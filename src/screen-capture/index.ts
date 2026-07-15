import { error as logError } from "@tauri-apps/plugin-log";
import { startScreenCapture } from "@/plugins/screenCapture";
import { globalStore } from "@/stores/global";
import { shouldStartScreenCapture } from "./shared";

export const startScreenCaptureOcr = async () => {
  if (!shouldStartScreenCapture(globalStore.env.platform)) {
    return;
  }

  try {
    await startScreenCapture();
  } catch (error) {
    await logError(`screen-capture: failed to start: ${String(error)}`);
  }
};
