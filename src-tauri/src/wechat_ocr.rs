use std::{
    env,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use chrono::Utc;
use clipboard_rs::{Clipboard, ClipboardContext};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    clipboard::{ImageStore, WritebackGuard},
    core::{AppError, Result},
    db::{
        items::{content_hash, upsert_item},
        models::{ClipboardItem, ClipboardKind, Platform},
    },
    settings::SettingsStore,
};

const SIDECAR_EXE_NAME: &str = "wechat-ocr-sidecar.exe";
const CLIPBOARD_UPDATED_EVENT: &str = "clipboard://updated";
const MAX_TIMEOUT_MS: u64 = 120_000;
const MIN_TIMEOUT_MS: u64 = 1_000;
const SUMMARY_MAX_CHARS: usize = 256;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunWechatOcrPayload {
    image_path: String,
    timeout_ms: Option<u64>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WechatOcrResponse {
    text: String,
    image_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarResponse {
    ok: bool,
    text: Option<String>,
    error: Option<String>,
}

fn normalize_timeout(timeout_ms: Option<u64>) -> Duration {
    let timeout = timeout_ms
        .unwrap_or(10_000)
        .clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    Duration::from_millis(timeout)
}

fn executable_exists(path: &Path) -> bool {
    path.is_file()
}

fn candidate_sidecar_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(path) = env::var("WECHAT_OCR_SIDECAR_PATH") {
        paths.push(PathBuf::from(path));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        paths.push(resource_dir.join(SIDECAR_EXE_NAME));
        paths.push(resource_dir.join("bin").join(SIDECAR_EXE_NAME));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            paths.push(exe_dir.join(SIDECAR_EXE_NAME));
            paths.push(exe_dir.join("bin").join(SIDECAR_EXE_NAME));
        }
    }

    paths.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bin")
            .join(SIDECAR_EXE_NAME),
    );

    paths
}

fn resolve_sidecar_path(app: &AppHandle) -> Result<PathBuf> {
    candidate_sidecar_paths(app)
        .into_iter()
        .find(|path| executable_exists(path))
        .ok_or_else(|| {
            AppError::Clipboard(
                "未找到 WeChat OCR 辅助程序，请先发布或放置 wechat-ocr-sidecar.exe。".to_owned(),
            )
        })
}

fn read_pipe<T: Read>(pipe: &mut Option<T>) -> String {
    let mut output = String::new();
    if let Some(pipe) = pipe.as_mut() {
        let _ = pipe.read_to_string(&mut output);
    }
    output
}

fn run_sidecar(sidecar_path: PathBuf, image_path: String, timeout: Duration) -> Result<String> {
    let mut child = Command::new(sidecar_path)
        .arg("--image")
        .arg(&image_path)
        .arg("--timeout")
        .arg(timeout.as_millis().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| AppError::Clipboard(format!("启动 WeChat OCR 辅助程序失败：{error}")))?;

    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = read_pipe(&mut child.stdout);
                let stderr = read_pipe(&mut child.stderr);

                if status.success() {
                    return Ok(stdout);
                }

                let message = if stderr.trim().is_empty() {
                    stdout
                } else {
                    stderr
                };

                return Err(AppError::Clipboard(format!(
                    "WeChat OCR 辅助程序执行失败：{}",
                    message.trim()
                )));
            }
            Ok(None) => {
                if started_at.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AppError::Clipboard("WeChat OCR 识别超时。".to_owned()));
                }

                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                let _ = child.kill();
                return Err(AppError::Clipboard(format!(
                    "等待 WeChat OCR 辅助程序失败：{error}"
                )));
            }
        }
    }
}

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(not(target_os = "windows"))]
trait CommandExtCompat {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self;
}

#[cfg(not(target_os = "windows"))]
impl CommandExtCompat for Command {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self {
        self
    }
}

fn parse_sidecar_output(output: &str) -> Result<String> {
    let response = serde_json::from_str::<SidecarResponse>(output)
        .map_err(|error| AppError::Clipboard(format!("解析 WeChat OCR 返回结果失败：{error}")))?;

    if !response.ok {
        return Err(AppError::Clipboard(response.error.unwrap_or_else(|| {
            "WeChat OCR 未返回有效结果。".to_owned()
        })));
    }

    Ok(normalize_ocr_text(&response.text.unwrap_or_default()))
}

fn normalize_ocr_text(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn current_platform() -> Platform {
    #[cfg(target_os = "macos")]
    {
        Platform::Macos
    }
    #[cfg(target_os = "windows")]
    {
        Platform::Windows
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        compile_error!("EcoPaste only supports macOS and Windows")
    }
}

fn make_summary(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(SUMMARY_MAX_CHARS).collect())
}

