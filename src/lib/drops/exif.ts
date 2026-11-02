/**
 * Zero-dependency EXIF & Receipt Timestamp Extractor.
 *
 * Extracts:
 *  - EXIF `DateTimeOriginal` (0x9003), `DateTimeDigitized` (0x9004), `DateTime` (0x0132)
 *    from JPEG APP1 segments.
 *  - Printed receipt timestamps (`HH:MM`, `HH:MM:SS AM/PM`, `MM/DD/YYYY HH:MM`)
 *    and machine `Q0xxxx` codes from OCR / filename / metadata text.
 */

export type PhotoProofMetadata = {
  capturedAt: Date | null;
  source: "exif" | "ocr_text" | "file_timestamp";
  machineCodeFound: string | null;
  confidence: number;
  summary: string;
};

/**
 * Parse JPEG APP1 EXIF buffer for DateTimeOriginal / DateTime tags.
 * Format in EXIF ASCII is `"YYYY:MM:DD HH:MM:SS"`.
 */
export function extractExifDateFromBuffer(buf: Uint8Array): Date | null {
  // Scan buffer for ASCII pattern "202X:XX:XX XX:XX:XX" which is standard EXIF DateTimeOriginal
  const decoder = new TextDecoder("latin1");
  // EXIF header always resides in the first 64KB of a JPEG/HEIC
  const head = decoder.decode(buf.subarray(0, Math.min(buf.length, 65536)));
  const m = head.match(/(202\d):([01]\d):([0-3]\d)\s+([0-2]\d):([0-5]\d):([0-5]\d)/);
  if (!m) return null;
  const [, yr, mo, da, hr, mi, se] = m;
  const parsed = new Date(
    Number(yr),
    Number(mo) - 1,
    Number(da),
    Number(hr),
    Number(mi),
    Number(se),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Extract receipt timestamp or clock readout from OCR text.
 */
export function extractReceiptTimestampFromText(text: string): {
  hour: number;
  minute: number;
  machineCode: string | null;
} | null {
  const codeMatch = text.match(/\b(Q\d{5})\b/i);
  const machineCode = codeMatch ? codeMatch[1].toUpperCase() : null;

  const timeMatch = text.match(/\b(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM|a\.m\.|p\.m\.)?\b/i);
  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const ampm = timeMatch[3]?.toLowerCase();
  if (ampm) {
    const isPm = ampm.startsWith("p");
    hour = (hour % 12) + (isPm ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute, machineCode };
}
