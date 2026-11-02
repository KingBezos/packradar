import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { getCurrentUser, requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { sendEmail } from "@/lib/notify/channels";

export const dynamic = "force-dynamic";

const INBOX_KEY = "adminAlertsInbox";
const OWNER_SALES_EMAIL = "james@jpegtown.com";

export type AdminInboxItem = {
  id: string;
  kind: "admin_alert" | "vendor_sales";
  category: string;
  subject: string;
  message: string;
  machineId?: string | null;
  pageUrl?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  businessName?: string | null;
  cityState?: string | null;
  website?: string | null;
  status: "open" | "resolved";
  emailStatus?: "sent" | "logged" | "none";
  createdAt: string;
};

// Per-IP sliding-window rate limiter (prevents spam floods)
const ipHits = new Map<string, number[]>();
function checkRateLimit(ip: string, maxPer15Min = 6): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const prev = (ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (prev.length >= maxPer15Min) return false;
  prev.push(now);
  if (ipHits.size > 500) ipHits.clear();
  ipHits.set(ip, prev);
  return true;
}

async function loadInbox(db: Awaited<ReturnType<typeof getDb>>): Promise<AdminInboxItem[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, INBOX_KEY));
  const raw = row?.value as { items?: AdminInboxItem[] } | null;
  return Array.isArray(raw?.items) ? raw.items : [];
}

async function saveInbox(db: Awaited<ReturnType<typeof getDb>>, items: AdminInboxItem[]) {
  const trimmed = items.slice(0, 250);
  await db
    .insert(settings)
    .values({ key: INBOX_KEY, value: { items: trimmed }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { items: trimmed }, updatedAt: new Date() },
    });
}

const CreateSchema = z.object({
  kind: z.enum(["admin_alert", "vendor_sales"]),
  category: z.string().trim().min(2).max(60).default("general"),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(4).max(3000),
  machineId: z.string().trim().max(24).optional().nullable(),
  pageUrl: z.string().trim().max(260).optional().nullable(),
  senderName: z.string().trim().max(80).optional().nullable(),
  senderEmail: z.string().trim().email().max(120).optional().nullable().or(z.literal("")),
  businessName: z.string().trim().max(120).optional().nullable(),
  cityState: z.string().trim().max(100).optional().nullable(),
  website: z.string().trim().max(200).optional().nullable(),
  // Spam protection fields
  faxHoneypot: z.string().max(200).optional(),
  challengeA: z.number().int().min(1).max(20),
  challengeB: z.number().int().min(1).max(20),
  challengeAnswer: z.number().int(),
  elapsedMs: z.number().optional(),
});

/** Admin GET: returns all Admin Alerts & Vendor Inquiries. */
export const GET = route(async () => {
  await requireRole(["mod", "admin"]);
  const db = await getDb();
  const items = await loadInbox(db);
  return { items };
});

/** Public POST: submit either an "Alert Admin" issue report or a Vendor/Sales email inquiry. */
export const POST = route(async (req) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "local";
  if (!checkRateLimit(ip)) {
    throw new Error("Too many submissions from your connection. Please wait a few minutes and try again.");
  }

  const b = CreateSchema.parse(await json(req));

  // 1. Honeypot check (bots fill hidden fax field; silently succeed without storing)
  if (b.faxHoneypot && b.faxHoneypot.trim().length > 0) {
    return { ok: true, id: "filtered" };
  }

  // 2. Timing check (if client reports elapsedMs < 800ms, reject instant bot POST)
  if (typeof b.elapsedMs === "number" && b.elapsedMs < 800) {
    throw new Error("Submission was too fast. Please verify your message and try again.");
  }

  // 3. Human math challenge check
  if (b.challengeA + b.challengeB !== b.challengeAnswer) {
    throw new Error(`Anti-spam check failed: please enter the sum of ${b.challengeA} + ${b.challengeB}.`);
  }

  const u = await getCurrentUser().catch(() => null);
  if (b.kind === "admin_alert" && !u) {
    throw new Error("Please sign in or create a free account to send an Admin Alert.");
  }
  const db = await getDb();
  const items = await loadInbox(db);

  const id = crypto.randomUUID();
  const senderName = (b.senderName || u?.name || "Anonymous Spotter").trim();
  const senderEmail = (b.senderEmail || u?.email || "").trim() || null;

  const subject =
    b.subject?.trim() ||
    (b.kind === "vendor_sales"
      ? `Vendor / Sponsorship Inquiry: ${b.businessName || senderName} (${b.category})`
      : `Admin Alert [${b.category}]${b.machineId ? ` · Machine ${b.machineId}` : ""}`);

  let emailStatus: "sent" | "logged" | "none" = "none";

  // Sales / Vendor inquiries are emailed directly to james@jpegtown.com
  if (b.kind === "vendor_sales") {
    if (!senderEmail) {
      throw new Error("Please include your contact email so we can reply to your inquiry.");
    }
    const emailBody = [
      `New Vendor / Sales Inquiry on PackRadar`,
      `----------------------------------------`,
      `Business / Shop: ${b.businessName || "—"}`,
      `Contact Name: ${senderName}`,
      `Reply-To Email: ${senderEmail}`,
      `Inquiry Type: ${b.category}`,
      `City / State / Target Area: ${b.cityState || "—"}`,
      `Website / Social: ${b.website || "—"}`,
      ``,
      `Message:`,
      b.message,
    ].join("\n");

    emailStatus = await sendEmail(OWNER_SALES_EMAIL, {
      title: `💼 ${subject}`,
      body: emailBody,
      url: "/admin",
    });
  }

  const newItem: AdminInboxItem = {
    id,
    kind: b.kind,
    category: b.category,
    subject,
    message: b.message,
    machineId: b.machineId ? b.machineId.toUpperCase() : null,
    pageUrl: b.pageUrl || null,
    senderName,
    senderEmail,
    businessName: b.businessName || null,
    cityState: b.cityState || null,
    website: b.website || null,
    status: "open",
    emailStatus,
    createdAt: new Date().toISOString(),
  };

  await saveInbox(db, [newItem, ...items]);

  return {
    ok: true,
    id,
    emailStatus,
    message:
      b.kind === "vendor_sales"
        ? "Your inquiry has been sent to james@jpegtown.com and logged in our partner queue!"
        : "Alert sent to the PackRadar Admin team! Thank you for helping keep the map accurate.",
  };
});

/** Admin PATCH: toggle status ("open" | "resolved") on an alert or inquiry. */
export const PATCH = route(async (req) => {
  await requireRole(["mod", "admin"]);
  const b = z
    .object({
      id: z.string(),
      status: z.enum(["open", "resolved"]),
    })
    .parse(await json(req));
  const db = await getDb();
  const items = await loadInbox(db);
  const next = items.map((it) => (it.id === b.id ? { ...it, status: b.status } : it));
  await saveInbox(db, next);
  return { ok: true };
});

/** Admin DELETE: remove an alert or inquiry. */
export const DELETE = route(async (req) => {
  await requireRole(["mod", "admin"]);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) throw new Error("id required");
  const db = await getDb();
  const items = await loadInbox(db);
  await saveInbox(
    db,
    items.filter((it) => it.id !== id),
  );
  return { ok: true };
});
