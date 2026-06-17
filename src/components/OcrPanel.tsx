import React, { useState } from "react";
import { Modal, Form, Select, Input, Button, Upload, Spin, Alert, Space } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { imageFileToBase64, recognizeTextFromImage } from "../plugins/ocr";
import { useSnapshot } from "valtio";
import { ocrStore } from "../stores/ocrStore";

const { Option } = Select;

type Props = {
  visible: boolean;
  onClose: () => void;
  // optional initial image url (from a clipboard item)
  imageUrl?: string | null;
};

export const OcrPanel: React.FC<Props> = ({ visible, onClose, imageUrl = null }) => {
  const snap = useSnapshot(ocrStore);
  const [form] = Form.useForm();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [raw, setRaw] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const uploadProps: UploadProps = {
    beforeUpload: (f) => {
      setFile(f);
      // prevent auto upload
      return false;
    },
    onRemove: () => setFile(null),
    accept: "image/*",
    multiple: false,
  };

  const handleRecognize = async () => {
    setError(null);
    setResult("");
    setRaw("");

    const values = await form.validateFields();

    const provider = values.provider || snap.provider;
    const apiKey = values.apiKey ?? snap.apiKey ?? "";
    const timeout = values.timeoutMs ?? snap.timeoutMs ?? 10000;
    let image_base64: string | undefined | null = null;
    let image_url = values.imageUrl || imageUrl || "";

    try {
      setLoading(true);

      if (file) {
        image_base64 = await imageFileToBase64(file);
        image_url = ""; // prefer base64 when file provided
      }

      const payload = {
        image_url,
        image_base64: image_base64 ? image_base64 : null,
        language: values.language || null,
        api_provider: provider,
        api_key: apiKey,
        timeout_ms: timeout,
      };

      const res = await recognizeTextFromImage(payload as any);

      if (res.status >= 200 && res.status < 300) {
        setResult(res.text || "");
        setRaw(res.raw_response || "");
      } else {
        setError(`识别失败（status=${res.status}）：${res.raw_response}`);
      }
    } catch (err: any) {
      setError(err?.toString() ?? "识别过程中发生错误");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = (values: any) => {
    ocrStore.provider = values.provider;
    ocrStore.apiKey = values.apiKey;
    ocrStore.timeoutMs = values.timeoutMs;
  };

  return (
    <Modal
      open={visible}
      title="OCR 识别"
      onCancel={onClose}
      footer={null}
      width={720}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          provider: snap.provider,
          apiKey: snap.apiKey,
          timeoutMs: snap.timeoutMs,
          imageUrl: imageUrl || "",
        }}
        onFinish={handleRecognize}
        onValuesChange={(_, values) => {
          // keep form values in store when provider/apiKey/timeout change
          if (values.provider || values.apiKey || values.timeoutMs) {
            handleSaveSettings({ ...form.getFieldsValue() });
          }
        }}
      >
        <Form.Item name="provider" label="OCR 提供商" rules={[{ required: true }]}>
          <Select>
            <Option value="paddle">Paddle OCR（默认）</Option>
            <Option value="google">Google Vision</Option>
            <Option value="tencent">Tencent OCR</Option>
          </Select>
        </Form.Item>

        <Form.Item name="apiKey" label="API Key / Token">
          <Input.Password placeholder="填写 API Key（可留空，某些服务需要）" />
        </Form.Item>

        <Form.Item name="timeoutMs" label="超时（毫秒）">
          <Input defaultValue={10000} />
        </Form.Item>

        <Form.Item name="imageUrl" label="图片 URL（与上传文件二选一）">
          <Input placeholder="例如：https://.../foo.png" />
        </Form.Item>

        <Form.Item label="上传图片（与 URL 二选一，可选）">
          <Upload {...uploadProps} maxCount={1}>
            <Button icon={<UploadOutlined />}>选择图片</Button>
          </Upload>
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" onClick={() => form.submit()} disabled={loading}>
              开始识别
            </Button>
            <Button onClick={onClose}>关闭</Button>
          </Space>
        </Form.Item>
      </Form>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <Spin />
        ) : error ? (
          <Alert type="error" message={error} />
        ) : (
          result && (
            <div>
              <h4>识别结果</h4>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{result}</pre>
              <h4>原始返回（调试）</h4>
              <pre style={{ maxHeight: 200, overflow: "auto" }}>{raw}</pre>
            </div>
          )
        )}
      </div>
    </Modal>
  );
};

export default OcrPanel;
