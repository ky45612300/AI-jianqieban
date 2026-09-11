/**
 * 字段格式验证模块
 * 用于验证结构化采集结果中各字段的数据质量
 */

import type { StructuredCaptureRecord } from "@/types/structured-capture";

/**
 * 邮箱验证正则表达式
 * 符合基本的 RFC 5322 标准
 */
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/**
 * 中国手机号验证正则
 * - 11位数字，首位为1，第二位为3-9
 * - 支持国际格式 +86-xxx 或 +86 xxx
 */
const CHINA_MOBILE_PATTERN = /^1[3-9]\d{9}$/;

/**
 * 中国固话验证正则
 * - 区号(3-4位) + 号码(7-8位)
 * - 格式: 010-12345678 或 010 12345678
 */
const CHINA_LANDLINE_PATTERN = /^0\d{2,3}[-\s]?\d{7,8}$/;

/**
 * 地址最小长度（字符数）
 * 用于过滤过短的无效地址
 */
const MIN_ADDRESS_LENGTH = 6;

/**
 * 公司名称最小长度
 * 防止单字或极短的无效公司名
 */
const MIN_COMPANY_NAME_LENGTH = 2;

/**
 * 联系人名称最小长度
 */
const MIN_CONTACT_NAME_LENGTH = 2;

/**
 * 验证邮箱格式
 * @param email 邮箱地址
 * @returns 是否为有效邮箱
 */
export const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== "string") {
    return false;
  }

  const trimmed = email.trim();

  // 基础长度检查
  if (trimmed.length < 5 || trimmed.length > 320) {
    return false;
  }

  return EMAIL_PATTERN.test(trimmed);
};

/**
 * 验证电话号码格式（中国）
 * 支持：
 * - 手机号: 13800138000, 1-380-013-8000
 * - 固话: 010-12345678, 0105678901
 * - 国际: +86-13800138000, +8613800138000
 *
 * @param phoneNumber 电话号码
 * @returns 是否为有效电话号码
 */
export const isValidPhoneNumber = (phoneNumber: string): boolean => {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return false;
  }

  // 移除空格、短横、加号等分隔符，但保留数字和+
  const cleaned = phoneNumber.replace(/[\s\-()]/g, "");

  // 处理国际格式 +8613800138000
  let toValidate = cleaned;
  if (toValidate.startsWith("+86")) {
    toValidate = `1${toValidate.substring(3)}`;
  } else if (toValidate.startsWith("86")) {
    // 有时候会是 8613800138000 格式
    if (toValidate.length === 12 && toValidate[2] === "1") {
      toValidate = toValidate.substring(2);
    }
  }

  // 检查手机号
  if (CHINA_MOBILE_PATTERN.test(toValidate)) {
    return true;
  }

  // 检查固话
  if (CHINA_LANDLINE_PATTERN.test(cleaned)) {
    return true;
  }

  return false;
};

/**
 * 验证公司名称
 * @param companyName 公司名称
 * @returns 是否为有效公司名称
 */
export const isValidCompanyName = (companyName: string): boolean => {
  if (!companyName || typeof companyName !== "string") {
    return false;
  }

  const trimmed = companyName.trim();

  // 长度检查
  if (trimmed.length < MIN_COMPANY_NAME_LENGTH) {
    return false;
  }

  // 过滤明显的垃圾数据（如纯数字、纯符号等）
  if (/^\d+$/.test(trimmed) || /^[^\w\u4e00-\u9fff]+$/.test(trimmed)) {
    return false;
  }

  return true;
};

/**
 * 验证联系人名称
 * @param contactName 联系人名称
 * @returns 是否为有效联系人名称
 */
export const isValidContactName = (contactName: string): boolean => {
  if (!contactName || typeof contactName !== "string") {
    return false;
  }

  const trimmed = contactName.trim();

  // 长度检查
  if (trimmed.length < MIN_CONTACT_NAME_LENGTH) {
    return false;
  }

  // 过滤明显的垃圾数据
  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  return true;
};

/**
 * 验证地址
 * @param address 地址
 * @returns 是否为有效地址
 */
