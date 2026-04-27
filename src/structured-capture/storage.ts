import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { error as logError } from "@tauri-apps/plugin-log";
import {
  STRUCTURED_CAPTURE_COLUMN_ORDER,
  STRUCTURED_CAPTURE_HEADERS,
} from "@/constants/structuredCapture";
import { appendStructuredCaptureCsv } from "@/plugins/structuredCapture";
import type {
  StructuredCaptureChannel,
  StructuredCaptureRecord,
  StructuredCaptureState,
} from "@/types/structured-capture";
import {
  getStructuredCaptureCsvPath,
  getStructuredCapturePath,
  getStructuredCaptureStatePath,
} from "@/utils/path";

const getState = async (statePath: string): Promise<StructuredCaptureState> => {
  if (!(await exists(statePath))) {
    return {
      lastFingerprint: "",
      updatedAt: "",
    };
  }

  try {
    const content = await readTextFile(statePath);
    if (!content.trim()) {
      return {
        lastFingerprint: "",
        updatedAt: "",
      };
    }

    const state = JSON.parse(content) as Partial<StructuredCaptureState>;

    return {
      lastFingerprint: state.lastFingerprint ?? "",
      updatedAt: state.updatedAt ?? "",
    };
  } catch (captureError) {
    await logError(
      `structured-capture: failed to read state file ${statePath}: ${String(captureError)}`,
    );

    return {
      lastFingerprint: "",
      updatedAt: "",
    };
  }
};

const saveState = async (statePath: string, fingerprint: string) => {
  const payload: StructuredCaptureState = {
    lastFingerprint: fingerprint,
    updatedAt: new Date().toISOString(),
  };

  await writeTextFile(statePath, JSON.stringify(payload, null, 2));
};

export const persistStructuredCaptureRecord = async (
  channel: StructuredCaptureChannel,
  record: StructuredCaptureRecord,
  fingerprint: string,
  customOutputDir?: string,
) => {
  const outputDir = getStructuredCapturePath(channel, customOutputDir);
  const statePath = getStructuredCaptureStatePath(channel, customOutputDir);
  const outputPath = getStructuredCaptureCsvPath(channel, customOutputDir);

  await mkdir(outputDir, { recursive: true });

  const state = await getState(statePath);
  if (state.lastFingerprint === fingerprint) {
    return false;
  }

  await appendStructuredCaptureCsv({
    headers: STRUCTURED_CAPTURE_COLUMN_ORDER.map(
      (key) => STRUCTURED_CAPTURE_HEADERS[key],
    ),
    outputPath,
    values: STRUCTURED_CAPTURE_COLUMN_ORDER.map((key) => record[key]),
  });

  await saveState(statePath, fingerprint);
  return true;
};
