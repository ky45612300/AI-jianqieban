# EcoPaste 剪切板信息采集版交接摘要

最后同步时间：2026-04-27

## 项目目标

基于 EcoPaste 二开一个桌面版剪切板信息采集工具。用户复制企业、门店或客户资料后，程序自动提取固定字段并写入表格。

固定字段：

- 公司名称
- 姓名/法人
- 电话号码
- 邮箱
- 地址

## 两条采集通道

规则提取：

- 本地脚本规则判断，不依赖 AI，不联网。
- 默认输出到 `D:\信息采集\规则提取\records.csv`。
- 当前规则要求识别出公司名称，并且至少有两个有效字段，才会落表。
- 用户已明确说规则逻辑不用再改。

AI 识别：

- 独立于规则提取，可单独开启。
- 默认输出到 `D:\信息采集\AI识别\records.csv`。
- 兼容 OpenAI Chat Completions 风格接口。
- 支持第三方 AI 平台，接口地址可填写 API 基地址、`/v1`、`/models` 或完整 `chat/completions` 地址。
- AI 请求已改为走 Tauri Rust 后端请求，避免 WebView 前端 `fetch` 跨域或网络限制。

## 关键代码

- 剪切板监听入口：`src/hooks/useClipboard.ts`
- 采集调度与双通道队列：`src/structured-capture/index.ts`
- 规则提取：`src/structured-capture/rules.ts`
- AI 提取与模型获取：`src/structured-capture/ai.ts`
- 共享判断与清洗：`src/structured-capture/shared.ts`
- CSV 写入与去重状态：`src/structured-capture/storage.ts`
- 设置页：`src/pages/Preference/components/Clipboard/components/StructuredCapture/index.tsx`
- 前端调用 Tauri 命令：`src/plugins/structuredCapture.ts`
- Rust CSV 追加和 AI 后端请求：`src-tauri/src/structured_capture.rs`

## 已修复的问题

- 规则采集不写表：前端调用 `append_structured_capture_csv` 少包了一层 `payload`，已修复。
- 获取模型 `TypeError: Failed to fetch`：前端直接请求第三方平台容易失败，已改为 Rust 后端请求。
- AI 识别 `404`：已增加接口地址自动补全和 404 兜底提示。
- 设置页局部显示 `\uXXXX` 乱码：已把 JSX 里的可见文案改为从 `LABELS` 取值。
- 安装包资源：已加入中文使用说明 `src-tauri/assets/使用说明.txt`，并写入 `src-tauri/tauri.conf.json` 的 `bundle.resources`。

## 构建与验证

常用验证命令：

```powershell
pnpm exec tsc --noEmit
pnpm exec biome check "src/pages/Preference/components/Clipboard/components/StructuredCapture/index.tsx" "src/structured-capture/ai.ts" "src/plugins/structuredCapture.ts"
cargo check --manifest-path src-tauri\Cargo.toml
```

Windows 打包需要在 Visual Studio Build Tools 环境下执行：

```powershell
$bat='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$proj='D:\Codex APP\EcoPaste'
$cmd='"' + $bat + '" -arch=x64 && cd /d "' + $proj + '" && pnpm tauri build'
cmd /d /c $cmd
```

安装包输出位置：

```text
D:\Codex APP\EcoPaste\target\release\bundle\nsis\EcoPaste_0.6.0-beta.3_x64-setup.exe
```

打包最后会提示缺少 updater 私钥，这是官方更新器签名配置导致，不影响本地安装包使用。

## 用户偏好

- 优先中文沟通。
- 尽量少追问，能判断就直接做。
- 规则提取逻辑暂时不要再改。
- 用户想把项目同步到 `https://github.com/ky45612300/AI-jianqieban`，方便其他设备继续开发。
