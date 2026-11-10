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
  __packradarEmailConfig?: { apiKey: string | null; from: string; replyTo: string };
};

export const DEFAULT_EMAIL_FROM = "PackRadar <drops@alerts.jpegtown.com>";
export const DEFAULT_EMAIL_REPLY_TO = "drops@alerts.jpegtown.com";

export function normalizeFromAddress(raw?: string | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULT_EMAIL_FROM;
  const lower = trimmed.toLowerCase();
  if (
    lower === "alerts.jpegtown.com" ||
    lower === "alerts@jpegtown.com" ||
    lower.includes("<alerts@jpegtown.com>") ||
    lower.includes("<alerts.jpegtown.com>") ||
    lower.includes("onboarding@resend.dev")
  ) {
    return DEFAULT_EMAIL_FROM;
  }
  if (!trimmed.includes("@")) {
    return `PackRadar <drops@${trimmed}>`;
  }
  if (!trimmed.includes("<")) {
    return `PackRadar <${trimmed}>`;
  }
  return trimmed;
}

export function setRuntimeEmailConfig(
  apiKey: string | null,
  from?: string | null,
  replyTo?: string | null,
) {
  const normalizedFrom = normalizeFromAddress(from || process.env.EMAIL_FROM);
  const normalizedReplyTo = (replyTo && replyTo.trim()) || process.env.EMAIL_REPLY_TO || DEFAULT_EMAIL_REPLY_TO;
  if (apiKey) process.env.RESEND_API_KEY = apiKey.trim();
  process.env.EMAIL_FROM = normalizedFrom;
  process.env.EMAIL_REPLY_TO = normalizedReplyTo;
  gEmail.__packradarEmailConfig = {
    apiKey: apiKey ? apiKey.trim() : process.env.RESEND_API_KEY || null,
    from: normalizedFrom,
    replyTo: normalizedReplyTo,
  };
}

export function getResendConfig(): { apiKey: string | null; from: string; replyTo: string } {
  let apiKey = process.env.RESEND_API_KEY || gEmail.__packradarEmailConfig?.apiKey || null;
  let from = normalizeFromAddress(
    gEmail.__packradarEmailConfig?.from || process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
  );
  let replyTo =
    gEmail.__packradarEmailConfig?.replyTo ||
    process.env.EMAIL_REPLY_TO ||
    DEFAULT_EMAIL_REPLY_TO;
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
            emailReplyTo?: string;
          };
          if (raw.resendApiKey) apiKey = raw.resendApiKey.trim();
          if (raw.emailFrom) from = normalizeFromAddress(raw.emailFrom);
          if (raw.emailReplyTo) replyTo = raw.emailReplyTo.trim();
          if (apiKey) break;
        }
      } catch {}
    }
  }
  return { apiKey, from, replyTo };
}

export async function getResendConfigWithDbFallback(): Promise<{
  apiKey: string | null;
  from: string;
  replyTo: string;
}> {
  const syncCfg = getResendConfig();
  try {
    const { getDb } = await import("@/db");
    const { settings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db.select().from(settings).where(eq(settings.key, "emailProviderConfigV1"));
    const val = (row?.value ?? null) as {
      resendApiKey?: string;
      emailFrom?: string;
      emailReplyTo?: string;
    } | null;
    if (val?.resendApiKey || val?.emailFrom || val?.emailReplyTo) {
      const mergedKey = val.resendApiKey?.trim() || syncCfg.apiKey;
      const mergedFrom = normalizeFromAddress(val.emailFrom || syncCfg.from);
      const mergedReplyTo = val.emailReplyTo?.trim() || syncCfg.replyTo;
      setRuntimeEmailConfig(mergedKey, mergedFrom, mergedReplyTo);
      return {
        apiKey: mergedKey,
        from: mergedFrom,
        replyTo: mergedReplyTo,
      };
    }
  } catch {}
  return syncCfg;
}

export function isEmailProviderConfigured(): boolean {
  return Boolean(getResendConfig().apiKey);
}

export async function sendEmail(to: string, msg: Message): Promise<"sent" | "logged"> {
  const { apiKey: key, from, replyTo } = await getResendConfigWithDbFallback();
  const targetUrl = absolute(msg.url);
  const alertsUrl = `${SITE_URL()}/alerts`;
  const text = `${msg.title}\n\n${msg.body}\n\nView details on PackRadar:\n${targetUrl}\n\n---\nYou received this notification because you subscribed to PackRadar alerts.\nManage your alert preferences: ${alertsUrl}`;
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
    <div style="font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">
      PackRadar Collector Update
    </div>
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:19px;line-height:1.4;font-weight:700">${escapeHtml(msg.title)}</h2>
    <p style="line-height:1.6;color:#334155;font-size:15px;margin:0 0 20px;white-space:pre-line">${escapeHtml(msg.body)}</p>
    <div style="margin:22px 0">
      <a href="${targetUrl}" style="display:inline-block;background-color:#0f172a;color:#ffffff;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none">View Release &amp; Drop Details</a>
    </div>
    <p style="font-size:12px;color:#64748b;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px;line-height:1.5">
      You are receiving this email because you enabled release and restock notifications on PackRadar.<br/>
      <a href="${alertsUrl}" style="color:#475569;text-decoration:underline">Manage or unsubscribe from alerts</a>
    </p>
  </div>
</body>
</html>`;
  if (key) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(key);
      const r = await resend.emails.send({
        from,
        to,
        replyTo,
        subject: msg.title,
        text,
        html,
        headers: {
          "List-Unsubscribe": `<${alertsUrl}>`,
        },
      });
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
