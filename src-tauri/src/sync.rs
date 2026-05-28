// Sync protocol client.
//
// Implements the three-step sync against the Fuji Studio API:
//   1. POST /api/projects/{id}/versions/check   -> get list of missing blob hashes
//   2. For each missing blob:
//      POST /api/projects/{id}/versions/upload-file (multipart: file, hash)
//   3. POST /api/projects/{id}/versions/complete  -> create the version + parse FLP
//
// `sync_local_project` is the high-level entry point — pass it a project_id
// and a local folder path, and it does the entire sync.

use crate::hasher::{self, LocalFile};
use crate::state::AppState;
use futures::stream::{self, StreamExt};
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

const DEFAULT_API_BASE: &str = "https://fujistud.io";
const MAX_PARALLEL_UPLOADS: usize = 8;

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn auth_header(state: &Mutex<AppState>) -> Result<String, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let token = s
        .token
        .as_ref()
        .ok_or_else(|| "Not authenticated. Please sign in first.".to_string())?;
    Ok(format!("Bearer {}", token))
}

fn api_base(state: &Mutex<AppState>) -> String {
    state
        .lock()
        .ok()
        .and_then(|s| s.api_base.clone())
        .unwrap_or_else(|| DEFAULT_API_BASE.to_string())
}

// ─── Remote project queries ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteProject {
    pub id: String,
    pub name: String,
    pub slug: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackRef {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub slug: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionTrackLink {
    #[serde(rename = "trackId")]
    pub track_id: String,
    pub track: TrackRef,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectTrackLink {
    #[serde(rename = "trackId")]
    pub track_id: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    pub track: TrackRef,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteProjectVersion {
    pub id: String,
    #[serde(rename = "versionNumber")]
    pub version_number: i32,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(rename = "totalFiles")]
    pub total_files: i32,
    #[serde(rename = "totalSize")]
    pub total_size: i64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "isParsed", default)]
    pub is_parsed: bool,
    #[serde(rename = "trackLinks", default)]
    pub track_links: Vec<VersionTrackLink>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteProjectDetail {
    pub id: String,
    pub name: String,
    pub slug: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub versions: Vec<RemoteProjectVersion>,
    #[serde(rename = "trackLinks", default)]
    pub track_links: Vec<ProjectTrackLink>,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MyTrack {
    pub id: String,
    pub title: String,
    #[serde(rename = "coverUrl", default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(rename = "isPublic", default)]
    pub is_public: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionDiff {
    #[serde(rename = "versionNumber")]
    pub version_number: i32,
    #[serde(rename = "previousVersionNumber")]
    pub previous_version_number: Option<i32>,
    #[serde(rename = "totalFiles")]
    pub total_files: i32,
    pub added: Vec<String>,
    pub changed: Vec<String>,
    pub removed: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[tauri::command]
pub async fn list_remote_projects(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<RemoteProject>, String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let resp = http_client()
        .get(format!("{}/api/projects", base))
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }
    resp.json::<Vec<RemoteProject>>()
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectArgs {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[tauri::command]
pub async fn create_remote_project(
    args: CreateProjectArgs,
    state: State<'_, Mutex<AppState>>,
) -> Result<RemoteProject, String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let resp = http_client()
        .post(format!("{}/api/projects", base))
        .header("Authorization", auth)
        .json(&args)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("API error: {}", txt));
    }
    resp.json::<RemoteProject>().await.map_err(|e| e.to_string())
}

// ─── Project detail, tracks, publish ───────────────────────────────────

#[tauri::command]
pub async fn get_project_detail(
    project_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<RemoteProjectDetail, String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let resp = http_client()
        .get(format!("{}/api/projects/{}", base, project_id))
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }
    resp.json::<RemoteProjectDetail>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_my_tracks(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<MyTrack>, String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let resp = http_client()
        .get(format!("{}/api/projects/my-tracks", base))
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }
    resp.json::<Vec<MyTrack>>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_version_diff(
    project_id: String,
    version_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<VersionDiff, String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let resp = http_client()
        .get(format!("{}/api/projects/{}/versions/{}/diff", base, project_id, version_id))
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("API error: {}", resp.status()));
    }
    resp.json::<VersionDiff>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn publish_version(
    project_id: String,
    version_id: String,
    track_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<serde_json::Value, String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let resp = http_client()
        .post(format!("{}/api/projects/{}/publish", base, project_id))
        .header("Authorization", auth)
        .json(&serde_json::json!({ "versionId": version_id, "trackId": track_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("Publish failed: {}", txt));
    }
    resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unpublish_version(
    project_id: String,
    track_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let resp = http_client()
        .post(format!("{}/api/projects/{}/unpublish", base, project_id))
        .header("Authorization", auth)
        .json(&serde_json::json!({ "trackId": track_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("Unpublish failed: {}", txt));
    }
    Ok(())
}

// ─── Local scanning ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub files: Vec<LocalFile>,
    pub total_size: u64,
}

#[tauri::command]
pub fn scan_local_folder(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", folder_path));
    }
    let files = hasher::walk_project(&root).map_err(|e| e.to_string())?;
    let total_size: u64 = files.iter().map(|f| f.size).sum();
    Ok(ScanResult { files, total_size })
}

// ─── Sync orchestration ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CheckResponse {
    #[serde(rename = "missingHashes")]
    missing_hashes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncArgs {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "folderPath")]
    pub folder_path: String,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum SyncStage {
    Scanning,
    Checking,
    Uploading,
    Finalizing,
    Done,
    Error,
}

#[derive(Debug, Serialize, Clone)]
pub struct SyncProgress {
    pub project_id: String,
    pub stage: SyncStage,
    pub uploaded: usize,
    pub total: usize,
    pub current_file: Option<String>,
    pub message: Option<String>,
}

fn emit_progress(app: &AppHandle, p: SyncProgress) {
    let _ = app.emit("sync:progress", p);
}

#[tauri::command]
pub async fn sync_local_project(
    args: SyncArgs,
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<serde_json::Value, String> {
    let base = api_base(&state);
    let auth = auth_header(&state)?;
    let project_id = args.project_id.clone();

    emit_progress(&app, SyncProgress {
        project_id: project_id.clone(),
        stage: SyncStage::Scanning,
        uploaded: 0,
        total: 0,
        current_file: None,
        message: Some("Hashing project files…".to_string()),
    });

    // ── Step 1: Scan local folder ──────────────────────────────────────
    let root = PathBuf::from(&args.folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {}", args.folder_path));
    }
    let files = hasher::walk_project(&root).map_err(|e| e.to_string())?;
    if files.is_empty() {
        return Err("Project folder is empty or contains no syncable files".to_string());
    }

    // ── Step 2: Ask server which blobs are missing ─────────────────────
    emit_progress(&app, SyncProgress {
        project_id: project_id.clone(),
        stage: SyncStage::Checking,
        uploaded: 0,
        total: files.len(),
        current_file: None,
        message: Some("Comparing file hashes against server…".to_string()),
    });

    let client = http_client();
    let check_url = format!("{}/api/projects/{}/versions/check", base, project_id);
    let check_resp = client
        .post(&check_url)
        .header("Authorization", &auth)
        .json(&serde_json::json!({ "files": files }))
        .send()
        .await
        .map_err(|e| format!("Check request failed: {}", e))?;

    if !check_resp.status().is_success() {
        let txt = check_resp.text().await.unwrap_or_default();
        return Err(format!("Check failed: {}", txt));
    }
    let check: CheckResponse = check_resp.json().await.map_err(|e| e.to_string())?;
    let missing: std::collections::HashSet<String> = check.missing_hashes.into_iter().collect();

    // Clone into owned values so the upload closures don't borrow from `files`.
    // Tauri commands require `'static` closures, which can't hold borrows of
    // function-local data.
    let to_upload: Vec<LocalFile> = files
        .iter()
        .filter(|f| missing.contains(&f.hash))
        .cloned()
        .collect();
    let total_uploads = to_upload.len();

    emit_progress(&app, SyncProgress {
        project_id: project_id.clone(),
        stage: SyncStage::Uploading,
        uploaded: 0,
        total: total_uploads,
        current_file: None,
        message: Some(format!(
            "{} of {} files need uploading",
            total_uploads,
            files.len()
        )),
    });

    // ── Step 3: Upload missing blobs (parallel) ────────────────────────
    let upload_url = format!("{}/api/projects/{}/versions/upload-file", base, project_id);
    let uploaded_counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let upload_results: Vec<Result<(), String>> = stream::iter(to_upload.into_iter())
        .map(|f| {
            let client = client.clone();
            let auth = auth.clone();
            let upload_url = upload_url.clone();
            let root = root.clone();
            let app = app.clone();
            let project_id = project_id.clone();
            let counter = uploaded_counter.clone();
            async move {
                let abs = hasher::resolve_path(&root, &f.path);
                let bytes = hasher::read_file_bytes(&abs).map_err(|e| e.to_string())?;

                let part = multipart::Part::bytes(bytes)
                    .file_name(f.path.clone())
                    .mime_str("application/octet-stream")
                    .map_err(|e| e.to_string())?;
                let form = multipart::Form::new()
                    .text("hash", f.hash.clone())
                    .text("path", f.path.clone())
                    .part("file", part);

                let resp = client
                    .post(&upload_url)
                    .header("Authorization", &auth)
                    .multipart(form)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                if !resp.status().is_success() {
                    let txt = resp.text().await.unwrap_or_default();
                    return Err(format!("Upload failed for {}: {}", f.path, txt));
                }
                let n = counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                emit_progress(&app, SyncProgress {
                    project_id,
                    stage: SyncStage::Uploading,
                    uploaded: n,
                    total: total_uploads,
                    current_file: Some(f.path.clone()),
                    message: None,
                });
                Ok(())
            }
        })
        .buffer_unordered(MAX_PARALLEL_UPLOADS)
        .collect()
        .await;

    for r in &upload_results {
        if let Err(e) = r {
            return Err(format!("Upload error: {}", e));
        }
    }

    // ── Step 4: Finalize version ───────────────────────────────────────
    emit_progress(&app, SyncProgress {
        project_id: project_id.clone(),
        stage: SyncStage::Finalizing,
        uploaded: total_uploads,
        total: total_uploads,
        current_file: None,
        message: Some("Creating version & parsing FLP…".to_string()),
    });

    let complete_url = format!("{}/api/projects/{}/versions/complete", base, project_id);
    let complete_resp = client
        .post(&complete_url)
        .header("Authorization", &auth)
        .json(&serde_json::json!({
            "files": files,
            "message": args.message,
        }))
        .send()
        .await
        .map_err(|e| format!("Finalize request failed: {}", e))?;

    if !complete_resp.status().is_success() {
        let txt = complete_resp.text().await.unwrap_or_default();
        return Err(format!("Finalize failed: {}", txt));
    }
    let version: serde_json::Value = complete_resp.json().await.map_err(|e| e.to_string())?;

    emit_progress(&app, SyncProgress {
        project_id,
        stage: SyncStage::Done,
        uploaded: total_uploads,
        total: total_uploads,
        current_file: None,
        message: Some("Sync complete".to_string()),
    });

    Ok(version)
}
