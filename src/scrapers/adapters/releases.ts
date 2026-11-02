/**
 * TCG release calendar from Serebii's English set list.
 */
import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";
import { newsPosts, releases } from "@/db/schema";
import { fetchText } from "../http";
import { slugify } from "@/lib/geo";
import { logActivity } from "@/lib/activity";
import { notifyRelease } from "@/lib/notify/dispatch";
import type { Adapter } from "../types";

const URL_SETS = "https://www.serebii.net/card/english.shtml";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "November 6th 2026" → "2026-11-06" */
export function parseSerebiiDate(s: string): string | null {
  const m = s.toLowerCase().match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1]);
  if (mo < 0) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

export type ParsedSet = { name: string; cardCount: number | null; releaseDate: string | null; url: string; imageUrl: string | null };

export function parseSerebiiSets(html: string): ParsedSet[] {
  const $ = cheerio.load(html);
  const out: ParsedSet[] = [];
  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 5) return;
    const name = $(tds[2]).text().trim();
    const date = parseSerebiiDate($(tds[4]).text().trim());
    const href = $(tds[2]).find("a").attr("href");
    if (!name || !date || !href) return;
    const img = $(tds[0]).find("img").attr("src");
    const count = Number($(tds[3]).text().trim());
    out.push({
      name,
      cardCount: Number.isFinite(count) && count > 0 ? count : null,
      releaseDate: date,
      url: new URL(href, URL_SETS).toString(),
      imageUrl: img ? new URL(img, URL_SETS).toString() : null,
    });
  });
  return out;
}

export const serebiiReleases: Adapter = {
  name: "serebii-releases",
  label: "TCG release calendar",
  description: "Upcoming + recent English TCG sets and release dates from Serebii.",
  daily: true,
  async run({ db, log }) {
    const html = await fetchText(URL_SETS, { minIntervalMs: 1000 });
    const sets = parseSerebiiSets(html).slice(0, 40);
    log(`${sets.length} sets parsed`);
    let created = 0;
    let updated = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const s of sets) {
      const slug = slugify(s.name);
      const [existing] = await db.select().from(releases).where(eq(releases.slug, slug));
      if (existing) {
        if (existing.releaseDate !== s.releaseDate || existing.cardCount !== s.cardCount) {
          await db
            .update(releases)
            .set({ releaseDate: s.releaseDate, cardCount: s.cardCount, imageUrl: s.imageUrl ?? existing.imageUrl })
            .where(eq(releases.id, existing.id));
          updated++;
        }
        continue;
      }
      await db.insert(releases).values({
        slug,
        name: s.name,
        kind: "set",
        releaseDate: s.releaseDate,
        cardCount: s.cardCount,
        imageUrl: s.imageUrl,
        sourceUrl: s.url,
        sourceName: "Serebii",
        confirmed: true,
      });
      created++;
      if (s.releaseDate && s.releaseDate >= today) {
        await logActivity(db, { type: "release", message: `🗓️ New set announced: ${s.name} (${s.releaseDate})`, url: "/releases" });
        await db
          .insert(newsPosts)
          .values({
            slug: `release-${slug}`,
            title: `${s.name} release date: ${s.releaseDate}`,
            summary: `${s.name}${s.cardCount ? ` (${s.cardCount} cards)` : ""} is scheduled to release in English on ${s.releaseDate}. Expect it to hit vending machines and retail shortly after launch.`,
            category: "releases",
            sourceName: "Serebii",
            sourceUrl: s.url,
            imageUrl: s.imageUrl,
          })
          .onConflictDoNothing();
        await notifyRelease(db, { name: s.name, releaseDate: s.releaseDate }).catch(() => {});
      }
    }
    return { found: sets.length, created, updated };
  },
};
