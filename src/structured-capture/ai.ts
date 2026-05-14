import { DEFAULT_AI_EXTRACTION_PROMPT } from "@/constants/structuredCapture";
import {
  fetchStructuredCaptureAiModels as invokeFetchStructuredCaptureAiModels,
  requestStructuredCaptureAiChatCompletion,
} from "@/plugins/structuredCapture";
import { clipboardStore } from "@/stores/clipboard";
import type { StructuredCaptureRecord } from "@/types/structured-capture";
import { applyInternalRules, buildInternalRulePrompt } from "./internalRules";
import {
  cleanupStructuredCaptureValue,
  sanitizeAddressValue,
  sanitizeEmail,
  sanitizePhoneNumber,
} from "./shared";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
}

interface ModelsResponse {
  data?: Array<{
    id?: string;
  }>;
}

interface AiRequestOptions {
  ai: typeof clipboardStore.structuredCapture.ai;
  text: string;
}

const CN_KEYS = {
  address: "\u5730\u5740",
  companyName: "\u516c\u53f8\u540d\u79f0",
  contactName: "\u59d3\u540d/\u6cd5\u4eba",
  email: "\u90ae\u7bb1",
  phoneNumber: "\u7535\u8bdd\u53f7\u7801",
} as const;

const cleanupValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }

  return cleanupStructuredCaptureValue(String(value));
};

const parseJsonBlock = (content: string) => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
};

const readMessageContent = (response: ChatCompletionResponse) => {
  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  return content
    .map((item) => item.text ?? "")
    .join("")
    .trim();
};

const createChatCompletionMessages = (extraPrompt: string, text: string) => {
  return [
    {
      content: extraPrompt.trim(),
      role: "system",
    },
    {
      content: text.slice(0, 6000),
      role: "user",
    },
  ];
};

const createRuleGenerationMessages = (requirement: string) => {
  return [
    {
      content: [
        "\u4f60\u662f\u4e00\u4e2a\u91c7\u96c6\u89c4\u5219\u6574\u7406\u52a9\u624b\u3002",
        "\u8bf7\u628a\u7528\u6237\u7684\u81ea\u7136\u8bed\u8a00\u8981\u6c42\u6574\u7406\u6210\u7b80\u6d01\u3001\u53ef\u6267\u884c\u7684\u91c7\u96c6\u89c4\u5219\u3002",
        "\u53ea\u56f4\u7ed5\u4e94\u4e2a\u5b57\u6bb5\uff1a\u516c\u53f8\u540d\u79f0\u3001\u59d3\u540d/\u6cd5\u4eba\u3001\u7535\u8bdd\u53f7\u7801\u3001\u90ae\u7bb1\u3001\u5730\u5740\u3002",
        "\u8bf7\u4f7f\u7528\u6761\u76ee\u5217\u8868\uff0c\u4e0d\u8981\u8f93\u51fa Markdown \u4ee3\u7801\u5757\uff0c\u4e0d\u8981\u8f93\u51fa\u89e3\u91ca\u3002",
        "\u5982\u679c\u7528\u6237\u8981\u6c42\u53ea\u63d0\u53d6\u67d0\u4e9b\u5b57\u6bb5\uff0c\u8bf7\u660e\u786e\u5199\u51fa\u201c\u53ea\u63d0\u53d6...\u201d\u3002",
      ].join("\n"),
      role: "system",
    },
    {
      content: requirement.slice(0, 3000),
      role: "user",
    },
  ];
};

const parseEndpointUrl = (endpoint: string) => {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(
      "\u8bf7\u68c0\u67e5 AI \u63a5\u53e3\u5730\u5740\u683c\u5f0f\u3002",
    );
  }

  return url;
};

const getModelsEndpoint = (endpoint: string) => {
  const url = parseEndpointUrl(endpoint);
  const trimmedPath = url.pathname.replace(/\/+$/, "");

  if (trimmedPath.endsWith("/chat/completions")) {
    url.pathname = trimmedPath.replace(/\/chat\/completions$/, "/models");
  } else if (trimmedPath.endsWith("/completions")) {
    url.pathname = trimmedPath.replace(/\/completions$/, "/models");
  } else if (trimmedPath.endsWith("/responses")) {
    url.pathname = trimmedPath.replace(/\/responses$/, "/models");
  } else if (!trimmedPath.endsWith("/models")) {
    url.pathname = `${trimmedPath || ""}/models`;
  }

  url.search = "";
  url.hash = "";
  return url.toString();
};

