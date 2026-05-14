import { readStructuredCaptureExternalScript } from "@/plugins/structuredCapture";
import type { StructuredCaptureRecord } from "@/types/structured-capture";
import {
  cleanupStructuredCaptureValue,
  hasCompanyHint,
  isLikelyAddressLine,
  isNoiseLine,
  normalizeStructuredCaptureText,
  sanitizeAddressValue,
  sanitizeEmail,
  sanitizePhoneNumber,
  splitStructuredCaptureLines,
} from "./shared";

const CN_KEYS = {
  address: "地址",
  companyName: "公司名称",
  contactName: "姓名/法人",
  email: "邮箱",
  phoneNumber: "电话号码",
} as const;

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

const cleanupValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }

  return cleanupStructuredCaptureValue(String(value));
};

const isRecordPayload = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const hasUsefulFields = (
  record: Omit<StructuredCaptureRecord, "capturedAt">,
) => {
  const meaningfulFields = [
    record.companyName,
    record.contactName,
    record.phoneNumber,
    record.email,
    record.address,
  ].filter(Boolean);

  return Boolean(record.companyName) && meaningfulFields.length >= 2;
};

const toStructuredRecord = (
  payload: unknown,
): Omit<StructuredCaptureRecord, "capturedAt"> | null => {
  if (!isRecordPayload(payload)) {
    return null;
  }

  const record = {
    address: sanitizeAddressValue(
      cleanupValue(
        payload.address ?? payload.companyAddress ?? payload[CN_KEYS.address],
      ),
    ),
    companyName: cleanupValue(
      payload.companyName ?? payload.company ?? payload[CN_KEYS.companyName],
    ),
    contactName: cleanupValue(
      payload.contactName ??
        payload.legalPerson ??
        payload.name ??
        payload[CN_KEYS.contactName],
    ),
    email: sanitizeEmail(cleanupValue(payload.email ?? payload[CN_KEYS.email])),
    phoneNumber: sanitizePhoneNumber(
      cleanupValue(
        payload.phoneNumber ?? payload.phone ?? payload[CN_KEYS.phoneNumber],
      ),
    ),
  };

  if (!hasUsefulFields(record)) {
    return null;
  }

  return record;
};

const runExternalScript = (source: string, text: string) => {
  const runner = new Function(
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

  return runner(text, externalScriptHelpers);
};

export const extractByExternalScript = async (
  text: string,
): Promise<Omit<StructuredCaptureRecord, "capturedAt"> | null> => {
  const source = await readStructuredCaptureExternalScript();
  const payload = await Promise.resolve(runExternalScript(source, text));

  return toStructuredRecord(payload);
};
