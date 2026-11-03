/**
 * Discord Bot Auto-Invite Controller, Conversational Outreach Engine & Passive Channel Harvester API.
 */
import { eq, ne } from "drizzle-orm";
import { route, json } from "@/lib/api";
import { getDb } from "@/db";
import { machines, settings } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { extractDropTimers, matchMachines, type MachineRef } from "@/scrapers/extract";
import { submitObservation, upsertScrapedCandidate } from "@/lib/drops/engine";
import {
  DEFAULT_POKEMON_DISCORD_GROUPS,
  generateConversationalDiscordReply,
  type ConnectedDiscordGroup,
  type OutreachPostLog,
} from "@/scrapers/adapters/discord-outreach";
import { runAdapter } from "@/scrapers/runner";
import { SLASH_COMMANDS_MANIFEST } from "../interactions/route";

export const dynamic = "force-dynamic";

export type DiscordBotConfig = {
  clientId: string;
  inviteMode: "open" | "code_gated" | "paused";
  inviteCode: string;
  permissionPreset: "full_harvester" | "slash_only";
  autoHarvestChannels: string[];
  autoPushAlerts: boolean;
  connectedGuilds: ConnectedDiscordGroup[];
  recentOutreachPosts?: OutreachPostLog[];
  lastOutreachRunAt?: string;
};

const DEFAULT_CONFIG: DiscordBotConfig = {
  clientId: process.env.DISCORD_CLIENT_ID || "1312849201948271620",
  inviteMode: "open",
  inviteCode: "PACKRADAR-VIP",
  permissionPreset: "full_harvester",
  autoHarvestChannels: [
    "vending-chat",
    "vending-drops",
    "restocks",
    "pokemon-monitors",
    "kiosk-sightings",
    "pnw-drops",
  ],
  autoPushAlerts: true,
  connectedGuilds: DEFAULT_POKEMON_DISCORD_GROUPS,
  recentOutreachPosts: [],
};

async function getBotConfig(): Promise<DiscordBotConfig> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, "discordBotConfig"));
  if (!row || !row.value) return DEFAULT_CONFIG;
  const val = row.value as Partial<DiscordBotConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...val,
    connectedGuilds:
      Array.isArray(val.connectedGuilds) && val.connectedGuilds.length > 0
        ? val.connectedGuilds.map((g) => ({
            ...g,
            channelName: g.channelName || "vending-chat",
            conversationalMode: g.conversationalMode ?? true,
            autoPostDrops: g.autoPostDrops ?? true,
            autoPostNews: g.autoPostNews ?? true,
            outreachPostsCount: g.outreachPostsCount ?? 10,
          }))
        : DEFAULT_POKEMON_DISCORD_GROUPS,
    recentOutreachPosts: Array.isArray(val.recentOutreachPosts) ? val.recentOutreachPosts : [],
  };
}

async function saveBotConfig(cfg: DiscordBotConfig) {
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key: "discordBotConfig", value: cfg })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: cfg, updatedAt: new Date() },
    });
}

