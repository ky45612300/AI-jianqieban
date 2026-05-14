import type { StructuredCaptureRecord } from "@/types/structured-capture";
import { applyInternalRules } from "./internalRules";
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

type StructuredCaptureDraft = Omit<StructuredCaptureRecord, "capturedAt">;
type FieldKey = keyof StructuredCaptureDraft;

const FIELD_LABELS: Record<FieldKey, RegExp> = {
  address:
    /^(?:\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740|\u901a\u8baf\u5730\u5740|\u529e\u516c\u5730\u5740|\u4f4f\u6240|\u6240\u5728\u5730)$/i,
  companyName:
    /^(?:\u516c\u53f8\u540d\u79f0|\u4f01\u4e1a\u540d\u79f0|\u540d\u79f0|\u5546\u6237\u540d\u79f0|\u5e97\u94fa\u540d\u79f0|\u673a\u6784\u540d\u79f0|\u5355\u4f4d\u540d\u79f0)$/i,
  contactName:
    /^(?:\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u8d1f\u8d23\u4eba|\u7ecf\u8425\u8005|\u8054\u7cfb\u4eba|\u59d3\u540d|\u59d3\u540d\/\u6cd5\u4eba|\u8001\u677f)$/i,
  email:
    /^(?:\u90ae\u7bb1|\u7535\u5b50\u90ae\u7bb1|\u90ae\u4ef6|Email|E-mail)$/i,
  phoneNumber:
    /^(?:\u7535\u8bdd\u53f7\u7801|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a|\u8054\u7cfb\u7535\u8bdd|\u8054\u7cfb\u65b9\u5f0f|\u8054\u7cfb\u7535\u8bdd\u53f7\u7801|\u5ea7\u673a)$/i,
};

const LABEL_ORDER: FieldKey[] = [
  "companyName",
  "contactName",
  "phoneNumber",
  "email",
  "address",
];

const BOUNDARY_LABELS = [
  "\u516c\u53f8\u540d\u79f0",
  "\u4f01\u4e1a\u540d\u79f0",
  "\u540d\u79f0",
  "\u5546\u6237\u540d\u79f0",
  "\u5e97\u94fa\u540d\u79f0",
  "\u673a\u6784\u540d\u79f0",
  "\u5355\u4f4d\u540d\u79f0",
  "\u6cd5\u5b9a\u4ee3\u8868\u4eba",
  "\u6cd5\u4eba",
  "\u8d1f\u8d23\u4eba",
  "\u7ecf\u8425\u8005",
  "\u8054\u7cfb\u4eba",
  "\u59d3\u540d/\u6cd5\u4eba",
  "\u59d3\u540d",
  "\u8001\u677f",
  "\u7535\u8bdd\u53f7\u7801",
  "\u8054\u7cfb\u7535\u8bdd\u53f7\u7801",
  "\u8054\u7cfb\u7535\u8bdd",
  "\u8054\u7cfb\u65b9\u5f0f",
  "\u7535\u8bdd",
  "\u624b\u673a\u53f7",
  "\u624b\u673a",
  "\u5ea7\u673a",
  "\u90ae\u7bb1",
  "\u7535\u5b50\u90ae\u7bb1",
  "\u90ae\u4ef6",
  "Email",
  "E-mail",
  "\u5730\u5740",
  "\u8054\u7cfb\u5730\u5740",
  "\u516c\u53f8\u5730\u5740",
  "\u7ecf\u8425\u5730\u5740",
  "\u6ce8\u518c\u5730\u5740",
  "\u901a\u8baf\u5730\u5740",
  "\u529e\u516c\u5730\u5740",
  "\u4f4f\u6240",
  "\u6240\u5728\u5730",
  "\u7ecf\u8425\u8303\u56f4",
  "\u4e3b\u8425",
  "\u5b98\u7f51",
  "\u7f51\u5740",
  "\u7b80\u4ecb",
  "\u9644\u8fd1\u4f01\u4e1a",
  "\u66f4\u591a",
];

const LABEL_PATTERN = new RegExp(
  `(${BOUNDARY_LABELS.map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})\\s*(?:[:\uFF1A])`,
  "gi",
);

const PHONE_PATTERN = /(?:\+?86[-\s]*)?(1[3-9]\d{9})/;
const LANDLINE_PATTERN = /(?:0\d{2,3}[-\s]?)?\d{7,8}(?:[-\s]?\d{1,6})?/;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+(?:\.[A-Za-z0-9-]{2,})?/;
const CONTACT_INLINE_PATTERN =
  /(?:\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u8d1f\u8d23\u4eba|\u7ecf\u8425\u8005|\u8054\u7cfb\u4eba|\u59d3\u540d|\u59d3\u540d\/\u6cd5\u4eba|\u8001\u677f)\s+([\u4e00-\u9fa5\u00b7]{2,8})/;
