import { invoke } from "@tauri-apps/api/core";
import type { WechatOcrResult } from "@/types/clipboard-ocr";

const COMMAND = {
  RUN: "run_wechat_ocr",
};

export interface RunWechatOcrPayload extends Record<string, unknown> {
  imagePath: string;
  timeoutMs: number;
}

export const runWechatOcr = (payload: RunWechatOcrPayload) => {
  return invoke<WechatOcrResult>(COMMAND.RUN, { payload });
};
