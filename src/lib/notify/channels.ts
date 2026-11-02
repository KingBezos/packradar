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

function getResendConfig(): { apiKey: string | null; from: string } {
  let apiKey = process.env.RESEND_API_KEY || null;
  let from = process.env.EMAIL_FROM || "PackRadar <onboarding@resend.dev>";
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

export function isEmailProviderConfigured(): boolean {
  return Boolean(getResendConfig().apiKey);
}

export async function sendEmail(to: string, msg: Message): Promise<"sent" | "logged"> {
  const { apiKey: key, from } = getResendConfig();
  const html = `
  <div style="font-family:system-ui,Segoe UI,Arial;max-width:520px;margin:auto;padding:24px;border-radius:16px;background:#0f172a;color:#e2e8f0">
    <div style="font-weight:800;font-size:18px;color:#facc15">⚡ PackRadar</div>
    <h2 style="margin:12px 0 8px;color:#fff">${escapeHtml(msg.title)}</h2>
    <p style="line-height:1.5">${escapeHtml(msg.body)}</p>
    <a href="${absolute(msg.url)}" style="display:inline-block;margin-top:12px;background:#facc15;color:#0f172a;padding:10px 16px;border-radius:10px;font-weight:700;text-decoration:none">Open PackRadar</a>
    <p style="font-size:11px;color:#94a3b8;margin-top:24px">You're receiving this from PackRadar. Manage alerts: ${SITE_URL()}/alerts<br/>Drop times are community estimates. Not affiliated with Nintendo or The Pokémon Company.</p>
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
      JSON.stringify({ to, from, ...msg, url: absolute(msg.url) }, null, 2),
    );
  } catch {}
  console.log(`[email:dev-outbox] → ${to}: ${msg.title}`);
  return "logged";
}

/* ───────── Web Push ───────── */

let vapidReady = false;
export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
function ensureVapid() {
  if (vapidReady || !pushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@packradar.local",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
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
