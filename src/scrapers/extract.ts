/**
 * Extract vending-machine drop timers and machine references from free text
 * (Reddit posts/comments, forum threads, articles).
 */

export type ExtractedTimer = {
  intervalMinutes: number;
  anchorMinute: number;
  /** 0..1 – how explicit the phrasing was. */
  confidence: number;
  evidence: string;
};

const DROP_CONTEXT = /\b(drop|drops|dropped|dropping|restock|releas|refresh|unlock|drip|reset|load|cycle|timer)/i;

function snippet(text: string, index: number, len = 140) {
  const start = Math.max(0, index - 60);
  return text.slice(start, start + len).replace(/\s+/g, " ").trim();
}

function parseInterval(text: string): { interval: number; explicit: boolean } {
  const t = text.toLowerCase();
  let m = t.match(/every\s+(\d{1,3})\s*(?:-|\s)?(?:min|mins|minutes|minute)\b/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 5 && n <= 720) return { interval: n, explicit: true };
  }
  if (/every\s+half(?:\s+an)?\s+hour|twice\s+an\s+hour|every\s+30\b/.test(t)) return { interval: 30, explicit: true };
  m = t.match(/every\s+(\d)\s*(?:hours|hrs|hr)\b/);
  if (m) return { interval: Number(m[1]) * 60, explicit: true };
  if (/every\s+hour|hourly|each\s+hour|once\s+an\s+hour|once\s+per\s+hour|every\s+60\b/.test(t)) {
    return { interval: 60, explicit: true };
  }
  if (/once\s+(?:a|per)\s+day|daily\s+at|every\s+day\s+at/.test(t)) return { interval: 1440, explicit: true };
  return { interval: 60, explicit: false };
}

const WORD_MINUTES: [RegExp, number][] = [
  [/\b(?:on|at)\s+the\s+(?:top\s+of\s+the\s+)?hour\b/i, 0],
  [/\btop\s+of\s+(?:the|every)\s+hour\b/i, 0],
  [/\bhalf\s+past\b/i, 30],
  [/\bquarter\s+past\b/i, 15],
  [/\bquarter\s+(?:to|till|til)\b/i, 45],
];

/** Pull explicit H:MM clock times (with minute-of-day when am/pm known). */
function clockTimes(text: string): { minuteOfDay: number | null; minute: number; index: number }[] {
  const out: { minuteOfDay: number | null; minute: number; index: number }[] = [];
  const re = /\b(\d{1,2}):([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23) continue;
    let mod: number | null = null;
    if (m[3]) {
      const pm = m[3].toLowerCase().startsWith("p");
      const h24 = (h % 12) + (pm ? 12 : 0);
      mod = h24 * 60 + min;
    } else if (h > 12) {
      mod = h * 60 + min;
    }
    out.push({ minuteOfDay: mod, minute: min, index: m.index });
  }
  return out;
}

export function extractDropTimers(rawText: string): ExtractedTimer[] {
  const text = rawText.replace(/\s+/g, " ");
  if (!DROP_CONTEXT.test(text)) return [];
  const { interval, explicit } = parseInterval(text);
  const results: ExtractedTimer[] = [];
  const push = (anchor: number, confidence: number, idx: number) => {
    const a = interval >= 1440 ? anchor : ((anchor % interval) + interval) % interval;
    if (!results.some((r) => r.intervalMinutes === interval && r.anchorMinute === a)) {
      results.push({ intervalMinutes: interval, anchorMinute: a, confidence, evidence: snippet(text, idx) });
    }
  };

  // ":37", "at :37", "x:37", "xx:37"
  const colonRe = /(?:^|[\s(])(?:x{1,2}|\?\?|\*|h{1,2})?:([0-5]\d)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = colonRe.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 3), m.index + 1);
    if (/\d$/.test(before.trim())) continue; // part of "10:37" – handled below
    push(Number(m[1]), explicit ? 0.9 : 0.75, m.index);
  }

  // "37 minute mark", "37 past the hour", "37 minutes after the hour"
  const markRe = /\b([0-5]?\d)\s*(?:-|\s)?(?:minute|min)s?\s*mark\b|\b([0-5]?\d)\s*(?:minutes?\s+)?(?:past|after)\s+(?:the|every|each)\s+hour\b/gi;
  while ((m = markRe.exec(text))) {
    push(Number(m[1] ?? m[2]), 0.85, m.index);
  }

  for (const [re, minute] of WORD_MINUTES) {
    const wm = re.exec(text);
    if (wm) push(minute, 0.7, wm.index);
  }

  // Explicit clock times near drop words: "dropped at 2:37", "10:37 and 11:37"
  if (results.length === 0) {
    const times = clockTimes(text).filter((t) => DROP_CONTEXT.test(snippet(text, t.index, 120)));
    if (times.length) {
      if (interval >= 1440) {
        const withDay = times.find((t) => t.minuteOfDay != null);
        if (withDay) push(withDay.minuteOfDay!, 0.6, withDay.index);
      } else {
        // Most common minute (±2) among the clock times.
        const counts = new Map<number, number>();
        for (const t of times) counts.set(t.minute, (counts.get(t.minute) ?? 0) + 1);
        const [minute, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        const idx = times.find((t) => t.minute === minute)!.index;
        push(minute, Math.min(0.8, 0.45 + 0.15 * count), idx);
      }
    }
  }
  return results;
}