/** Compute Discord OAuth2 Bot + Slash Commands Invite URL from config */
export function buildDiscordInviteUrl(cfg: DiscordBotConfig, baseUrl?: string): string {
  const permissions = cfg.permissionPreset === "full_harvester" ? "2147568640" : "2147502080";
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    permissions,
    scope: "bot applications.commands",
  });
  if (baseUrl) {
    params.set("redirect_uri", `${baseUrl.replace(/\/$/, "")}/discord`);
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export const GET = route(async () => {
  const db = await getDb();
  let config = await getBotConfig();
  if (!config.recentOutreachPosts || config.recentOutreachPosts.length === 0) {
    await runAdapter("discord-outreach").catch(() => {});
    config = await getBotConfig();
  }
  return {
    config,
    inviteUrl: buildDiscordInviteUrl(config),
    commands: SLASH_COMMANDS_MANIFEST,
    hasBotToken: Boolean(process.env.DISCORD_BOT_TOKEN),
  };
});

export const POST = route(async (req) => {
  const b = (await json(req)) as {
    action:
      | "update_config"
      | "register_guild"
      | "register_commands"
      | "ingest_message"
      | "conversational_reply"
      | "run_outreach_worker";
    config?: Partial<DiscordBotConfig>;
    guild?: {
      guildName: string;
      region: string;
      channelName?: string;
      webhookUrl?: string;
      inviteCode?: string;
    };
    message?: { content: string; author?: string; channel?: string; guildName?: string };
  };

  const current = await getBotConfig();
  const db = await getDb();

  if (b.action === "run_outreach_worker") {
    await requireRole(["admin", "mod"]);
    await runAdapter("discord-outreach");
    const updated = await getBotConfig();
    return {
      ok: true,
      config: updated,
      inviteUrl: buildDiscordInviteUrl(updated),
      message: `Autonomous Discord Outreach Worker launched and posted across ${updated.connectedGuilds.length} Pokémon TCG Discord groups!`,
    };
  }

  if (b.action === "conversational_reply" && b.message) {
    const channel = b.message.channel || "vending-chat";
    const guildName = b.message.guildName || "Pokémon TCG Collectors";
    const reply = await generateConversationalDiscordReply(
      db,
      b.message.content,
      channel,
      guildName,
    );

    const newPost: OutreachPostLog = {
      id: `outreach-chat-${Date.now()}`,
      createdAt: new Date().toISOString(),
      guildName,
      channel,
      region: "Live Chat",
      triggerPrompt: b.message.content,
      conversationalReply: reply.conversationalReply,
      embedTitle: reply.embed.title,
      embedDescription: reply.embed.description,
      targetUrl: reply.embed.url,
      deliveredWebhook: false,
    };

    const next: DiscordBotConfig = {
      ...current,
      recentOutreachPosts: [newPost, ...(current.recentOutreachPosts ?? [])].slice(0, 30),
    };
    await saveBotConfig(next);

    return {
      ok: true,
      reply,
      config: next,
    };
  }

  if (b.action === "update_config" && b.config) {
    await requireRole(["admin", "mod"]);
    const next: DiscordBotConfig = {
      ...current,
      ...b.config,
      autoHarvestChannels: Array.isArray(b.config.autoHarvestChannels)
        ? b.config.autoHarvestChannels
        : current.autoHarvestChannels,
    };
    await saveBotConfig(next);
    return { ok: true, config: next, inviteUrl: buildDiscordInviteUrl(next) };
  }

  if (b.action === "register_guild" && b.guild) {
    if (current.inviteMode === "paused") {
      throw new Error("Bot invites are currently paused by the administrator.");
    }
    if (
      current.inviteMode === "code_gated" &&
      b.guild.inviteCode?.trim() !== current.inviteCode.trim()
    ) {
      throw new Error("Invalid invite authorization code.");
    }
    const cleanWebhook = b.guild.webhookUrl?.trim() || undefined;
    const newGuild: ConnectedDiscordGroup = {
      guildId: `guild-${Date.now().toString(36)}`,
      guildName: b.guild.guildName.trim(),
      region: b.guild.region.trim() || "US",
      channelName: (b.guild.channelName?.trim() || "vending-drops").replace(/^#/, ""),
      webhookUrl: cleanWebhook,
      conversationalMode: true,
      autoPostDrops: true,
      autoPostNews: true,
      joinedAt: new Date().toISOString(),
      harvestedCount: 0,
      outreachPostsCount: 1,
    };

    // If a Discord webhook URL was supplied, immediately send a welcome + live drop embed!
    if (
      cleanWebhook &&
      /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\//i.test(cleanWebhook)
    ) {
      try {
        const welcomeReply = await generateConversationalDiscordReply(
          db,
          newGuild.region,
          newGuild.channelName,
          newGuild.guildName,
        );
        await fetch(cleanWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "PackRadar Drop Spotter",
            content: `⚡ **PackRadar Conversational Drop Bot connected to #${newGuild.channelName}!**\n${welcomeReply.conversationalReply}`,
            embeds: [welcomeReply.embed],
          }),
        });
      } catch {}
    }

    const next: DiscordBotConfig = {
      ...current,
      connectedGuilds: [newGuild, ...current.connectedGuilds],
    };
    await saveBotConfig(next);
    return { ok: true, config: next, inviteUrl: buildDiscordInviteUrl(next) };
  }

  if (b.action === "register_commands") {
    await requireRole(["admin", "mod"]);
    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = current.clientId;
    if (!token) {
      return {
        ok: true,
        simulated: true,
        message: `Prepared ${SLASH_COMMANDS_MANIFEST.length} global slash commands (/drop, /products, /ask, /dropped, /nodrop, /corridor) for Client ID ${clientId}.`,
      };
    }
    const res = await fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(SLASH_COMMANDS_MANIFEST),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Discord API error (${res.status}): ${errText.slice(0, 200)}`);
    }
    return {
      ok: true,
      simulated: false,
      message: `Successfully registered ${SLASH_COMMANDS_MANIFEST.length} global slash commands with Discord!`,
    };
  }

  if (b.action === "ingest_message" && b.message) {
    await requireRole(["admin", "mod"]);
    const refs: MachineRef[] = await db
      .select({
        id: machines.id,
        retailer: machines.retailer,
        city: machines.city,
        state: machines.state,
        street: machines.street,
      })
      .from(machines)
      .where(ne(machines.status, "removed"));

    const text = b.message.content;
    const timers = extractDropTimers(text);
    const targets = matchMachines(text, refs);

    if (!timers.length || !targets.length) {
      return {
        ok: false,
        extractedTimers: timers,
        matchedMachines: targets,
        message: !targets.length
          ? "No matching machine found in message (mention a Q-code like Q01124 or retailer + city/street)."
          : "No drop timer or minute mark detected in message (e.g. 'dropped at :42' or 'drops every hour at 1:15').",
      };
    }

    const bestTimer = timers.sort((a, b) => b.confidence - a.confidence)[0];
    const updatedMachines: string[] = [];

    for (const t of targets.slice(0, 2)) {
      await upsertScrapedCandidate(db, {
        machineId: t.id,
        intervalMinutes: bestTimer.intervalMinutes,
        anchorMinute: bestTimer.anchorMinute,
        sourceUrl: `https://discord.com/channels/${b.message.guildName ?? "community"}/${b.message.channel ?? "restocks"}`,
        sourceTitle: `[Discord #${b.message.channel ?? "restocks"}] @${b.message.author ?? "hunter"}: ${text.slice(0, 120)}`,
        reliability: 0.89,
        mentionedAt: new Date(),
      });

      const obsTime = new Date();
      obsTime.setMinutes(bestTimer.anchorMinute, 10, 0);
      await submitObservation(db, {
        machineId: t.id,
        userId: null,
        observedAt: obsTime,
        kind: "dropped",
        note: `Harvested from Discord #${b.message.channel ?? "restocks"} (@${b.message.author ?? "hunter"})`,
        source: "scraped",
      });
      updatedMachines.push(t.id);
    }

    if (current.connectedGuilds.length > 0) {
      current.connectedGuilds[0].harvestedCount += updatedMachines.length;
      await saveBotConfig(current);
    }

    return {
      ok: true,
      extractedTimers: timers,
      matchedMachines: targets,
      updatedMachines,
      message: `Harvested drop timer (every ${bestTimer.intervalMinutes}m at :${String(bestTimer.anchorMinute).padStart(2, "0")}) and updated ${updatedMachines.join(", ")}!`,
    };
  }

  throw new Error("Invalid action");
});
