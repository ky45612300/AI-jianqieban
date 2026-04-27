const FIELD_LABEL_PATTERN =
  /(?:\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u59d3\u540d\/\u6cd5\u4eba|\u59d3\u540d|\u8054\u7cfb\u4eba|\u7535\u8bdd\u53f7\u7801|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a|\u8054\u7cfb\u7535\u8bdd|\u90ae\u7bb1|\u7535\u5b50\u90ae\u7bb1|Email|E-mail|\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740)/i;

const INLINE_LABEL_PATTERN =
  /([^\n])(?=(?:\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u59d3\u540d\/\u6cd5\u4eba|\u59d3\u540d|\u8054\u7cfb\u4eba|\u7535\u8bdd\u53f7\u7801|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a|\u8054\u7cfb\u7535\u8bdd|\u90ae\u7bb1|\u7535\u5b50\u90ae\u7bb1|Email|E-mail|\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740|Q?\u7ecf\u8425\u8303\u56f4)\s*(?::|\uFF1A))/gi;

const NOISE_PATTERN =
  /(?:\u66f4\u591a\d*|Q?\u7ecf\u8425\u8303\u56f4.*$|\u4e3b\u8425.*$|\u4f01\u4e1a\u98ce\u9669.*$|\u9644\u8fd1\u4f01\u4e1a.*$)/gi;

const PURE_NOISE_LINE_PATTERN =
  /^(?:\u54a8\u8be2|\u5f00\u4e1a|\u5b58\u7eed|\u5728\u4e1a|\u5728\u8425|\u56fe\u6587\u5feb\u5370|\u53f8\u6cd5\u6848\u4ef6\d+\u6761.*|\u6d89\u8bc9\u5173\u7cfb\d+\u4e2a.*)$/i;

const BARE_LABEL_LINE_PATTERN =
  /^(?:\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u59d3\u540d\/\u6cd5\u4eba|\u59d3\u540d|\u8054\u7cfb\u4eba|\u7535\u8bdd\u53f7\u7801|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a|\u8054\u7cfb\u7535\u8bdd|\u90ae\u7bb1|\u7535\u5b50\u90ae\u7bb1|Email|E-mail|\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740)\s*(?::|\uFF1A)?\s*$/i;

const COMPANY_HINT_PATTERN =
  /(?:\u6709\u9650\u8d23\u4efb\u516c\u53f8|\u80a1\u4efd\u6709\u9650\u516c\u53f8|\u6709\u9650\u516c\u53f8|\u96c6\u56e2|\u516c\u53f8|\u5de5\u4f5c\u5ba4|\u4e8b\u52a1\u6240|\u5546\u884c|\u4e2d\u5fc3|\u7ecf\u8425\u90e8|\u670d\u52a1\u90e8|\u95e8\u5e97|\u5206\u5e97|\u65d7\u8230\u5e97|\u4e13\u5356\u5e97|\u5e7f\u544a|\u5de5\u7a0b|\u88c5\u9970|\u79d1\u6280|\u8d38\u6613|\u5546\u8d38|\u7167\u660e|\u56fe\u6587|\u9910\u996e|\u5bbe\u9986|\u9152\u5e97|\u5382)/i;

const ADDRESS_SIGNAL_PATTERN =
  /(?:\u7701|\u5e02|\u533a|\u53bf|\u9547|\u4e61|\u6751|\u8857|\u8def|\u9053|\u53f7|\u5f04|\u5df7|\u697c|\u680b|\u5ea7|\u5ba4|\u56ed|\u5e7f\u573a|\u5927\u53a6|\u5927\u9053)/g;

const PHONE_VALUE_PATTERN = /(?:\+?86[-\s]*)?(1\d{10})/;

const EMAIL_VALUE_PATTERN =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+(?:\.[A-Za-z0-9-]{2,})?/;

export const normalizeStructuredCaptureText = (text: string) => {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(INLINE_LABEL_PATTERN, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const cleanupStructuredCaptureValue = (value: string) => {
  return value
    .replace(NOISE_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
};

export const splitStructuredCaptureLines = (text: string) => {
  return normalizeStructuredCaptureText(text)
    .split("\n")
    .map((line) => cleanupStructuredCaptureValue(line))
    .filter(Boolean);
};

export const sanitizePhoneNumber = (value: string) => {
  const matched =
    cleanupStructuredCaptureValue(value).match(PHONE_VALUE_PATTERN);
  return matched?.[1] ?? "";
};

export const sanitizeEmail = (value: string) => {
  const matched =
    cleanupStructuredCaptureValue(value).match(EMAIL_VALUE_PATTERN);
  return matched?.[0] ?? "";
};

export const sanitizeAddressValue = (value: string) => {
  return cleanupStructuredCaptureValue(
    value.replace(
      /^(?:\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740)\s*(?::|\uFF1A)\s*/i,
      "",
    ),
  ).replace(/\s*Q$/i, "");
};

export const hasCompanyHint = (value: string) => {
  return COMPANY_HINT_PATTERN.test(cleanupStructuredCaptureValue(value));
};

const countAddressSignals = (value: string) => {
  return (
    cleanupStructuredCaptureValue(value).match(ADDRESS_SIGNAL_PATTERN)
      ?.length ?? 0
  );
};

export const isNoiseLine = (value: string) => {
  const cleaned = cleanupStructuredCaptureValue(value);
  if (!cleaned) {
    return true;
  }

  if (PURE_NOISE_LINE_PATTERN.test(cleaned)) {
    return true;
  }

  if (BARE_LABEL_LINE_PATTERN.test(cleaned)) {
    return true;
  }

  return cleaned.length <= 2 && !hasCompanyHint(cleaned);
};

export const isLikelyAddressLine = (value: string) => {
  const cleaned = cleanupStructuredCaptureValue(value);
  if (
    !cleaned ||
    PHONE_VALUE_PATTERN.test(cleaned) ||
    EMAIL_VALUE_PATTERN.test(cleaned)
  ) {
    return false;
  }

  const signalCount = countAddressSignals(cleaned);
  if (signalCount < 2) {
    return false;
  }

  if (hasCompanyHint(cleaned) && signalCount < 3) {
    return false;
  }

  return true;
};

export const isStructuredCaptureCandidate = (text: string) => {
  const normalizedText = normalizeStructuredCaptureText(text);
  if (!normalizedText) {
    return false;
  }

  const lines = splitStructuredCaptureLines(normalizedText).filter(
    (line) => !isNoiseLine(line),
  );
  if (lines.length === 0) {
    return false;
  }

  const hasPhone = PHONE_VALUE_PATTERN.test(normalizedText);
  const hasEmail = EMAIL_VALUE_PATTERN.test(normalizedText);
  const hasLabeledField = FIELD_LABEL_PATTERN.test(normalizedText);
  const hasAddress = lines.some((line) => isLikelyAddressLine(line));
  const hasCompany = lines.some((line) => hasCompanyHint(line));

  const score = [
    hasPhone,
    hasEmail,
    hasLabeledField,
    hasAddress,
    hasCompany,
  ].filter(Boolean).length;

  return (
    score >= 2 ||
    (hasCompany && lines.length >= 2) ||
    ((hasPhone || hasEmail) && hasAddress)
  );
};
