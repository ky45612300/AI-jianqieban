use serde::{Deserialize, Serialize};
use std::{
    env,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

const SIDECAR_EXE_NAME: &str = "wechat-ocr-sidecar.exe";
const MAX_TIMEOUT_MS: u64 = 120_000;
const MIN_TIMEOUT_MS: u64 = 1_000;

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
    let timeout = timeout_ms.unwrap_or(10_000).clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
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

fn resolve_sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    candidate_sidecar_paths(app)
        .into_iter()
        .find(|path| executable_exists(path))
        .ok_or_else(|| {
            "未找到 WeChat OCR 辅助程序，请先发布或放置 wechat-ocr-sidecar.exe。".to_string()
        })
}

fn read_pipe<T: Read>(pipe: &mut Option<T>) -> String {
    let mut output = String::new();
    if let Some(pipe) = pipe.as_mut() {
        let _ = pipe.read_to_string(&mut output);
    }
    output
}

fn run_sidecar(sidecar_path: PathBuf, image_path: &str, timeout: Duration) -> Result<String, String> {
    let mut child = Command::new(sidecar_path)
        .arg("--image")
        .arg(image_path)
        .arg("--timeout")
        .arg(timeout.as_millis().to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| format!("启动 WeChat OCR 辅助程序失败：{error}"))?;

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

                return Err(format!("WeChat OCR 辅助程序执行失败：{}", message.trim()));
            }
            Ok(None) => {
                if started_at.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("WeChat OCR 识别超时。".to_string());
                }

                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                let _ = child.kill();
                return Err(format!("等待 WeChat OCR 辅助程序失败：{error}"));
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

#[tauri::command]
pub fn run_wechat_ocr(
    app: AppHandle,
    payload: RunWechatOcrPayload,
) -> Result<WechatOcrResponse, String> {
    if cfg!(not(target_os = "windows")) {
        return Err("WeChat OCR 仅支持 Windows。".to_string());
    }

    let image_path = payload.image_path.trim();
    if image_path.is_empty() {
        return Err("图片路径为空，无法进行 OCR。".to_string());
    }

    let sidecar_path = resolve_sidecar_path(&app)?;
    let output = run_sidecar(sidecar_path, image_path, normalize_timeout(payload.timeout_ms))?;
    let response = serde_json::from_str::<SidecarResponse>(&output)
        .map_err(|error| format!("解析 WeChat OCR 返回结果失败：{error}"))?;

    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "WeChat OCR 未返回有效结果。".to_string()));
    }

    Ok(WechatOcrResponse {
        text: response.text.unwrap_or_default(),
        image_path: image_path.to_string(),
    })
}
