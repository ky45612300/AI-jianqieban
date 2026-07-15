use std::process::Command;

use tauri::{AppHandle, Manager};

use crate::core::{AppError, Result};

const SCREEN_CAPTURE_URI: &str = "ms-screenclip:";

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

pub fn trigger_screen_capture(app: &AppHandle) -> Result<()> {
    if cfg!(not(target_os = "windows")) {
        return Err(AppError::Clipboard(
            "截图 OCR 仅支持 Windows。".to_owned(),
        ));
    }

    for (_, window) in app.webview_windows() {
        let _ = window.hide();
    }

    Command::new("explorer.exe")
        .arg(SCREEN_CAPTURE_URI)
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| AppError::Clipboard(format!("启动截图工具失败：{error}")))?;

    Ok(())
}

#[tauri::command]
pub fn start_screen_capture(app: AppHandle) -> Result<()> {
    trigger_screen_capture(&app)
}
