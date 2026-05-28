// OAuth device-flow client.
//
// Flow:
//   1. Frontend calls `start_device_auth` -> returns user_code + verification_uri
//   2. User opens verification_uri in their browser and enters the code
//   3. Frontend polls `poll_device_auth` every `interval` seconds until it
//      receives an access_token or an error.
//
// After authentication the token is held in memory (`AppState.token`) and
// is also persisted via tauri-plugin-store on the frontend side.

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

const DEFAULT_API_BASE: &str = "https://fujistud.io";

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    #[serde(default)]
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccessTokenResponse {
    pub access_token: String,
    pub token_type: String,
    #[serde(default)]
    pub scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceErrorResponse {
    pub error: String,
    #[serde(default)]
    pub error_description: Option<String>,
}

fn api_base(state: &Mutex<AppState>) -> String {
    state
        .lock()
        .ok()
        .and_then(|s| s.api_base.clone())
        .unwrap_or_else(|| DEFAULT_API_BASE.to_string())
}

#[tauri::command]
pub async fn start_device_auth(
    state: State<'_, Mutex<AppState>>,
) -> Result<DeviceCodeResponse, String> {
    let base = api_base(&state);
    let url = format!("{}/api/oauth/device/start", base);
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({
            "client_id": "fuji-studio-desktop",
            "scope": "project:read project:write",
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("Server returned error: {}", txt));
    }

    resp.json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("Invalid response: {}", e))
}

#[tauri::command]
pub async fn poll_device_auth(
    device_code: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<PollResult, String> {
    let base = api_base(&state);
    let url = format!("{}/api/oauth/device/poll", base);
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({ "device_code": device_code }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();

    if status.is_success() {
        let token: AccessTokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Invalid token response: {}", e))?;
        if let Ok(mut s) = state.lock() {
            s.token = Some(token.access_token.clone());
        }
        return Ok(PollResult::Ok {
            access_token: token.access_token,
        });
    }

    let err: DeviceErrorResponse = serde_json::from_str(&body)
        .unwrap_or(DeviceErrorResponse { error: "unknown_error".to_string(), error_description: None });

    match err.error.as_str() {
        "authorization_pending" | "slow_down" => Ok(PollResult::Pending),
        other => Ok(PollResult::Error {
            error: other.to_string(),
            description: err.error_description,
        }),
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "status")]
pub enum PollResult {
    Ok { access_token: String },
    Pending,
    Error { error: String, description: Option<String> },
}

#[tauri::command]
pub fn set_token(token: String, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .token = Some(token);
    Ok(())
}

#[tauri::command]
pub fn get_token(state: State<'_, Mutex<AppState>>) -> Result<Option<String>, String> {
    Ok(state.lock().map_err(|e| e.to_string())?.token.clone())
}

#[tauri::command]
pub fn clear_token(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .token = None;
    Ok(())
}

#[tauri::command]
pub fn set_api_base(base: String, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let trimmed = base.trim_end_matches('/').to_string();
    state
        .lock()
        .map_err(|e| e.to_string())?
        .api_base = Some(trimmed);
    Ok(())
}

#[tauri::command]
pub fn get_api_base(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    Ok(state
        .lock()
        .map_err(|e| e.to_string())?
        .api_base
        .clone()
        .unwrap_or_else(|| DEFAULT_API_BASE.to_string()))
}
