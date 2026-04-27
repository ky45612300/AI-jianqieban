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

const CONTACT_PATTERNS = [
  /(?:\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u59d3\u540d\/\u6cd5\u4eba|\u59d3\u540d|\u8054\u7cfb\u4eba)\s*(?::|\uFF1A|\s)\s*(?<value>[^\r\n]+)/i,
];

const PHONE_PATTERNS = [
  /(?:\u7535\u8bdd\u53f7\u7801|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a|\u8054\u7cfb\u7535\u8bdd)\s*(?::|\uFF1A|\s)\s*(?<value>(?:\+?86[-\s]*)?1\d{10})/i,
  /(?<value>(?:\+?86[-\s]*)?1\d{10})/,
];

const EMAIL_PATTERNS = [
  /(?:\u90ae\u7bb1|\u7535\u5b50\u90ae\u7bb1|Email|E-mail)\s*(?::|\uFF1A|\s)\s*(?<value>[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/i,
  /(?<value>[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+(?:\.[A-Za-z0-9-]{2,})?)/i,
];

const ADDRESS_PATTERNS = [
  /(?:\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740)\s*(?::|\uFF1A)\s*(?<value>.+?)(?=(?:\s*(?:Q?\u7ecf\u8425\u8303\u56f4|\u4e3b\u8425|\u5b98\u7f51|\u7f51\u5740|\u7b80\u4ecb|\u9644\u8fd1\u4f01\u4e1a|\u66f4\u591a\d*))|$)/is,
];

const emptyRecord = (): StructuredCaptureRecord => ({
  address: "",
  capturedAt: "",
  companyName: "",
  contactName: "",
  email: "",
  phoneNumber: "",
});

const extractByPatterns = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const matched = pattern.exec(text);
    if (!matched) {
      continue;
    }

    const value = matched.groups?.value ?? matched[1] ?? "";
    const cleaned = cleanupStructuredCaptureValue(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
};

const extractCompanyName = (text: string) => {
  const lines = splitStructuredCaptureLines(text).filter(
    (line) => !isNoiseLine(line),
  );
  if (lines.length === 0) {
    return "";
  }

  const hintedLine = lines.find((line) => {
    return (
      !/[:\uFF1A]/.test(line) &&
      !sanitizePhoneNumber(line) &&
      !sanitizeEmail(line) &&
      !isLikelyAddressLine(line) &&
      hasCompanyHint(line)
    );
  });

  if (hintedLine) {
    return cleanupStructuredCaptureValue(hintedLine);
  }

  const fallbackLine = lines.find((line) => {
    return (
      !/[:\uFF1A]/.test(line) &&
      !sanitizePhoneNumber(line) &&
      !sanitizeEmail(line) &&
      !isLikelyAddressLine(line)
    );
  });

  return fallbackLine ? cleanupStructuredCaptureValue(fallbackLine) : "";
};

const extractAddress = (text: string) => {
  const byLabel = sanitizeAddressValue(
    extractByPatterns(text, ADDRESS_PATTERNS),
  );
  if (byLabel) {
    return byLabel;
  }

  const lines = splitStructuredCaptureLines(text);
  const lineAddress = lines.find(
    (line) => !isNoiseLine(line) && isLikelyAddressLine(line),
  );

  return lineAddress ? sanitizeAddressValue(lineAddress) : "";
};

const hasUsefulFields = (record: StructuredCaptureRecord) => {
  const meaningfulFields = [
    record.companyName,
    record.contactName,
    record.phoneNumber,
    record.email,
    record.address,
  ].filter(Boolean);

  return Boolean(record.companyName) && meaningfulFields.length >= 2;
};

export const extractByRules = (
  text: string,
): Omit<StructuredCaptureRecord, "capturedAt"> | null => {
  const normalizedText = normalizeStructuredCaptureText(text);
  if (!normalizedText) {
    return null;
  }

  const record = emptyRecord();
  record.companyName = extractCompanyName(normalizedText);
  record.contactName = extractByPatterns(normalizedText, CONTACT_PATTERNS);
  record.phoneNumber = sanitizePhoneNumber(
    extractByPatterns(normalizedText, PHONE_PATTERNS),
  );
  record.email = sanitizeEmail(
    extractByPatterns(normalizedText, EMAIL_PATTERNS),
  );
  record.address = extractAddress(normalizedText);

  if (!hasUsefulFields(record)) {
    return null;
  }

  const { capturedAt: _capturedAt, ...result } = record;
  return result;
};
