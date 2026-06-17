import { invoke } from '@tauri-apps/api/tauri';

export type OcrRequest = {
  image_url: string;
  image_base64?: string | null;
  language?: string | null;
  api_provider: 'google' | 'paddle' | 'tencent' | string;
  api_key: string;
  timeout_ms: number;
};

export type OcrResponse = {
  text: string;
  confidence?: number | null;
  raw_response: string;
  status: number;
};

export async function imageFileToBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip prefix like data:image/png;base64,
      const idx = result.indexOf('base64,');
      if (idx !== -1) {
        resolve(result.slice(idx + 7));
      } else {
        // fallback: take whole data URL
        resolve(result);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export async function recognizeTextFromImage(
  payload: OcrRequest
): Promise<OcrResponse> {
  // Tauri invoke: call the rust command `recognize_text_from_image`
  return await invoke<OcrResponse>('recognize_text_from_image', payload as any);
}

export async function batchRecognizeText(
  payloads: OcrRequest[]
): Promise<OcrResponse[]> {
  return await invoke<OcrResponse[]>('batch_recognize_text', { payloads } as any);
}
