import { invoke } from "@tauri-apps/api/core";

const COMMAND = {
  APPEND_CSV: "append_structured_capture_csv",
  FETCH_AI_MODELS: "fetch_structured_capture_ai_models",
  REQUEST_AI_CHAT_COMPLETION: "request_structured_capture_ai_chat_completion",
};

export interface AppendStructuredCaptureCsvPayload
  extends Record<string, unknown> {
  outputPath: string;
  headers: string[];
  values: string[];
}

export interface StructuredCaptureAiRequestPayload
  extends Record<string, unknown> {
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
  body?: Record<string, unknown>;
}

export interface StructuredCaptureAiResponse {
  body: string;
  status: number;
}

export const appendStructuredCaptureCsv = (
  payload: AppendStructuredCaptureCsvPayload,
) => {
  return invoke(COMMAND.APPEND_CSV, { payload });
};

export const fetchStructuredCaptureAiModels = (
  payload: StructuredCaptureAiRequestPayload,
) => {
  return invoke<StructuredCaptureAiResponse>(COMMAND.FETCH_AI_MODELS, {
    payload,
  });
};

export const requestStructuredCaptureAiChatCompletion = (
  payload: StructuredCaptureAiRequestPayload,
) => {
  return invoke<StructuredCaptureAiResponse>(
    COMMAND.REQUEST_AI_CHAT_COMPLETION,
    {
      payload,
    },
  );
};
