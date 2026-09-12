# Structured Capture 交接文档

## 背景

这个二开版本是在 EcoPaste 里加入“结构化剪切板信息采集”能力。

目标数据主要来自这些场景：

1. 企业详情页
2. 商家/门店页面
3. 半结构化企业信息页
4. 复制到剪切板的联系人或企业资料文本

## 用户需求

固定字段：

- 公司名称
- 姓名/法人
- 电话号码
- 邮箱
- 地址

必须满足：

1. 规则提取和 AI 提取是两条独立通道
2. 两条通道可分别开启或关闭
3. 可以只跑规则
4. 可以只跑 AI
5. 可以两者同时跑
6. 结果必须分别存到不同目录
7. 功能要尽量耐打断、耐噪声
8. 规则通道可以选择内置脚本或外置脚本

## 设计决策

结构化结果不要写进 EcoPaste 原始 history 表。

改为：

1. 保留 EcoPaste 原有历史逻辑
2. 单独跑一条结构化采集侧链路
3. 直接把结构化结果落 CSV
4. 每个通道各自维护一个 `.state.json`

这样做的好处：

1. 不干扰原始历史记录
2. 更容易导出和审计
3. 规则通道和 AI 通道更容易拆分维护

## 默认输出

配置位置：

- `src/constants/structuredCapture.ts`

默认目录：

- `DEFAULT_STRUCTURED_CAPTURE_OUTPUT_DIRS.rules`
- `DEFAULT_STRUCTURED_CAPTURE_OUTPUT_DIRS.ai`

具体 Windows 路径以代码里的常量为准。

每个目录下都有：

- `records.csv`
- `.state.json`

CSV 列顺序：

1. `capturedAt`
2. `companyName`
3. `contactName`
4. `phoneNumber`
5. `email`
6. `address`

## 完整流程

1. 剪切板变化从 `src/hooks/useClipboard.ts` 进入
2. 对 `text/html/rtf` 类型，先触发结构化采集，再走 EcoPaste 原历史逻辑
3. `src/structured-capture/index.ts` 先做文本归一化
4. 内置路径会先用 `src/structured-capture/shared.ts` 判断这段文本是否像“企业信息”
5. 外置规则脚本路径会直接把文本交给脚本，由脚本返回结果或 `null`
6. 如果是候选文本，再分别调度已开启的通道：
   - `rules`
   - `ai`
7. 每条通道独立提取字段
8. 每条通道按 `channel + text` 计算自己的指纹；外置规则脚本会额外带上 `external` 标记
9. 每条通道把结果写入自己的 CSV 和 `.state.json`

## 为什么要先做脚本判断

不是所有剪切板文本都值得进入提取。

`src/structured-capture/shared.ts` 先做轻量判断，目的是减少：

1. 无效提取
2. 无效 AI 请求
3. 无意义写盘
4. 剪切板频繁变化时的资源抖动

判断信号包括：

1. 是否有公司/商户类词
2. 是否有手机号
3. 是否有邮箱
4. 是否有字段标签
5. 是否有像地址的行

## 规则提取思路

实现文件：

- `src/structured-capture/rules.ts`

核心思路：

1. 先统一换行
2. 尽量把黏连字段拆开
3. 清理网页噪声
4. 用固定规则提取字段
5. 如果没有显式地址标签，就尝试用“像地址的行”来识别
6. 如果没有显式公司名标签，就优先取第一条像公司/门店名称的有效行

重点处理过的噪声包括：

1. `更多7` 这类尾巴
2. 字段和字段粘在同一行
3. `Q经营范围` 这类尾部干扰
4. 企业风险、附近企业之类的尾巴

已验证能覆盖至少两类样本：

1. 带标签的企业详情页
2. 不带标签的门店/商户页

## 外置脚本思路

实现文件：

- `src/structured-capture/externalScript.ts`
- `src-tauri/src/structured_capture.rs`

外置脚本只属于 `rules` 通道，和 `ai` 通道仍然独立。

当前约定：

1. 设置页里 `rules.scriptSource` 可选：
   - `builtin`
   - `external`
2. `builtin` 使用 `src/structured-capture/rules.ts`
3. `external` 读取软件可执行文件同级目录下的 `structured-capture-script.js`
4. 文件不存在时，点击打开脚本或首次外置采集会生成默认模板
5. 生成后不要自动覆盖用户已编辑内容

外置 JS 脚本需要导出 `capture(text, helpers)`：

```js
function capture(text, helpers) {
  return {
    companyName: "",
    contactName: "",
    phoneNumber: "",
    email: "",
    address: "",
  };
}

module.exports.capture = capture;
```

返回 `null` 表示跳过该剪切板文本。返回对象时字段会继续经过前端统一清洗后写入 `rules` 的 CSV。

为了让外置脚本能自定义候选判断，选择 `external` 时不会先用内置候选判断拦住文本；脚本自己返回 `null` 即可跳过。

## AI 提取思路

实现文件：

- `src/structured-capture/ai.ts`

核心思路：

1. 走 OpenAI 兼容 `chat/completions`
2. 强制要求只返回 JSON
3. 优先要求模型输出英文键：
   - `companyName`
   - `contactName`
   - `phoneNumber`
   - `email`
   - `address`
