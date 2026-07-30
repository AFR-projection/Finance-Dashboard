/**
 * Future-ready stubs for voice transcription and receipt OCR.
 * Keep interfaces stable so chat media handlers can plug in later.
 */

export type TranscriptionResult = {
  text: string;
  language?: string;
  confidence?: number;
};

export type ReceiptOcrResult = {
  merchant?: string;
  amount?: number;
  currency?: string;
  category?: string;
  date?: string;
  rawText?: string;
};

export async function transcribeAudio(_input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<TranscriptionResult> {
  void _input;
  throw new Error("Voice transcription is not enabled yet. Wire Whisper / Gemini audio here.");
}

export async function parseReceiptImage(_input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<ReceiptOcrResult> {
  void _input;
  throw new Error("Receipt OCR is not enabled yet. Wire Gemini vision / Document AI here.");
}