const getChatCompletionEndpoints = (endpoint: string) => {
  const primaryUrl = parseEndpointUrl(endpoint);
  const originalUrl = primaryUrl.toString();
  const trimmedPath = primaryUrl.pathname.replace(/\/+$/, "");

  if (trimmedPath.endsWith("/chat/completions")) {
    return [originalUrl];
  }

  if (trimmedPath.endsWith("/models")) {
    primaryUrl.pathname = trimmedPath.replace(/\/models$/, "/chat/completions");
  } else if (
    trimmedPath.endsWith("/completions") &&
    !trimmedPath.endsWith("/chat/completions")
  ) {
    primaryUrl.pathname = trimmedPath.replace(
      /\/completions$/,
      "/chat/completions",
    );
  } else {
    primaryUrl.pathname = `${trimmedPath || ""}/chat/completions`;
  }

  primaryUrl.search = "";
  primaryUrl.hash = "";

  const nextEndpoints = [primaryUrl.toString(), originalUrl];
  return nextEndpoints.filter(
    (current, index, list) => list.indexOf(current) === index,
  );
};

const createChatCompletionBody = (
  ai: typeof clipboardStore.structuredCapture.ai,
  text: string,
) => {
  const internalRulePrompt = buildInternalRulePrompt(ai.prompt || "");

  return {
    messages: createChatCompletionMessages(
      `${DEFAULT_AI_EXTRACTION_PROMPT}\n${internalRulePrompt}`.trim(),
      text,
    ),
    model: ai.model,
    temperature: 0,
  };
};

const createRuleGenerationBody = (
  ai: typeof clipboardStore.structuredCapture.ai,
  requirement: string,
) => {
  return {
    messages: createRuleGenerationMessages(requirement),
    model: ai.model,
    temperature: 0,
  };
};

const createEndpoint404Error = (endpoints: string[]) => {
  const attempted = endpoints.join(" , ");
  return new Error(
    `\u63a5\u53e3\u8fd4\u56de 404\uff0c\u8bf7\u68c0\u67e5 AI \u5730\u5740\u662f\u5426\u6b63\u786e\u3002\u5c1d\u8bd5\u5730\u5740\uff1a${attempted}`,
  );
};

const requestChatCompletion = async ({ ai, text }: AiRequestOptions) => {
  const endpoints = getChatCompletionEndpoints(ai.endpoint);
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    const response = await requestStructuredCaptureAiChatCompletion({
      apiKey: ai.apiKey,
      body: createChatCompletionBody(ai, text),
      endpoint,
      timeoutMs: ai.timeoutMs || 20000,
    });

    lastStatus = response.status;

    if (response.status === 404 && endpoints.length > 1) {
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      if (response.status === 404) {
        throw createEndpoint404Error(endpoints);
      }

      throw new Error(
        `AI \u63d0\u53d6\u5931\u8d25\uff0c\u63a5\u53e3\u8fd4\u56de ${response.status}\u3002`,
      );
    }

    const data = JSON.parse(response.body) as ChatCompletionResponse;
    return readMessageContent(data);
  }

  if (lastStatus === 404) {
    throw createEndpoint404Error(endpoints);
  }

  throw new Error(
    `AI \u63d0\u53d6\u5931\u8d25\uff0c\u63a5\u53e3\u8fd4\u56de ${lastStatus}\u3002`,
  );
};

const requestRuleGeneration = async (
  ai: typeof clipboardStore.structuredCapture.ai,
  requirement: string,
) => {
  const endpoints = getChatCompletionEndpoints(ai.endpoint);
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    const response = await requestStructuredCaptureAiChatCompletion({
      apiKey: ai.apiKey,
      body: createRuleGenerationBody(ai, requirement),
      endpoint,
      timeoutMs: ai.timeoutMs || 20000,
    });

    lastStatus = response.status;

    if (response.status === 404 && endpoints.length > 1) {
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      if (response.status === 404) {
        throw createEndpoint404Error(endpoints);
      }

      throw new Error(
        `\u751f\u6210\u89c4\u5219\u5931\u8d25\uff0c\u63a5\u53e3\u8fd4\u56de ${response.status}\u3002`,
      );
    }

    const data = JSON.parse(response.body) as ChatCompletionResponse;
    return readMessageContent(data);
  }

  if (lastStatus === 404) {
    throw createEndpoint404Error(endpoints);
  }

  throw new Error(
    `\u751f\u6210\u89c4\u5219\u5931\u8d25\uff0c\u63a5\u53e3\u8fd4\u56de ${lastStatus}\u3002`,
  );
};

const requestAvailableModels = async (
  ai: typeof clipboardStore.structuredCapture.ai,
) => {
  const response = await invokeFetchStructuredCaptureAiModels({
    apiKey: ai.apiKey,
    endpoint: getModelsEndpoint(ai.endpoint),
    timeoutMs: ai.timeoutMs || 20000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `\u83b7\u53d6\u6a21\u578b\u5931\u8d25\uff0c\u72b6\u6001\u7801 ${response.status}`,
    );
  }

  const data = JSON.parse(response.body) as ModelsResponse;
  const models =
    data.data
      ?.map((item) => item.id?.trim() ?? "")
      .filter(Boolean)
      .filter((model, index, list) => list.indexOf(model) === index) ?? [];

  return models;
};

