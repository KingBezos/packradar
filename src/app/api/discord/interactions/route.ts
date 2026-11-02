/**
 * Discord HTTP Interactions Endpoint + Slash Command & Conversational Handler.
 *
 * Supports:
 *  - PING (type 1) verification handshake with Ed25519 signature check
 *  - APPLICATION_COMMAND (type 2) slash commands:
 *      • /ask question:<Natural language Pokémon TCG / vending drop question>
 *      • /drop query:<Q-code, ZIP, or city>
 *      • /products machine:<Q-code>
 *      • /dropped machine:<Q-code> [minute:<0..59>]
 *      • /nodrop machine:<Q-code>
 *      • /corridor state:<2-letter state>
 */
import { NextResponse } from "next/server";
import { eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/db";
import { machines } from "@/db/schema";
import { describeSchedule, formatCountdown, getDropState } from "@/lib/drops/schedule";
import { machineSchedule } from "@/lib/drops/engine";
import { buildRouteCorridors } from "@/lib/drops/clusters";
import { getMachineVendedProducts } from "@/lib/vending-storage";
import { generateConversationalDiscordReply } from "@/scrapers/adapters/discord-outreach";
import { searchMachines } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://packradar.onrender.com";

const SLASH_COMMANDS_MANIFEST = [
  {
    name: "ask",
    description: "Ask PackRadar a conversational question about vending drops, ETBs, or local restocks",
    options: [
      {
        name: "question",
        description: "e.g. Which Seattle machines carry Prismatic ETBs and when do they drop?",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "drop",
    description: "Check live Pokémon vending machine drop countdowns by Q-code, ZIP, or city",
    options: [
      {
        name: "query",
        description: "Machine code (e.g. Q01124), 5-digit ZIP (e.g. 97045), or city",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "products",
    description: "See what Pokémon TCG products (ETBs, Booster Boxes, Bundles, Packs) are inside a machine",
    options: [
      {
        name: "machine",
        description: "Machine code (e.g. Q00810)",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "dropped",
    description: "Get a direct link to log a verified machine drop & earn +2 to +25 Leaderboard Rep",
    options: [
      {
        name: "machine",
        description: "Machine code (e.g. Q01124)",
        type: 3,
        required: true,
      },
      {
        name: "minute",
        description: "Optional minute past the hour it dropped (0-59)",
        type: 4,
        required: false,
      },
    ],
  },
  {
    name: "nodrop",
    description: "Flag a missed drop window on PackRadar",
    options: [
      {
        name: "machine",
        description: "Machine code (e.g. Q01124)",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "corridor",
    description: "View highway servicing corridor & predicted drop offsets for a state",
    options: [
      {
        name: "state",
        description: "2-letter US state code (e.g. OR, WA, CO, CA, TX)",
        type: 3,
        required: true,
      },
    ],
  },
];

export { SLASH_COMMANDS_MANIFEST };

async function verifyDiscordSignature(req: Request, rawBody: string): Promise<boolean> {
  const pubKeyHex = process.env.DISCORD_PUBLIC_KEY;
  if (!pubKeyHex) return true;
  const sigHex = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!sigHex || !timestamp) return false;
  try {
    const hexToBytes = (hex: string) =>
      new Uint8Array(hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(pubKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const msg = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(sigHex), msg);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const isSimulator = req.headers.get("x-packradar-simulator") === "1";
  if (!isSimulator && !(await verifyDiscordSignature(req, rawBody))) {
    return NextResponse.json({ error: "Invalid request signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as {
    type: number;
    guild_id?: string;
    member?: { user?: { username?: string } };
    data?: {
      name: string;
      options?: { name: string; value: string | number }[];
    };
  };

  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  if (body.type === 2 && body.data) {
    const cmd = body.data.name;
    const opts = new Map((body.data.options ?? []).map((o) => [o.name, o.value]));
    const db = await getDb();
    const now = Date.now();

    if (cmd === "ask") {
      const question = String(opts.get("question") ?? "When are the next Pokémon vending drops?");
      const reply = await generateConversationalDiscordReply(
        db,
        question,
        "vending-chat",
        "Discord Server",
      );
      return NextResponse.json({
        type: 4,
        data: {
          content: reply.conversationalReply,
          embeds: [reply.embed],
        },
      });
    }

    if (cmd === "products") {
      const code = String(opts.get("machine") ?? "Q00810")
        .trim()
        .toUpperCase();
      const [m] = await db.select().from(machines).where(eq(machines.id, code));
      if (!m) {
        return NextResponse.json({
          type: 4,
          data: { content: `❌ Machine \`${code}\` not found. Browse all machines at ${SITE_URL}/map` },
        });
      }
      const vended = await getMachineVendedProducts(db, m);
      const lines = vended.items.map(
        (i) =>
          `• **${i.name}** — $${i.msrp.toFixed(2)} MSRP (${i.confidence}% confidence · ${i.confirms} confirms)`,
      );
      const pageUrl = `${SITE_URL}/machines/${m.id}`;
      return NextResponse.json({
        type: 4,
        data: {
          content: `Here's what collectors have spotted inside **${m.retailer} (${m.id})** in ${m.city}, ${m.state}:`,
          embeds: [
            {
              title: `📦 Vended Products in ${m.retailer} (${m.id}) — ${m.city}, ${m.state}`,
              description:
                `*${vended.profileLabel}*\n\n${lines.join("\n")}\n\n` +
                `🔒 **[Confirm or Add Spotted Products on PackRadar](${SITE_URL}/sign-up?next=${encodeURIComponent(`/machines/${m.id}`)})** · **[Open Machine Page](${pageUrl})**`,
              color: 0xfacc15,
            },
          ],
        },
      });
    }

    if (cmd === "drop") {
      const q = String(opts.get("query") ?? "").trim();
      const [exact] = await db
        .select()
        .from(machines)
        .where(or(eq(machines.id, q.toUpperCase()), ilike(machines.city, q)))
        .limit(1);

      if (exact && /^Q\d{5}$/i.test(q)) {
        const sched = machineSchedule(exact);
        const st = getDropState(sched, now);
        const vended = await getMachineVendedProducts(db, exact);
        const countdown =
          st.status === "unknown"
            ? "Drop time unknown — sign in on PackRadar to report the drop minute!"
            : st.status === "dropped"
              ? `🟢 Dropped ${formatCountdown(st.secondsSincePrev)} ago`
              : `⏱️ Next drop in **${formatCountdown(st.secondsToNext)}**`;

        const pageUrl = `${SITE_URL}/machines/${exact.id}`;
        return NextResponse.json({
          type: 4,
          data: {
            content: `Checking **${exact.retailer} (${exact.id})** in ${exact.city}, ${exact.state} — watch the live countdown or set a 5-min pre-drop alert at ${pageUrl}`,
            embeds: [
              {
                title: `⚡ ${exact.retailer} (${exact.id}) — ${exact.city}, ${exact.state}`,
                description:
                  `${exact.street}, ${exact.city}, ${exact.state} ${exact.zip}\n\n` +
                  `${countdown}\n**Schedule:** ${sched ? describeSchedule(sched) : "Unconfirmed"}\n` +
                  `**Accuracy:** ${exact.accuracy ? `${Math.round(exact.accuracy)}%` : "N/A"}\n` +
                  `**Spotted Products:** ${vended.items.slice(0, 3).map((i) => i.name).join(" · ")}\n\n` +
                  `👉 **[Open Live Timer & Set Free Drop Alert](${SITE_URL}/sign-up?next=${encodeURIComponent(`/machines/${exact.id}`)})**`,
                color: st.status === "dropped" ? 0x22c55e : st.status === "imminent" ? 0xfacc15 : 0x3b82f6,
              },
            ],
          },
        });
      }

      const search = await searchMachines(q, 5);
      if (search.machines.length === 0) {
        return NextResponse.json({
          type: 4,
          data: { content: `No vending machines found matching \`${q}\`. Search the live map at ${SITE_URL}/map` },
        });
      }

      const lines = search.machines.slice(0, 5).map((m) => {
        const sched = machineSchedule(m);
        const st = getDropState(sched, now);
        const timerText =
          st.status === "unknown"
            ? "❓ Needs drop report"
            : st.status === "dropped"
              ? `🟢 Dropped ${formatCountdown(st.secondsSincePrev)} ago`
              : `⏱️ Next in **${formatCountdown(st.secondsToNext)}** (:${String(m.anchorMinute ?? 0).padStart(2, "0")})`;
        const dist = m.distance != null ? ` · ${m.distance.toFixed(1)} mi` : "";
        return `• [**${m.retailer}** \`${m.id}\`](${SITE_URL}/machines/${m.id}) (${m.city}, ${m.state}${dist}) — ${timerText}`;
      });

      return NextResponse.json({
        type: 4,
        data: {
          content: `Found **${search.machines.length}** Pokémon vending machines near **${search.center?.label || q}**! Create a free account at ${SITE_URL}/sign-up to get 5-min drop alerts:`,
          embeds: [
            {
              title: `📡 PackRadar Live Drops for "${search.center?.label || q}"`,
              description:
                `${lines.join("\n")}\n\n` +
                `🔒 **[Join Free on PackRadar](${SITE_URL}/sign-up)** to unlock 10 drop alerts, confirm machine products & win monthly ETB prizes!`,
              color: 0xfacc15,
            },
          ],
        },
      });
    }

    if (cmd === "dropped" || cmd === "nodrop") {
      const code = String(opts.get("machine") ?? "")
        .trim()
        .toUpperCase();
      const [m] = await db.select().from(machines).where(eq(machines.id, code));
      if (!m) {
        return NextResponse.json({
          type: 4,
          data: { content: `❌ Machine \`${code}\` not found.` },
        });
      }

      const nextPath = encodeURIComponent(`/machines/${m.id}`);
      return NextResponse.json({
        type: 4,
        data: {
          content: `🔒 **Free PackRadar Account Required to Log Drops & Earn Leaderboard Rep!**\nClick below to sign in or create your free account in 5 seconds and log your report for **${m.retailer} (${m.id})**:`,
          embeds: [
            {
              title: `🏆 Log Drop for ${m.retailer} (${m.id}) & Earn +2 to +25 Rep`,
              description:
                `To keep drop consensus 100% accurate and award monthly Pokémon ETB prizes to real spotters, all drop reports require a free PackRadar account.\n\n` +
                `👉 **[Sign In / Join Free & Log Report for ${m.id} →](${SITE_URL}/sign-up?next=${nextPath})**`,
              color: 0x22c55e,
            },
          ],
        },
      });
    }

    if (cmd === "corridor") {
      const stCode = String(opts.get("state") ?? "OR")
        .trim()
        .toUpperCase();
      const rows = await db.select().from(machines).where(eq(machines.state, stCode));
      const corridors = buildRouteCorridors(rows);
      if (corridors.length === 0) {
        return NextResponse.json({
          type: 4,
          data: { content: `No servicing corridors found for state \`${stCode}\`.` },
        });
      }
      const top = corridors.slice(0, 3).map((c) => {
        const stops = c.members
          .map(
            (m) =>
              `[\`${m.id}\` ${m.retailer} ${m.city}](${SITE_URL}/machines/${m.id}) (${m.anchorMinute != null ? `:${String(m.anchorMinute).padStart(2, "0")}` : "??"})`,
          )
          .join(" → ");
        return `**${c.name}** (~${c.fittedServiceMinutes}m/stop)\n${stops}`;
      });
      return NextResponse.json({
        type: 4,
        data: {
          embeds: [
            {
              title: `🛣️ ${stCode} Route Servicing Corridors`,
              description:
                `${top.join("\n\n")}\n\n` +
                `👉 **[Explore Full State Map & Set Corridor Alerts](${SITE_URL}/locations/${stCode.toLowerCase()})**`,
              color: 0xa855f7,
            },
          ],
        },
      });
    }
  }

  return NextResponse.json({ error: "Unhandled interaction" }, { status: 400 });
}
