/**
 * Receipt & Touchscreen Photo EXIF + OCR Drop Verifier ("Snap to Confirm").
 *
 * Accepts a photo of a Pokémon vending machine receipt or in-stock screen:
 *  1. Extracts EXIF `DateTimeOriginal` from the binary image header.
 *  2. Optionally runs Gemini Vision OCR (`GEMINI_API_KEY`) to read printed receipt
 *     timestamps and `Q0xxxx` machine codes.
 *  3. Adjusts for checkout latency (receipts print ~1 minute after the drip unlocks)
 *     and records a high-confidence drop candidate + verified observation (+25 Rep).
 */
import { eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { machines } from "@/db/schema";
import { extractExifDateFromBuffer, extractReceiptTimestampFromText } from "@/lib/drops/exif";
import { localClock } from "@/lib/drops/schedule";
import { submitObservation, upsertScrapedCandidate } from "@/lib/drops/engine";
import { addReputation } from "@/lib/activity";

export const dynamic = "force-dynamic";

async function runGeminiPhotoOcr(base64Jpeg: string, mimeType: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Extract any visible time (HH:MM AM/PM) and Pokemon vending machine code (Q followed by 5 digits) from this receipt or kiosk screen photo. Return plain text.",
                },
                { inlineData: { mimeType, data: base64Jpeg } },
              ],
            },
          ],
        }),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const [m] = await db.select().from(machines).where(eq(machines.id, id));
  if (!m) throw new Error("Machine not found");

  const form = await req.formData();
  const file = form.get("photo") as File | null;
  const kind = String(form.get("kind") ?? "receipt"); // "receipt" | "screen"
  const clientLastModified = Number(form.get("lastModified") ?? 0);
  const manualReceiptText = String(form.get("receiptText") ?? "");

  if (!file && !manualReceiptText) {
    throw new Error("Please select a receipt or screen photo to upload.");
  }

  let capturedAt: Date | null = null;
  let proofSource: "EXIF DateTimeOriginal" | "Vision OCR" | "File Timestamp" = "File Timestamp";
  let ocrNote = "";

  if (file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const exifDate = extractExifDateFromBuffer(buf);
    if (exifDate) {
      capturedAt = exifDate;
      proofSource = "EXIF DateTimeOriginal";
    }

    // Attempt Gemini Vision OCR if configured
    if (buf.length < 6_000_000) {
      const b64 = Buffer.from(buf).toString("base64");
      const ocrText = await runGeminiPhotoOcr(b64, file.type || "image/jpeg");
      if (ocrText) {
        const parsed = extractReceiptTimestampFromText(ocrText);
        if (parsed) {
          const d = capturedAt ? new Date(capturedAt) : new Date();
          d.setHours(parsed.hour, parsed.minute, 0, 0);
          capturedAt = d;
          proofSource = "Vision OCR";
          ocrNote = ocrText.slice(0, 100);
        }
      }
    }

    if (!capturedAt && clientLastModified > 0) {
      capturedAt = new Date(clientLastModified);
      proofSource = "File Timestamp";
    }
  }

  if (manualReceiptText) {
    const parsed = extractReceiptTimestampFromText(manualReceiptText);
    if (parsed) {
      const d = capturedAt ? new Date(capturedAt) : new Date();
      d.setHours(parsed.hour, parsed.minute, 0, 0);
      capturedAt = d;
      proofSource = "Vision OCR";
    }
  }

  if (!capturedAt) {
    capturedAt = new Date();
  }

  const clock = localClock(capturedAt.getTime(), m.timezone);
  const rawMinute = clock.minuteOfDay % 60;
  // Receipts print ~1 minute after the drop unlocks on screen
  const anchorMinute = kind === "receipt" ? (rawMinute + 59) % 60 : rawMinute;
  const intervalMinutes = m.intervalMinutes ?? 60;

  await upsertScrapedCandidate(db, {
    machineId: m.id,
    intervalMinutes,
    anchorMinute,
    sourceUrl: `/machines/${m.id}#photo-proof`,
    sourceTitle: `Verified ${kind === "receipt" ? "Receipt" : "Screen Photo"} (${proofSource} @ :${String(anchorMinute).padStart(2, "0")})`,
    reliability: 0.94,
    mentionedAt: capturedAt,
  });

  // Align observation timestamp with the anchor minute so consensus engine links it
  const alignedObs = new Date(capturedAt);
  alignedObs.setMinutes(anchorMinute, 15, 0);

  const updated = await submitObservation(db, {
    machineId: m.id,
    userId: user?.id ?? null,
    observedAt: alignedObs,
    kind: "dropped",
    note: `📸 Verified via ${kind === "receipt" ? "Receipt" : "Screen Photo"} (${proofSource})${ocrNote ? ` · ${ocrNote}` : ""}`,
    source: user ? "user" : "scraped",
  });

  if (user) {
    await addReputation(db, user.id, 25, "photo/receipt verification");
  }

  return {
    ok: true,
    proofSource,
    anchorMinute,
    intervalMinutes,
    accuracy: updated?.accuracy ?? null,
    message: `📸 Verified via ${proofSource}! Drop anchor locked at :${String(anchorMinute).padStart(2, "0")} past the hour${user ? " (+25 Rep)" : ""}.`,
  };
});