const parseStructuredRecord = (
  messageContent: string,
): Omit<StructuredCaptureRecord, "capturedAt"> | null => {
  if (!messageContent) {
    return null;
  }

  const parsed = JSON.parse(parseJsonBlock(messageContent)) as Record<
    string,
    unknown
  >;
  const record = toStructuredRecord(parsed);

  if (!hasUsefulFields(record)) {
    return null;
  }

  return record;
};

const toStructuredRecord = (
  payload: Record<string, unknown>,
): Omit<StructuredCaptureRecord, "capturedAt"> => {
  return {
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

export const extractByAi = async (
  text: string,
): Promise<Omit<StructuredCaptureRecord, "capturedAt"> | null> => {
  const { ai } = clipboardStore.structuredCapture;

  if (!ai.enabled || !ai.endpoint || !ai.model) {
    return null;
  }

  const messageContent = await requestChatCompletion({
    ai,
    text,
  });
  const record = parseStructuredRecord(messageContent);

  if (!record) {
    return null;
  }

  return applyInternalRules(record, ai.prompt || "");
};

export const generateStructuredCaptureInternalRules = async (): Promise<{
  message: string;
  ok: boolean;
  rules: string;
}> => {
  const { ai } = clipboardStore.structuredCapture;
  const requirement = cleanupStructuredCaptureValue(ai.prompt || "");

  if (!ai.endpoint || !ai.model) {
    return {
      message:
        "\u8bf7\u5148\u586b\u5199 AI \u63a5\u53e3\u5730\u5740\u548c\u6a21\u578b\u540d\u3002",
      ok: false,
      rules: "",
    };
  }

  if (!requirement) {
    return {
      message:
        "\u8bf7\u5148\u5199\u4e0b\u4f60\u7684\u91c7\u96c6\u8981\u6c42\u3002",
      ok: false,
      rules: "",
    };
  }

  const generatedRules = cleanupStructuredCaptureValue(
    await requestRuleGeneration(ai, requirement),
  );

  if (!generatedRules) {
    return {
      message: "\u672a\u751f\u6210\u6709\u6548\u89c4\u5219\u3002",
      ok: false,
      rules: "",
    };
  }

  return {
    message: "\u5df2\u751f\u6210\u91c7\u96c6\u89c4\u5219\u3002",
    ok: true,
    rules: generatedRules,
  };
};

export const testStructuredCaptureAiEndpoint = async (): Promise<{
  message: string;
  ok: boolean;
}> => {
  const { ai } = clipboardStore.structuredCapture;

  if (!ai.enabled) {
    return {
      message: "\u8bf7\u5148\u5f00\u542f AI \u63d0\u53d6\u3002",
      ok: false,
    };
  }

  if (!ai.endpoint || !ai.model) {
    return {
      message:
        "\u8bf7\u5148\u586b\u5199 AI \u63a5\u53e3\u5730\u5740\u548c\u6a21\u578b\u540d\u3002",
      ok: false,
    };
  }

  const testText = [
    "\u516c\u53f8\u540d\u79f0\uff1a\u6d4b\u8bd5\u6709\u9650\u516c\u53f8",
    "\u59d3\u540d/\u6cd5\u4eba\uff1a\u5f20\u4e09",
    "\u7535\u8bdd\uff1a13800138000",
    "\u90ae\u7bb1\uff1atest@example.com",
    "\u5730\u5740\uff1a\u5317\u4eac\u5e02\u6d77\u6dc0\u533a\u67d0\u8def1\u53f7",
  ].join("\n");

  const messageContent = await requestChatCompletion({
    ai,
    text: testText,
  });
  const record = parseStructuredRecord(messageContent);

  if (!record) {
    return {
      message:
        "\u63a5\u53e3\u5df2\u901a\uff0c\u4f46\u8fd4\u56de\u683c\u5f0f\u4e0d\u662f\u6709\u6548 JSON \u6216\u5b57\u6bb5\u4e0d\u5b8c\u6574\u3002",
      ok: false,
    };
  }

  return {
    message: "\u63a5\u53e3\u5b9e\u6d4b\u6210\u529f\u3002",
    ok: true,
  };
};

export const fetchStructuredCaptureAiModels = async (): Promise<{
  message: string;
  models: string[];
  ok: boolean;
}> => {
  const { ai } = clipboardStore.structuredCapture;

  if (!ai.endpoint) {
    return {
      message: "\u8bf7\u5148\u586b\u5199 AI \u63a5\u53e3\u5730\u5740\u3002",
      models: [],
      ok: false,
    };
  }

  const models = await requestAvailableModels(ai);

  if (!models.length) {
    return {
      message:
        "\u63a5\u53e3\u5df2\u901a\uff0c\u4f46\u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u6a21\u578b\u5217\u8868\u3002",
      models: [],
      ok: false,
    };
  }

  return {
    message: `\u5df2\u83b7\u53d6 ${models.length} \u4e2a\u6a21\u578b\u3002`,
    models,
    ok: true,
  };
};