fn build_ocr_text_item(text: String) -> ClipboardItem {
    let now = Utc::now();
    ClipboardItem {
        id: uuid::Uuid::new_v4().to_string(),
        kind: ClipboardKind::Text,
        sub_kind: None,
        group_id: None,
        source_app_id: None,
        content_hash: content_hash(ClipboardKind::Text, &text),
        search_text: Some(text.clone()),
        summary: make_summary(&text),
        file_types: None,
        size: Some(text.len() as i64),
        width: None,
        height: None,
        use_count: 1,
        is_favorite: false,
        is_pinned: false,
        is_sensitive: false,
        platform: current_platform(),
        note: None,
        created_at: now,
        updated_at: now,
        content: text,
        source_app_name: None,
        source_app_icon_file: None,
        source_app_icon_path: None,
        image_thumbnail_path: None,
        file_entries: None,
        files_preview_kind: None,
        available_actions: Vec::new(),
        color_preview: None,
        display_created_at: String::new(),
    }
}

fn write_text_to_clipboard(app: &AppHandle, item: &ClipboardItem) -> Result<()> {
    let guard = app.state::<Arc<WritebackGuard>>();
    guard.suppress(item.content_hash.clone());

    let ctx = ClipboardContext::new()
        .map_err(|error| AppError::Clipboard(format!("打开系统剪贴板失败：{error}")))?;
    ctx.set_text(item.content.clone())
        .map_err(|error| AppError::Clipboard(format!("写入 OCR 文本到剪贴板失败：{error}")))?;
    Ok(())
}

async fn run_ocr_text(app: AppHandle, image_path: String, timeout: Duration) -> Result<String> {
    let sidecar_path = resolve_sidecar_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || run_sidecar(sidecar_path, image_path, timeout))
        .await
        .map_err(|error| AppError::Clipboard(format!("WeChat OCR 后台任务失败：{error}")))?
        .and_then(|output| parse_sidecar_output(&output))
}

async fn persist_ocr_text(app: AppHandle, text: String, write_to_clipboard: bool) -> Result<()> {
    if text.trim().is_empty() {
        return Ok(());
    }

    let item = build_ocr_text_item(text);
    let pool = app.state::<crate::db::DatabaseState>().pool().await;
    let result = upsert_item(&pool, &item).await?;

    if write_to_clipboard {
        if let Err(err) = write_text_to_clipboard(&app, &item) {
            log::warn!("{err}");
        }
    }

    if let Err(err) = app.emit(
        CLIPBOARD_UPDATED_EVENT,
        serde_json::json!({
            "id": result.id,
            "kind": item.kind,
            "deduplicated": result.deduplicated,
        }),
    ) {
        log::warn!("emit {CLIPBOARD_UPDATED_EVENT} after OCR failed: {err}");
    }

    Ok(())
}

pub fn spawn_image_ocr(app: &AppHandle, image_item: &ClipboardItem, deduplicated: bool) {
    if deduplicated || image_item.kind != ClipboardKind::Image {
        return;
    }

    let settings = app.state::<SettingsStore>().snapshot();
    if !settings.clipboard.wechat_ocr.enabled {
        return;
    }

    let image_store = app.state::<ImageStore>();
    let image_path = image_store.origin_path(&image_item.content);
    let Some(image_path) = image_path.to_str().map(str::to_owned) else {
        log::warn!("wechat ocr skipped invalid image path: {:?}", image_item.content);
        return;
    };

    let timeout = normalize_timeout(Some(settings.clipboard.wechat_ocr.timeout_ms));
    let write_to_clipboard = settings.clipboard.wechat_ocr.write_to_clipboard;
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        match run_ocr_text(app.clone(), image_path, timeout).await {
            Ok(text) => {
                if let Err(err) = persist_ocr_text(app, text, write_to_clipboard).await {
                    log::warn!("persist OCR text failed: {err}");
                }
            }
            Err(err) => {
                log::warn!("WeChat OCR failed: {err}");
            }
        }
    });
}

#[tauri::command]
pub async fn run_wechat_ocr(
    app: AppHandle,
    payload: RunWechatOcrPayload,
) -> Result<WechatOcrResponse> {
    if cfg!(not(target_os = "windows")) {
        return Err(AppError::Clipboard("WeChat OCR 仅支持 Windows。".to_owned()));
    }

    let image_path = payload.image_path.trim();
    if image_path.is_empty() {
        return Err(AppError::Clipboard("图片路径为空，无法进行 OCR。".to_owned()));
    }

    let text = run_ocr_text(
        app,
        image_path.to_owned(),
        normalize_timeout(payload.timeout_ms),
    )
    .await?;

    Ok(WechatOcrResponse {
        text,
        image_path: image_path.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_ocr_text() {
        assert_eq!(normalize_ocr_text("  hello\r\n\r\n world \r tail "), "hello\nworld\ntail");
    }

    #[test]
    fn clamps_timeout() {
        assert_eq!(normalize_timeout(Some(1)).as_millis(), 1_000);
        assert_eq!(normalize_timeout(Some(999_999)).as_millis(), 120_000);
        assert_eq!(normalize_timeout(None).as_millis(), 10_000);
    }

    #[test]
    fn builds_searchable_text_item() {
        let item = build_ocr_text_item("OCR text".to_owned());

        assert_eq!(item.kind, ClipboardKind::Text);
        assert_eq!(item.content, "OCR text");
        assert_eq!(item.search_text.as_deref(), Some("OCR text"));
        assert_eq!(item.summary.as_deref(), Some("OCR text"));
    }
}