export const isValidAddress = (address: string): boolean => {
  if (!address || typeof address !== "string") {
    return false;
  }

  const trimmed = address.trim();

  // 最小长度检查
  if (trimmed.length < MIN_ADDRESS_LENGTH) {
    return false;
  }

  // 过滤纯数字或纯符号
  if (/^\d+$/.test(trimmed) || /^[^\w\u4e00-\u9fff]+$/.test(trimmed)) {
    return false;
  }

  return true;
};

/**
 * 字段验证结果
 */
export interface FieldValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * 验证单个字段
 * @param field 字段名
 * @param value 字段值
 * @returns 验证结果
 */
export const validateField = (
  field: keyof Omit<StructuredCaptureRecord, "capturedAt">,
  value: string,
): FieldValidationResult => {
  if (!value) {
    return { isValid: true }; // 空值认为有效（允许字段不填）
  }

  switch (field) {
    case "email":
      if (!isValidEmail(value)) {
        return {
          isValid: false,
          reason: "邮箱格式无效",
        };
      }
      break;

    case "phoneNumber":
      if (!isValidPhoneNumber(value)) {
        return {
          isValid: false,
          reason: "电话号码格式无效",
        };
      }
      break;

    case "companyName":
      if (!isValidCompanyName(value)) {
        return {
          isValid: false,
          reason: "公司名称无效",
        };
      }
      break;

    case "contactName":
      if (!isValidContactName(value)) {
        return {
          isValid: false,
          reason: "联系人名称无效",
        };
      }
      break;

    case "address":
      if (!isValidAddress(value)) {
        return {
          isValid: false,
          reason: "地址无效",
        };
      }
      break;
  }

  return { isValid: true };
};

/**
 * 验证整条记录
 * @param record 结构化采集记录
 * @returns 是否有效
 */
export const isValidStructuredRecord = (
  record: Omit<StructuredCaptureRecord, "capturedAt">,
): boolean => {
  // 所有字段都必须通过验证
  const fields: Array<keyof Omit<StructuredCaptureRecord, "capturedAt">> = [
    "companyName",
    "contactName",
    "phoneNumber",
    "email",
    "address",
  ];

  for (const field of fields) {
    const value = record[field];
    if (value) {
      const result = validateField(field, value);
      if (!result.isValid) {
        return false;
      }
    }
  }

  return true;
};

/**
 * 获取记录中有效的字段数量
 * 即字段值非空且通过格式验证
 * @param record 结构化采集记录
 * @returns 有效字段数
 */
export const getValidFieldCount = (
  record: Omit<StructuredCaptureRecord, "capturedAt">,
): number => {
  const fields: Array<keyof Omit<StructuredCaptureRecord, "capturedAt">> = [
    "companyName",
    "contactName",
    "phoneNumber",
    "email",
    "address",
  ];

  let count = 0;
  for (const field of fields) {
    const value = record[field];
    if (value && validateField(field, value).isValid) {
      count++;
    }
  }

  return count;
};

/**
 * 检查记录是否包含有用的字段（用于AI提取的质量检查）
 * 规则：
 * 1. 必须有有效的公司名称
 * 2. 至少再有2个其他有效字段
 * @param record 结构化采集记录
 * @returns 是否有用
 */
export const hasUsefulFieldsWithValidation = (
  record: Omit<StructuredCaptureRecord, "capturedAt">,
): boolean => {
  // 公司名称是必须的
  if (!record.companyName || !isValidCompanyName(record.companyName)) {
    return false;
  }

  // 检查其他字段的有效数量
  const otherFields = [
    { field: "contactName" as const, value: record.contactName },
    { field: "phoneNumber" as const, value: record.phoneNumber },
    { field: "email" as const, value: record.email },
    { field: "address" as const, value: record.address },
  ];

  const validOtherFieldCount = otherFields.filter(
    ({ field, value }) => value && validateField(field, value).isValid,
  ).length;

  // 至少需要2个有效的其他字段
  return validOtherFieldCount >= 2;
};
