import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";

export type Message = { title: string; body: string; url?: string | null };

const SITE_URL = () =>
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  "http://localhost:3000";

function absolute(url?: string | null) {
  if (!url) return SITE_URL();
  return url.startsWith("http") ? url : `${SITE_URL()}${url}`;
}

/* ───────── Email ───────── */

const gEmail = globalThis as unknown as {
  __packradarEmailConfig?: { apiKey: string | null; from: string };
};

export function setRuntimeEmailConfig(apiKey: string | null, from?: string | null) {
  if (apiKey) process.env.RESEND_API_KEY = apiKey.trim();
  if (from) process.env.EMAIL_FROM = from.trim();
  gEmail.__packradarEmailConfig = {
    apiKey: apiKey ? apiKey.trim() : process.env.RESEND_API_KEY || null,
    from: (from && from.trim()) || process.env.EMAIL_FROM || "PackRadar Alerts <onboarding@resend.dev>",
  };
}

export function getResendConfig(): { apiKey: string | null; from: string } {
  let apiKey = process.env.RESEND_API_KEY || gEmail.__packradarEmailConfig?.apiKey || null;
  let from =
    process.env.EMAIL_FROM ||
    gEmail.__packradarEmailConfig?.from ||
    "PackRadar Alerts <onboarding@resend.dev>";
  if (!apiKey) {
    for (const cfgPath of [
      path.join(process.cwd(), "data", "oauth-config.json"),
      "/tmp/packradar-oauth-config.json",
    ]) {
      try {
        if (fs.existsSync(cfgPath)) {
          const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as {
            resendApiKey?: string;
            emailFrom?: string;
          };
          if (raw.resendApiKey) apiKey = raw.resendApiKey.trim();
          if (raw.emailFrom) from = raw.emailFrom.trim();
          if (apiKey) break;
        }
      } catch {}
    }
  }
  return { apiKey, from };
}

export async function getResendConfigWithDbFallback(): Promise<{ apiKey: string | null; from: string }> {
  const syncCfg = getResendConfig();
  if (syncCfg.apiKey) return syncCfg;
  try {
    const { getDb } = await import("@/db");
    const { settings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db.select().from(settings).where(eq(settings.key, "emailProviderConfigV1"));
    const val = (row?.value ?? null) as { resendApiKey?: string; emailFrom?: string } | null;
    if (val?.resendApiKey) {
      setRuntimeEmailConfig(val.resendApiKey, val.emailFrom);
      return {
        apiKey: val.resendApiKey.trim(),
        from: val.emailFrom?.trim() || syncCfg.from,
      };
    }
  } catch {}
  return syncCfg;
}

export function isEmailProviderConfigured(): boolean {
  return Boolean(getResendConfig().apiKey);
}

export async function sendEmail(to: string, msg: Message): Promise<"sent" | "logged"> {
  const { apiKey: key, from } = await getResendConfigWithDbFallback();
  const targetUrl = absolute(msg.url);
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:auto;padding:28px;border-radius:16px;background:#0f172a;color:#e2e8f0;border:1px solid #1e293b">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;padding-bottom:14px;margin-bottom:18px">
      <span style="font-weight:900;font-size:19px;color:#facc15;letter-spacing:-0.02em">⚡ PackRadar Release &amp; Lottery Alert</span>
      <span style="font-size:11px;background:#1e293b;color:#fde047;padding:4px 10px;border-radius:999px;font-weight:700">LIVE INTEL</span>
    </div>
    <h2 style="margin:0 0 10px;color:#ffffff;font-size:20px;line-height:1.35">${escapeHtml(msg.title)}</h2>
    <p style="line-height:1.6;color:#cbd5e1;font-size:14px;margin:0 0 18px;white-space:pre-line">${escapeHtml(msg.body)}</p>
    <div style="margin:20px 0">
      <a href="${targetUrl}" style="display:inline-block;background:#facc15;color:#0f172a;padding:12px 20px;border-radius:10px;font-weight:800;font-size:14px;text-decoration:none">View Drop &amp; Lottery Details on PackRadar →</a>
    </div>
    <p style="font-size:11px;color:#64748b;margin-top:26px;border-top:1px solid #1e293b;padding-top:14px">
      You are subscribed to PackRadar Release, Online Lottery &amp; Restock Email Alerts.<br/>
      Manage or pause your alerts anytime at <a href="${SITE_URL()}/alerts" style="color:#facc15;text-decoration:underline">${SITE_URL()}/alerts</a>
    </p>
  </div>`;
  if (key) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(key);
      const r = await resend.emails.send({ from, to, subject: msg.title, html });
      if (!r.error) return "sent";
      console.warn(`[email:resend-warn] ${r.error.message} — falling back to outbox log`);
    } catch (err) {
      console.warn(`[email:resend-error] ${(err as Error).message} — falling back to outbox log`);
    }
  }
  try {
    const dir = process.env.VERCEL ? "/tmp/packradar-outbox" : path.join(process.cwd(), "data", "outbox");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9]/gi, "_")}.json`),
      JSON.stringify({ to, from, ...msg, url: targetUrl }, null, 2),
    );
  } catch {}
  console.log(`[email:dev-outbox] → ${to}: ${msg.title}`);
  return "logged";
}

/* ───────── Web Push ───────── */

export const DEFAULT_VAPID_PUBLIC_KEY =
  "BPovxSR0d6QAzApgRb0cEsXVZITSwa3Xia8Xz54LBUp1R3yeU084qZq6tUvY0Ycc6y1yksZNlzUPsaeZrL5TlSA";
const DEFAULT_VAPID_PRIVATE_KEY = "zWxFUXB8A88X6L0hxtreyBqJ240z-akEGezHffq_94A";

let vapidReady = false;
export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
}
function getVapidPrivateKey() {
  return process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
}
export function pushConfigured() {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}
function ensureVapid() {
  if (vapidReady || !pushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:alerts@packradar.app",
    getVapidPublicKey(),
    getVapidPrivateKey(),
  );
  vapidReady = true;
}

/** Returns false if the subscription is gone (caller should delete it). */
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, msg: Message): Promise<boolean> {
  if (!pushConfigured()) return true;
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: msg.title, body: msg.body, url: absolute(msg.url) }),
      { TTL: 600 },
    );
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return false;
    throw e;
  }
}

/* ───────── Discord ───────── */

export async function sendDiscord(webhookUrl: string, msg: Message) {
  if (!/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    throw new Error("Invalid Discord webhook URL");
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "PackRadar",
      embeds: [{ title: msg.title, description: msg.body, url: absolute(msg.url), color: 0xfacc15 }],
    }),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}`);
}

/* ───────── SMS (premium, future) ───────── */

export async function sendSms(_phone: string, _msg: Message) {
  // Hook for Twilio (premium). Intentionally a no-op until configured.
  return "logged" as const;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
