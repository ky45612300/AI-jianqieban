import { error as logError } from "@tauri-apps/plugin-log";
import { clipboardStore } from "@/stores/clipboard";
import type {
  StructuredCaptureChannel,
  StructuredCaptureRecord,
} from "@/types/structured-capture";
import { formatDate } from "@/utils/dayjs";
import { extractByAi } from "./ai";
import { extractByExternalScript } from "./externalScript";
import { extractByRules } from "./rules";
import { isStructuredCaptureCandidate } from "./shared";
import { persistStructuredCaptureRecord } from "./storage";

const channelQueues: Record<StructuredCaptureChannel, Promise<void>> = {
  ai: Promise.resolve(),
  rules: Promise.resolve(),
};

const normalizeInput = (text: string) => {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
};

const buildFingerprint = async (
  channel: StructuredCaptureChannel,
  text: string,
  variant?: string,
) => {
  const payload = new TextEncoder().encode(
    variant ? `${channel}:${variant}:${text}` : `${channel}:${text}`,
  );
  const hashBuffer = await crypto.subtle.digest("SHA-256", payload);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((item) => item.toString(16).padStart(2, "0")).join("");
};

const toRecord = (
  payload: Omit<StructuredCaptureRecord, "capturedAt">,
): StructuredCaptureRecord => {
  return {
    ...payload,
    capturedAt: formatDate(),
  };
};

const processChannel = async (
  channel: StructuredCaptureChannel,
  text: string,
  extractor: (
    value: string,
  ) =>
    | Promise<Omit<StructuredCaptureRecord, "capturedAt"> | null>
    | Omit<StructuredCaptureRecord, "capturedAt">
    | null,
  outputDir?: string,
  fingerprintVariant?: string,
) => {
  const result = await extractor(text);
  if (!result) {
    return;
  }

  const fingerprint = await buildFingerprint(channel, text, fingerprintVariant);
  await persistStructuredCaptureRecord(
    channel,
    toRecord(result),
    fingerprint,
    outputDir,
  );
};

const runStructuredCapture = async (text: string) => {
  const normalizedText = normalizeInput(text);
  if (!normalizedText) {
    return;
  }

  const { rules, ai } = clipboardStore.structuredCapture;
  const useExternalRules = rules.scriptSource === "external";

  if (!rules.enabled && !ai.enabled) {
    return;
  }

  const isBuiltInCandidate = isStructuredCaptureCandidate(normalizedText);
  if (!isBuiltInCandidate && !(rules.enabled && useExternalRules)) {
    return;
  }

  const enqueueChannel = (
    channel: StructuredCaptureChannel,
    task: () => Promise<void>,
  ) => {
    channelQueues[channel] = channelQueues[channel]
      .then(task)
      .catch(async (captureError) => {
        await logError(
          `structured-capture: ${channel} channel failed: ${String(captureError)}`,
        );
      });

    return channelQueues[channel];
  };

  const tasks: Promise<void>[] = [];

  if (rules.enabled && (isBuiltInCandidate || useExternalRules)) {
    tasks.push(
      enqueueChannel("rules", () =>
        processChannel(
          "rules",
          normalizedText,
          useExternalRules
            ? extractByExternalScript
            : (value) => extractByRules(value, ai.prompt || ""),
          rules.outputDir,
          useExternalRules ? "external" : `builtin:${ai.prompt || ""}`,
        ),
      ),
    );
  }

  if (ai.enabled && isBuiltInCandidate) {
    tasks.push(
      enqueueChannel("ai", () =>
        processChannel("ai", normalizedText, extractByAi, ai.outputDir),
      ),
    );
  }

  await Promise.allSettled(tasks);
};

export const enqueueStructuredCapture = (text: string) => {
  return runStructuredCapture(text).catch(async (captureError) => {
    await logError(
      `structured-capture: processing failed: ${String(captureError)}`,
    );
  });
};
