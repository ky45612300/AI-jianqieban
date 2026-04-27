import type { StructuredCaptureRecord } from "@/types/structured-capture";

export const STRUCTURED_CAPTURE_HEADERS: Record<
  keyof StructuredCaptureRecord,
  string
> = {
  address: "\u5730\u5740",
  capturedAt: "\u91c7\u96c6\u65f6\u95f4",
  companyName: "\u516c\u53f8\u540d\u79f0",
  contactName: "\u59d3\u540d/\u6cd5\u4eba",
  email: "\u90ae\u7bb1",
  phoneNumber: "\u7535\u8bdd\u53f7\u7801",
};

export const STRUCTURED_CAPTURE_COLUMN_ORDER: (keyof StructuredCaptureRecord)[] =
  [
    "capturedAt",
    "companyName",
    "contactName",
    "phoneNumber",
    "email",
    "address",
  ];

export const DEFAULT_STRUCTURED_CAPTURE_OUTPUT_DIRS = {
  ai: "D:\\\u4fe1\u606f\u91c7\u96c6\\AI\u8bc6\u522b",
  rules: "D:\\\u4fe1\u606f\u91c7\u96c6\\\u89c4\u5219\u63d0\u53d6",
} as const;

export const DEFAULT_AI_EXTRACTION_PROMPT = [
  "\u4f60\u662f\u4e00\u4e2a\u4f01\u4e1a\u4fe1\u606f\u7ed3\u6784\u5316\u63d0\u53d6\u52a9\u624b\u3002",
  "\u8bf7\u4ece\u7528\u6237\u63d0\u4f9b\u7684\u526a\u5207\u677f\u6587\u672c\u4e2d\u63d0\u53d6\u4ee5\u4e0b\u5b57\u6bb5\uff1a\u516c\u53f8\u540d\u79f0\u3001\u59d3\u540d/\u6cd5\u4eba\u3001\u7535\u8bdd\u53f7\u7801\u3001\u90ae\u7bb1\u3001\u5730\u5740\u3002",
  "\u5982\u679c\u67d0\u4e2a\u5b57\u6bb5\u4e0d\u5b58\u5728\uff0c\u8bf7\u8fd4\u56de\u7a7a\u5b57\u7b26\u4e32\u3002",
  "\u53ea\u8fd4\u56de JSON\uff0c\u4e0d\u8981\u8fd4\u56de\u89e3\u91ca\uff0c\u4e0d\u8981\u4f7f\u7528 Markdown \u4ee3\u7801\u5757\u3002",
  "JSON \u952e\u5fc5\u987b\u4e25\u683c\u4f7f\u7528\uff1acompanyName, contactName, phoneNumber, email, address",
].join("\n");