const STOP_VALUE_PATTERN =
  /(?:\u7ecf\u8425\u8303\u56f4|\u4e3b\u8425|\u5b98\u7f51|\u7f51\u5740|\u7b80\u4ecb|\u9644\u8fd1\u4f01\u4e1a|\u66f4\u591a\d*|\u4f01\u4e1a\u98ce\u9669|\u53f8\u6cd5\u6848\u4ef6|\u6d89\u8bc9\u5173\u7cfb|\u6700\u7ec8\u53d7\u76ca\u4eba|\u5b9e\u9645\u63a7\u5236\u4eba|\u80a1\u4e1c\u4fe1\u606f|\u4e3b\u8981\u4eba\u5458|\u53d8\u66f4\u8bb0\u5f55)\s*[:\uFF1A]?[\s\S]*$/i;
const COMPANY_TAIL_PATTERN =
  /(\u6709\u9650\u8d23\u4efb\u516c\u53f8|\u80a1\u4efd\u6709\u9650\u516c\u53f8|\u6709\u9650\u516c\u53f8|\u96c6\u56e2\u6709\u9650\u516c\u53f8|\u96c6\u56e2|\u516c\u53f8|\u5de5\u4f5c\u5ba4|\u4e8b\u52a1\u6240|\u5546\u884c|\u4e2d\u5fc3|\u7ecf\u8425\u90e8|\u670d\u52a1\u90e8|\u95e8\u5e97|\u5206\u5e97|\u65d7\u8230\u5e97|\u4e13\u5356\u5e97|\u5382)(?![\u4e00-\u9fa5])/;
const BAD_TAIL_PATTERN =
  /\u7ecf\u8425\u8303\u56f4|\u4e3b\u8425|\u5b98\u7f51|\u7f51\u5740|\u7b80\u4ecb|\u9644\u8fd1\u4f01\u4e1a|\u66f4\u591a/;
const ADDRESS_WORD_PATTERN = /\u5730\u5740|\u4f4f\u6240|\u6240\u5728\u5730/;
const ADDRESS_SIGNAL_PATTERN =
  /\u7701|\u5e02|\u533a|\u53bf|\u9547|\u4e61|\u6751|\u8857|\u8def|\u9053|\u53f7|\u5f04|\u5df7|\u697c|\u680b|\u5ea7|\u5ba4|\u56ed|\u5e7f\u573a|\u5927\u53a6/;

const emptyRecord = (): StructuredCaptureDraft => ({
  address: "",
  companyName: "",
  contactName: "",
  email: "",
  phoneNumber: "",
});

const insertLabelBreaks = (text: string) => {
  return text.replace(LABEL_PATTERN, (_matched, label, offset: number) => {
    return offset > 0 ? `\n${label}\uFF1A` : `${label}\uFF1A`;
  });
};

const stripLabel = (value: string) => {
  const cleaned = cleanupStructuredCaptureValue(value);
  const separatorIndex = cleaned.search(/[:\uFF1A]/);
  if (separatorIndex < 0) {
    return cleaned;
  }

  const possibleLabel = cleaned.slice(0, separatorIndex).trim();
  if (LABEL_ORDER.some((key) => FIELD_LABELS[key].test(possibleLabel))) {
    return cleanupStructuredCaptureValue(cleaned.slice(separatorIndex + 1));
  }

  return cleaned;
};

const cleanValue = (value: string) => {
  return stripLabel(value.replace(STOP_VALUE_PATTERN, ""));
};

const findFieldKey = (label: string): FieldKey | null => {
  const cleanedLabel = cleanupStructuredCaptureValue(label).replace(
    /[:\uFF1A]/g,
    "",
  );

  return (
    LABEL_ORDER.find((key) => FIELD_LABELS[key].test(cleanedLabel)) ?? null
  );
};

const splitLabelValue = (line: string) => {
  const matched = /^([^:\uFF1A]{1,16})\s*[:\uFF1A]\s*([\s\S]*)$/.exec(line);
  if (!matched) {
    return null;
  }

  const key = findFieldKey(matched[1]);
  if (!key) {
    return null;
  }

  return {
    key,
    value: cleanValue(matched[2]),
  };
};

const normalizeForRules = (text: string) => {
  return insertLabelBreaks(normalizeStructuredCaptureText(text));
};

const getLines = (text: string) => {
  return splitStructuredCaptureLines(text)
    .map((line) => cleanupStructuredCaptureValue(line))
    .filter((line) => line && !isNoiseLine(line));
};

const extractLandline = (text: string) => {
  const matched = cleanValue(text).match(LANDLINE_PATTERN);
  if (!matched) {
    return "";
  }

  const digits = matched[0].replace(/\D/g, "");
  return digits.length >= 7 ? matched[0].replace(/\s+/g, "") : "";
};

const extractPhone = (text: string) => {
  return sanitizePhoneNumber(text) || extractLandline(text);
};

