import { invoke } from "@tauri-apps/api/core";

const COMMAND = {
  APPEND_CSV: "append_structured_capture_csv",
  ENSURE_EXTERNAL_SCRIPT: "ensure_structured_capture_external_script",
  FETCH_AI_MODELS: "fetch_structured_capture_ai_models",
  GET_EXTERNAL_SCRIPT_PATH: "get_structured_capture_external_script_path",
  OPEN_EXTERNAL_SCRIPT: "open_structured_capture_external_script",
  READ_EXTERNAL_SCRIPT: "read_structured_capture_external_script",
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

export const getStructuredCaptureExternalScriptPath = () => {
  return invoke<string>(COMMAND.GET_EXTERNAL_SCRIPT_PATH);
};

export const ensureStructuredCaptureExternalScript = () => {
  return invoke<string>(COMMAND.ENSURE_EXTERNAL_SCRIPT);
};

export const openStructuredCaptureExternalScript = () => {
  return invoke<string>(COMMAND.OPEN_EXTERNAL_SCRIPT);
};

export const readStructuredCaptureExternalScript = () => {
  return invoke<string>(COMMAND.READ_EXTERNAL_SCRIPT);
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
