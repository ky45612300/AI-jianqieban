export type StructuredCaptureChannel = "rules" | "ai";

export interface StructuredCaptureRecord {
  capturedAt: string;
  companyName: string;
  contactName: string;
  phoneNumber: string;
  email: string;
  address: string;
}

export interface StructuredCaptureState {
  lastFingerprint: string;
  updatedAt: string;
}
