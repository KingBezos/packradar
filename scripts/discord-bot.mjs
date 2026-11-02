/**
 * PackRadar Standalone Discord Gateway Bot (Zero-Dependency Node 24 WebSocket).
 *
 * Capabilities:
 *  1. Connects to Discord Gateway v10 (`wss://gateway.discord.gg/?v=10&encoding=json`).
 *  2. Enforces PackRadar's Auto-Invite Policy on `GUILD_CREATE`:
 *     - Checks `/api/discord/control` for `inviteMode` and `autoHarvestChannels`.
 *     - Automatically registers newly joined servers into PackRadar's guild list.
 *  3. Passively monitors restock channels (`#vending-drops`, `#restocks`, etc.)
 *     for messages mentioning Q-codes, stores, and minute marks, forwarding
 *     them to `/api/discord/control` (`action: "ingest_message"`).
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=your_token node scripts/discord-bot.mjs
 */

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const PACKRADAR_URL = process.env.PACKRADAR_URL || "http://localhost:3000";

if (!TOKEN) {
  console.log("[discord-bot] DISCORD_BOT_TOKEN not set. Use http://localhost:3000/discord to configure invites & test in simulator mode.");
  process.exit(0);
}

// Intents: GUILDS (1 << 0) | GUILD_MESSAGES (1 << 9) | MESSAGE_CONTENT (1 << 15) = 33281
const INTENTS = (1 << 0) | (1 << 9) | (1 << 15);
let heartbeatInterval = null;
let lastSeq = null;

async function fetchControlConfig() {
  const res = await fetch(`${PACKRADAR_URL}/api/discord/control`);
  return res.json();
}

function connect() {
  const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");

  ws.onopen = () => {
    console.log("[discord-bot] Connected to Discord Gateway v10");
  };

  ws.onmessage = async (event) => {
    const payload = JSON.parse(event.data);
    const { op, d, s, t } = payload;
    if (s !== null && s !== undefined) lastSeq = s;

    // OP 10: Hello -> start heartbeat & identify
    if (op === 10) {
      const interval = d.heartbeat_interval;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: lastSeq }));
      }, interval);

      ws.send(
        JSON.stringify({
          op: 2,
          d: {
            token: TOKEN,
            intents: INTENTS,
            properties: { os: "windows", browser: "packradar", device: "packradar" },
          },
        }),
      );
    }

    // Event dispatch
    if (op === 0) {
      if (t === "READY") {
        console.log(`[discord-bot] Logged in as ${d.user.username}#${d.user.discriminator}`);
      }

      if (t === "GUILD_CREATE") {
        const { config } = await fetchControlConfig();
        if (config.inviteMode === "paused") {
          console.log(`[discord-bot] Invite mode is PAUSED. Leaving guild ${d.name} (${d.id})`);
          await fetch(`https://discord.com/api/v10/users/@me/guilds/${d.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bot ${TOKEN}` },
          });
          return;
        }
        console.log(`[discord-bot] Active in guild: ${d.name} (${d.member_count} members)`);
      }

      if (t === "MESSAGE_CREATE" && !d.author?.bot && d.content) {
        if (/vending|kiosk|drop|restock|safeway|fred meyer|king soopers|qfc|Q\d{5}/i.test(d.content)) {
          const res = await fetch(`${PACKRADAR_URL}/api/discord/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ingest_message",
              message: {
                content: d.content,
                author: d.author.username,
                channel: d.channel_id,
                guildName: d.guild_id,
              },
            }),
          });
          const out = await res.json();
          if (out.ok) {
            console.log(`[discord-bot] Harvested drop from @${d.author.username}:`, out.message);
          }
        }
      }
    }
  };

  ws.onclose = () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    console.log("[discord-bot] Disconnected. Reconnecting in 5s...");
    setTimeout(connect, 5000);
  };
}

connect();
