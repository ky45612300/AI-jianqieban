import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCREEN_CAPTURE_SHORTCUT,
  SCREEN_CAPTURE_URI,
  shouldStartScreenCapture,
} from "../src/screen-capture/shared.ts";

test("screen capture uses Alt+Z as the default shortcut", () => {
  assert.equal(DEFAULT_SCREEN_CAPTURE_SHORTCUT, "Alt+Z");
});

test("screen capture uses the Windows screen clipping URI", () => {
  assert.equal(SCREEN_CAPTURE_URI, "ms-screenclip:");
});

test("screen capture only starts on Windows", () => {
  assert.equal(shouldStartScreenCapture("windows"), true);
  assert.equal(shouldStartScreenCapture("macos"), false);
  assert.equal(shouldStartScreenCapture("linux"), false);
  assert.equal(shouldStartScreenCapture(undefined), false);
});
