import type { StructuredCaptureRecord } from "@/types/structured-capture";
import { cleanupStructuredCaptureValue } from "./shared";

export type StructuredCaptureField = keyof Omit<
  StructuredCaptureRecord,
  "capturedAt"
>;

type StructuredCaptureDraft = Omit<StructuredCaptureRecord, "capturedAt">;

interface InternalRuleConfig {
  excludedFields: Set<StructuredCaptureField>;
  includedFields: Set<StructuredCaptureField>;
  onlyMode: boolean;
}

const FIELD_DEFINITIONS: Array<{
  key: StructuredCaptureField;
  label: string;
  pattern: RegExp;
}> = [
  {
    key: "companyName",
    label: "\u516c\u53f8\u540d\u79f0",
    pattern:
      /(?:\u516c\u53f8\u540d\u79f0|\u4f01\u4e1a\u540d\u79f0|\u516c\u53f8|\u4f01\u4e1a|\u540d\u79f0|company)/i,
  },
  {
    key: "contactName",
    label: "\u59d3\u540d/\u6cd5\u4eba",
    pattern:
      /(?:\u59d3\u540d\/\u6cd5\u4eba|\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u8d1f\u8d23\u4eba|\u7ecf\u8425\u8005|\u8054\u7cfb\u4eba|\u59d3\u540d|contact|person)/i,
  },
  {
    key: "phoneNumber",
    label: "\u7535\u8bdd\u53f7\u7801",
    pattern:
      /(?:\u7535\u8bdd\u53f7\u7801|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a|\u8054\u7cfb\u7535\u8bdd|\u8054\u7cfb\u65b9\u5f0f|phone|mobile|tel)/i,
  },
  {
    key: "email",
    label: "\u90ae\u7bb1",
    pattern:
      /(?:\u90ae\u7bb1|\u7535\u5b50\u90ae\u7bb1|\u90ae\u4ef6|email|e-mail)/i,
  },
  {
    key: "address",
    label: "\u5730\u5740",
    pattern:
      /(?:\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740|\u901a\u8baf\u5730\u5740|\u529e\u516c\u5730\u5740|\u4f4f\u6240|\u6240\u5728\u5730|address)/i,
  },
];

const DEFAULT_FIELD_SET = new Set(FIELD_DEFINITIONS.map((field) => field.key));

const ONLY_INTENT_PATTERN =
  /(?:\u53ea|\u4ec5|\u53ea\u8981|\u4ec5\u8981|\u53ea\u9700|\u4ec5\u9700|\u53ea\u63d0\u53d6|\u4ec5\u63d0\u53d6|\u53ea\u91c7\u96c6|\u4ec5\u91c7\u96c6|\u53ea\u4fdd\u7559|\u4ec5\u4fdd\u7559|\u53ea\u8f93\u51fa|\u4ec5\u8f93\u51fa)/;
const INCLUDE_INTENT_PATTERN =
  /(?:\u9700\u8981|\u63d0\u53d6|\u91c7\u96c6|\u4fdd\u7559|\u8f93\u51fa|\u8bc6\u522b|\u586b\u5199|\u5b57\u6bb5)/;
const EXCLUDE_INTENT_PATTERN =
  /(?:\u4e0d\u63d0\u53d6|\u4e0d\u8981\u63d0\u53d6|\u4e0d\u91c7\u96c6|\u4e0d\u8981\u91c7\u96c6|\u4e0d\u8f93\u51fa|\u4e0d\u8981\u8f93\u51fa|\u4e0d\u4fdd\u7559|\u4e0d\u8981\u4fdd\u7559|\u65e0\u9700|\u6392\u9664\u5b57\u6bb5|\u5ffd\u7565\u5b57\u6bb5)/;
const YES_VALUE_PATTERN =
  /[:\uFF1A]\s*(?:\u662f|\u8981|\u9700\u8981|\u63d0\u53d6|\u91c7\u96c6|\u4fdd\u7559|\u8f93\u51fa|true|yes)\s*$/i;
const NO_VALUE_PATTERN =
  /[:\uFF1A]\s*(?:\u5426|\u4e0d|\u4e0d\u8981|\u4e0d\u9700\u8981|\u4e0d\u63d0\u53d6|\u4e0d\u91c7\u96c6|\u6392\u9664|\u5ffd\u7565|false|no)\s*$/i;

const getMentionedFields = (line: string) => {
  return FIELD_DEFINITIONS.filter((field) => field.pattern.test(line)).map(
    (field) => field.key,
  );
};

const splitRuleLines = (ruleText: string) => {
  return cleanupStructuredCaptureValue(ruleText)
    .split(/\n|；|;/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, "").trim())
    .filter(Boolean);
};

export const parseInternalRuleConfig = (
  ruleText: string,
): InternalRuleConfig => {
  const config: InternalRuleConfig = {
    excludedFields: new Set(),
    includedFields: new Set(),
    onlyMode: false,
  };

  for (const line of splitRuleLines(ruleText)) {
    const fields = getMentionedFields(line);
    if (fields.length === 0) {
      continue;
    }

    if (ONLY_INTENT_PATTERN.test(line)) {
      config.onlyMode = true;
      for (const field of fields) {
        config.includedFields.add(field);
      }
      continue;
    }

    if (NO_VALUE_PATTERN.test(line) || EXCLUDE_INTENT_PATTERN.test(line)) {
      for (const field of fields) {
        config.excludedFields.add(field);
      }
      continue;
    }

    if (YES_VALUE_PATTERN.test(line) || INCLUDE_INTENT_PATTERN.test(line)) {
      for (const field of fields) {
        config.includedFields.add(field);
      }
    }
  }

  return config;
};

const getActiveFields = (config: InternalRuleConfig) => {
  const fields =
    config.onlyMode && config.includedFields.size > 0
      ? new Set(config.includedFields)
      : new Set(DEFAULT_FIELD_SET);

  for (const field of config.excludedFields) {
    fields.delete(field);
  }

  return fields;
};

const hasUsefulFields = (
  record: StructuredCaptureDraft,
  activeFields: Set<StructuredCaptureField>,
) => {
  const activeValues = Array.from(activeFields)
    .map((field) => record[field])
    .filter(Boolean);

  if (activeFields.size > 0 && activeFields.size <= 2) {
    return activeValues.length > 0;
  }

  const meaningfulFields = [
    record.companyName,
    record.contactName,
    record.phoneNumber,
    record.email,
    record.address,
  ].filter(Boolean);

  return Boolean(record.companyName) && meaningfulFields.length >= 2;
};

export const applyInternalRules = <T extends StructuredCaptureDraft>(
  record: T,
  ruleText: string,
) => {
  const config = parseInternalRuleConfig(ruleText);
  const activeFields = getActiveFields(config);
  const nextRecord = { ...record };

  for (const field of DEFAULT_FIELD_SET) {
    if (!activeFields.has(field)) {
      nextRecord[field] = "";
    }
  }

  if (!hasUsefulFields(nextRecord, activeFields)) {
    return null;
  }

  return nextRecord;
};

export const buildInternalRulePrompt = (ruleText: string) => {
  const cleaned = cleanupStructuredCaptureValue(ruleText);
  if (!cleaned) {
    return "";
  }

  return [
    "\u5185\u5728\u91c7\u96c6\u89c4\u5219\uff1a",
    cleaned,
    "\u8bf7\u4e25\u683c\u6309\u4ee5\u4e0a\u89c4\u5219\u51b3\u5b9a\u9700\u8981\u63d0\u53d6\u548c\u7f6e\u7a7a\u7684\u5b57\u6bb5\u3002",
  ].join("\n");
};
