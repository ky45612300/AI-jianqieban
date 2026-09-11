# OCR Sidecar（截图 OCR 引擎）

C# 控制台程序，封装 mmmojo/WeChatOCR 引擎。输入图片路径，输出 JSON（`{"ok","text","error"}`）到 stdout，随后强杀自身进程（WeChatOCR 引擎会挂住宿主进程，不杀退不出）。

## 前置依赖

1. .NET 8 SDK
2. 克隆 WeChatOcr 到 `..\..\WeChatOcr`（即 `F:\WeChatOcr`）：

   ```powershell
   git clone https://github.com/mmmojo/WeChatOcr.git F:\WeChatOcr
   ```

   `ocr-sidecar.csproj` 通过 `ProjectReference` 引用 `F:\WeChatOcr\src\WeChatOcr\WeChatOcr.csproj`，`wco_data`（引擎数据文件）会随构建拷贝到输出目录。

## 构建与部署

```powershell
cd ocr-sidecar
dotnet publish -c Release -r win-x64 --self-contained false -o publish
# 把 publish\ocr-sidecar.exe 和 wco_data 目录拷到：
Copy-Item publish\ocr-sidecar.exe ..\src-tauri\resources\ocr\ocr-sidecar.exe -Force
Copy-Item -Recurse publish\wco_data ..\src-tauri\resources\ocr\wco_data
```

Tauri 打包时 `tauri.conf.json` 会把 `resources/ocr/ocr-sidecar.exe` 和 `resources/ocr/wco_data/**` 打进安装包；Rust 侧 `src-tauri/src/ocr.rs` 在运行期从资源目录启动 exe（无窗口、异步、20 秒超时由 C# 侧控制）。

## 注意

- 仅 Windows 支持；其它平台 Rust 侧直接返回 `ocr not supported`。
- `src-tauri/resources/` 与 `bin/obj/publish/` 都在 `.gitignore` 中，不要提交。
