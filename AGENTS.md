# EcoPaste 二开说明

这个仓库现在不是纯官方版 `EcoPaste`，而是为了“结构化剪切板信息采集”做过二开的版本。

## 接手前先看

后续如果是人或 AI 接手，建议先看：

1. `STRUCTURED_CAPTURE_HANDOFF.md`
2. `src/structured-capture/*`
3. `src/pages/Preference/components/Clipboard/components/StructuredCapture/index.tsx`

## 当前目标

在不破坏 EcoPaste 原有剪切板历史逻辑的前提下，增加“结构化信息采集”能力。

固定采集字段：

- `companyName`
- `contactName`
- `phoneNumber`
- `email`
- `address`

## 关键业务规则

1. 必须保留两条独立通道：
   - `rules`
   - `ai`
2. 两条通道要能分别开关。
3. 两条通道要写入不同目录。
4. 两条通道结果不能混存。
5. 结构化采集不能依赖 EcoPaste 自己的 history 去重。
6. 不要修改旧脚本 `D:\Codex APP\clipboard-collector.ps1`。
7. `rules` 通道支持内置脚本和外置脚本两种来源，外置脚本文件位于软件可执行文件同级目录。
8. 外置脚本是用户可编辑文件，不要在常规运行中覆盖用户已经编辑过的内容。

## 默认输出目录

实际默认目录定义在：

- `src/constants/structuredCapture.ts`

目录映射：

- `rules -> DEFAULT_STRUCTURED_CAPTURE_OUTPUT_DIRS.rules`
- `ai -> DEFAULT_STRUCTURED_CAPTURE_OUTPUT_DIRS.ai`

每个通道目录下都会有：

- `records.csv`
- `.state.json`

## 当前实现概况

1. 剪切板监听入口在 `src/hooks/useClipboard.ts`。
2. `src/structured-capture/shared.ts` 负责脚本自动判断、文本清洗、候选识别。
3. `src/structured-capture/rules.ts` 负责规则提取。
4. `src/structured-capture/externalScript.ts` 负责读取并执行外置 JS 采集脚本。
5. `src/structured-capture/ai.ts` 负责 AI 提取和 AI 接口测试。
6. `src/structured-capture/index.ts` 负责两条通道独立排队、独立容错。
7. `src/structured-capture/storage.ts` 负责 CSV 持久化和状态去重。
8. `src-tauri/src/structured_capture.rs` 负责高效追加写 CSV、AI 请求和外置脚本文件初始化。

## 当前验证状态

历史上已经完成：

1. 结构化采集代码接入
2. 前端类型检查通过
3. 目标文件 Biome 检查通过
4. Vite 前端构建通过

本次新增外置脚本后已经完成：

1. `git diff --check` 通过

还没完成：

1. 前端类型检查复跑
2. 目标文件 Biome 检查复跑
3. Tauri 桌面安装包构建
4. Rust 编译验证

原因：

- 当前机器没有可直接调用的 `pnpm`
- 当前机器没有安装 `cargo`

## Git 说明

当前远程仓库还是官方上游：

- `https://github.com/EcoPasteHub/EcoPaste.git`

如果要跨设备同步当前二开版本，建议：

1. 新建你自己的私有仓库
2. 把官方仓库改成 `upstream`
3. 把你的仓库作为 `origin`
4. 后续都推到你自己的仓库
