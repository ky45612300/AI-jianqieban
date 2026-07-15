import { stat } from "@tauri-apps/plugin-fs";
import { error as logError, info as logInfo } from "@tauri-apps/plugin-log";
import { useMount } from "ahooks";
import { cloneDeep } from "es-toolkit";
import { isEmpty, remove } from "es-toolkit/compat";
import { nanoid } from "nanoid";
import {
  type ClipboardChangeOptions,
  getDefaultSaveImagePath,
  onClipboardChange,
  type ReadClipboard,
  startListening,
} from "tauri-plugin-clipboard-x-api";
import { enqueueClipboardImageOcr } from "@/clipboard-ocr";
import {
  createClipboardImageDisplayHistory,
  createOcrTextHistory,
  resolveClipboardImageOcrPath,
  shouldAcceptClipboardImage,
} from "@/clipboard-ocr/shared";
import {
  insertHistory,
  selectHistory,
  updateHistory,
} from "@/database/history";
import type { State } from "@/pages/Main";
import { getClipboardTextSubtype } from "@/plugins/clipboard";
import { clipboardStore } from "@/stores/clipboard";
import { enqueueStructuredCapture } from "@/structured-capture";
import type { DatabaseSchemaHistory } from "@/types/database";
import { formatDate } from "@/utils/dayjs";

const waitForImageFileBytes = async (imagePath: string) => {
  for (let index = 0; index < 6; index += 1) {
    try {
      const fileInfo = await stat(imagePath);

      if (fileInfo.isFile && fileInfo.size > 0) {
        return fileInfo.size;
      }
    } catch {
      // The clipboard plugin may still be writing the image file.
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return 0;
};

export const useClipboard = (
  state: State,
  options?: ClipboardChangeOptions,
) => {
  useMount(async () => {
    await startListening();
    let queue: Promise<unknown> = Promise.resolve();

    const insertOcrTextHistory = async (ocrText: string) => {
      const subtype = await getClipboardTextSubtype(ocrText);
      const textData = createOcrTextHistory({
        createTime: formatDate(),
        id: nanoid(),
        subtype,
        text: ocrText,
      }) as DatabaseSchemaHistory<"text">;

      const [matched] = await selectHistory((qb) => {
        return qb.where("type", "=", "text").where("value", "=", ocrText);
      });
      const visible = state.group === "all" || state.group === "text";

      if (matched) {
        if (!clipboardStore.content.autoSort) return;

        if (visible) {
          remove(state.list, { id: matched.id });
          state.list.unshift({ ...textData, id: matched.id });
        }

        await updateHistory(matched.id, { createTime: textData.createTime });
        return;
      }

      if (visible) {
        state.list.unshift(textData);
      }

      await insertHistory(textData);
    };

    const handleClipboardChange = async (result: ReadClipboard) => {
      const { files, image, html, rtf, text } = result;

      if (isEmpty(result) || Object.values(result).every(isEmpty)) return;

      const { copyPlain } = clipboardStore.content;

      const data = {
        createTime: formatDate(),
        favorite: false,
        group: "text",
        id: nanoid(),
        search: text?.value,
      } as DatabaseSchemaHistory;

      if (files) {
        Object.assign(data, files, {
          group: "files",
          search: files.value.join(" "),
        });
      } else if (html && !copyPlain) {
        Object.assign(data, html);
      } else if (rtf && !copyPlain) {
        Object.assign(data, rtf);
      } else if (text) {
        const subtype = await getClipboardTextSubtype(text.value);

        Object.assign(data, text, {
          subtype,
        });
      } else if (image) {
        Object.assign(data, image, {
          group: "image",
        });
      }

      const sqlData = cloneDeep(data);

      const { type, value, group, createTime } = data;
      const structuredText = text?.value ?? data.search ?? "";
      let ocrImagePath = "";

      if (type === "image") {
        const imagePath = resolveClipboardImageOcrPath({
          imageValue: value,
          saveImagePath: await getDefaultSaveImagePath(),
        });
        const fileBytes = await waitForImageFileBytes(imagePath);

        if (
          !shouldAcceptClipboardImage({
            fileBytes,
            reportedBytes: data.count,
          })
        ) {
          await logInfo(
            `clipboard: skipped empty image, reportedBytes=${String(data.count)}, fileBytes=${fileBytes}, imagePath=${imagePath}`,
          );
          return;
        }

        Object.assign(
          data,
          createClipboardImageDisplayHistory(data, { imagePath }),
        );
        ocrImagePath = imagePath;
      }

      if (type === "files") {
        sqlData.value = JSON.stringify(value);
      }

      if (["text", "html", "rtf"].includes(type) && structuredText) {
        void enqueueStructuredCapture(structuredText);
      }

      const [matched] = await selectHistory((qb) => {
        const { type, value } = sqlData;

        return qb.where("type", "=", type).where("value", "=", value);
      });

      const visible = state.group === "all" || state.group === group;

      if (matched) {
        if (!clipboardStore.content.autoSort) return;

        const { id } = matched;

        if (visible) {
          remove(state.list, { id });

          state.list.unshift({ ...data, id });
        }

        return updateHistory(id, { createTime });
      }

      if (visible) {
        state.list.unshift(data);
      }

      await insertHistory(sqlData);

      if (ocrImagePath) {
        void enqueueClipboardImageOcr(ocrImagePath, insertOcrTextHistory);
      }
    };

    onClipboardChange((result) => {
      queue = queue
        .then(() => handleClipboardChange(result))
        .catch(async (error) => {
          await logError(
            `clipboard: failed to handle change: ${String(error)}`,
          );
        });
    }, options);
  });
};
