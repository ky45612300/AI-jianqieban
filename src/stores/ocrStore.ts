import { proxy } from "valtio";

export type OcrMode = "online" | "local" | "auto";

export const ocrStore = proxy({
  provider: "paddle" as string,
  mode: "auto" as OcrMode,
  apiKey: "" as string,
  timeoutMs: 10000 as number,
});

// Try to load persisted settings from localStorage
try {
  const raw = localStorage.getItem("ecopaste:ocr");
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.provider) ocrStore.provider = parsed.provider;
    if (parsed.mode) ocrStore.mode = parsed.mode;
    if (parsed.apiKey) ocrStore.apiKey = parsed.apiKey;
    if (parsed.timeoutMs) ocrStore.timeoutMs = parsed.timeoutMs;
  }
} catch (e) {
  // ignore
}

// persist on changes
ocrStore.subscribe = (callback: any) => {
  // noop - valtio proxy doesn't expose subscribe directly; consumers can write explicit saves.
};

export function saveOcrStore() {
  try {
    localStorage.setItem(
      "ecopaste:ocr",
      JSON.stringify({
        provider: ocrStore.provider,
        mode: ocrStore.mode,
        apiKey: ocrStore.apiKey,
        timeoutMs: ocrStore.timeoutMs,
      })
    );
  } catch (e) {
    // ignore
  }
}
