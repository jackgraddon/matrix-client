use tauri::AppHandle;
use log::info;
use tokio_util::sync::CancellationToken;

pub mod ipc;
pub mod websocket;
pub mod types;

pub struct RpcServer {
    app: AppHandle,
    cancel_token: CancellationToken,
    user_id: String,
    user_name: String,
    avatar: Option<String>,
}

impl RpcServer {
    pub fn new(app: AppHandle, cancel_token: CancellationToken, user_id: String, user_name: String, avatar: Option<String>) -> Self {
        Self { app, cancel_token, user_id, user_name, avatar }
    }

    pub async fn start(&self) {
        info!("[rpc] Starting Rust RPC server...");

        let app_ws = self.app.clone();
        let cancel_ws = self.cancel_token.clone();
        let user_id_ws = self.user_id.clone();
        let user_name_ws = self.user_name.clone();
        let avatar_ws = self.avatar.clone();
        tokio::spawn(async move {
            websocket::start_websocket_server(app_ws, cancel_ws, user_id_ws, user_name_ws, avatar_ws).await;
        });

        let app_ipc = self.app.clone();
        let cancel_ipc = self.cancel_token.clone();
        let user_id_ipc = self.user_id.clone();
        let user_name_ipc = self.user_name.clone();
        let avatar_ipc = self.avatar.clone();
        tokio::spawn(async move {
            ipc::start_ipc_server(app_ipc, cancel_ipc, user_id_ipc, user_name_ipc, avatar_ipc).await;
        });
    }
}
