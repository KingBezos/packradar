/**
 * Optional AI writer. If GEMINI_API_KEY is set, news summaries and the daily
 * report intro are written by Gemini; otherwise we fall back to templates.
 */
export function aiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function aiWrite(prompt: string, maxChars = 1200): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
        }),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    return text ? text.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
