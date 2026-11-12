"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Crown,
  Gift,
  Lock,
  Share2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import type { UserReferralSummary } from "@/lib/referrals";

export function ReferralCard({
  summary,
  compact = false,
}: {
  summary: UserReferralSummary | null;
  compact?: boolean;
}) {
  const [origin, setOrigin] = useState("https://packradar.onrender.com");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  if (!summary) {
    return (
      <div className="card border-volt/40 bg-gradient-to-br from-yellow-500/10 via-panel to-emerald-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-volt/20 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-volt">
              <Users className="h-3.5 w-3.5" /> Hunt With Friends · Unlock Perks
            </span>
            <h3 className="text-lg font-black text-white sm:text-xl">
              Invite 1 Hunting Buddy → Unlock VIP Lottery Alerts, Extra ZIPs &amp; +25 Leaderboard Rep
            </h3>
            <p className="text-xs text-slate-300 sm:text-sm">
              Create your free Spotter account to get your personal invite link. Refer 1 friend for VIP Early Lottery
              Alerts + Multi-Machine Drive Route access (+25 Rep), or refer 3 friends for{" "}
              <b className="text-volt">1 Month of PackRadar Pro Free</b>!
            </p>
          </div>
          <Link href="/sign-up" className="btn-primary shrink-0">
            <Gift className="h-4 w-4" /> Get My Invite Link
          </Link>
        </div>
      </div>
    );
  }

  const inviteUrl = `${origin}/?ref=${encodeURIComponent(summary.referralCode)}`;
  const pct = Math.min(100, Math.round((summary.referredCount / 3) * 100));

  const handleCopy = () => {
    navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleNativeShare = async () => {
    const shareText = `Check exact Pokémon vending machine drop minutes & get 10-min pre-drop + Target/Walmart lottery alerts on PackRadar! Use my invite link for +5 bonus rep:`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "PackRadar – Live Pokémon Vending Drop Timers",
          text: shareText,
          url: inviteUrl,
        });
        return;
      } catch {}
    }
    handleCopy();
  };

  return (
    <div className="card relative overflow-hidden border-volt/40 bg-gradient-to-br from-yellow-500/12 via-panel to-emerald-500/10 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-volt px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-slate-950">
              <Gift className="h-3.5 w-3.5" /> Spotter Referral Rewards
            </span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
              {summary.referredCount} {summary.referredCount === 1 ? "friend" : "friends"} invited · +{summary.totalRepEarned} Rep earned
            </span>
          </div>
          <h3 className="text-xl font-black text-white">
            Unlock Multi-Machine Drive Routes, Extra ZIPs &amp; Free Pro
          </h3>
          <p className="text-xs text-slate-300 sm:text-sm">
            Collectors hunt in packs. Share your personal invite link in your local group chat or Discord — every friend
            who joins earns you <b className="text-volt">+25 Monthly Leaderboard Rep</b> toward sealed Pokémon prizes!
          </p>
        </div>
      </div>

      {/* Personal Invite Link Box */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center justify-between gap-2 rounded-xl border border-line bg-slate-950/80 px-3.5 py-2.5">
          <span className="truncate font-mono text-xs text-volt sm:text-sm">{inviteUrl}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-volt px-3 py-1.5 text-xs font-extrabold text-slate-950 transition hover:brightness-110"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleNativeShare}
          className="btn-ghost justify-center border-volt/40 bg-panel-2 py-2.5 text-xs font-bold text-white hover:border-volt"
        >
          <Share2 className="h-4 w-4 text-volt" /> Share to Group Chat
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-300">
          <span>
            Progress: <b className="text-white">{Math.min(summary.referredCount, 3)} / 3 friends</b>
          </span>
          <span className="text-volt font-semibold">{summary.nextMilestoneLabel}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-900 ring-1 ring-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-volt to-emerald-400 transition-all duration-500"
            style={{ width: `${Math.max(summary.referredCount > 0 ? 12 : 4, pct)}%` }}
          />
        </div>
      </div>

      {/* Two Reward Tiers */}
      {!compact && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div
            className={`rounded-xl border p-3.5 ${
              summary.tier1Unlocked
                ? "border-emerald-400/50 bg-emerald-500/10"
                : "border-line bg-slate-950/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white">
                <Trophy className="h-4 w-4 text-volt" /> Refer 1 Friend
              </span>
              {summary.tier1Unlocked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <Check className="h-3 w-3" /> Unlocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                  <Lock className="h-3 w-3" /> 1 invite needed
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              Unlocks <b className="text-white">VIP Early Lottery Alerts</b>,{" "}
              <b className="text-white">Extra Watched ZIP Radius (+5 alert slots)</b>,{" "}
              <b className="text-white">Multi-Machine Drive Route</b> access, plus{" "}
              <b className="text-volt">+25 Leaderboard Rep</b>.
            </p>
          </div>

          <div
            className={`rounded-xl border p-3.5 ${
              summary.tier3Unlocked
                ? "border-volt/60 bg-volt/15"
                : "border-line bg-slate-950/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white">
                <Crown className="h-4 w-4 text-volt" /> Refer 3 Friends
              </span>
              {summary.tier3Unlocked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2 py-0.5 text-[10px] font-black text-slate-950">
                  <Sparkles className="h-3 w-3" /> {summary.proMonthsBanked} Mo Pro Unlocked!
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                  <Lock className="h-3 w-3" /> {Math.max(0, 3 - summary.referredCount)} more needed
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              Get <b className="text-volt">1 Month of PackRadar Pro Free</b> when Pro launches (instant Pro perks active
              now) + <b className="text-volt">+75 Total Rep</b> toward monthly ETB prizes!
            </p>
          </div>
        </div>
      )}

      {summary.referredFriends.length > 0 && !compact && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
          <span className="font-semibold text-muted">Your squad:</span>
          {summary.referredFriends.slice(0, 8).map((f) => (
            <span
              key={`${f.handle}-${f.createdAt}`}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-emerald-300"
            >
              @{f.handle}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
