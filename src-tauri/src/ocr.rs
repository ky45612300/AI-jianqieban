use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE},
    Client, Method,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::command;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OcrRequest {
    pub image_url: String,
    pub image_base64: Option<String>,
    pub language: Option<String>,
    pub api_provider: String,
    pub api_key: String,
    pub timeout_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResponse {
    pub text: String,
    pub confidence: Option<f32>,
    pub raw_response: String,
    pub status: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleVisionResponse {
    responses: Vec<GoogleVisionResponseItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleVisionResponseItem {
    full_text_annotation: Option<GoogleFullTextAnnotation>,
    error: Option<GoogleError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleFullTextAnnotation {
    text: String,
}

#[derive(Debug, Deserialize)]
struct GoogleError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct PaddleOcrResponse {
    #[serde(rename = "data")]
    data: Option<Vec<PaddleOcrBlock>>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PaddleOcrBlock {
    texts: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct TencentOcrResponse {
    Response: Option<TencentOcrResponseData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TencentOcrResponseData {
    text_detections: Option<Vec<TencentTextDetection>>,
    error: Option<TencentError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TencentTextDetection {
    detected_text: String,
    confidence: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct TencentError {
    message: String,
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

async fn call_google_vision(
    image_base64: &str,
    api_key: &str,
    timeout_ms: u64,
) -> Result<OcrResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_millis(timeout_ms.max(5000)))
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;

    let endpoint = format!(
        "https://vision.googleapis.com/v1/images:annotate?key={}",
        api_key
    );

    let body = json!({
        "requests": [
            {
                "image": {
                    "content": image_base64
                },
                "features": [
                    {
                        "type": "TEXT_DETECTION"
                    }
                ]
            }
        ]
    });

    let response = client
        .post(&endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;

    if status != 200 {
        return Err(format!("OCR API returned status {}: {}", status, text));
    }

    let result: GoogleVisionResponse = serde_json::from_str(&text)
        .map_err(|error| format!("failed to parse response: {error}"))?;

    if let Some(item) = result.responses.first() {
        if let Some(error) = &item.error {
            return Err(format!("Google Vision API error: {}", error.message));
        }

        if let Some(annotation) = &item.full_text_annotation {
            return Ok(OcrResponse {
                text: annotation.text.clone(),
                confidence: None,
                raw_response: text,
                status,
            });
        }
    }

    Err("No text detected in image".to_string())
}

async fn call_paddle_ocr(
    image_url: &str,
    api_key: &str,
    timeout_ms: u64,
) -> Result<OcrResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_millis(timeout_ms.max(5000)))
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;

    let headers = create_headers(api_key)?;

    let body = json!({
        "url": image_url
    });

    let response = client
        .post("https://api.pdfrw.io/v1/ocr")
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;

    if status != 200 {
        return Err(format!("Paddle OCR API returned status {}: {}", status, text));
    }

    let result: PaddleOcrResponse = serde_json::from_str(&text)
        .map_err(|error| format!("failed to parse response: {error}"))?;

    if let Some(error_msg) = &result.message {
        return Err(format!("Paddle OCR API error: {}", error_msg));
    }

    if let Some(data) = result.data {
        let full_text = data
            .iter()
            .filter_map(|block| block.texts.as_ref())
            .flatten()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");

        if !full_text.is_empty() {
            return Ok(OcrResponse {
                text: full_text,
                confidence: None,
                raw_response: text,
                status,
            });
        }
    }

    Err("No text detected in image".to_string())
}

async fn call_tencent_ocr(
    image_base64: &str,
    api_key: &str,
    timeout_ms: u64,
) -> Result<OcrResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_millis(timeout_ms.max(5000)))
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;

    let headers = create_headers(api_key)?;

    let body = json!({
        "ImageBase64": image_base64,
        "LanguageType": "auto"
    });

    let response = client
        .post("https://ocr.tencentcloudapi.com/")
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;

    if status != 200 {
        return Err(format!("Tencent OCR API returned status {}: {}", status, text));
    }

    let result: TencentOcrResponse = serde_json::from_str(&text)
        .map_err(|error| format!("failed to parse response: {error}"))?;

    if let Some(response_data) = result.Response {
        if let Some(error) = response_data.error {
            return Err(format!("Tencent OCR API error: {}", error.message));
        }

        if let Some(detections) = response_data.text_detections {
            let full_text = detections
                .iter()
                .map(|d| d.detected_text.clone())
                .collect::<Vec<_>>()
                .join("\n");

            let confidence = detections
                .iter()
                .filter_map(|d| d.confidence)
                .sum::<i32>()
                / detections.len().max(1) as i32;

            return Ok(OcrResponse {
                text: full_text,
                confidence: Some(confidence as f32 / 100.0),
                raw_response: text,
                status,
            });
        }
    }

    Err("No text detected in image".to_string())
}

#[command]
pub async fn recognize_text_from_image(
    payload: OcrRequest,
) -> Result<OcrResponse, String> {
    let api_provider = payload.api_provider.to_lowercase();

    match api_provider.as_str() {
        "google" => {
            if let Some(base64) = &payload.image_base64 {
                call_google_vision(base64, &payload.api_key, payload.timeout_ms).await
            } else {
                Err("Google Vision requires image_base64".to_string())
            }
        }
        "paddle" => {
            call_paddle_ocr(&payload.image_url, &payload.api_key, payload.timeout_ms).await
        }
        "tencent" => {
            if let Some(base64) = &payload.image_base64 {
                call_tencent_ocr(base64, &payload.api_key, payload.timeout_ms).await
            } else {
                Err("Tencent OCR requires image_base64".to_string())
            }
        }
        _ => Err(format!(
            "Unsupported OCR provider: {}. Supported: google, paddle, tencent",
            api_provider
        )),
    }
}

#[command]
pub async fn batch_recognize_text(
    payloads: Vec<OcrRequest>,
) -> Result<Vec<OcrResponse>, String> {
    let mut results = Vec::new();

    for payload in payloads {
        match recognize_text_from_image(payload).await {
            Ok(response) => results.push(response),
            Err(error) => {
                results.push(OcrResponse {
                    text: String::new(),
                    confidence: None,
                    raw_response: error,
                    status: 400,
                });
            }
        }
    }

    Ok(results)
}
