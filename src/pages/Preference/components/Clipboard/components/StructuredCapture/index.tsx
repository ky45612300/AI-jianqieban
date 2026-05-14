import {
  FileTextOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AutoComplete,
  Button,
  Input,
  InputNumber,
  message,
  Segmented,
  Space,
  Tooltip,
} from "antd";
import { isEqual, isString } from "es-toolkit";
import { useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import ProList from "@/components/ProList";
import ProListItem from "@/components/ProListItem";
import ProSwitch from "@/components/ProSwitch";
import {
  getStructuredCaptureExternalScriptPath,
  openStructuredCaptureExternalScript,
} from "@/plugins/structuredCapture";
import { clipboardStore } from "@/stores/clipboard";
import {
  fetchStructuredCaptureAiModels,
  generateStructuredCaptureInternalRules,
  testStructuredCaptureAiEndpoint,
} from "@/structured-capture/ai";
import type { StructuredCaptureScriptSource } from "@/types/structured-capture";
import { getStructuredCapturePath } from "@/utils/path";

const LABELS = {
  aiDesc:
    "\u542f\u7528\u540e\u4f1a\u5148\u7528\u811a\u672c\u5224\u65ad\u662f\u5426\u50cf\u4f01\u4e1a\u4fe1\u606f\uff0c\u518d\u628a\u7591\u4f3c\u6587\u672c\u53d1\u7ed9\u4f60\u914d\u7f6e\u7684 OpenAI \u517c\u5bb9\u63a5\u53e3\uff0c\u7531 AI \u505a\u7ed3\u6784\u5316\u63d0\u53d6\u5e76\u5199\u5165\u72ec\u7acb\u76ee\u5f55\u3002",
  aiExtract: "AI \u63d0\u53d6",
  aiHeader: "AI \u8bc6\u522b",
  aiOutputDir: "AI \u8f93\u51fa\u76ee\u5f55",
  apiKey: "API Key",
  apiKeyDesc:
    "\u5982\u679c\u63a5\u53e3\u9700\u8981\u5bc6\u94a5\u5c31\u5728\u8fd9\u91cc\u586b",
  apiUrl: "\u63a5\u53e3\u5730\u5740",
  apiUrlDesc:
    "\u53ef\u4ee5\u586b API \u57fa\u5730\u5740\u3001/v1 \u6216\u5b8c\u6574 chat/completions \u5730\u5740",
  externalScriptFile: "\u5916\u7f6e\u811a\u672c\u6587\u4ef6",
  externalScriptFileDesc:
    "\u4f4d\u4e8e\u8f6f\u4ef6\u53ef\u6267\u884c\u6587\u4ef6\u540c\u7ea7\u76ee\u5f55\uff0c\u9996\u6b21\u6253\u5f00\u65f6\u4f1a\u81ea\u52a8\u751f\u6210\u53ef\u7f16\u8f91\u6a21\u677f",
  fetchModels: "\u83b7\u53d6\u6a21\u578b",
  fetchModelsDesc:
    "\u4f1a\u6839\u636e\u4f60\u7684 AI \u63a5\u53e3\u5730\u5740\u81ea\u52a8\u53bb\u62c9\u53d6\u53ef\u7528\u6a21\u578b\u5217\u8868",
  modelName: "\u6a21\u578b\u540d",
  modelNameDesc:
    "\u8c03\u7528\u8be5\u63a5\u53e3\u65f6\u4f7f\u7528\u7684\u6a21\u578b\u540d",
  openScript: "\u6253\u5f00\u811a\u672c",
  prompt: "\u5185\u5728\u91c7\u96c6\u89c4\u5219",
  promptDesc:
    "\u5199\u4e0b\u91c7\u96c6\u8981\u6c42\uff0c\u53ef\u70b9\u51fb AI \u751f\u6210\u89c4\u5219\uff1b\u8be5\u89c4\u5219\u4f1a\u540c\u65f6\u5e94\u7528\u5230 AI \u63d0\u53d6\u548c\u5185\u7f6e\u89c4\u5219\u63d0\u53d6",
  promptGenerate: "AI \u751f\u6210\u89c4\u5219",
  promptPlaceholder:
    "\u4f8b\uff1a\u53ea\u63d0\u53d6\u516c\u53f8\u540d\u79f0\uff1b\u4e0d\u8981\u63d0\u53d6\u7535\u8bdd\u548c\u90ae\u7bb1\uff1b\u5730\u5740\u4e0d\u8981\u5305\u542b\u7ecf\u8425\u8303\u56f4",
  reset: "\u6062\u590d\u9ed8\u8ba4",
  rulesDesc:
    "\u542f\u7528\u540e\u53ef\u9009\u62e9\u8d70\u5185\u7f6e\u811a\u672c\u6216\u5b89\u88c5\u76ee\u5f55\u4e0b\u7684\u5916\u7f6e JS \u811a\u672c\uff0c\u8bc6\u522b \u516c\u53f8\u540d\u79f0 / \u59d3\u540d\u6cd5\u4eba / \u7535\u8bdd\u53f7\u7801 / \u90ae\u7bb1 / \u5730\u5740\uff0c\u5e76\u5199\u5165\u72ec\u7acb\u76ee\u5f55\u3002",
  rulesHeader: "\u89c4\u5219\u63d0\u53d6",
  rulesOutputDir: "\u89c4\u5219\u8f93\u51fa\u76ee\u5f55",
  scriptSource: "\u91c7\u96c6\u811a\u672c",
  scriptSourceDesc:
    "\u5185\u7f6e\u811a\u672c\u4f7f\u7528\u8f6f\u4ef6\u81ea\u5e26\u89c4\u5219\uff1b\u5916\u7f6e\u811a\u672c\u4f1a\u8bfb\u53d6\u5b89\u88c5\u76ee\u5f55\u4e0b\u7684 JS \u6587\u4ef6",
  selectDir: "\u9009\u62e9\u76ee\u5f55",
  structuredHeader: "\u7ed3\u6784\u5316\u91c7\u96c6",
  testAi: "\u6d4b\u8bd5 AI \u63a5\u53e3",
  testAiDesc:
    "\u4f1a\u53d1\u9001\u4e00\u6761\u6700\u5c0f\u6d4b\u8bd5\u8bf7\u6c42\uff0c\u68c0\u67e5\u63a5\u53e3\u8fde\u901a\u6027\u548c JSON \u683c\u5f0f\u3002",
  testButton: "\u6d4b\u8bd5",
  timeout: "\u8d85\u65f6\u65f6\u95f4(\u6beb\u79d2)",
  timeoutDesc:
    "\u8d85\u65f6\u540e\u81ea\u52a8\u653e\u5f03\u5e76\u7ee7\u7eed\u4e0b\u4e00\u6761",
};

const SCRIPT_SOURCE_OPTIONS: Array<{
  label: string;
  value: StructuredCaptureScriptSource;
}> = [
  {
    label: "\u5185\u7f6e\u811a\u672c",
    value: "builtin",
  },
  {
    label: "\u5916\u7f6e\u811a\u672c",
    value: "external",
  },
];

const StructuredCapture = () => {
  const { structuredCapture } = useSnapshot(clipboardStore);
  const [externalScriptPath, setExternalScriptPath] = useState("");
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string }>>(
    [],
  );
  const [generatingRules, setGeneratingRules] = useState(false);
  const [openingExternalScript, setOpeningExternalScript] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  useEffect(() => {
    getStructuredCaptureExternalScriptPath()
      .then(setExternalScriptPath)
      .catch(() => {
        setExternalScriptPath("");
      });
  }, []);

  const handlePickPath = async (channel: "rules" | "ai") => {
    const dstDir = await open({ directory: true });
    if (!isString(dstDir)) return;

    const currentPath = getStructuredCapturePath(
      channel,
      structuredCapture[channel].outputDir,
    );
    const nextPath = getStructuredCapturePath(channel, dstDir);

    if (isEqual(currentPath, nextPath)) return;

    clipboardStore.structuredCapture[channel].outputDir = dstDir;
  };

  const handleResetPath = (channel: "rules" | "ai") => {
    clipboardStore.structuredCapture[channel].outputDir = "";
  };

  const handleOpenPath = async (channel: "rules" | "ai") => {
    const path = getStructuredCapturePath(
      channel,
      structuredCapture[channel].outputDir,
    );

    await mkdir(path, { recursive: true });
    await openPath(path);
  };

  const handleOpenExternalScript = async () => {
    try {
      setOpeningExternalScript(true);
      const path = await openStructuredCaptureExternalScript();
      setExternalScriptPath(path);
    } catch (error) {
      message.error(String(error));
    } finally {
      setOpeningExternalScript(false);
    }
  };

  const handleTestAi = async () => {
    try {
      setTestingAi(true);
      const result = await testStructuredCaptureAiEndpoint();

      if (result.ok) {
        message.success(result.message);
        return;
      }

      message.error(result.message);
    } catch (error) {
      message.error(String(error));
    } finally {
      setTestingAi(false);
    }
  };

  const handleFetchModels = async () => {
    try {
      setFetchingModels(true);
      const result = await fetchStructuredCaptureAiModels();

      if (!result.ok) {
        setModelOptions([]);
        setModelDropdownOpen(false);
        message.error(result.message);
        return;
      }

      const nextOptions = result.models.map((model) => ({
        value: model,
      }));

      setModelOptions(nextOptions);
      setModelDropdownOpen(nextOptions.length > 0);
      message.success(result.message);
    } catch (error) {
      setModelDropdownOpen(false);
      message.error(String(error));
    } finally {
      setFetchingModels(false);
    }
  };

  const handleGenerateRules = async () => {
    try {
      setGeneratingRules(true);
      const result = await generateStructuredCaptureInternalRules();

      if (!result.ok) {
        message.error(result.message);
        return;
      }

      clipboardStore.structuredCapture.ai.prompt = result.rules;
      message.success(result.message);
    } catch (error) {
      message.error(String(error));
    } finally {
      setGeneratingRules(false);
    }
  };

  const renderPath = (channel: "rules" | "ai") => {
    return (
      <span
        className="hover:color-primary cursor-pointer break-all transition"
        onMouseDown={() => {
          void handleOpenPath(channel);
        }}
      >
        {getStructuredCapturePath(
          channel,
          structuredCapture[channel].outputDir,
        )}
      </span>
    );
  };

  const renderExternalScriptPath = () => {
    return (
      <span
        className="hover:color-primary cursor-pointer break-all transition"
        onMouseDown={() => {
          void handleOpenExternalScript();
        }}
      >
        {externalScriptPath || LABELS.externalScriptFileDesc}
      </span>
    );
  };

  return (
    <>
      <ProList header={LABELS.structuredHeader}>
        <ProSwitch
          description={LABELS.rulesDesc}
          onChange={(value) => {
            clipboardStore.structuredCapture.rules.enabled = value;
          }}
          title={LABELS.rulesHeader}
          value={structuredCapture.rules.enabled}
        />

        <ProListItem
          description={LABELS.scriptSourceDesc}
          title={LABELS.scriptSource}
        >
          <Segmented
            onChange={(value) => {
              clipboardStore.structuredCapture.rules.scriptSource =
                value as StructuredCaptureScriptSource;
            }}
            options={SCRIPT_SOURCE_OPTIONS}
            value={structuredCapture.rules.scriptSource}
          />
        </ProListItem>

        <ProListItem
          description={renderExternalScriptPath()}
          title={LABELS.externalScriptFile}
        >
          <Tooltip title={LABELS.openScript}>
            <Button
              icon={<FileTextOutlined />}
              loading={openingExternalScript}
              onClick={() => {
                void handleOpenExternalScript();
              }}
            />
          </Tooltip>
        </ProListItem>

        <ProListItem
          description={renderPath("rules")}
          title={LABELS.rulesOutputDir}
        >
          <Space.Compact>
            <Tooltip title={LABELS.selectDir}>
              <Button
                icon={<FolderOpenOutlined />}
                onClick={() => handlePickPath("rules")}
              />
            </Tooltip>

            <Tooltip title={LABELS.reset}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => handleResetPath("rules")}
              />
            </Tooltip>
          </Space.Compact>
        </ProListItem>
      </ProList>

      <ProList header={LABELS.aiHeader}>
        <ProSwitch
          description={LABELS.aiDesc}
          onChange={(value) => {
            clipboardStore.structuredCapture.ai.enabled = value;
          }}
          title={LABELS.aiExtract}
          value={structuredCapture.ai.enabled}
        />

        <ProListItem description={LABELS.apiUrlDesc} title={LABELS.apiUrl}>
          <Input
            allowClear
            onChange={(event) => {
              clipboardStore.structuredCapture.ai.endpoint = event.target.value;
            }}
            placeholder="https://api.openai.com/v1"
            value={structuredCapture.ai.endpoint}
          />
        </ProListItem>

        <ProListItem
          description={LABELS.modelNameDesc}
          title={LABELS.modelName}
        >
          <Space.Compact style={{ width: "100%" }}>
            <AutoComplete
              onBlur={() => {
                setModelDropdownOpen(false);
              }}
              onChange={(value) => {
                clipboardStore.structuredCapture.ai.model = value;
              }}
              onFocus={() => {
                if (modelOptions.length > 0) {
                  setModelDropdownOpen(true);
                }
              }}
              onSelect={(value) => {
                clipboardStore.structuredCapture.ai.model = value;
                setModelDropdownOpen(false);
              }}
              open={modelDropdownOpen && modelOptions.length > 0}
              options={modelOptions}
              style={{ width: "100%" }}
              value={structuredCapture.ai.model}
            >
              <Input allowClear placeholder="gpt-4o-mini" />
            </AutoComplete>

            <Tooltip title={LABELS.fetchModelsDesc}>
              <Button loading={fetchingModels} onClick={handleFetchModels}>
                {LABELS.fetchModels}
              </Button>
            </Tooltip>
          </Space.Compact>
        </ProListItem>

        <ProListItem description={LABELS.promptDesc} title={LABELS.prompt}>
          <Space.Compact style={{ width: "100%" }}>
            <Input.TextArea
              autoSize={{ maxRows: 6, minRows: 3 }}
              onChange={(event) => {
                clipboardStore.structuredCapture.ai.prompt = event.target.value;
              }}
              placeholder={LABELS.promptPlaceholder}
              value={structuredCapture.ai.prompt}
            />
            <Tooltip title={LABELS.promptDesc}>
              <Button loading={generatingRules} onClick={handleGenerateRules}>
                {LABELS.promptGenerate}
              </Button>
            </Tooltip>
          </Space.Compact>
        </ProListItem>

        <ProListItem description={LABELS.apiKeyDesc} title={LABELS.apiKey}>
          <Input.Password
            allowClear
            onChange={(event) => {
              clipboardStore.structuredCapture.ai.apiKey = event.target.value;
            }}
            placeholder="sk-..."
            value={structuredCapture.ai.apiKey}
          />
        </ProListItem>

        <ProListItem description={LABELS.testAiDesc} title={LABELS.testAi}>
          <Button loading={testingAi} onClick={handleTestAi} type="primary">
            {LABELS.testButton}
          </Button>
        </ProListItem>

        <ProListItem description={LABELS.timeoutDesc} title={LABELS.timeout}>
          <InputNumber
            min={1000}
            onChange={(value) => {
              clipboardStore.structuredCapture.ai.timeoutMs =
                Number(value) || 20000;
            }}
            style={{ width: "100%" }}
            value={structuredCapture.ai.timeoutMs}
          />
        </ProListItem>

        <ProListItem description={renderPath("ai")} title={LABELS.aiOutputDir}>
          <Space.Compact>
            <Tooltip title={LABELS.selectDir}>
              <Button
                icon={<FolderOpenOutlined />}
                onClick={() => handlePickPath("ai")}
              />
            </Tooltip>

            <Tooltip title={LABELS.reset}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => handleResetPath("ai")}
              />
            </Tooltip>
          </Space.Compact>
        </ProListItem>
      </ProList>
    </>
  );
};

export default StructuredCapture;
