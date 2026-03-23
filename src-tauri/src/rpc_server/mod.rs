use std::sync::Mutex;
use tokio::sync::broadcast;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

pub mod ipc;
pub mod ws;

#[derive(Clone, Debug)]
pub enum RpcEvent {
    Activity(Value),
}

pub struct RpcServer {
    pub tx: broadcast::Sender<RpcEvent>,
}

#[derive(Clone, Debug)]
pub struct RpcIdentity {
    pub user_id: String,
    pub user_name: String,
    pub avatar: Option<String>,
}

impl RpcServer {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self { tx }
    }

    pub async fn start(&self, identity: RpcIdentity, cancel_token: CancellationToken) -> Result<(), String> {
        let tx_ipc = self.tx.clone();
        let tx_ws = self.tx.clone();
        let token_ipc = cancel_token.clone();
        let token_ws = cancel_token.clone();
        let identity_ipc = identity.clone();
        let identity_ws = identity;

        tokio::spawn(async move {
            if let Err(e) = ipc::start_ipc_server(tx_ipc, identity_ipc, token_ipc).await {
                log::error!("[rpc-native] IPC server error: {}", e);
            }
        });

        tokio::spawn(async move {
            if let Err(e) = ws::start_ws_server(tx_ws, identity_ws, token_ws).await {
                log::error!("[rpc-native] WS server error: {}", e);
            }
        });

        Ok(())
    }
}

pub struct SocketContext {
    pub client_id: Mutex<Option<String>>,
    pub socket_id: String,
}

impl SocketContext {
    pub fn new() -> Self {
        Self {
            client_id: Mutex::new(None),
            socket_id: uuid::Uuid::new_v4().to_string(),
        }
    }
}

pub async fn start_native_rpc_server(app: tauri::AppHandle, server: std::sync::Arc<RpcServer>, identity: RpcIdentity) -> Result<CancellationToken, String> {
    let cancel_token = CancellationToken::new();
    let token_clone = cancel_token.clone();
    let relay_token = cancel_token.clone();

    server.start(identity, token_clone).await?;

    let mut rx = server.tx.subscribe();
    tauri::async_runtime::spawn(async move {
        use tauri::Emitter;
        loop {
            tokio::select! {
                _ = relay_token.cancelled() => {
                    log::info!("[rpc-native] Native RPC event relay shutting down");
                    break;
                }
                event = rx.recv() => {
                    if let Ok(RpcEvent::Activity(activity)) = event {
                        let _ = app.emit("arrpc-activity", activity);
                    }
                }
            }
        }
    });

    Ok(cancel_token)
}
