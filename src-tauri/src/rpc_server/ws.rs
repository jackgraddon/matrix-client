use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_hdr_async, tungstenite::protocol::Message};
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response, ErrorResponse};
use serde_json::{json, Value};
use tokio::sync::broadcast;
use futures_util::{StreamExt, SinkExt};
use tokio_util::sync::CancellationToken;
use super::{RpcEvent, SocketContext, RpcIdentity};

pub async fn start_ws_server(
    tx: broadcast::Sender<RpcEvent>,
    identity: RpcIdentity,
    cancel_token: CancellationToken
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    for port in 6463..=6472 {
        let addr = format!("127.0.0.1:{}", port).parse::<SocketAddr>()?;
        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(_) => continue,
        };

        log::info!("[rpc-native-ws] Starting WS server at {:?}", addr);

        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    log::info!("[rpc-native-ws] WS server listener shutting down");
                    return Ok(());
                }
                res = listener.accept() => {
                    let (stream, _) = match res {
                        Ok(s) => s,
                        Err(e) => {
                            log::error!("[rpc-native-ws] Accept error: {}", e);
                            continue;
                        }
                    };

                    let tx_client = tx.clone();
                    let identity_client = identity.clone();
                    let token_client = cancel_token.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_ws_client(stream, tx_client, identity_client, token_client).await {
                            log::error!("[rpc-native-ws] Client error: {}", e);
                        }
                    });
                }
            }
        }
    }

    Err("Could not bind to any port in 6463-6472".into())
}

async fn handle_ws_client(
    stream: TcpStream,
    tx: broadcast::Sender<RpcEvent>,
    identity: RpcIdentity,
    cancel_token: CancellationToken
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let callback = |req: &Request, response: Response| -> Result<Response, ErrorResponse> {
        let origin = req.headers().get("Origin").and_then(|v| v.to_str().ok()).unwrap_or("");

        let is_discord = origin == "https://discord.com" || origin.ends_with(".discord.com");
        let is_tumult = origin == "https://tumult.jackg.cc" || origin == "http://localhost:3000" || origin.is_empty();

        if is_discord || is_tumult {
             Ok(response)
        } else {
             log::warn!("[rpc-native-ws] Blocked connection from untrusted origin: {}", origin);
             Err(ErrorResponse::new(Some("Forbidden".to_string())))
        }
    };

    let ws_stream = accept_hdr_async(stream, callback).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    log::info!("[rpc-native-ws] New client connected");
    let ctx = SocketContext::new();

    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => {
                log::info!("[rpc-native-ws] WS client closing (cancel token)");
                break;
            }
            msg = ws_receiver.next() => {
                let msg = match msg {
                    Some(Ok(m)) => m,
                    _ => break,
                };

                if msg.is_text() {
                    let value: Value = serde_json::from_str(msg.to_text()?)?;
                    let cmd = value["cmd"].as_str().unwrap_or("");
                    let args = &value["args"];
                    let nonce = &value["nonce"];

                    match cmd {
                        "SET_ACTIVITY" => {
                            let activity = &args["activity"];
                            let pid = args["pid"].as_i64();

                            let mut final_activity = activity.clone();
                            if let Some(obj) = final_activity.as_object_mut() {
                                obj.insert("application_id".to_string(), json!(ctx.client_id.lock().unwrap().clone()));
                            }

                            let event_data = json!({
                                "activity": final_activity,
                                "pid": pid,
                                "socketId": ctx.socket_id
                            });

                            let _ = tx.send(RpcEvent::Activity(event_data));

                            let response = json!({
                                "cmd": "SET_ACTIVITY",
                                "data": activity,
                                "evt": null,
                                "nonce": nonce
                            });
                            ws_sender.send(Message::Text(serde_json::to_string(&response)?)).await?;
                        }
                        _ => {
                            // Handshake or other commands
                            if value["v"].as_i64() == Some(1) {
                                let client_id = value["client_id"].as_str().unwrap_or("").to_string();
                                *ctx.client_id.lock().unwrap() = Some(client_id.clone());

                                let ready = json!({
                                    "cmd": "DISPATCH",
                                    "data": {
                                        "v": 1,
                                        "config": {
                                            "cdn_host": "cdn.discordapp.com",
                                            "api_endpoint": "//discord.com/api",
                                            "environment": "production"
                                        },
                                        "user": {
                                            "id": identity.user_id.clone(),
                                            "username": identity.user_name.clone(),
                                            "discriminator": "0",
                                            "global_name": identity.user_name.clone(),
                                            "avatar": identity.avatar.clone().unwrap_or_else(|| "cfefa4d9839fb4bdf030f91c2a13e95c".to_string()),
                                            "bot": false,
                                            "flags": 0,
                                            "premium_type": 0,
                                        }
                                    },
                                    "evt": "READY",
                                    "nonce": null
                                });
                                ws_sender.send(Message::Text(serde_json::to_string(&ready)?)).await?;
                            }
                        }
                    }
                }
            }
        }
    }

    // Emit null activity on close
    let _ = tx.send(RpcEvent::Activity(json!({
        "activity": null,
        "socketId": ctx.socket_id
    })));

    Ok(())
}
