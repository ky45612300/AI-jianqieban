// 结构化采集链路测试：
// - 内置规则通道 extractByRules
// - 外置脚本通道 extractByExternalScript（通过环境变量指定脚本目录，避免污染用户文件）
// - 公共 payload 映射 / 候选判断 / 内部规则 / 字段校验
// 运行方式：pnpm exec tsx scripts/structured-capture.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

// 一个外置脚本覆盖三种场景：英文键 / 中文键 / 返回 null 跳过
const SCRIPT_SOURCE = `
function capture(text, helpers) {
  if (text.indexOf("SKIP_ME") !== -1) return null;
  if (text.indexOf("CHINESE_KEYS") !== -1) {
    return {
      "公司名称": "测试有限公司",
      "姓名/法人": "王五",
      "电话号码": "13900001111",
      "邮箱": "wuwu@example.com",
      "地址": "上海市浦东新区测试路1号",
    };
  }
  return {
    companyName: "北京示例科技有限公司",
    contactName: "李四",
    phoneNumber: helpers.sanitizePhoneNumber(text) || "13800002222",
    email: "",
    address: "北京市海淀区示例路88号",
  };
}
module.exports.capture = capture;
`;

const { recordFromScriptSource } = await import(
  "../src/structured-capture/externalScript.ts"
);
const { extractByRules } = await import("../src/structured-capture/rules.ts");
const {
  hasUsefulFields,
  isStructuredCaptureCandidate,
  toStructuredRecordFromPayload,
} = await import("../src/structured-capture/shared.ts");
const { applyInternalRules } = await import(
  "../src/structured-capture/internalRules.ts"
);
const { isValidStructuredRecord } = await import(
  "../src/structured-capture/validation.ts"
);

// 模拟样例一：带标签的企业详情页
const LabeledSample = [
  "北京华宇科技有限公司",
  "法定代表人：张三",
  "电话：13800138000",
  "邮箱：zhangsan@example.com",
  "地址：北京市朝阳区望京街88号501室",
].join("\n");

// 模拟样例二：不带标签的门店页
const ShopSample = [
  "老王牛肉面馆(王府井店)",
  "13912345678",
  "北京市朝阳区王府井大街123号",
].join("\n");

// 模拟样例三：普通文本（应被候选判断拒绝）
const PlainText = "这是一段普通文本，没有任何企业信息。";

test("候选判断：企业详情页 / 门店页应通过，普通文本应拒绝", () => {
  assert.equal(isStructuredCaptureCandidate(LabeledSample), true);
  assert.equal(isStructuredCaptureCandidate(ShopSample), true);
  assert.equal(isStructuredCaptureCandidate(PlainText), false);
});

test("内置规则通道：带标签的企业详情页五个字段全部提取", () => {
  const record = extractByRules(LabeledSample);
  assert.ok(record, "不应返回 null");
  assert.equal(record.companyName, "北京华宇科技有限公司");
  assert.equal(record.contactName, "张三");
  assert.equal(record.phoneNumber, "13800138000");
  assert.equal(record.email, "zhangsan@example.com");
  assert.match(record.address, /北京市朝阳区望京街88号501室/);
  assert.ok(isValidStructuredRecord(record), "记录应通过字段格式校验");
});

test("内置规则通道：不带标签的门店页能提取公司名 / 电话 / 地址", () => {
  const record = extractByRules(ShopSample);
  assert.ok(record, "不应返回 null");
  assert.equal(record.companyName, "老王牛肉面馆(王府井店)");
  assert.equal(record.phoneNumber, "13912345678");
  assert.match(record.address, /北京市朝阳区王府井大街123号/);
});

test("内置规则通道：普通文本返回 null", () => {
  assert.equal(extractByRules(PlainText), null);
});

test("外置脚本通道：英文键映射 + helpers 清洗", () => {
  const record = recordFromScriptSource(SCRIPT_SOURCE, "随机文本 abc");
  assert.ok(record, "不应返回 null");
  assert.equal(record.companyName, "北京示例科技有限公司");
  assert.equal(record.contactName, "李四");
  assert.equal(record.phoneNumber, "13800002222");
  assert.equal(record.email, "");
  assert.equal(record.address, "北京市海淀区示例路88号");
  assert.ok(hasUsefulFields(record));
});

test("外置脚本通道：中文键兜底映射", () => {
  const record = recordFromScriptSource(SCRIPT_SOURCE, "CHINESE_KEYS 测试");
  assert.ok(record, "不应返回 null");
  assert.equal(record.companyName, "测试有限公司");
  assert.equal(record.contactName, "王五");
  assert.equal(record.phoneNumber, "13900001111");
  assert.equal(record.email, "wuwu@example.com");
  assert.equal(record.address, "上海市浦东新区测试路1号");
});

test("外置脚本通道：脚本返回 null 时跳过", () => {
  const record = recordFromScriptSource(SCRIPT_SOURCE, "SKIP_ME");
  assert.equal(record, null);
});

test("toStructuredRecordFromPayload：非对象输入返回 null", () => {
  assert.equal(toStructuredRecordFromPayload("字符串"), null);
  assert.equal(toStructuredRecordFromPayload(null), null);
  assert.equal(toStructuredRecordFromPayload(undefined), null);
  assert.equal(toStructuredRecordFromPayload([]), null);
});

test("hasUsefulFields：必须有公司名且至少 2 个有效字段", () => {
  assert.equal(
    hasUsefulFields({
      address: "",
      companyName: "",
      contactName: "张三",
      email: "a@b.com",
      phoneNumber: "13800138000",
    }),
    false,
  );
  assert.equal(
    hasUsefulFields({
      address: "",
      companyName: "某公司",
      contactName: "",
      email: "a@b.com",
      phoneNumber: "13800138000",
    }),
    true,
  );
});

test("applyInternalRules：'只提取电话号码' 时清空其余字段", () => {
  const record = applyInternalRules(
    {
      address: "某地址",
      companyName: "某公司",
      contactName: "张三",
      email: "a@b.com",
      phoneNumber: "13800138000",
    },
    "只提取电话号码",
  );
  assert.ok(record);
  assert.equal(record.phoneNumber, "13800138000");
  assert.equal(record.companyName, "");
  assert.equal(record.email, "");
  assert.equal(record.address, "");
  assert.equal(record.contactName, "");
});

test("applyInternalRules：'不提取邮箱' 时仅清空邮箱", () => {
  const record = applyInternalRules(
    {
      address: "某地址",
      companyName: "某公司",
      contactName: "张三",
      email: "a@b.com",
      phoneNumber: "13800138000",
    },
    "不提取邮箱",
  );
  assert.ok(record);
  assert.equal(record.email, "");
  assert.equal(record.companyName, "某公司");
});

test("isValidStructuredRecord：非法电话 / 邮箱 / 过短地址应拒绝", () => {
  const base = {
    address: "北京市朝阳区某路1号",
    companyName: "北京测试有限公司",
    contactName: "张三",
    email: "a@b.com",
    phoneNumber: "13800138000",
  };
  assert.equal(isValidStructuredRecord(base), true);
  assert.equal(
    isValidStructuredRecord({ ...base, phoneNumber: "12345" }),
    false,
  );
  assert.equal(
    isValidStructuredRecord({ ...base, email: "not-an-email" }),
    false,
  );
  assert.equal(isValidStructuredRecord({ ...base, address: "太短" }), false);
});
