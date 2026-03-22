use async_trait::async_trait;
use serde_json::Value;
use std::sync::Mutex;

#[async_trait]
pub trait RpcTransport: Send + Sync {
    async fn send(&self, msg: Value) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
    fn socket_id(&self) -> String;
    fn client_id(&self) -> String;
    fn set_client_id(&self, client_id: String);
    async fn close(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
}

pub struct SocketContext {
    pub socket_id: String,
    pub client_id: Mutex<String>,
}

impl SocketContext {
    pub fn new(socket_id: String, client_id: String) -> Self {
        Self {
            socket_id,
            client_id: Mutex::new(client_id),
        }
    }
}
