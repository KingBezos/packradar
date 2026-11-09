import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { alertSubscriptions, settings, user } from "@/db/schema";
import {
  DEFAULT_EMAIL_FROM,
  DEFAULT_EMAIL_REPLY_TO,
  getResendConfigWithDbFallback,
  normalizeFromAddress,
  sendEmail,
  setRuntimeEmailConfig,
} from "@/lib/notify/channels";
import { notifyNews } from "@/lib/notify/dispatch";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireRole(["admin", "mod"]);
  const db = await getDb();
  const cfg = await getResendConfigWithDbFallback();
  const allSubs = await db
    .select({ s: alertSubscriptions, u: user })
    .from(alertSubscriptions)
    .innerJoin(user, eq(user.id, alertSubscriptions.userId))
    .where(eq(alertSubscriptions.active, true));

  const emailSubCount = allSubs.filter((x) => x.s.channels.includes("email")).length;
  const releaseNewsSubCount = allSubs.filter(
    (x) => x.s.kind === "news" || x.s.kind === "release" || x.s.kind === "product_restock",
  ).length;
  const uniqueEmailUsers = new Set(allSubs.filter((x) => x.s.channels.includes("email")).map((x) => x.u.email)).size;

  return {
    configured: Boolean(cfg.apiKey),
    apiKeyPreview: cfg.apiKey ? `${cfg.apiKey.slice(0, 7)}••••••••` : null,
    emailFrom: cfg.from,
    emailReplyTo: cfg.replyTo,
    usingSandboxSender: cfg.from.includes("resend.dev"),
    stats: {
      totalEmailSubscriptions: emailSubCount,
      releaseAndLotterySubscriptions: releaseNewsSubCount,
      uniqueSubscribedUsers: uniqueEmailUsers,
    },
  };
});

const PostBody = z.object({
  action: z.enum(["save_config", "test_email", "broadcast_alert"]).default("save_config"),
  resendApiKey: z.string().optional(),
  emailFrom: z.string().optional(),
  emailReplyTo: z.string().optional(),
  broadcastTitle: z.string().optional(),
  broadcastSummary: z.string().optional(),
  broadcastUrl: z.string().optional(),
});

export const POST = route(async (req) => {
  const admin = await requireRole(["admin"]);
  const b = PostBody.parse(await json(req));
  const db = await getDb();

  if (b.resendApiKey !== undefined || b.emailFrom !== undefined || b.emailReplyTo !== undefined) {
    const existingCfg = await getResendConfigWithDbFallback();
    const nextKey = b.resendApiKey?.trim() || existingCfg.apiKey || "";
    const nextFrom = normalizeFromAddress(b.emailFrom?.trim() || existingCfg.from || DEFAULT_EMAIL_FROM);
    const nextReplyTo = b.emailReplyTo?.trim() || existingCfg.replyTo || DEFAULT_EMAIL_REPLY_TO;

    if (nextKey) {
      setRuntimeEmailConfig(nextKey, nextFrom, nextReplyTo);
      await db
        .insert(settings)
        .values({
          key: "emailProviderConfigV1",
          value: { resendApiKey: nextKey, emailFrom: nextFrom, emailReplyTo: nextReplyTo },
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: { resendApiKey: nextKey, emailFrom: nextFrom, emailReplyTo: nextReplyTo },
            updatedAt: new Date(),
          },
        });

      // Also persist to oauth-config.json if present
      for (const cfgPath of [
        path.join(process.cwd(), "data", "oauth-config.json"),
        "/tmp/packradar-oauth-config.json",
      ]) {
        try {
          const existing = fs.existsSync(cfgPath)
            ? (JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Record<string, string>)
            : {};
          existing.resendApiKey = nextKey;
          existing.emailFrom = nextFrom;
          existing.emailReplyTo = nextReplyTo;
          fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
          fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2), "utf8");
          break;
        } catch {}
      }
    }
  }

  const cfg = await getResendConfigWithDbFallback();

  if (b.action === "test_email") {
    const status = await sendEmail(admin.email, {
      title: "PackRadar Update: Walmart+ & Target Online Queue & Sam's Club 151 Details",
      body: "Your PackRadar Release & Online Lottery alert system is active.\n\nSubscribers who enable 'Email Me All Release News & Lotteries' receive this update when a new retail draw, online queue, or allocation schedule is posted.",
      url: "/news/walmart-target-amazon-pokemon-tcg-online-lottery-queue-invite-guide",
    });
    return {
      ok: true,
      configured: Boolean(cfg.apiKey),
      deliveryStatus: status,
      sentTo: admin.email,
      replyTo: cfg.replyTo,
      message:
        status === "sent"
          ? `Live email delivered to ${admin.email} (Reply-To: ${cfg.replyTo}) via Resend!`
          : `Resend API key not set yet — test email logged to server outbox for ${admin.email}.`,
    };
  }

  if (b.action === "broadcast_alert") {
    const title =
      b.broadcastTitle?.trim() ||
      "Walmart+, Target & Amazon Pokémon TCG Online Lotteries & Sam's Club 151 Mini Tins Drop";
    const summary =
      b.broadcastSummary?.trim() ||
      "New online collector lotteries, EQL draws, Amazon Request Invite waves, and Sam's Club 151 & 30th Celebration Mini Tins ($34.98) allocation details are live on PackRadar.";
    const slug =
      b.broadcastUrl?.trim() || "/news/walmart-target-amazon-pokemon-tcg-online-lottery-queue-invite-guide";

    await notifyNews(db, {
      title,
      slug,
      category: "drop-report",
      summary,
    });

    const matchedSubs = await db
      .select()
      .from(alertSubscriptions)
      .where(and(eq(alertSubscriptions.active, true), inArray(alertSubscriptions.kind, ["news", "release"])));

    return {
      ok: true,
      configured: Boolean(cfg.apiKey),
      subscribersNotified: matchedSubs.length,
      message: cfg.apiKey
        ? `Broadcast sent to ${matchedSubs.length} active Release/Lottery subscribers via Resend!`
        : `Broadcast recorded for ${matchedSubs.length} subscribers (in-app notifications delivered; add a Resend API key to deliver external emails).`,
    };
  }

  return {
    ok: true,
    configured: Boolean(cfg.apiKey),
    apiKeyPreview: cfg.apiKey ? `${cfg.apiKey.slice(0, 7)}••••••••` : null,
    emailFrom: cfg.from,
    message: cfg.apiKey ? "Email provider configuration saved!" : "Saved sender settings.",
  };
});
