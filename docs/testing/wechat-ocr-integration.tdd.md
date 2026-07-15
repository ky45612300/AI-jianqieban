# WeChat OCR Integration TDD Evidence

## Source

Journeys derived during implementation.

## User Journeys

1. As a Windows user, I want copied images to be sent to local WeChat OCR when enabled, so that image text can enter the existing structured capture flow.
2. As a non-Windows user, I want the WeChat OCR option to stay unavailable, so that unsupported systems do not try to launch Windows-only OCR.
3. As a Windows user, I want a default Alt+Z shortcut that opens screen snipping and then OCRs the copied image.
4. As a Windows user, I want recognized screenshot text to appear as a text history item, so that OCR does not depend on a second clipboard change event.
5. As a Windows user, I want clipboard image filenames to resolve to the real clipboard image directory, so that OCR reads the saved screenshot instead of looking under the app install folder.
6. As a Windows user, I want newly captured image history items to display immediately, so that OCR text insertion does not break the screenshot preview.
7. As a Windows user, I want empty placeholder image events to be ignored, so that transient 0 B screenshot rows do not appear and then break/disappear.

## Evidence

| # | What is guaranteed | Test file or command | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | OCR only queues when enabled, on Windows, and with an image path | `scripts/clipboard-ocr.test.mjs` | unit | PASS | `node --test scripts\clipboard-ocr.test.mjs` |
| 2 | OCR text cleanup preserves useful lines and removes blank noise | `scripts/clipboard-ocr.test.mjs` | unit | PASS | `node --test scripts\clipboard-ocr.test.mjs` |
| 3 | OCR timeout values are clamped between 1s and 120s | `scripts/clipboard-ocr.test.mjs` | unit | PASS | `node --test scripts\clipboard-ocr.test.mjs` |
| 4 | Frontend TypeScript compiles | `pnpm.cmd exec tsc --noEmit` | typecheck | PASS | no diagnostics |
| 5 | Touched frontend files pass Biome | `pnpm.cmd exec biome check ...` | lint/format | PASS | no diagnostics |
| 6 | Frontend production build succeeds | `pnpm.cmd run build:vite` | build | PASS | Vite built `dist/` |
| 7 | Screenshot OCR defaults to Alt+Z and only starts on Windows | `scripts/screen-capture.test.mjs` | unit | PASS | `node --test scripts\screen-capture.test.mjs` |
| 8 | Tauri backend commands compile | `cargo check` | build | PASS | no diagnostics |
| 9 | OCR text can be converted into a visible text history item | `scripts/clipboard-ocr.test.mjs` | unit | PASS | `node --test scripts\clipboard-ocr.test.mjs scripts\screen-capture.test.mjs` |
| 10 | The integrated portable sidecar recognizes the provided screenshot | `release\AI-jianqieban-WeChatOCR_0.6.0-beta.3_x64-portable\bin\wechat-ocr-sidecar.exe --image F:\DevEnv\temp\codex-clipboard-e2b3dfc7-6ad8-4ad0-bb30-347020c392e4.png` | integration | PASS | returned `ok:true` with recognized Chinese text |
| 11 | Clipboard image filenames resolve to `tauri-plugin-clipboard-x\images` before OCR | `scripts/clipboard-ocr.test.mjs` | unit | PASS | `node --test scripts\clipboard-ocr.test.mjs scripts\screen-capture.test.mjs` |
| 12 | The installed app writes OCR text back to the system clipboard from a copied image | `D:\Program Files\EcoPaste\EcoPaste.exe` plus PowerShell STA clipboard image simulation | integration | PASS | final clipboard text contained the recognized Chinese text from `F:\DevEnv\temp\codex-clipboard-e2b3dfc7-6ad8-4ad0-bb30-347020c392e4.png` |
| 13 | OCR success and text history insertion are visible in runtime logs | `C:\Users\LSir\AppData\Local\com.ayangweb.EcoPaste\logs\EcoPaste.log` | integration | PASS | log included `wechat-ocr: wrote OCR text, length=223` and SQL insert into text history |
| 14 | New image history display uses the resolved absolute image path while database storage keeps the original image value | `scripts/clipboard-ocr.test.mjs` | unit | PASS | `node --test scripts\clipboard-ocr.test.mjs scripts\screen-capture.test.mjs` |
| 15 | Latest copied image file is present and readable after OCR | `C:\Users\LSir\AppData\Roaming\com.ayangweb.EcoPaste\tauri-plugin-clipboard-x\images\18370351244927533136.png` | integration | PASS | local image opened successfully after installed app OCR run |
| 16 | Empty placeholder image events are rejected | `scripts/clipboard-ocr.test.mjs` | unit | PASS | `node --test scripts\clipboard-ocr.test.mjs scripts\screen-capture.test.mjs` |
| 17 | Installed app skips the 0 B placeholder and keeps one valid image after a copied image | `D:\Program Files\EcoPaste\EcoPaste.exe` plus PowerShell STA clipboard image simulation | integration | PASS | log included `clipboard: skipped empty image, reportedBytes=0, fileBytes=8444` followed by one image insert and OCR success |

## Known Gaps

- The final Tauri build emits an updater signing warning because no private update key is available locally. The Windows installer is still produced.
- Live screen snipping is not automated in tests because it opens the Windows interactive snipping overlay.
