import type { MetadataRoute } from "next";
import { getDb } from "@/db";
import { machines, newsPosts } from "@/db/schema";
import { ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.SITE_URL || "http://localhost:3000";
  const db = await getDb();
  const ms = await db.select({ id: machines.id, state: machines.state, slug: machines.citySlug }).from(machines).where(ne(machines.status, "removed"));
  const news = await db.select({ slug: newsPosts.slug }).from(newsPosts).limit(500);
  const states = [...new Set(ms.map((m) => m.state.toLowerCase()))];
  const cities = [...new Set(ms.map((m) => `${m.state.toLowerCase()}/${m.slug}`))];
  const u = (p: string, priority = 0.5) => ({ url: `${site}${p}`, priority });
  return [
    u("/", 1), u("/map", 0.9), u("/news", 0.8), u("/releases", 0.7), u("/drops", 0.6), u("/locations", 0.7), u("/premium", 0.5),
    ...states.map((s) => u(`/locations/${s}`, 0.6)),
    ...cities.map((c) => u(`/locations/${c}`, 0.6)),
    ...ms.map((m) => u(`/machines/${m.id}`, 0.5)),
    ...news.map((n) => u(`/news/${n.slug}`, 0.4)),
  ];
}
