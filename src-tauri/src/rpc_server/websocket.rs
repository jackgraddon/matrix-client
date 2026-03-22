use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade, rejection::WebSocketUpgradeRejection}, Query, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use log::{info, error, debug};
use tokio_util::sync::CancellationToken;
use futures_util::StreamExt;
use std::collections::HashMap;
use super::types::{RpcMessage, RpcResponse};

#[derive(Clone)]
struct AppState {
    app: AppHandle,
    user_id: String,
    user_name: String,
    avatar: Option<String>,
}

pub async fn start_websocket_server(
    app: AppHandle,
    cancel_token: CancellationToken,
    user_id: String,
    user_name: String,
    avatar: Option<String>,
) {
    let state = AppState {
        app,
        user_id,
        user_name,
        avatar,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app_router = Router::new()
        .route("/", get(handler))
        .layer(cors)
        .with_state(state);

    for port in 6463..=6472 {
        let addr = format!("127.0.0.1:{}", port);
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => {
                info!("[rpc-ws] Listening on http/ws://{}", addr);
                let cancel_handle = cancel_token.clone();
                let router = app_router.clone();

                tokio::spawn(async move {
                    if let Err(e) = axum::serve(listener, router)
                        .with_graceful_shutdown(async move {
                            cancel_handle.cancelled().await;
                            info!("[rpc-ws] Axum server on port {} stopping...", port);
                        })
                        .await {
                            error!("[rpc-ws] Server error on port {}: {}", port, e);
                        }
                });
                return;
            }
            Err(_) => continue,
        }
    }
}

async fn handler(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
    ws: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    match ws {
        Ok(ws) => {
            ws.on_upgrade(move |socket| handle_socket(socket, state, params)).into_response()
        }
        Err(_) => {
            // Standard HTTP request
            axum::response::Json(json!({
                "code": 404,
                "message": "Not Found"
            })).into_response()
        }
    }
}

async fn handle_socket(mut socket: WebSocket, state: AppState, query: HashMap<String, String>) {
    // 1. Wait for the INITIAL Handshake message from the client
    let client_id = match socket.recv().await {
        Some(Ok(Message::Text(text))) => {
            if let Ok(handshake) = serde_json::from_str::<serde_json::Value>(&text) {
                handshake["args"]["client_id"]
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| query.get("client_id").cloned())
                    .unwrap_or_else(|| "0".to_string())
            } else {
                "0".to_string()
            }
        }
        _ => return, // Drop connection if no handshake received
    };

    info!("[rpc-ws] Handshake received for client: {}", client_id);

    // 2. NOW send the READY event
    let ready_data = json!({
        "v": 1,
        "config": {
            "cdn_host": "cdn.discordapp.com",
            "api_endpoint": "//discord.com/api",
            "environment": "production"
        },
        "user": {
            "id": state.user_id,
            "username": state.user_name,
            "avatar": state.avatar,
            "discriminator": "0",
            "public_flags": 0
        }
    });
    let ready = RpcResponse::new("DISPATCH", Some(ready_data), Some("READY".to_string()), None);

    if let Err(e) = socket.send(Message::Text(ready.to_string().into())).await {
        error!("[rpc-ws] Failed to send READY: {}", e);
        return;
    }

    // 3. Main Message Loop
    while let Some(Ok(msg)) = socket.next().await {
        match msg {
            Message::Text(text) => {
                debug!("[rpc-ws] Received message: {}", text);
                if let Ok(msg) = serde_json::from_str::<RpcMessage>(&text) {
                    match msg.cmd.as_str() {
                        "SET_ACTIVITY" => {
                            let args = msg.args.clone().unwrap_or(json!({}));

                            let _ = state.app.emit("arrpc-activity", json!({
                                "activity": args["activity"],
                                "pid": args["pid"],
                                "socketId": format!("ws-{}", client_id)
                            }));

                            let response = json!({
                                "application_id": client_id,
                                "name": "",
                                "type": 0,
                                "activity": args["activity"]
                            });
                            let frame = RpcResponse::new("SET_ACTIVITY", Some(response), None, msg.nonce);
                            let _ = socket.send(Message::Text(frame.to_string().into())).await;
                        }
                        _ => {
                            let frame = RpcResponse::new(&msg.cmd, Some(json!({})), None, msg.nonce);
                            let _ = socket.send(Message::Text(frame.to_string().into())).await;
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}

type Response = axum::response::Response;

impl ToString for RpcResponse {
    fn to_string(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}
