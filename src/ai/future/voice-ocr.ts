/**
 * Future-ready stubs for voice transcription and receipt OCR.
 * Do not call production AI providers from here yet — interfaces only.
 */

export type VoiceTranscriptionRequest = {
  userId: string;
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
  channel: "TELEGRAM" | "WEB";
};

export type VoiceTranscriptionResult = {
  text: string;
  confidence?: number;
  language?: string;
};

export type ReceiptOcrRequest = {
  userId: string;
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
};

export type ReceiptOcrResult = {
  merchant?: string;
  amount?: number;
  currency?: string;
  category?: string;
  transactionDate?: string;
  rawText?: string;
};

export async function transcribeVoice(
  _req: VoiceTranscriptionRequest,
): Promise<VoiceTranscriptionResult> {
  void _req;
  throw new Error(
    "Voice transcription is not enabled yet. Phase 2: wire Whisper / Gemini audio here.",
  );
}

export async function parseReceipt(_req: ReceiptOcrRequest): Promise<ReceiptOcrResult> {
  void _req;
  throw new Error(
    "Receipt OCR is not enabled yet. Phase 2: wire Gemini vision / Document AI here.",
  );
}
