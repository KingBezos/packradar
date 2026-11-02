/**
 * "Daily Drop Report" – an auto-written news article summarizing the last
 * 24h: drop-time accuracy changes, new machines, community activity, and
 * upcoming releases.
 */
import { and, desc, gte, isNotNull, sql, eq } from "drizzle-orm";
import {
  activity,
  dropObservations,
  machines,
  newsPosts,
  releases,
  reputationEvents,
  scheduleHistory,
  user,
} from "@/db/schema";
import type { Adapter } from "../types";
import { aiWrite } from "@/lib/ai";
import { notifyNews } from "@/lib/notify/dispatch";

export const dailyReport: Adapter = {
  name: "daily-report",
  label: "Daily Drop Report",
  description: "Writes the daily news article on drop-time accuracy, new machines and upcoming releases.",
  daily: true,
  async run({ db, log }) {
    const since = new Date(Date.now() - 86_400_000);
    const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
    const isoDay = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(machines).where(eq(machines.status, "active"));
    const [{ withTimes, avgAcc, verified, confirmed }] = await db
      .select({
        withTimes: sql<number>`count(*)::int`,
        avgAcc: sql<number>`coalesce(avg(${machines.accuracy}), 0)::float`,
        verified: sql<number>`count(*) filter (where ${machines.scheduleVerified})::int`,
        confirmed: sql<number>`count(*) filter (where ${machines.accuracy} >= 90)::int`,
      })
      .from(machines)
      .where(and(eq(machines.status, "active"), isNotNull(machines.intervalMinutes)));
    const changes = await db
      .select({ h: scheduleHistory, m: machines })
      .from(scheduleHistory)
      .innerJoin(machines, eq(machines.id, scheduleHistory.machineId))
      .where(gte(scheduleHistory.createdAt, since))
      .orderBy(desc(scheduleHistory.createdAt))
      .limit(12);
    const newMachines = await db
      .select()
      .from(activity)
      .where(and(eq(activity.type, "new_machine"), gte(activity.createdAt, since)))
      .limit(15);
    const [{ obsCount }] = await db
      .select({ obsCount: sql<number>`count(*)::int` })
      .from(dropObservations)
      .where(gte(dropObservations.createdAt, since));
    const today = new Date().toISOString().slice(0, 10);
    const in45 = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
    const upcoming = await db
      .select()
      .from(releases)
      .where(and(gte(releases.releaseDate, today), sql`${releases.releaseDate} <= ${in45}`))
      .orderBy(releases.releaseDate)
      .limit(6);
    const topReporters = await db
      .select({ name: user.name, pts: sql<number>`sum(${reputationEvents.delta})::int` })
      .from(reputationEvents)
      .innerJoin(user, eq(user.id, reputationEvents.userId))
      .where(gte(reputationEvents.createdAt, since))
      .groupBy(user.name)
      .orderBy(desc(sql`sum(${reputationEvents.delta})`))
      .limit(5);

    const lines: string[] = [];
    lines.push(`## By the numbers`);
    lines.push(`- **${total}** active machines tracked`);
    lines.push(`- **${withTimes}** have a drop time (${total ? Math.round((withTimes / total) * 100) : 0}% coverage)`);
    lines.push(`- **${confirmed}** confirmed at ≥90% accuracy · **${verified}** verified`);
    lines.push(`- Average accuracy: **${avgAcc.toFixed(1)}%**`);
    lines.push(`- **${obsCount}** drop reports from the community in the last 24h`);
    if (changes.length) {
      lines.push(``, `## Drop-time updates`);
      for (const { h, m } of changes) {
        lines.push(
          `- [${m.retailer} – ${m.street}, ${m.city}, ${m.state}](/machines/${m.id}): ${h.fromDescription ? `${h.fromDescription} → ` : ""}**${h.toDescription}** _(${h.reason})_`,
        );
      }
    }
    if (newMachines.length) {
      lines.push(``, `## New machines`);
      for (const a of newMachines) lines.push(`- ${a.message.replace(/^📍\s*/, "")}${a.url ? ` ([view](${a.url}))` : ""}`);
    }
    if (upcoming.length) {
      lines.push(``, `## Coming soon`);
      for (const r of upcoming) lines.push(`- **${r.name}** – ${r.releaseDate}${r.cardCount ? ` · ${r.cardCount} cards` : ""}`);
    }
    if (topReporters.length) {
      lines.push(``, `## Top trainers today`);
      topReporters.forEach((t, i) => lines.push(`${i + 1}. ${t.name} (+${t.pts} rep)`));
    }
    lines.push(
      ``,
      `_Drop times are crowd-sourced estimates. Spotted a drop? Report it on the machine page to push its accuracy toward 100%._`,
    );

    const stats = `machines=${total}, withTimes=${withTimes}, confirmed=${confirmed}, avgAccuracy=${avgAcc.toFixed(1)}, reports24h=${obsCount}, scheduleChanges=${changes.length}, newMachines=${newMachines.length}, upcoming=${upcoming.map((u) => `${u.name} ${u.releaseDate}`).join("; ")}`;
    const intro =
      (await aiWrite(
        `Write a friendly 2-3 sentence intro for today's "Daily Drop Report" on a Pokémon vending machine drop-time tracker. Use these stats, no emojis, no invented facts: ${stats}`,
        500,
      )) ??
      `Here's today's roundup: ${changes.length} drop-time update${changes.length === 1 ? "" : "s"}, ${newMachines.length} new machine${newMachines.length === 1 ? "" : "s"}, and ${obsCount} community drop report${obsCount === 1 ? "" : "s"} in the last 24 hours.`;

    const slug = `daily-drop-report-${isoDay}`;
    const body = `${intro}\n\n${lines.join("\n")}`;
    const values = {
      slug,
      title: `Daily Drop Report – ${dateStr}`,
      summary: intro.slice(0, 280),
      body,
      category: "drop-report",
      sourceName: "PackRadar",
      autoGenerated: true,
      publishedAt: new Date(),
    };
    const [existing] = await db.select({ id: newsPosts.id }).from(newsPosts).where(eq(newsPosts.slug, slug));
    if (existing) {
      await db.update(newsPosts).set(values).where(eq(newsPosts.id, existing.id));
      log(`updated ${slug}`);
      return { found: 1, created: 0, updated: 1 };
    }
    await db.insert(newsPosts).values(values);
    await notifyNews(db, { title: values.title, slug, category: "drop-report" }).catch(() => {});
    log(`published ${slug}`);
    return { found: 1, created: 1, updated: 0 };
  },
};
