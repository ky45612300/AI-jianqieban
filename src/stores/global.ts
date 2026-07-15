import { proxy } from "valtio";
import { DEFAULT_SCREEN_CAPTURE_SHORTCUT } from "@/screen-capture/shared";
import type { GlobalStore } from "@/types/store";

export const globalStore = proxy<GlobalStore>({
  app: {
    autoStart: false,
    showMenubarIcon: true,
    showTaskbarIcon: false,
    silentStart: false,
  },

  appearance: {
    isDark: false,
    theme: "auto",
  },

  env: {},

  shortcut: {
    clipboard: "Alt+C",
    pastePlain: "",
    preference: "Alt+X",
    quickPaste: {
      enable: false,
      value: "Command+Shift",
    },
    screenCapture: DEFAULT_SCREEN_CAPTURE_SHORTCUT,
  },

  update: {
    auto: false,
    beta: false,
  },
});
