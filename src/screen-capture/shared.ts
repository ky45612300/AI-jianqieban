import type { Platform } from "@tauri-apps/plugin-os";

export const DEFAULT_SCREEN_CAPTURE_SHORTCUT = "Alt+Z";

export const SCREEN_CAPTURE_URI = "ms-screenclip:";

export const shouldStartScreenCapture = (platform?: Platform) => {
  return platform === "windows";
};
