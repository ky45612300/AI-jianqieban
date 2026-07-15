# WeChat OCR Sidecar

这个辅助程序负责调用 `WeChatOcr`，并把识别结果以 JSON 输出给 Tauri 后端。

发布到主程序打包目录：

```powershell
dotnet publish .\sidecars\WeChatOcr.Sidecar\WeChatOcr.Sidecar.csproj -c Release -r win-x64 --self-contained false -o .\src-tauri\bin
```

发布后 `src-tauri/bin` 下应包含：

- `wechat-ocr-sidecar.exe`
- `wco_data/`

开发调试时，也可以用环境变量指定辅助程序路径：

```powershell
$env:WECHAT_OCR_SIDECAR_PATH="F:\path\to\wechat-ocr-sidecar.exe"
```
