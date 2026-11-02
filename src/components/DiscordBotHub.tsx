"use client";

import { useEffect, useState } from "react";
import { Bot, Check, Copy, ExternalLink, Loader2, MessageSquarePlus, Shield, Sparkles, Terminal, Zap } from "lucide-react";
import clsx from "clsx";
import type { DiscordBotConfig } from "@/app/api/discord/control/route";

type SlashReply = {
  type: number;
  data?: {
    content?: string;
    embeds?: { title?: string; description?: string; color?: number }[];
  };
};

export function DiscordBotHub() {
  const [config, setConfig] = useState<DiscordBotConfig | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Simulator state
  const [simCmd, setSimCmd] = useState<"drop" | "dropped" | "nodrop" | "corridor">("drop");
  const [simArg1, setSimArg1] = useState("97045");
  const [simArg2, setSimArg2] = useState("42");
  const [simReply, setSimReply] = useState<SlashReply | null>(null);

  // Passive Harvester test state
  const [harvestText, setHarvestText] = useState(
    "Just left Safeway Gladstone (Q01124) — machine dropped 151 bundles at the :42 minute mark!",
  );
  const [harvestChannel, setHarvestChannel] = useState("pnw-drops");

  // Guild onboarding form
  const [guildName, setGuildName] = useState("");
  const [guildRegion, setGuildRegion] = useState("");
  const [guildInviteCode, setGuildInviteCode] = useState("");

  useEffect(() => {
    fetch("/api/discord/control")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config);
        setInviteUrl(d.inviteUrl);
      });
  }, []);

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
        simCmd === "drop"
          ? [{ name: "query", value: simArg1 }]
          : simCmd === "dropped"
            ? [
                { name: "machine", value: simArg1 },
                ...(simArg2 ? [{ name: "minute", value: Number(simArg2) }] : []),
              ]
            : simCmd === "nodrop"
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
            inviteCode: guildInviteCode,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register server");
      setConfig(data.config);
      setGuildName("");
      setGuildRegion("");
      setFeedback({ ok: true, text: `Connected server "${guildName}" to PackRadar network!` });
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!config) {
    return (
      <div className="card flex items-center gap-3 p-8 text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-volt" /> Loading Discord Bot Control Center...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner + Auto-Invite Link */}
      <div className="card relative overflow-hidden border-indigo-500/30 bg-gradient-to-br from-indigo-950/50 via-panel to-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300 ring-1 ring-indigo-400/30">
              <Bot className="h-3.5 w-3.5" /> PackRadar Discord Bot & Auto-Harvester
            </span>
            <h1 className="text-2xl font-black text-white sm:text-3xl">
              Turn Local Discord Servers Into Live Drop Sensors
            </h1>
            <p className="text-sm text-muted">
              Server members get free live countdown embeds (<code className="text-white">/drop 97045</code>,{" "}
              <code className="text-white">/corridor OR</code>), while every{" "}
              <code className="text-white">/dropped</code> command and restock channel message automatically feeds
              PackRadar&apos;s consensus engine.
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
              <ExternalLink className="h-4 w-4" /> Invite Bot to Discord
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
              {copied ? "Copied OAuth2 Link" : "Copy Invite URL"}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-slate-950/70 p-3 font-mono text-xs text-slate-300">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{inviteUrl}</span>
            <span className="shrink-0 rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-300">
              {config.permissionPreset === "full_harvester" ? "Slash + Passive Harvester" : "Slash Commands Only"}
            </span>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Auto-Invite & Permissions Controller */}
        <div className="card space-y-5 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-volt" />
              <h2 className="text-lg font-bold text-white">Auto-Invite & Access Control</h2>
            </div>
            <button className="btn-ghost py-1.5 text-xs" disabled={busy !== null} onClick={registerCommands}>
              {busy === "reg" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-volt" />}
              Sync Slash Commands
            </button>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Discord Application Client ID
              </label>
              <div className="flex gap-2">
                <input
                  className="input font-mono text-xs"
                  value={config.clientId}
                  onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                />
                <button
                  className="btn-ghost shrink-0"
                  onClick={() => updateConfig({ clientId: config.clientId }, "Updated Discord Client ID & OAuth2 URL")}
                >
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Server Invite Policy
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["open", "🟢 Open Auto-Join", "Any collector server can invite"],
                    ["code_gated", "🔒 Code Gated", "Requires invite code"],
                    ["paused", "⏸️ Paused", "Auto-leaves new servers"],
                  ] as const
                ).map(([mode, title, sub]) => (
                  <button
                    key={mode}
                    onClick={() => updateConfig({ inviteMode: mode }, `Invite mode set to ${title}`)}
                    className={clsx(
                      "rounded-xl border p-3 text-left transition",
                      config.inviteMode === mode
                        ? "border-volt bg-volt/10 text-white"
                        : "border-line bg-panel-2 text-muted hover:text-white",
                    )}
                  >
                    <div className="text-xs font-bold">{title}</div>
                    <div className="mt-0.5 text-[11px] opacity-80">{sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {config.inviteMode === "code_gated" && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Required Invite Passcode
                </label>
                <div className="flex gap-2">
                  <input
                    className="input font-mono text-xs"
                    value={config.inviteCode}
                    onChange={(e) => setConfig({ ...config, inviteCode: e.target.value })}
                  />
                  <button
                    className="btn-ghost"
                    onClick={() => updateConfig({ inviteCode: config.inviteCode }, "Updated invite passcode")}
                  >
                    Update
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                OAuth2 Permission Scope Preset
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    updateConfig(
                      { permissionPreset: "full_harvester" },
                      "Switched OAuth2 URL to Full Harvester (Slash + Read Restock Channels)",
                    )
                  }
                  className={clsx(
                    "rounded-xl border p-3 text-left",
                    config.permissionPreset === "full_harvester"
                      ? "border-indigo-400 bg-indigo-500/15 text-white"
                      : "border-line bg-panel-2 text-muted",
                  )}
                >
                  <div className="text-xs font-bold">📡 Full Harvester (Recommended)</div>
                  <div className="mt-0.5 text-[11px] opacity-80">
                    Slash commands + passively reads #restocks / #vending-drops messages
                  </div>
                </button>
                <button
                  onClick={() =>
                    updateConfig({ permissionPreset: "slash_only" }, "Switched OAuth2 URL to Slash Commands Only")
                  }
                  className={clsx(
                    "rounded-xl border p-3 text-left",
                    config.permissionPreset === "slash_only"
                      ? "border-indigo-400 bg-indigo-500/15 text-white"
                      : "border-line bg-panel-2 text-muted",
                  )}
                >
                  <div className="text-xs font-bold">⚡ Slash Commands Only</div>
                  <div className="mt-0.5 text-[11px] opacity-80">
                    Minimal permissions: only responds when users type /drop or /dropped
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Auto-Harvest Channel Names (comma-separated)
              </label>
              <div className="flex gap-2">
                <input
                  className="input font-mono text-xs"
                  value={config.autoHarvestChannels.join(", ")}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      autoHarvestChannels: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <button
                  className="btn-ghost shrink-0"
                  onClick={() =>
                    updateConfig(
                      { autoHarvestChannels: config.autoHarvestChannels },
                      "Saved auto-harvest channel filter",
                    )
                  }
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Slash Command Simulator */}
        <div className="card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Live Slash Command Simulator</h2>
          </div>
          <p className="text-xs text-muted">
            Test how the bot responds inside Discord servers and how <code className="text-white">/dropped</code>{" "}
            updates PackRadar&apos;s live database immediately.
          </p>

          <div className="flex flex-wrap gap-2">
            {(["drop", "dropped", "nodrop", "corridor"] as const).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setSimCmd(c);
                  if (c === "drop") setSimArg1("97045");
                  if (c === "dropped" || c === "nodrop") setSimArg1("Q01124");
                  if (c === "corridor") setSimArg1("OR");
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
                {simCmd === "drop"
                  ? "query (ZIP, city, or Q-code)"
                  : simCmd === "corridor"
                    ? "state (2-letter)"
                    : "machine (Q-code)"}
              </span>
              <input
                className="input py-1.5 font-mono text-xs"
                value={simArg1}
                onChange={(e) => setSimArg1(e.target.value)}
              />
            </label>
            {simCmd === "dropped" && (
              <label className="w-28">
                <span className="mb-1 block font-mono text-[11px] text-muted">minute (0-59)</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  className="input py-1.5 font-mono text-xs"
                  value={simArg2}
                  onChange={(e) => setSimArg2(e.target.value)}
                />
              </label>
            )}
            <button className="btn-primary py-1.5" disabled={busy !== null} onClick={runSimulator}>
              {busy === "sim" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run /" + simCmd}
            </button>
          </div>

          {simReply && (
            <div className="rounded-xl border border-indigo-500/30 bg-[#2b2d31] p-4 text-sm text-slate-100">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-indigo-300">
                <Bot className="h-4 w-4" /> PackRadar Bot <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">APP</span>
              </div>
              {simReply.data?.content && <p className="whitespace-pre-line text-xs">{simReply.data.content}</p>}
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

      {/* Passive Channel Harvester + Connected Servers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-volt" />
            <h2 className="text-lg font-bold text-white">Passive Discord Channel Harvester</h2>
          </div>
          <p className="text-xs text-muted">
            When invited with <b className="text-white">Full Harvester</b> permissions, the bot watches{" "}
            <code className="text-white">#{config.autoHarvestChannels[0] ?? "restocks"}</code> and automatically extracts
            stores, Q-codes, and minute marks from natural chat messages. Test it below:
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
            <button className="btn-green w-full" disabled={busy !== null} onClick={runHarvest}>
              {busy === "harvest" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-4 w-4" />
              )}{" "}
              Harvest Message Into PackRadar DB
            </button>
          </div>
        </div>

        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Connected Collector Servers ({config.connectedGuilds.length})</h2>
          </div>
          <ul className="divide-y divide-line text-sm">
            {config.connectedGuilds.map((g) => (
              <li key={g.guildId} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-semibold text-white">{g.guildName}</p>
                  <p className="text-xs text-muted">{g.region}</p>
                </div>
                <span className="chip border-green-500/30 text-green-300">
                  {g.harvestedCount} drops harvested
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Register Partner Server / Webhook
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="input py-1.5 text-xs"
                placeholder="Server name"
                value={guildName}
                onChange={(e) => setGuildName(e.target.value)}
              />
              <input
                className="input py-1.5 text-xs"
                placeholder="Region (e.g. PNW, TX)"
                value={guildRegion}
                onChange={(e) => setGuildRegion(e.target.value)}
              />
              {config.inviteMode === "code_gated" && (
                <input
                  className="input py-1.5 font-mono text-xs"
                  placeholder="Invite passcode"
                  value={guildInviteCode}
                  onChange={(e) => setGuildInviteCode(e.target.value)}
                />
              )}
              <button className="btn-ghost py-1.5 text-xs" disabled={busy !== null} onClick={registerGuild}>
                + Connect Server
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
