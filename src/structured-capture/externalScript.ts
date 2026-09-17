import { readStructuredCaptureExternalScript } from "@/plugins/structuredCapture";
import type { StructuredCaptureRecord } from "@/types/structured-capture";
import {
  cleanupStructuredCaptureValue,
  hasCompanyHint,
  hasUsefulFields,
  isLikelyAddressLine,
  isNoiseLine,
  normalizeStructuredCaptureText,
  sanitizeAddressValue,
  sanitizeEmail,
  sanitizePhoneNumber,
  splitStructuredCaptureLines,
  toStructuredRecordFromPayload,
} from "./shared";

const externalScriptHelpers = {
  cleanup: cleanupStructuredCaptureValue,
  hasCompanyHint,
  isLikelyAddressLine,
  isNoiseLine,
  normalizeText: normalizeStructuredCaptureText,
  sanitizeAddress: sanitizeAddressValue,
  sanitizeEmail,
  sanitizePhoneNumber,
  splitLines: splitStructuredCaptureLines,
};

// 外置脚本缓存：剪贴板变化频繁时避免每次都走 IPC 读文件 + new Function 重新编译。
// 用户编辑脚本后最多延迟 5 秒生效。
const SCRIPT_CACHE_TTL_MS = 5000;
let scriptCache: { loadedAt: number; source: string } | null = null;

const readExternalScript = async () => {
  const now = Date.now();
  if (scriptCache && now - scriptCache.loadedAt < SCRIPT_CACHE_TTL_MS) {
    return scriptCache.source;
  }

  const source = await readStructuredCaptureExternalScript();
  scriptCache = { loadedAt: now, source };
  return source;
};

const EXECUTION_CACHE = new Map<
  string,
  (value: string, helpers: typeof externalScriptHelpers) => unknown
>();

const simpleHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
};

const runExternalScript = (source: string, text: string) => {
  const cacheKey = simpleHash(source).toString(16);
  let runner = EXECUTION_CACHE.get(cacheKey);

  if (!runner) {
    runner = new Function(
      "text",
      "helpers",
      `
"use strict";
const module = { exports: {} };
const exports = module.exports;

${source}

const __structuredCaptureRunner =
  (typeof module.exports === "function" ? module.exports : undefined) ||
  (typeof module.exports.capture === "function" ? module.exports.capture : undefined) ||
  (typeof exports.capture === "function" ? exports.capture : undefined) ||
  (typeof captureStructuredClipboard === "function" ? captureStructuredClipboard : undefined) ||
  (typeof capture === "function" ? capture : undefined);

if (typeof __structuredCaptureRunner !== "function") {
  throw new Error("外置采集脚本需要导出 capture(text, helpers) 函数。");
}

return __structuredCaptureRunner(text, helpers);
`,
    ) as (value: string, helpers: typeof externalScriptHelpers) => unknown;

    EXECUTION_CACHE.set(cacheKey, runner);
  }

  return runner(text, externalScriptHelpers);
};

/**
 * 纯函数：给定外置脚本文本源与输入文本，执行脚本并转换为结构化记录。
 * 不依赖 Tauri IPC，便于单元测试；生产路径由 extractByExternalScript 读脚本后调用。
 */
export const recordFromScriptSource = (
  source: string,
  text: string,
): Omit<StructuredCaptureRecord, "capturedAt"> | null => {
  const payload = runExternalScript(source, text);
  const record = toStructuredRecordFromPayload(payload);
  if (!record || !hasUsefulFields(record)) {
    return null;
  }

  return record;
};

export const extractByExternalScript = async (
  text: string,
): Promise<Omit<StructuredCaptureRecord, "capturedAt"> | null> => {
  const source = await readExternalScript();
  return recordFromScriptSource(source, text);
};
