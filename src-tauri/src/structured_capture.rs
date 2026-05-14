use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE},
    Method,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
use tauri::command;

const EXTERNAL_SCRIPT_FILE_NAME: &str = "structured-capture-script.js";

const DEFAULT_EXTERNAL_SCRIPT: &str = r#"// EcoPaste external structured capture script.
// Edit and save this file. EcoPaste reloads it before each external capture.
// Return null to skip. Return an object to append a row to records.csv.
// Fields: companyName, contactName, phoneNumber, email, address.
// This template is ES5-compatible, so double-clicking it will not trigger Windows Script Host syntax errors.

var LABEL_PATTERN = /(\u516c\u53f8\u540d\u79f0|\u4f01\u4e1a\u540d\u79f0|\u540d\u79f0|\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u8d1f\u8d23\u4eba|\u7ecf\u8425\u8005|\u8054\u7cfb\u4eba|\u59d3\u540d\/\u6cd5\u4eba|\u59d3\u540d|\u7535\u8bdd\u53f7\u7801|\u8054\u7cfb\u7535\u8bdd|\u8054\u7cfb\u65b9\u5f0f|\u7535\u8bdd|\u624b\u673a\u53f7|\u624b\u673a|\u90ae\u7bb1|\u7535\u5b50\u90ae\u7bb1|Email|E-mail|\u5730\u5740|\u8054\u7cfb\u5730\u5740|\u516c\u53f8\u5730\u5740|\u7ecf\u8425\u5730\u5740|\u6ce8\u518c\u5730\u5740|\u4f4f\u6240|\u6240\u5728\u5730|\u7ecf\u8425\u8303\u56f4|\u4e3b\u8425|\u5b98\u7f51|\u7f51\u5740|\u7b80\u4ecb|\u9644\u8fd1\u4f01\u4e1a|\u66f4\u591a)\s*(?:[:\uFF1A])/gi;
var PHONE_PATTERN = /(?:\+?86[-\s]*)?(1[3-9]\d{9})/;
var EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+(?:\.[A-Za-z0-9-]{2,})?/;
var STOP_PATTERN = /(?:\u7ecf\u8425\u8303\u56f4|\u4e3b\u8425|\u5b98\u7f51|\u7f51\u5740|\u7b80\u4ecb|\u9644\u8fd1\u4f01\u4e1a|\u66f4\u591a\d*|\u4f01\u4e1a\u98ce\u9669|\u53f8\u6cd5\u6848\u4ef6|\u6d89\u8bc9\u5173\u7cfb)\s*[:\uFF1A]?[\s\S]*$/i;
var COMPANY_TAIL_PATTERN = /(\u6709\u9650\u8d23\u4efb\u516c\u53f8|\u80a1\u4efd\u6709\u9650\u516c\u53f8|\u6709\u9650\u516c\u53f8|\u96c6\u56e2|\u516c\u53f8|\u5de5\u4f5c\u5ba4|\u4e8b\u52a1\u6240|\u5546\u884c|\u4e2d\u5fc3|\u7ecf\u8425\u90e8|\u670d\u52a1\u90e8|\u95e8\u5e97|\u5206\u5e97|\u5382)(?![\u4e00-\u9fa5])/;
var CONTACT_INLINE_PATTERN = /(?:\u6cd5\u5b9a\u4ee3\u8868\u4eba|\u6cd5\u4eba|\u8d1f\u8d23\u4eba|\u7ecf\u8425\u8005|\u8054\u7cfb\u4eba|\u59d3\u540d|\u59d3\u540d\/\u6cd5\u4eba)\s+([\u4e00-\u9fa5\u00b7]{2,8})/;

function cleanup(value, helpers) {
  return helpers.cleanup(String(value || "").replace(STOP_PATTERN, ""));
}

function withLabelBreaks(text) {
  return text.replace(LABEL_PATTERN, function (_matched, label, offset) {
    return offset > 0 ? "\n" + label + "\uFF1A" : label + "\uFF1A";
  });
}

function stripLabel(value, helpers) {
  return cleanup(value, helpers).replace(/^[^:\uFF1A]{1,16}\s*[:\uFF1A]\s*/, "");
}

function fieldValue(lines, labels, helpers) {
  for (var index = 0; index < lines.length; index += 1) {
    var line = cleanup(lines[index], helpers);
    for (var labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      var label = labels[labelIndex];
      if (line.indexOf(label + "\uFF1A") === 0 || line.indexOf(label + ":") === 0) {
        return stripLabel(line, helpers);
      }
    }
  }
  return "";
}

function phoneValue(value, helpers) {
  return helpers.sanitizePhoneNumber(value) || ((cleanup(value, helpers).match(PHONE_PATTERN) || [])[1] || "");
}