const normalizeCompanyName = (value: string) => {
  const cleaned = cleanValue(value)
    .replace(PHONE_PATTERN, "")
    .replace(EMAIL_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const tailMatched = COMPANY_TAIL_PATTERN.exec(cleaned);
  if (!tailMatched) {
    return cleaned;
  }

  return cleaned.slice(0, tailMatched.index + tailMatched[0].length).trim();
};

const normalizeContactName = (value: string) => {
  const cleaned = cleanValue(value)
    .replace(PHONE_PATTERN, "")
    .replace(EMAIL_PATTERN, "")
    .replace(
      /(?:\u5148\u751f|\u5973\u58eb|\u7ecf\u7406|\u8001\u677f|\u6cd5\u4eba|\u8d1f\u8d23\u4eba|\u8054\u7cfb\u4eba)$/i,
      "",
    )
    .trim();

  if (!cleaned || cleaned.length > 12) {
    return "";
  }

  return cleaned;
};

const normalizeFieldValue = (key: FieldKey, value: string) => {
  const cleaned = cleanValue(value);

  switch (key) {
    case "address":
      return sanitizeAddressValue(cleaned);
    case "companyName":
      return normalizeCompanyName(cleaned);
    case "contactName":
      return normalizeContactName(cleaned);
    case "email":
      return sanitizeEmail(cleaned);
    case "phoneNumber":
      return extractPhone(cleaned);
  }
};

const collectLabeledFields = (lines: string[]) => {
  const record = emptyRecord();

  for (const line of lines) {
    const labeled = splitLabelValue(line);
    if (!labeled || record[labeled.key]) {
      continue;
    }

    const value = normalizeFieldValue(labeled.key, labeled.value);
    if (value) {
      record[labeled.key] = value;
    }
  }

  return record;
};

const scoreCompanyLine = (line: string) => {
  if (
    !line ||
    sanitizeEmail(line) ||
    extractPhone(line) ||
    isLikelyAddressLine(line)
  ) {
    return -20;
  }

  let score = 0;
  if (hasCompanyHint(line)) score += 12;
  if (COMPANY_TAIL_PATTERN.test(line)) score += 8;
  if (/^[\u4e00-\u9fa5A-Za-z0-9\uff08\uff09()·\-\s]{4,60}$/.test(line)) {
    score += 2;
  }
  if (/[:\uFF1A]/.test(line)) score -= 8;
  if (BAD_TAIL_PATTERN.test(line)) score -= 20;
  if (line.length > 80) score -= 10;
  return score;
};

const extractCompanyName = (lines: string[]) => {
  const candidates = lines
    .map((line) => ({
      line,
      score: scoreCompanyLine(line),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ? normalizeCompanyName(candidates[0].line) : "";
};

const scoreAddressLine = (line: string) => {
  if (!line || sanitizeEmail(line) || extractPhone(line)) {
    return -20;
  }

  let score = isLikelyAddressLine(line) ? 8 : 0;
  if (ADDRESS_WORD_PATTERN.test(line)) score += 6;
  if (ADDRESS_SIGNAL_PATTERN.test(line)) score += 4;
  if (hasCompanyHint(line)) score -= 4;
  if (BAD_TAIL_PATTERN.test(line)) score -= 10;
  return score;
};

const extractAddress = (lines: string[]) => {
  const candidates = lines
    .map((line) => ({
      line,
      score: scoreAddressLine(line),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ? sanitizeAddressValue(candidates[0].line) : "";
};

const extractContactName = (lines: string[]) => {
  for (const line of lines) {
    const matched = CONTACT_INLINE_PATTERN.exec(line);
    if (!matched) {
      continue;
    }

    const contactName = normalizeContactName(matched[1]);
    if (contactName) {
      return contactName;
    }
  }

  return "";
};

const fillFallbackFields = (
  record: StructuredCaptureDraft,
  lines: string[],
) => {
  const joined = lines.join("\n");

  if (!record.phoneNumber) {
    record.phoneNumber = extractPhone(joined);
  }

  if (!record.email) {
    record.email = sanitizeEmail(joined);
  }

  if (!record.contactName) {
    record.contactName = extractContactName(lines);
  }

  if (!record.companyName) {
    record.companyName = extractCompanyName(lines);
  }

  if (!record.address) {
    record.address = extractAddress(lines);
  }
};

const hasUsefulFields = (record: StructuredCaptureDraft) => {
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
  ruleText = "",
): Omit<StructuredCaptureRecord, "capturedAt"> | null => {
  const normalizedText = normalizeForRules(text);
  if (!normalizedText) {
    return null;
  }

  const lines = getLines(normalizedText);
  if (lines.length === 0) {
    return null;
  }

  const record = collectLabeledFields(lines);
  fillFallbackFields(record, lines);

  if (!hasUsefulFields(record)) {
    return null;
  }

  return applyInternalRules(record, ruleText);
};
