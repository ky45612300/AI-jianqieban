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

export const isAbsolutePath = (path: string) => {
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
  reportedBytes: _reportedBytes,
}: ShouldAcceptClipboardImageOptions) => {
  // 以磁盘文件实际大小为准：文件有内容（fileBytes > 0）就放行。
  // 占位空图的文件本身是 0 字节，仍会被过滤；
  // 而 reportedBytes 在 Windows 上对真实图片有时报 0（上报延迟/不可靠），
  // 不能作为拒绝依据，否则会把真实图片误判为空图丢弃。
  return fileBytes > 0;
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