function emailValue(value, helpers) {
  return helpers.sanitizeEmail(value) || ((cleanup(value, helpers).match(EMAIL_PATTERN) || [])[0] || "");
}

function companyValue(value, helpers) {
  var cleaned = cleanup(value, helpers).replace(PHONE_PATTERN, "").replace(EMAIL_PATTERN, "").trim();
  var matched = COMPANY_TAIL_PATTERN.exec(cleaned);
  return matched ? cleaned.slice(0, matched.index + matched[0].length).trim() : cleaned;
}

function contactValue(value, helpers) {
  var cleaned = cleanup(value, helpers).replace(PHONE_PATTERN, "").replace(EMAIL_PATTERN, "").replace(/(?:\u5148\u751f|\u5973\u58eb|\u7ecf\u7406|\u8001\u677f|\u6cd5\u4eba|\u8d1f\u8d23\u4eba|\u8054\u7cfb\u4eba)$/i, "").trim();
  return cleaned.length <= 12 ? cleaned : "";
}

function pickCompany(lines, helpers) {
  var best = "";
  var bestScore = 0;
  for (var index = 0; index < lines.length; index += 1) {
    var line = cleanup(lines[index], helpers);
    if (!line || phoneValue(line, helpers) || emailValue(line, helpers) || helpers.isLikelyAddressLine(line)) continue;
    var score = helpers.hasCompanyHint(line) ? 10 : 0;
    if (COMPANY_TAIL_PATTERN.test(line)) score += 8;
    if (/[:\uFF1A]/.test(line)) score -= 6;
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return companyValue(best, helpers);
}

function pickAddress(lines, helpers) {
  for (var index = 0; index < lines.length; index += 1) {
    var line = cleanup(lines[index], helpers);
    if (!phoneValue(line, helpers) && !emailValue(line, helpers) && helpers.isLikelyAddressLine(line)) {
      return helpers.sanitizeAddress(line);
    }
  }
  return "";
}

function usefulFieldCount(fields) {
  var count = 0;
  for (var index = 0; index < fields.length; index += 1) {
    if (fields[index]) count += 1;
  }
  return count;
}

function capture(text, helpers) {
  var normalized = withLabelBreaks(helpers.normalizeText(text));
  var rawLines = helpers.splitLines(normalized);
  var lines = [];
  for (var index = 0; index < rawLines.length; index += 1) {
    if (!helpers.isNoiseLine(rawLines[index])) lines.push(rawLines[index]);
  }

  var companyName = companyValue(fieldValue(lines, ["\u516c\u53f8\u540d\u79f0", "\u4f01\u4e1a\u540d\u79f0", "\u540d\u79f0"], helpers), helpers) || pickCompany(lines, helpers);
  var contactName = contactValue(fieldValue(lines, ["\u6cd5\u5b9a\u4ee3\u8868\u4eba", "\u6cd5\u4eba", "\u8d1f\u8d23\u4eba", "\u7ecf\u8425\u8005", "\u8054\u7cfb\u4eba", "\u59d3\u540d/\u6cd5\u4eba", "\u59d3\u540d"], helpers), helpers);
  var phoneNumber = phoneValue(fieldValue(lines, ["\u7535\u8bdd\u53f7\u7801", "\u8054\u7cfb\u7535\u8bdd", "\u8054\u7cfb\u65b9\u5f0f", "\u7535\u8bdd", "\u624b\u673a\u53f7", "\u624b\u673a"], helpers) || normalized, helpers);
  var email = emailValue(fieldValue(lines, ["\u90ae\u7bb1", "\u7535\u5b50\u90ae\u7bb1", "Email", "E-mail"], helpers) || normalized, helpers);
  var address = helpers.sanitizeAddress(fieldValue(lines, ["\u5730\u5740", "\u8054\u7cfb\u5730\u5740", "\u516c\u53f8\u5730\u5740", "\u7ecf\u8425\u5730\u5740", "\u6ce8\u518c\u5730\u5740", "\u4f4f\u6240", "\u6240\u5728\u5730"], helpers)) || pickAddress(lines, helpers);

  if (!contactName) {
    for (index = 0; index < lines.length; index += 1) {
      var matched = CONTACT_INLINE_PATTERN.exec(lines[index]);
      if (matched) {
        contactName = contactValue(matched[1], helpers);
        break;
      }
    }
  }

  if (!companyName || usefulFieldCount([companyName, contactName, phoneNumber, email, address]) < 2) {
    return null;
  }

  return {
    address: address,
    companyName: companyName,
    contactName: contactName,
    email: email,
    phoneNumber: phoneNumber
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports.capture = capture;
}
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendStructuredCaptureCsvPayload {
    pub output_path: String,
    pub headers: Vec<String>,
    pub values: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredCaptureAiRequestPayload {
    pub endpoint: String,
    pub api_key: String,
    pub timeout_ms: u64,
    pub body: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredCaptureAiResponse {
    pub body: String,
    pub status: u16,
}

fn escape_csv_value(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r')
    {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn join_csv_row(values: &[String]) -> String {
    values
        .iter()
        .map(|value| escape_csv_value(value))
        .collect::<Vec<_>>()
        .join(",")
}

fn get_install_dir() -> Result<PathBuf, String> {
    let exe_path = env::current_exe().map_err(|error| error.to_string())?;
    exe_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "failed to resolve application directory".to_string())
}

fn get_external_script_path() -> Result<PathBuf, String> {
    Ok(get_install_dir()?.join(EXTERNAL_SCRIPT_FILE_NAME))
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn ensure_external_script_file() -> Result<PathBuf, String> {
    let path = get_external_script_path()?;

    if !path.exists() {
        fs::write(&path, DEFAULT_EXTERNAL_SCRIPT).map_err(|error| error.to_string())?;
    } else {
        let source = fs::read_to_string(&path).unwrap_or_default();
        let is_legacy_default = source.contains("EcoPaste 缁撴瀯")
            || source.contains("matched.groups?.value")
            || source.contains("function pickCompanyName(lines, helpers)");

        if is_legacy_default {
            fs::write(&path, DEFAULT_EXTERNAL_SCRIPT).map_err(|error| error.to_string())?;
        }
    }

    Ok(path)
}

#[cfg(target_os = "windows")]
fn open_path_in_text_editor(path: &Path) -> Result<(), String> {
    Command::new("notepad.exe")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn open_path_in_text_editor(path: &Path) -> Result<(), String> {
    Command::new("open")
        .arg("-t")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_path_in_text_editor(path: &Path) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn create_headers(api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if !api_key.trim().is_empty() {
        let token = format!("Bearer {}", api_key.trim());
        let header_value = HeaderValue::from_str(&token)
            .map_err(|error| format!("invalid authorization header: {error}"))?;
        headers.insert(AUTHORIZATION, header_value);
    }

    Ok(headers)
}

async fn send_ai_request(
    endpoint: &str,
    method: Method,
    api_key: &str,
    timeout_ms: u64,
    body: Option<Value>,
) -> Result<StructuredCaptureAiResponse, String> {
    let headers = create_headers(api_key)?;
    let timeout = Duration::from_millis(timeout_ms.max(1000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;

    let mut request = client.request(method, endpoint).headers(headers);

    if let Some(json_body) = body {
        request = request.json(&json_body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;

    Ok(StructuredCaptureAiResponse { body, status })
}

#[command]
pub fn append_structured_capture_csv(
    payload: AppendStructuredCaptureCsvPayload,
) -> Result<(), String> {
    let path = Path::new(&payload.output_path);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let file_exists = path.exists();
    let file_is_empty = if file_exists {
        fs::metadata(path)
            .map_err(|error| error.to_string())?
            .len()
            == 0
    } else {
        true
    };

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;

    if !file_exists || file_is_empty {
        writeln!(file, "{}", join_csv_row(&payload.headers))
            .map_err(|error| error.to_string())?;
    }

    writeln!(file, "{}", join_csv_row(&payload.values)).map_err(|error| error.to_string())?;
    Ok(())
}

#[command]
pub fn get_structured_capture_external_script_path() -> Result<String, String> {
    get_external_script_path().map(path_to_string)
}

#[command]
pub fn ensure_structured_capture_external_script() -> Result<String, String> {
    ensure_external_script_file().map(path_to_string)
}

#[command]
pub fn open_structured_capture_external_script() -> Result<String, String> {
    let path = ensure_external_script_file()?;
    open_path_in_text_editor(&path)?;
    Ok(path_to_string(path))
}

#[command]
pub fn read_structured_capture_external_script() -> Result<String, String> {
    let path = ensure_external_script_file()?;

    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[command]
pub async fn request_structured_capture_ai_chat_completion(
    payload: StructuredCaptureAiRequestPayload,
) -> Result<StructuredCaptureAiResponse, String> {
    send_ai_request(
        &payload.endpoint,
        Method::POST,
        &payload.api_key,
        payload.timeout_ms,
        payload.body,
    )
    .await
}

#[command]
pub async fn fetch_structured_capture_ai_models(
    payload: StructuredCaptureAiRequestPayload,
) -> Result<StructuredCaptureAiResponse, String> {
    send_ai_request(
        &payload.endpoint,
        Method::GET,
        &payload.api_key,
        payload.timeout_ms,
        None,
    )
    .await
}
