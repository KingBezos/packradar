import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";

export type FeedItem = {
  title: string;
  link: string;
  /** Plain-text content/description. */
  text: string;
  /** Raw HTML content if present. */
  html: string;
  published: Date | null;
  imageUrl: string | null;
  author: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata",
});

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return str(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o["#cdata"] ?? o["#text"] ?? "");
  }
  return "";
}

export function htmlToText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script,style").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

function firstImage(html: string): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

/** Parse RSS 2.0 or Atom into a uniform list. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml);
  const items: FeedItem[] = [];

  const rssItems = doc?.rss?.channel?.item;
  if (rssItems) {
    for (const it of Array.isArray(rssItems) ? rssItems : [rssItems]) {
      const html = str(it["content:encoded"]) || str(it.description);
      const media =
        it["media:content"]?.["@_url"] ??
        it["media:thumbnail"]?.["@_url"] ??
        it.enclosure?.["@_url"] ??
        (Array.isArray(it["media:content"]) ? it["media:content"][0]?.["@_url"] : undefined);
      items.push({
        title: htmlToText(str(it.title)),
        link: str(it.link) || str(it.guid),
        html,
        text: htmlToText(html),
        published: it.pubDate ? new Date(str(it.pubDate)) : null,
        imageUrl: media ?? firstImage(html),
        author: str(it["dc:creator"]) || str(it.author) || null,
      });
    }
    return items;
  }

  const entries = doc?.feed?.entry;
  if (entries) {
    for (const e of Array.isArray(entries) ? entries : [entries]) {
      const links = Array.isArray(e.link) ? e.link : [e.link];
      const alt = links.find((l: Record<string, string>) => !l?.["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      const html = str(e.content) || str(e.summary);
      items.push({
        title: htmlToText(str(e.title)),
        link: alt?.["@_href"] ?? "",
        html,
        text: htmlToText(html),
        published: e.updated || e.published ? new Date(str(e.published ?? e.updated)) : null,
        imageUrl: e["media:thumbnail"]?.["@_url"] ?? firstImage(html),
        author: str(e.author?.name) || null,
      });
    }
  }
  return items;
}
