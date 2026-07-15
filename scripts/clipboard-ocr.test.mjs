import assert from "node:assert/strict";
import test from "node:test";
import {
  createClipboardImageDisplayHistory,
  createOcrTextHistory,
  normalizeOcrText,
  resolveClipboardImageOcrPath,
  resolveWechatOcrTimeoutMs,
  shouldAcceptClipboardImage,
  shouldRunWechatOcr,
} from "../src/clipboard-ocr/shared.ts";
import { clipboardStore } from "../src/stores/clipboard.ts";

test("shouldRunWechatOcr only allows enabled Windows image paths", () => {
  assert.equal(
    shouldRunWechatOcr({
      enabled: true,
      imagePath: "D:\\capture.png",
      platform: "windows",
    }),
    true,
  );
  assert.equal(
    shouldRunWechatOcr({
      enabled: false,
      imagePath: "D:\\capture.png",
      platform: "windows",
    }),
    false,
  );
  assert.equal(
    shouldRunWechatOcr({
      enabled: true,
      imagePath: "",
      platform: "windows",
    }),
    false,
  );
  assert.equal(
    shouldRunWechatOcr({
      enabled: true,
      imagePath: "D:\\capture.png",
      platform: "macos",
    }),
    false,
  );
});

test("normalizeOcrText trims OCR noise without joining useful lines", () => {
  assert.equal(
    normalizeOcrText("  公司名称：测试公司\r\n\r\n 电话：123456 \n "),
    "公司名称：测试公司\n电话：123456",
  );
});

test("resolveWechatOcrTimeoutMs clamps unsafe values", () => {
  assert.equal(resolveWechatOcrTimeoutMs(undefined), 10000);
  assert.equal(resolveWechatOcrTimeoutMs(100), 1000);
  assert.equal(resolveWechatOcrTimeoutMs(5000), 5000);
  assert.equal(resolveWechatOcrTimeoutMs(999999), 120000);
});

test("WeChat OCR is enabled by default for screenshot OCR builds", () => {
  assert.equal(clipboardStore.wechatOcr.enabled, true);
});

test("resolveClipboardImageOcrPath resolves plugin image filenames from the clipboard image directory", () => {
  assert.equal(
    resolveClipboardImageOcrPath({
      imageValue: "3752102193407215918.png",
      saveImagePath:
        "C:\\Users\\LSir\\AppData\\Roaming\\com.ayangweb.EcoPaste\\tauri-plugin-clipboard-x\\images",
    }),
    "C:\\Users\\LSir\\AppData\\Roaming\\com.ayangweb.EcoPaste\\tauri-plugin-clipboard-x\\images\\3752102193407215918.png",
  );

  assert.equal(
    resolveClipboardImageOcrPath({
      imageValue: "D:\\Pictures\\capture.png",
      saveImagePath:
        "C:\\Users\\LSir\\AppData\\Roaming\\com.ayangweb.EcoPaste\\tauri-plugin-clipboard-x\\images",
    }),
    "D:\\Pictures\\capture.png",
  );
});

test("createClipboardImageDisplayHistory keeps database image value separate from display path", () => {
  const sqlData = {
    group: "image",
    type: "image",
    value: "3752102193407215918.png",
  };
  const displayData = createClipboardImageDisplayHistory(sqlData, {
    imagePath:
      "C:\\Users\\LSir\\AppData\\Roaming\\com.ayangweb.EcoPaste\\tauri-plugin-clipboard-x\\images\\3752102193407215918.png",
  });

  assert.equal(sqlData.value, "3752102193407215918.png");
  assert.equal(
    displayData.value,
    "C:\\Users\\LSir\\AppData\\Roaming\\com.ayangweb.EcoPaste\\tauri-plugin-clipboard-x\\images\\3752102193407215918.png",
  );
});

test("shouldAcceptClipboardImage rejects empty placeholder images", () => {
  assert.equal(
    shouldAcceptClipboardImage({
      fileBytes: 64_000,
      reportedBytes: 0,
    }),
    false,
  );
  assert.equal(
    shouldAcceptClipboardImage({
      fileBytes: 0,
      reportedBytes: 64_000,
    }),
    false,
  );
  assert.equal(
    shouldAcceptClipboardImage({
      fileBytes: 64_000,
      reportedBytes: 64_000,
    }),
    true,
  );
});

test("createOcrTextHistory creates a visible text history item from OCR text", () => {
  assert.deepEqual(
    createOcrTextHistory({
      createTime: "2026-07-06 18:00:00",
      id: "ocr-history-id",
      subtype: "url",
      text: "https://example.com\n识别文字",
    }),
    {
      createTime: "2026-07-06 18:00:00",
      favorite: false,
      group: "text",
      id: "ocr-history-id",
      search: "https://example.com\n识别文字",
      subtype: "url",
      type: "text",
      value: "https://example.com\n识别文字",
    },
  );
});
