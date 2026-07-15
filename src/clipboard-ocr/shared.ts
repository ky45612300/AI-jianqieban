import type { Platform } from "@tauri-apps/plugin-os";

interface ShouldRunWechatOcrOptions {
  enabled: boolean;
  imagePath?: string;
  platform?: Platform;
}

interface CreateOcrTextHistoryOptions {
  createTime: string;
  id: string;
  subtype?: "url" | "email" | "color" | "path";
  text: string;
}

interface ResolveClipboardImageOcrPathOptions {
  imageValue: string;
  saveImagePath: string;
}

interface ShouldAcceptClipboardImageOptions {
  fileBytes: number;
  reportedBytes?: number;
}

interface CreateClipboardImageDisplayHistoryOptions {
  imagePath: string;
}

const isAbsolutePath = (path: string) => {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
};

export const createClipboardImageDisplayHistory = <T extends { value: string }>(
  data: T,
  { imagePath }: CreateClipboardImageDisplayHistoryOptions,
) => ({
  ...data,
  value: imagePath,
});

export const shouldAcceptClipboardImage = ({
  fileBytes,
  reportedBytes,
}: ShouldAcceptClipboardImageOptions) => {
  const hasValidReportedBytes =
    reportedBytes === undefined || reportedBytes > 0;

  return hasValidReportedBytes && fileBytes > 0;
};

export const resolveClipboardImageOcrPath = ({
  imageValue,
  saveImagePath,
}: ResolveClipboardImageOcrPathOptions) => {
  const value = imageValue.trim();

  if (!value || isAbsolutePath(value)) {
    return value;
  }

  const separator = saveImagePath.includes("\\") ? "\\" : "/";

  return [
    saveImagePath.replace(/[\\/]+$/, ""),
    value.replace(/^[\\/]+/, ""),
  ].join(separator);
};

export const createOcrTextHistory = ({
  createTime,
  id,
  subtype,
  text,
}: CreateOcrTextHistoryOptions) => ({
  createTime,
  favorite: false,
  group: "text" as const,
  id,
  search: text,
  ...(subtype ? { subtype } : {}),
  type: "text" as const,
  value: text,
});

export const normalizeOcrText = (text: string) => {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
};

export const resolveWechatOcrTimeoutMs = (timeoutMs?: number) => {
  if (!Number.isFinite(timeoutMs)) {
    return 10000;
  }

  return Math.min(Math.max(Math.trunc(timeoutMs as number), 1000), 120000);
};

export const shouldRunWechatOcr = ({
  enabled,
  imagePath,
  platform,
}: ShouldRunWechatOcrOptions) => {
  return enabled && platform === "windows" && Boolean(imagePath?.trim());
};
