use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE},
    Method,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::Duration,
};
use tauri::command;

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
