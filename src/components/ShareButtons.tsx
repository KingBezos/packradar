"use client";

import { useState } from "react";
import { Check, Copy, Share2, MessageSquare } from "lucide-react";

const SITE_ORIGIN = "https://packradar.onrender.com";

export function ShareButtons({
  path,
  title,
  summary,
  compact = false,
}: {
  path: string;
  title: string;
  summary?: string;
  compact?: boolean;
}) {
  const [copiedMode, setCopiedMode] = useState<"discord" | "link" | "fb" | null>(null);
  const fullUrl = path.startsWith("http") ? path : `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;

  const discordSnippet = summary
    ? `🚨 **${title}**\n${summary}\n🔗 Live tracker & details: ${fullUrl}`
    : `🚨 **${title}**\n🔗 Live tracker & details: ${fullUrl}`;

  async function copyDiscord(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(discordSnippet);
      setCopiedMode("discord");
      setTimeout(() => setCopiedMode(null), 2500);
    } catch {
      // ignore
    }
  }

  async function copyLink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.share && compact) {
        await navigator.share({ title, text: summary || title, url: fullUrl });
        return;
      }
      await navigator.clipboard.writeText(fullUrl);
      setCopiedMode("link");
      setTimeout(() => setCopiedMode(null), 2500);
    } catch {
      // ignore
    }
  }

  async function shareFacebook(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${title}${summary ? ` — ${summary}` : ""}\n${fullUrl}`);
      setCopiedMode("fb");
      setTimeout(() => setCopiedMode(null), 2500);
    } catch {
      // ignore
    }
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}&quote=${encodeURIComponent(title)}`;
    window.open(fbUrl, "_blank", "noopener,noreferrer,width=640,height=520");
  }

  function shareReddit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(fullUrl)}&title=${encodeURIComponent(title)}`;
    window.open(redditUrl, "_blank", "noopener,noreferrer");
  }

  function shareTwitter(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`🚨 ${title}`)}&url=${encodeURIComponent(fullUrl)}`;
    window.open(xUrl, "_blank", "noopener,noreferrer");
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 pt-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={copyDiscord}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2 py-1 text-[11px] font-bold text-indigo-200 transition hover:bg-indigo-500/25"
          title="Copy formatted alert with link to paste in Discord"
        >
          {copiedMode === "discord" ? <Check className="h-3 w-3 text-green-400" /> : <MessageSquare className="h-3 w-3" />}
          <span>{copiedMode === "discord" ? "Copied for Discord!" : "Discord"}</span>
        </button>
        <button
          type="button"
          onClick={shareFacebook}
          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2 py-1 text-[11px] font-bold text-sky-200 transition hover:bg-sky-500/25"
          title="Share to Facebook & auto-copy caption"
        >
          <span>{copiedMode === "fb" ? "Copied + Opened!" : "Facebook"}</span>
        </button>
        <button
          type="button"
          onClick={shareReddit}
          className="inline-flex items-center gap-1 rounded-lg border border-orange-500/40 bg-orange-500/15 px-2 py-1 text-[11px] font-bold text-orange-200 transition hover:bg-orange-500/25"
          title="Share link on Reddit"
        >
          <span>Reddit</span>
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-volt/50 hover:text-volt"
          title="Copy direct PackRadar link"
        >
          {copiedMode === "link" ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          <span>{copiedMode === "link" ? "Copied!" : "Link"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-volt/30 bg-panel-2/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-volt">
            <Share2 className="h-3.5 w-3.5" /> Share This Drop Intel With Your Local Group
          </p>
          <p className="mt-0.5 text-xs text-slate-300">
            1-click formats the alert + PackRadar link for Discord servers, Facebook TCG groups, Reddit, or X.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyDiscord}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/50 bg-indigo-500/20 px-3 py-1.5 text-xs font-bold text-indigo-100 transition hover:bg-indigo-500/30"
          >
            {copiedMode === "discord" ? <Check className="h-3.5 w-3.5 text-green-400" /> : <MessageSquare className="h-3.5 w-3.5" />}
            <span>{copiedMode === "discord" ? "Copied Discord Alert!" : "Copy for Discord"}</span>
          </button>

          <button
            type="button"
            onClick={shareFacebook}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-xs font-bold text-sky-100 transition hover:bg-sky-500/30"
          >
            <span>{copiedMode === "fb" ? "Copied Caption + Opening FB…" : "Share to Facebook"}</span>
          </button>

          <button
            type="button"
            onClick={shareReddit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-orange-500/50 bg-orange-500/20 px-3 py-1.5 text-xs font-bold text-orange-100 transition hover:bg-orange-500/30"
          >
            <span>Post to Reddit</span>
          </button>

          <button
            type="button"
            onClick={shareTwitter}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-500/20 px-3 py-1.5 text-xs font-bold text-slate-100 transition hover:bg-slate-500/30"
          >
            <span>Post on 𝕏</span>
          </button>

          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-xl border border-volt/50 bg-volt/15 px-3 py-1.5 text-xs font-bold text-volt transition hover:bg-volt/25"
          >
            {copiedMode === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedMode === "link" ? "Link Copied!" : "Copy Link"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
