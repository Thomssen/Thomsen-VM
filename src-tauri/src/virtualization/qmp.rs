//! A minimal QEMU Machine Protocol (QMP) client.
//!
//! QMP is QEMU's JSON-line control protocol: connect, read QEMU's greeting,
//! send `qmp_capabilities` once to leave "capabilities negotiation" mode,
//! then exchange one JSON object per line for every command/reply. QEMU may
//! also push unsolicited `{"event": ...}` lines at any time (device changes,
//! shutdown notifications) - those are skipped while waiting for the reply
//! to a specific command.
//!
//! Each call here opens a fresh connection and closes it afterwards rather
//! than holding one connection open for the VM's lifetime. QMP's
//! `server,nowait` mode happily accepts a new connection once the previous
//! one disconnects, and reconnecting per action is simpler and more robust
//! than keeping shared, long-lived socket state across unrelated Tauri
//! command invocations.

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

use crate::error::AppError;

pub struct QmpClient {
    stream: BufReader<TcpStream>,
}

impl QmpClient {
    /// Connect and complete the capabilities handshake. Retries briefly since
    /// the QMP socket may not accept connections in the instant right after
    /// the QEMU process is spawned.
    pub async fn connect(port: u16) -> Result<Self, AppError> {
        let addr = format!("127.0.0.1:{port}");
        let mut last_err = None;
        for attempt in 0..30 {
            match TcpStream::connect(&addr).await {
                Ok(stream) => {
                    let mut client = QmpClient { stream: BufReader::new(stream) };
                    client.read_line_json().await?; // greeting
                    client.execute("qmp_capabilities", None).await?;
                    return Ok(client);
                }
                Err(e) => {
                    last_err = Some(e);
                    tokio::time::sleep(Duration::from_millis(if attempt < 10 { 100 } else { 250 })).await;
                }
            }
        }
        Err(AppError::msg("Could not reach the virtual machine's control socket.")
            .technical(last_err.map(|e| e.to_string()).unwrap_or_default()))
    }

    async fn read_line_json(&mut self) -> Result<Value, AppError> {
        loop {
            let mut line = String::new();
            let n = timeout(Duration::from_secs(5), self.stream.read_line(&mut line))
                .await
                .map_err(|_| AppError::msg("The virtual machine did not respond in time."))?
                .map_err(|e| AppError::msg("Lost contact with the virtual machine.").technical(e.to_string()))?;
            if n == 0 {
                return Err(AppError::msg("The virtual machine closed its control connection."));
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let value: Value = serde_json::from_str(trimmed)
                .map_err(|e| AppError::msg("Received an unexpected reply from the virtual machine.").technical(e.to_string()))?;
            // Skip unsolicited events; the caller only wants command replies.
            if value.get("event").is_some() {
                continue;
            }
            return Ok(value);
        }
    }

    pub async fn execute(&mut self, command: &str, args: Option<Value>) -> Result<Value, AppError> {
        let mut payload = json!({ "execute": command });
        if let Some(args) = args {
            payload["arguments"] = args;
        }
        let mut line = serde_json::to_vec(&payload).expect("QMP payload always serializes");
        line.push(b'\n');
        self.stream
            .get_mut()
            .write_all(&line)
            .await
            .map_err(|e| AppError::msg("Could not send a command to the virtual machine.").technical(e.to_string()))?;

        let reply = self.read_line_json().await?;
        if let Some(err) = reply.get("error") {
            let desc = err.get("desc").and_then(|d| d.as_str()).unwrap_or("Unknown QEMU error.");
            return Err(AppError::msg(format!("The virtual machine reported an error: {desc}")));
        }
        Ok(reply)
    }
}

/// Standard USB HID usage-ish key names QEMU's `send-key` accepts for a
/// Ctrl+Alt+Delete chord.
pub fn ctrl_alt_delete_keys() -> Value {
    json!({ "keys": [
        { "type": "qcode", "data": "ctrl" },
        { "type": "qcode", "data": "alt" },
        { "type": "qcode", "data": "delete" },
    ] })
}
