import { proxy } from "valtio";
import type { ClipboardStore } from "@/types/store";

export const clipboardStore = proxy<ClipboardStore>({
  audio: {
    copy: false,
  },

  content: {
    autoFavorite: false,
    autoPaste: "double",
    autoSort: false,
    copyPlain: false,
    deleteConfirm: true,
    operationButtons: ["copy", "star", "delete"],
    pastePlain: false,
    showOriginalContent: false,
  },

  history: {
    duration: 0,
    maxCount: 0,
    unit: 1,
  },

  search: {
    autoClear: false,
    defaultFocus: false,
    position: "top",
  },

  structuredCapture: {
    ai: {
      apiKey: "",
      enabled: false,
      endpoint: "",
      model: "",
      outputDir: "",
      prompt: "",
      timeoutMs: 20000,
    },
    rules: {
      enabled: false,
      outputDir: "",
      scriptSource: "builtin",
    },
  },
  window: {
    backTop: false,
    position: "remember",
    showAll: false,
    style: "standard",
  },
});
