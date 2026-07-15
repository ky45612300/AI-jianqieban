import { error as logError, info as logInfo } from "@tauri-apps/plugin-log";
import { writeText } from "tauri-plugin-clipboard-x-api";
import { runWechatOcr } from "@/plugins/wechatOcr";
import { clipboardStore } from "@/stores/clipboard";
import { globalStore } from "@/stores/global";
import { enqueueStructuredCapture } from "@/structured-capture";
import {
  normalizeOcrText,
  resolveWechatOcrTimeoutMs,
  shouldRunWechatOcr,
} from "./shared";

let queue = Promise.resolve();

export type ClipboardImageOcrTextHandler = (
  text: string,
) => Promise<void> | void;

const runClipboardImageOcr = async (
  imagePath: string,
  onText?: ClipboardImageOcrTextHandler,
) => {
  const { wechatOcr } = clipboardStore;
  const timeoutMs = resolveWechatOcrTimeoutMs(wechatOcr.timeoutMs);
  const platform = globalStore.env.platform;

  if (
    !shouldRunWechatOcr({
      enabled: wechatOcr.enabled,
      imagePath,
      platform,
    })
  ) {
    await logInfo(
      `wechat-ocr: skipped, enabled=${wechatOcr.enabled}, platform=${String(platform)}, imagePath=${imagePath}`,
    );
    return;
  }

  const result = await runWechatOcr({
    imagePath,
    timeoutMs,
  });

  const text = normalizeOcrText(result.text);
  if (!text) {
    return;
  }

  await writeText(text);
  await onText?.(text);
  await logInfo(`wechat-ocr: wrote OCR text, length=${text.length}`);

  if (wechatOcr.structuredCapture) {
    await enqueueStructuredCapture(text);
  }
};

export const enqueueClipboardImageOcr = (
  imagePath: string,
  onText?: ClipboardImageOcrTextHandler,
) => {
  queue = queue
    .then(() => runClipboardImageOcr(imagePath, onText))
    .catch(async (ocrError) => {
      await logError(`wechat-ocr: image OCR failed: ${String(ocrError)}`);
    });

  return queue;
};