/* ───────────────────────── Machine references ───────────────────────── */

export type MachineRef = {
  id: string;
  retailer: string;
  city: string;
  state: string;
  street: string;
};

const RETAILER_ALIASES: Record<string, string[]> = {
  safeway: ["safeway"],
  qfc: ["qfc", "quality food center"],
  kroger: ["kroger"],
  "fred meyer": ["fred meyer", "freddy", "freddie's", "freddys"],
  ralphs: ["ralphs", "ralph's"],
  "king soopers": ["king soopers", "king sooper"],
  "fry's": ["fry's", "frys food", "fry's food"],
  "smith's": ["smith's", "smiths"],
  "harris teeter": ["harris teeter"],
  albertsons: ["albertsons", "albertson's"],
  vons: ["vons"],
  pavilions: ["pavilions"],
  "jewel-osco": ["jewel-osco", "jewel osco", "jewel"],
  "tom thumb": ["tom thumb"],
  randalls: ["randalls"],
  acme: ["acme"],
  "shaw's": ["shaw's", "shaws"],
  "dillons": ["dillons"],
  "food 4 less": ["food 4 less", "food4less"],
  "pick 'n save": ["pick n save", "pick 'n save"],
  "mariano's": ["mariano's", "marianos"],
  "baker's": ["baker's"],
  "city market": ["city market"],
  "pay less": ["pay less"],
  "gerbes": ["gerbes"],
  meijer: ["meijer"],
  "h-e-b": ["heb", "h-e-b"],
  target: ["target"],
  walmart: ["walmart"],
};

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
}

export function retailerKey(retailer: string): string {
  const r = norm(retailer);
  for (const [key, aliases] of Object.entries(RETAILER_ALIASES)) {
    if (aliases.some((a) => r.includes(a))) return key;
  }
  return r;
}

/** Machine codes like Q01168 mentioned directly. */
export function extractMachineCodes(text: string): string[] {
  return [...new Set((text.match(/\bQ\d{5}\b/gi) ?? []).map((c) => c.toUpperCase()))];
}

/**
 * Resolve which machines a text is talking about.
 * Direct codes win; otherwise score retailer + city + street mentions and
 * return the unique best matches.
 */
export function matchMachines(text: string, all: MachineRef[]): { id: string; score: number }[] {
  const codes = extractMachineCodes(text);
  if (codes.length) {
    const ids = new Set(all.map((m) => m.id));
    return codes.filter((c) => ids.has(c)).map((id) => ({ id, score: 10 }));
  }
  const t = ` ${norm(text)} `;
  const mentionedRetailers = Object.entries(RETAILER_ALIASES)
    .filter(([, aliases]) => aliases.some((a) => t.includes(` ${a} `) || t.includes(` ${a}s `) || t.includes(` ${a}'s `)))
    .map(([k]) => k);
  if (!mentionedRetailers.length) return [];

  const scored: { id: string; score: number }[] = [];
  for (const m of all) {
    const rk = retailerKey(m.retailer);
    if (!mentionedRetailers.includes(rk)) continue;
    let score = 2;
    const city = norm(m.city);
    if (city.length > 2 && t.includes(` ${city} `)) score += 3;
    const streetName = norm(m.street)
      .replace(/^\d+\s+/, "")
      .replace(/\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|hwy|highway|pkwy|ln|lane|ne|nw|se|sw|n|s|e|w)\b/g, "")
      .trim();
    if (streetName.length > 3 && t.includes(` ${streetName}`)) score += 3;
    if (t.includes(` ${m.state.toLowerCase()} `)) score += 1;
    if (score >= 5) scored.push({ id: m.id, score });
  }
  if (!scored.length) return [];
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best);
  // Ambiguous (e.g. "Safeway in Seattle" matches 9 stores) → only accept if few.
  return top.length <= 2 ? top : [];
}
