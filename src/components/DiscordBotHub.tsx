"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Radio,
  Send,
  Shield,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import type { DiscordBotConfig } from "@/app/api/discord/control/route";

type SlashReply = {
  type: number;
  data?: {
    content?: string;
    embeds?: { title?: string; description?: string; color?: number }[];
  };
};

const SAMPLE_CONVERSATION_PROMPTS = [
  "Anyone know when Q00810 or Seattle Safeway vending machines drop Prismatic ETBs?",
  "Which vending machines near 97045 carry 151 Booster Bundles or Surging Sparks?",
  "What products are inside machine Q00003 right now?",
  "Any Denver or Dallas Kroger kiosks dropping ETBs this hour?",
];

export function DiscordBotHub({
  isStaff = false,
  signedIn = false,
}: {
  isStaff?: boolean;
  signedIn?: boolean;
}) {
  const [config, setConfig] = useState<DiscordBotConfig | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Conversational Q&A Bot state
  const [chatPrompt, setChatPrompt] = useState(SAMPLE_CONVERSATION_PROMPTS[0]);
  const [chatChannel, setChatChannel] = useState("vending-chat");
  const [chatGuild, setChatGuild] = useState("PNW & Seattle/Portland Pokémon Vending Hunters");
  const [chatReply, setChatReply] = useState<{
    conversationalReply: string;
    embed: { title: string; description: string; url: string };
  } | null>(null);

  // Slash Command Simulator state
  const [simCmd, setSimCmd] = useState<"ask" | "drop" | "products" | "corridor">("ask");
  const [simArg1, setSimArg1] = useState("Which Seattle machines carry Prismatic ETBs?");
  const [simReply, setSimReply] = useState<SlashReply | null>(null);

  // Passive Harvester test state
  const [harvestText, setHarvestText] = useState(
    "Just left Safeway Gladstone (Q01124) — machine dropped 151 bundles at the :42 minute mark!",
  );
  const [harvestChannel, setHarvestChannel] = useState("pnw-drops");

  // Guild / Webhook onboarding form
  const [guildName, setGuildName] = useState("");
  const [guildRegion, setGuildRegion] = useState("");
  const [guildChannel, setGuildChannel] = useState("vending-drops");
  const [guildWebhook, setGuildWebhook] = useState("");
  const [guildInviteCode, setGuildInviteCode] = useState("");

  useEffect(() => {
    fetch("/api/discord/control")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config);
        setInviteUrl(d.inviteUrl);
      });
  }, []);

  const runConversationalBot = async (customPrompt?: string) => {
    const text = (customPrompt ?? chatPrompt).trim();
    if (!text) return;
    setBusy("chat");
    setFeedback(null);
    try {
      const res = await fetch("/api/discord/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "conversational_reply",
          message: {
            content: text,
            channel: chatChannel,
            guildName: chatGuild,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate conversational reply");
      setChatReply(data.reply);
      if (data.config) setConfig(data.config);
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const triggerOutreachWorker = async () => {
    setBusy("worker");
    setFeedback(null);
    try {
      const res = await fetch("/api/discord/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_outreach_worker" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to launch worker");
      setConfig(data.config);
      setFeedback({ ok: true, text: data.message });
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const updateConfig = async (patch: Partial<DiscordBotConfig>, note: string) => {
    setBusy("cfg");
    setFeedback(null);
    try {
      const res = await fetch("/api/discord/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_config", config: patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setConfig(data.config);
      setInviteUrl(data.inviteUrl);
      setFeedback({ ok: true, text: note });
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const registerCommands = async () => {
    setBusy("reg");
    setFeedback(null);
    try {
      const res = await fetch("/api/discord/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register_commands" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setFeedback({ ok: true, text: data.message });
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const runSimulator = async () => {
    setBusy("sim");
    try {
      const options =
        simCmd === "ask"
          ? [{ name: "question", value: simArg1 }]
          : simCmd === "drop"
            ? [{ name: "query", value: simArg1 }]
            : simCmd === "products"
              ? [{ name: "machine", value: simArg1 }]
              : [{ name: "state", value: simArg1 }];

      const res = await fetch("/api/discord/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-packradar-simulator": "1",
        },
        body: JSON.stringify({
          type: 2,
          guild_id: "simulator-guild",
          member: { user: { username: "collector_pro" } },
          data: { name: simCmd, options },
        }),
      });
      setSimReply(await res.json());
    } finally {
      setBusy(null);
    }
  };

  const runHarvest = async () => {
    setBusy("harvest");
    setFeedback(null);
    try {
      const res = await fetch("/api/discord/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest_message",
          message: {
            content: harvestText,
            channel: harvestChannel,
            author: "server_hunter",
            guildName: "Community Discord",
          },
        }),
      });
      const data = await res.json();
      setFeedback({ ok: Boolean(data.ok), text: data.message });
      if (data.ok) {
        const refreshed = await fetch("/api/discord/control").then((r) => r.json());
        setConfig(refreshed.config);
      }
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const registerGuild = async () => {
    if (!guildName.trim()) return;
    setBusy("guild");
    setFeedback(null);
    try {
      const res = await fetch("/api/discord/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_guild",
          guild: {
            guildName,
            region: guildRegion || "US",
            channelName: guildChannel || "vending-drops",
            webhookUrl: guildWebhook || undefined,
            inviteCode: guildInviteCode,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register server");
      setConfig(data.config);
      setGuildName("");
      setGuildRegion("");
      setGuildWebhook("");
      setFeedback({
        ok: true,
        text: `Connected "${guildName}" to the PackRadar Conversational Discord Worker!`,
      });
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!config) {
    return (
      <div className="card flex items-center gap-3 p-8 text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-volt" /> Loading PackRadar Conversational Discord Bot &amp; Outreach Worker...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Hero Banner + Invite Link */}
      <div className="card relative overflow-hidden border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 via-panel to-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300 ring-1 ring-indigo-400/30">
                <Bot className="h-3.5 w-3.5" /> PackRadar Conversational Discord Drop Bot
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[11px] font-bold text-green-300">
                <Radio className="h-3 w-3 animate-pulse" /> Active in {config.connectedGuilds.length} Pokémon TCG Groups
              </span>
            </div>
            <h1 className="text-2xl font-black text-white sm:text-3xl">
              Live Vending Machine Drop &amp; Restock Bot for Your Discord Server
            </h1>
            <p className="text-sm text-slate-300">
              Add the PackRadar bot to your Pokémon TCG Discord server (<code className="text-volt">#vending-chat</code>,{" "}
              <code className="text-volt">#restocks</code>, <code className="text-volt">/ask</code>,{" "}
              <code className="text-volt">/drop</code>, <code className="text-volt">/products</code>) to check live
              kiosk drop timers, spotted ETBs &amp; Booster Bundles, and regional restock alerts right inside Discord.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={config.inviteMode === "paused" ? "#" : inviteUrl}
              target={config.inviteMode === "paused" ? undefined : "_blank"}
              rel="noopener noreferrer"
              className={clsx(
                "btn-primary",
                config.inviteMode === "paused" && "pointer-events-none opacity-50",
              )}
            >
              <ExternalLink className="h-4 w-4" /> Add Bot to Discord Server
            </a>
            <button
              className="btn-ghost"
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied Invite Link" : "Copy Bot Invite URL"}
            </button>
            {isStaff && (
              <button
                type="button"
                onClick={triggerOutreachWorker}
                disabled={busy !== null}
                className="btn-green text-xs font-bold"
              >
                {busy === "worker" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Auto-Post to Connected Groups Now (Admin)
              </button>
            )}
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm font-medium",
            feedback.ok
              ? "border-green-500/40 bg-green-500/10 text-green-300"
              : "border-red-500/40 bg-red-500/10 text-red-300",
          )}
        >
          {feedback.text}
        </div>
      )}

      {/* 1. Conversational Discord Bot Tester + Live Worker Outreach Stream */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-volt" />
              <h2 className="text-lg font-bold text-white">
                Conversational Discord Chat Bot (Live Test)
              </h2>
            </div>
            <span className="rounded-full bg-volt/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-volt">
              Natural Conversation Mode
            </span>
          </div>
          <p className="text-xs text-muted">
            Type any question a collector would ask in a Pokémon Discord server — the bot answers naturally with live
            vending timers &amp; spotted products:
          </p>

          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_CONVERSATION_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setChatPrompt(p);
                  void runConversationalBot(p);
                }}
                className="rounded-lg border border-line bg-panel-2 px-2.5 py-1 text-left text-[11px] text-slate-300 transition hover:border-volt/50 hover:text-white"
              >
                💬 &ldquo;{p.slice(0, 56)}…&rdquo;
              </button>
            ))}
          </div>

          <div className="space-y-2.5 rounded-xl bg-panel-2 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Discord Server</label>
                <input
                  className="input py-1.5 text-xs"
                  value={chatGuild}
                  onChange={(e) => setChatGuild(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Channel</label>
                <input
                  className="input py-1.5 font-mono text-xs"
                  value={chatChannel}
                  onChange={(e) => setChatChannel(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-xs"
                placeholder="Ask about a machine (Q00810), city (Seattle), ZIP (97045), or ETB restocks…"
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => runConversationalBot()}
                className="btn-primary shrink-0 py-1.5 text-xs font-bold"
              >
                {busy === "chat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Reply in Chat
              </button>
            </div>
          </div>

          {chatReply && (
            <div className="rounded-xl border border-indigo-500/30 bg-[#2b2d31] p-4 text-xs text-slate-100 space-y-2">
              <div className="flex items-center gap-2 font-bold text-indigo-300">
                <Bot className="h-4 w-4" /> PackRadar Drop Spotter
                <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] text-white">BOT</span>
                <span className="text-[10px] font-normal text-slate-400">in #{chatChannel}</span>
              </div>
              <p className="whitespace-pre-line leading-relaxed text-slate-200">
                {chatReply.conversationalReply}
              </p>
              <div className="rounded-lg border-l-4 border-volt bg-[#1e1f22] p-3 space-y-1">
                <p className="font-bold text-white">{chatReply.embed.title}</p>
                <p className="whitespace-pre-line text-slate-300">{chatReply.embed.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* Slash Command Simulator */}
        <div className="card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Slash Command Simulator (/ask, /drop, /products)</h2>
          </div>
          <p className="text-xs text-muted">
            Test the slash commands server members use to check drop timers and vended products inside Discord:
          </p>

          <div className="flex flex-wrap gap-2">
            {(["ask", "drop", "products", "corridor"] as const).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setSimCmd(c);
                  if (c === "ask") setSimArg1("Which Seattle machines carry Prismatic ETBs?");
                  if (c === "drop") setSimArg1("97045");
                  if (c === "products") setSimArg1("Q00810");
                  if (c === "corridor") setSimArg1("WA");
                }}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 font-mono text-xs font-bold",
                  simCmd === c
                    ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                    : "border-line bg-panel-2 text-muted hover:text-white",
                )}
              >
                /{c}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-panel-2 p-3">
            <label className="flex-1">
              <span className="mb-1 block font-mono text-[11px] text-muted">
                {simCmd === "ask"
                  ? "question (natural language)"
                  : simCmd === "drop"
                    ? "query (ZIP, city, or Q-code)"
                    : simCmd === "products"
                      ? "machine (Q-code, e.g. Q00810)"
                      : "state (2-letter, e.g. WA, OR, CA)"}
              </span>
              <input
                className="input py-1.5 font-mono text-xs"
                value={simArg1}
                onChange={(e) => setSimArg1(e.target.value)}
              />
            </label>
            <button className="btn-primary py-1.5 text-xs" disabled={busy !== null} onClick={runSimulator}>
              {busy === "sim" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run /" + simCmd}
            </button>
          </div>

          {simReply && (
            <div className="rounded-xl border border-indigo-500/30 bg-[#2b2d31] p-4 text-sm text-slate-100">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-indigo-300">
                <Bot className="h-4 w-4" /> PackRadar Bot{" "}
                <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">APP</span>
              </div>
              {simReply.data?.content && (
                <p className="whitespace-pre-line text-xs text-slate-200">{simReply.data.content}</p>
              )}
              {simReply.data?.embeds?.map((e, i) => (
                <div
                  key={i}
                  className="mt-2 rounded-lg border-l-4 border-volt bg-[#1e1f22] p-3 text-xs leading-relaxed"
                >
                  {e.title && <p className="font-bold text-white">{e.title}</p>}
                  {e.description && <p className="mt-1 whitespace-pre-line text-slate-300">{e.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Live Feed of Recent Bot Replies Across Connected Pokémon Discord Groups */}
      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-white">
              <Radio className="h-5 w-5 text-green-400" /> Recent Live Bot Answers in Connected Pokémon Discord Servers
            </h2>
            <p className="text-xs text-muted">
              Live examples of the PackRadar bot answering drop time &amp; vended product questions across connected Pokémon TCG Discord channels.
            </p>
          </div>
          <Link href={signedIn ? "/alerts" : "/sign-up?next=%2Fdiscord"} className="btn-primary py-1.5 text-xs font-bold">
            {signedIn ? "Manage Alerts →" : "Create Free Account →"}
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {(config.recentOutreachPosts ?? []).slice(0, 6).map((post) => (
            <div
              key={post.id}
              className="rounded-xl border border-line bg-[#2b2d31]/85 p-4 text-xs space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-indigo-300 truncate">
                  {post.guildName} · <code className="text-volt">#{post.channel}</code>
                </span>
                <span className="shrink-0 rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-300">
                  {post.region}
                </span>
              </div>
              <div className="rounded-lg bg-[#1e1f22] px-3 py-2 text-[11px] text-slate-300">
                <span className="font-bold text-slate-400">@collector:</span> &ldquo;{post.triggerPrompt}&rdquo;
              </div>
              <p className="whitespace-pre-line text-slate-200 leading-relaxed">
                <b className="text-volt">🤖 PackRadar Bot:</b> {post.conversationalReply}
              </p>
              <div className="flex items-center justify-between pt-1 text-[11px] text-muted">
                <span>{new Date(post.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                <Link href={post.targetUrl.replace(/^https?:\/\/[^/]+/, "") || "/map"} className="font-bold text-volt hover:underline">
                  Open Target Page →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Connected Pokémon Discord Groups + Connect Webhook + Passive Harvester */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              Connected Pokémon Discord Groups ({config.connectedGuilds.length})
            </h2>
          </div>
          <ul className="divide-y divide-line text-sm">
            {config.connectedGuilds.map((g) => (
              <li key={g.guildId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold text-white">{g.guildName}</p>
                  <p className="text-xs text-muted">
                    {g.region} · <code className="text-volt">#{g.channelName || "vending-chat"}</code>
                    {g.memberCountEstimate ? ` · ~${g.memberCountEstimate.toLocaleString()} members` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="chip border-indigo-400/30 text-indigo-300 text-xs">
                    {g.outreachPostsCount ?? 10} bot replies
                  </span>
                  <span className="chip border-green-500/30 text-green-300 text-xs">
                    {g.harvestedCount} drops harvested
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-line pt-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-white">
              Connect a Pokémon Discord Server / Channel Webhook
            </p>
            <p className="text-[11px] text-muted">
              Paste a Discord Channel Webhook URL (Server Settings → Integrations → Webhooks) and our worker will
              automatically post live regional vending drops &amp; restock updates into your channel!
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="input py-1.5 text-xs"
                placeholder="Discord Server Name"
                value={guildName}
                onChange={(e) => setGuildName(e.target.value)}
              />
              <input
                className="input py-1.5 text-xs"
                placeholder="Region / State (e.g. WA, TX)"
                value={guildRegion}
                onChange={(e) => setGuildRegion(e.target.value)}
              />
              <input
                className="input py-1.5 font-mono text-xs"
                placeholder="#channel (e.g. restocks)"
                value={guildChannel}
                onChange={(e) => setGuildChannel(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className="input flex-1 py-1.5 font-mono text-xs"
                placeholder="Optional Discord Webhook URL (https://discord.com/api/webhooks/...)"
                value={guildWebhook}
                onChange={(e) => setGuildWebhook(e.target.value)}
              />
              {config.inviteMode === "code_gated" && (
                <input
                  className="input w-36 py-1.5 font-mono text-xs"
                  placeholder="Invite passcode"
                  value={guildInviteCode}
                  onChange={(e) => setGuildInviteCode(e.target.value)}
                />
              )}
              <button className="btn-primary py-1.5 text-xs font-bold" disabled={busy !== null} onClick={registerGuild}>
                + Connect Discord Group
              </button>
            </div>
          </div>
        </div>

        {isStaff && (
          <div className="space-y-6">
            <div className="card space-y-4 border-volt/40 p-6">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-volt" />
                <h2 className="text-lg font-bold text-white">Admin: Passive Discord Channel Harvester</h2>
              </div>
              <p className="text-xs text-muted">
                When invited with <b className="text-white">Full Harvester</b> permissions, the bot watches{" "}
                <code className="text-white">#{config.autoHarvestChannels[0] ?? "vending-chat"}</code>, extracts Q-codes
                &amp; minute marks from natural chat messages, and updates PackRadar:
              </p>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <span className="inline-flex items-center rounded-lg border border-line bg-panel-2 px-3 font-mono text-xs text-muted">
                    #{harvestChannel}
                  </span>
                  <input
                    className="input font-mono text-xs"
                    placeholder="Channel name"
                    value={harvestChannel}
                    onChange={(e) => setHarvestChannel(e.target.value)}
                  />
                </div>
                <textarea
                  rows={3}
                  className="input text-xs"
                  value={harvestText}
                  onChange={(e) => setHarvestText(e.target.value)}
                />
                <button className="btn-green w-full text-xs font-bold" disabled={busy !== null} onClick={runHarvest}>
                  {busy === "harvest" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquarePlus className="h-4 w-4" />
                  )}{" "}
                  Harvest Discord Message Into PackRadar DB (Admin)
                </button>
              </div>
            </div>

            <div className="card space-y-4 border-volt/40 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-volt" />
                  <h2 className="text-base font-bold text-white">Admin Bot Credentials &amp; Sync</h2>
                </div>
                <button className="btn-ghost py-1 text-xs" disabled={busy !== null} onClick={registerCommands}>
                  {busy === "reg" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5 text-volt" />
                  )}
                  Sync Slash Commands
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  className="input font-mono text-xs"
                  placeholder="Discord Application Client ID"
                  value={config.clientId}
                  onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                />
                <button
                  className="btn-ghost shrink-0 text-xs"
                  onClick={() =>
                    updateConfig({ clientId: config.clientId }, "Updated Discord Client ID & OAuth2 URL")
                  }
                >
                  Save ID
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
