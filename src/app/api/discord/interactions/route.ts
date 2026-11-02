/**
 * Discord HTTP Interactions Endpoint + Slash Command Handler.
 *
 * Supports:
 *  - PING (type 1) verification handshake with Ed25519 signature check
 *  - APPLICATION_COMMAND (type 2) slash commands:
 *      • /drop query:<Q-code, ZIP, or city>
 *      • /dropped machine:<Q-code> [minute:<0..59>]
 *      • /nodrop machine:<Q-code>
 *      • /corridor state:<2-letter state>
 */
import { NextResponse } from "next/server";
import { eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/db";
import { machines } from "@/db/schema";
import { describeSchedule, formatCountdown, getDropState } from "@/lib/drops/schedule";
import { machineSchedule, submitObservation, upsertScrapedCandidate } from "@/lib/drops/engine";
import { buildRouteCorridors } from "@/lib/drops/clusters";
import { searchMachines } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SLASH_COMMANDS_MANIFEST = [
  {
    name: "drop",
    description: "Check live Pokémon vending machine drop countdowns by Q-code, ZIP, or city",
    options: [
      {
        name: "query",
        description: "Machine code (e.g. Q01124), 5-digit ZIP (e.g. 97045), or city",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "dropped",
    description: "Report that a vending machine just dropped product (feeds PackRadar consensus)",
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
        type: 4, // INTEGER
        required: false,
      },
    ],
  },
  {
    name: "nodrop",
    description: "Report that a machine did NOT drop at its scheduled time (flags route reset)",
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
  if (!pubKeyHex) return true; // In local/simulator mode without key, allow testing
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

  // Discord PING handshake
  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  if (body.type === 2 && body.data) {
    const cmd = body.data.name;
    const opts = new Map((body.data.options ?? []).map((o) => [o.name, o.value]));
    const db = await getDb();
    const now = Date.now();

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
        const countdown =
          st.status === "unknown"
            ? "Drop time unknown — help us find the drop times!"
            : st.status === "dropped"
              ? `🟢 Dropped ${formatCountdown(st.secondsSincePrev)} ago`
              : `⏱️ Next drop in **${formatCountdown(st.secondsToNext)}**`;

        return NextResponse.json({
          type: 4,
          data: {
            embeds: [
              {
                title: `⚡ ${exact.retailer} (${exact.id}) — ${exact.city}, ${exact.state}`,
                description: `${exact.street}, ${exact.city}, ${exact.state} ${exact.zip}\n\n${countdown}\n**Schedule:** ${sched ? describeSchedule(sched) : "Unconfirmed"}\n**Accuracy:** ${exact.accuracy ? `${Math.round(exact.accuracy)}%` : "N/A"}`,
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
          data: { content: `No vending machines found matching \`${q}\`.` },
        });
      }

      const lines = search.machines.slice(0, 5).map((m) => {
        const sched = machineSchedule(m);
        const st = getDropState(sched, now);
        const timerText =
          st.status === "unknown"
            ? "❓ Help us find the drop times"
            : st.status === "dropped"
              ? `🟢 Dropped ${formatCountdown(st.secondsSincePrev)} ago`
              : `⏱️ Next in **${formatCountdown(st.secondsToNext)}** (:‍${String(m.anchorMinute ?? 0).padStart(2, "0")})`;
        const dist = m.distance != null ? ` · ${m.distance.toFixed(1)} mi` : "";
        return `• **${m.retailer}** \`${m.id}\` (${m.city}, ${m.state}${dist}) — ${timerText}`;
      });

      return NextResponse.json({
        type: 4,
        data: {
          embeds: [
            {
              title: `📡 PackRadar Live Drops for "${search.center?.label || q}"`,
              description: lines.join("\n"),
              color: 0xfacc15,
            },
          ],
        },
      });
    }

    if (cmd === "dropped") {
      const code = String(opts.get("machine") ?? "")
        .trim()
        .toUpperCase();
      const minuteOpt = opts.get("minute");
      const [m] = await db.select().from(machines).where(eq(machines.id, code));
      if (!m) {
        return NextResponse.json({
          type: 4,
          data: { content: `❌ Machine \`${code}\` not found.` },
        });
      }

      const obsDate = new Date();
      if (minuteOpt != null && Number.isFinite(Number(minuteOpt))) {
        const min = Math.max(0, Math.min(59, Number(minuteOpt)));
        obsDate.setMinutes(min, 15, 0);
        await upsertScrapedCandidate(db, {
          machineId: m.id,
          intervalMinutes: m.intervalMinutes ?? 60,
          anchorMinute: min,
          sourceUrl: `https://discord.com/channels/${body.guild_id ?? "community"}`,
          sourceTitle: `Discord /dropped report by @${body.member?.user?.username ?? "hunter"}`,
          reliability: 0.88,
          mentionedAt: obsDate,
        });
      }

      const updated = await submitObservation(db, {
        machineId: m.id,
        userId: null,
        observedAt: obsDate,
        kind: "dropped",
        note: `Reported via PackRadar Discord Bot (@${body.member?.user?.username ?? "hunter"})`,
        source: "scraped",
      });

      return NextResponse.json({
        type: 4,
        data: {
          embeds: [
            {
              title: `🟢 Drop Logged for ${m.retailer} (${m.id})!`,
              description: `Thanks! Consensus engine updated **${m.city}, ${m.state}**.\n**Active Schedule:** ${updated?.intervalMinutes ? `Every ${updated.intervalMinutes}m at :${String(updated.anchorMinute).padStart(2, "0")}` : "Calibrating..."}\n**New Accuracy:** **${Math.round(updated?.accuracy ?? 50)}%**`,
              color: 0x22c55e,
            },
          ],
        },
      });
    }

    if (cmd === "nodrop") {
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
      await submitObservation(db, {
        machineId: m.id,
        userId: null,
        observedAt: new Date(),
        kind: "no_drop",
        note: `No-drop reported via Discord Bot (@${body.member?.user?.username ?? "hunter"})`,
        source: "scraped",
      });
      return NextResponse.json({
        type: 4,
        data: {
          content: `🚫 Logged **no-drop** for **${m.retailer} ${m.city}** (\`${m.id}\`). If neighboring machines in this corridor also miss their window, PackRadar will flag a **Route Reset (2× Rep Bounty)**.`,
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
              `\`${m.id}\` ${m.retailer} ${m.city} (${m.anchorMinute != null ? `:${String(m.anchorMinute).padStart(2, "0")}` : "??"})`,
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
              description: top.join("\n\n"),
              color: 0xa855f7,
            },
          ],
        },
      });
    }
  }

  return NextResponse.json({ error: "Unhandled interaction" }, { status: 400 });
}
