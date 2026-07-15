import { invoke } from "@tauri-apps/api/core";

const COMMAND = {
  START: "start_screen_capture",
};

export const startScreenCapture = () => {
  return invoke<void>(COMMAND.START);
};
