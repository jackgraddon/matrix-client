use std::env;
use std::io::Cursor;
use std::path::PathBuf;
use byteorder::{ReadBytesExt, WriteBytesExt, LittleEndian};
use interprocess::local_socket::tokio::{LocalSocketListener, LocalSocketStream};
use interprocess::local_socket::ToLocalSocketName;
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use super::{RpcEvent, SocketContext, RpcIdentity};

pub async fn start_ipc_server(
    tx: broadcast::Sender<RpcEvent>,
    identity: RpcIdentity,
    cancel_token: CancellationToken
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut listener = None;
    let mut socket_name = None;

    for i in 0..10 {
        let name = get_socket_name(i)?;
        #[cfg(unix)]
        {
            // On Unix, we check if the socket is already in use by trying to connect to it.
            // If it's not, we can safely remove it and bind our own.
            if let Ok(path) = name.to_str() {
                if std::path::Path::new(path).exists() {
                    if tokio::net::UnixStream::connect(path).await.is_err() {
                        let _ = std::fs::remove_file(path);
                    } else {
                        continue; // Socket is in use
                    }
                }
            }
        }

        match LocalSocketListener::bind(name.clone()) {
            Ok(l) => {
                listener = Some(l);
                socket_name = Some(name);
                break;
            }
            Err(_) => continue,
        }
    }

    let listener = listener.ok_or("Could not bind to any IPC socket (0-9)")?;
    log::info!("[rpc-native-ipc] Starting IPC server at {:?}", socket_name);

    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => {
                log::info!("[rpc-native-ipc] IPC server listener shutting down");
                return Ok(());
            }
            res = listener.accept() => {
                let stream = match res {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("[rpc-native-ipc] Accept error: {}", e);
                        continue;
                    }
                };

                let tx_client = tx.clone();
                let identity_client = identity.clone();
                let token_client = cancel_token.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_ipc_client(stream, tx_client, identity_client, token_client).await {
                        log::error!("[rpc-native-ipc] Client error: {}", e);
                    }
                });
            }
        }
    }
}

fn get_socket_name(i: u32) -> Result<interprocess::local_socket::LocalSocketName<'static>, Box<dyn std::error::Error + Send + Sync>> {
    #[cfg(windows)]
    return Ok(format!(r"\\.\pipe\discord-ipc-{}", i).to_local_socket_name()?);

    #[cfg(unix)]
    {
        let tmp = env::var("TMPDIR").or_else(|_| env::var("TMP")).or_else(|_| env::var("TEMP")).unwrap_or_else(|_| "/tmp".to_string());
        return Ok(PathBuf::from(tmp).join(format!("discord-ipc-{}", i)).to_local_socket_name()?);
    }
}

async fn handle_ipc_client(
    mut stream: LocalSocketStream,
    tx: broadcast::Sender<RpcEvent>,
    identity: RpcIdentity,
    cancel_token: CancellationToken
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    log::info!("[rpc-native-ipc] New client connected");
    let ctx = SocketContext::new();

    loop {
        let mut header = [0u8; 8];
        tokio::select! {
            _ = cancel_token.cancelled() => {
                log::info!("[rpc-native-ipc] Client connection closing (cancel token)");
                break;
            }
            res = stream.read_exact(&mut header) => {
                if res.is_err() {
                    break;
                }
            }
        }

        let mut rdr = Cursor::new(header);
        let opcode = rdr.read_u32::<LittleEndian>()?;
        let length = rdr.read_u32::<LittleEndian>()?;

        if length > 10 * 1024 * 1024 { // 10MB limit
            return Err("Payload too large".into());
        }

        let mut payload = vec![0u8; length as usize];
        stream.read_exact(&mut payload).await?;

        let value: Value = serde_json::from_slice(&payload)?;

        match opcode {
            0 => { // Handshake
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
                            "id": identity.user_id,
                            "username": identity.user_name,
                            "discriminator": "0",
                            "global_name": identity.user_name,
                            "avatar": identity.avatar.unwrap_or_else(|| "cfefa4d9839fb4bdf030f91c2a13e95c".to_string()),
                            "bot": false,
                            "flags": 0,
                            "premium_type": 0,
                        }
                    },
                    "evt": "READY",
                    "nonce": null
                });

                send_ipc_frame(&mut stream, 1, ready).await?;
            }
            1 => { // Frame
                let cmd = value["cmd"].as_str().unwrap_or("");
                let args = &value["args"];
                let nonce = &value["nonce"];

                if cmd == "SET_ACTIVITY" {
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
                    send_ipc_frame(&mut stream, 1, response).await?;
                }
            }
            2 => { // Close
                break;
            }
            _ => {}
        }
    }

    // Emit null activity on close
    let _ = tx.send(RpcEvent::Activity(json!({
        "activity": null,
        "socketId": ctx.socket_id
    })));

    Ok(())
}

async fn send_ipc_frame(stream: &mut LocalSocketStream, opcode: u32, value: Value) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let payload = serde_json::to_vec(&value)?;
    let mut header = [0u8; 8];
    let mut wrt = Cursor::new(&mut header[..]);
    wrt.write_u32::<LittleEndian>(opcode)?;
    wrt.write_u32::<LittleEndian>(payload.len() as u32)?;

    stream.write_all(&header).await?;
    stream.write_all(&payload).await?;
    Ok(())
}