4. 兼容中文键兜底
5. AI 返回后继续走同一套清洗逻辑

注意：

AI 通道不是规则通道的替代，而是另一条独立通道，独立输出。

## 容错设计

为了减少“任务很容易被别的操作打断”的问题，已经做了这些处理：

1. `rules` 和 `ai` 走独立队列
2. 一条通道报错不会拖死另一条通道
3. 每条通道各自用 `.state.json` 去重
4. CSV 追加写通过 Rust 侧命令完成
5. 不再让前端每次全量重写 CSV

## 关键文件

配置和类型：

- `src/types/store.d.ts`
- `src/stores/clipboard.ts`
- `src/types/structured-capture.ts`
- `src/constants/structuredCapture.ts`

剪切板入口：

- `src/hooks/useClipboard.ts`

结构化采集核心：

- `src/structured-capture/shared.ts`
- `src/structured-capture/rules.ts`
- `src/structured-capture/externalScript.ts`
- `src/structured-capture/ai.ts`
- `src/structured-capture/index.ts`
- `src/structured-capture/storage.ts`

Tauri 桥接：

- `src/plugins/structuredCapture.ts`
- `src-tauri/src/structured_capture.rs`
- `src-tauri/src/lib.rs`

路径工具：

- `src/utils/path.ts`

设置页：

- `src/pages/Preference/components/Clipboard/components/StructuredCapture/index.tsx`
- `src/pages/Preference/components/Clipboard/index.tsx`

## 已完成内容

1. 新增结构化采集配置
2. 新增规则通道和 AI 通道
3. 两条通道分别输出到不同目录
4. 两条通道分别维护状态文件
5. 剪切板监听已接入结构化采集
6. 规则提取已完成
7. AI 提取已完成
8. 设置页已完成
9. AI 接口测试按钮已完成
10. 输出目录点击打开已补容错
11. Rust 追加写 CSV 命令已完成
12. 规则通道已支持内置/外置脚本选择
13. 用户提供的两条样本已经做过规则验证

## 当前验证结果

外置脚本功能加入前，本机曾完成：

1. `pnpm install --registry=https://registry.npmmirror.com`
2. `pnpm exec tsc --noEmit`
3. `pnpm exec biome check ...`
4. `pnpm run build:vite`

结果：

1. 前端类型检查通过
2. 前端构建通过
3. `dist/` 已生成

本轮优化改动后，本机已完成：

1. `pnpm install`
2. `pnpm exec tsc --noEmit` 通过
3. `pnpm exec biome lint src` 通过（纯 lint，无逻辑错误）
4. `cargo check` 通过（需先 `pnpm exec tauri icon src-tauri/assets/logo.png` 生成 icons）

注意：本机 git 配置 autocrlf 使工作区文件为 CRLF，`biome check`（含 format）会报换行符差异，属既有环境问题；提交时 `lint-staged` 的 `biome check --write` 会自动转 LF，不影响提交。校验逻辑用 `biome lint` 即可。

## 本轮优化改动（外置脚本之后）

1. `validation.ts` 已接入 AI 通道：`ai.ts` 的 `parseStructuredRecord` 现在同时要求 `hasUsefulFields` + `isValidStructuredRecord`（邮箱/电话/地址格式校验）
2. `hasUsefulFields` 抽到 `shared.ts`，`rules.ts`/`ai.ts`/`externalScript.ts` 统一引用，消除 3 处重复
3. `release/` 两个安装包（16.8MB）已从 git 移除跟踪（本地文件保留），后续用 Release 页面或独立分支管理
4. AI 请求增加有限重试：`requestWithRetry` 对 429/5xx/网络错误最多重试 3 次（指数退避），避免偶发抖动丢记录
5. `.state.json` 去重升级：新增 `fingerprintHistory`（最近 200 个指纹），解决 A→B→A 重复采集问题
6. 外置脚本增加 5 秒缓存：`externalScript.ts` 避免每次剪贴板变化都走 IPC 读文件 + `new Function` 重新编译
7. 顺手修了 `validation.ts` 的 `useTemplate` lint 错误

## 当前缺口

还没完成：

1. `pnpm tauri build`（Windows 可安装成品包导出）
2. 四种模式实机验证（只开规则 / 外置脚本 / 只开 AI / 双开）

原因：尚未执行完整打包构建。

## 建议的下一步

1. 在本仓库执行 `pnpm tauri build`（需先 `pnpm exec tauri icon src-tauri/assets/logo.png` 生成 icons）
2. 再验证四种模式：
   - 只开规则
   - 规则通道选择外置脚本
   - 只开 AI
   - 两者同时开

## Git 同步建议

当前远程已指向自己的仓库：

- `origin -> https://github.com/ky45612300/AI-jianqieban.git`

如果要保留官方上游以便合并更新，建议：

1. 把官方仓库加为 `upstream`：`git remote add upstream https://github.com/EcoPasteHub/EcoPaste.git`
2. 后续都推送到自己的 `origin`，需要合并官方更新时再从 `upstream` 拉取
