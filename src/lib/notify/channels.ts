import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";

export type Message = { title: string; body: string; url?: string | null };

const SITE_URL = () => process.env.SITE_URL || "http://localhost:3000";

function absolute(url?: string | null) {
  if (!url) return SITE_URL();
  return url.startsWith("http") ? url : `${SITE_URL()}${url}`;
}

/* ───────── Email ───────── */

export async function sendEmail(to: string, msg: Message): Promise<"sent" | "logged"> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "PackRadar <alerts@packradar.local>";
  const html = `
  <div style="font-family:system-ui,Segoe UI,Arial;max-width:520px;margin:auto;padding:24px;border-radius:16px;background:#0f172a;color:#e2e8f0">
    <div style="font-weight:800;font-size:18px;color:#facc15">⚡ PackRadar</div>
    <h2 style="margin:12px 0 8px;color:#fff">${escapeHtml(msg.title)}</h2>
    <p style="line-height:1.5">${escapeHtml(msg.body)}</p>
    <a href="${absolute(msg.url)}" style="display:inline-block;margin-top:12px;background:#facc15;color:#0f172a;padding:10px 16px;border-radius:10px;font-weight:700;text-decoration:none">Open PackRadar</a>
    <p style="font-size:11px;color:#94a3b8;margin-top:24px">You're receiving this because you set up an alert. Manage alerts: ${SITE_URL()}/alerts<br/>Drop times are community estimates. Not affiliated with Nintendo or The Pokémon Company.</p>
  </div>`;
  if (!key) {
    const dir = path.join(process.cwd(), "data", "outbox");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9]/gi, "_")}.json`),
      JSON.stringify({ to, from, ...msg, url: absolute(msg.url) }, null, 2),
    );
    console.log(`[email:dev-outbox] → ${to}: ${msg.title}`);
    return "logged";
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const r = await resend.emails.send({ from, to, subject: msg.title, html });
  if (r.error) throw new Error(r.error.message);
  return "sent";
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
