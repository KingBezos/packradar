"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2, Mail, Ticket } from "lucide-react";

export function ReleaseNewsAlertBanner({
  currentPath = "/news",
  compact = false,
}: {
  currentPath?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [statusAll, setStatusAll] = useState<"idle" | "loading" | "saved" | "limit_reached">("idle");
  const [statusLotteries, setStatusLotteries] = useState<"idle" | "loading" | "saved" | "limit_reached">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function subscribe(
    keyword: "ALL_RELEASE_NEWS" | "ONLINE_LOTTERIES",
    setter: (v: "idle" | "loading" | "saved" | "limit_reached") => void,
  ) {
    setter("loading");
    setErrorMsg(null);
    const returnPath = currentPath.includes("?")
      ? `${currentPath}&autoGlobalAlert=${keyword}`
      : `${currentPath}?autoGlobalAlert=${keyword}`;
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "news",
          keyword,
          leadMinutes: 10,
          channels: ["email", "push"],
        }),
      });
      if (res.status === 401) {
        router.push(`/sign-up?next=${encodeURIComponent(returnPath)}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        if (data.error && /limit reached/i.test(data.error)) {
          setter("limit_reached");
          setErrorMsg(data.error);
          return;
        }
        router.push(`/sign-up?next=${encodeURIComponent(returnPath)}`);
        return;
      }
      setter("saved");
    } catch {
      router.push(`/sign-up?next=${encodeURIComponent(returnPath)}`);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const auto = params.get("autoGlobalAlert");
    if (auto === "ALL_RELEASE_NEWS" && statusAll === "idle") {
      void subscribe("ALL_RELEASE_NEWS", setStatusAll);
    } else if (auto === "ONLINE_LOTTERIES" && statusLotteries === "idle") {
      void subscribe("ONLINE_LOTTERIES", setStatusLotteries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-400/35 bg-indigo-500/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-200">
          <Ticket className="h-4 w-4 shrink-0 text-volt" />
          <span>
            Want <b className="text-white">every release announcement, Walmart/Target/Amazon online lottery &amp; queue drop</b> sent straight to your email?
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => subscribe("ALL_RELEASE_NEWS", setStatusAll)}
            className={
              statusAll === "saved"
                ? "inline-flex items-center gap-1.5 rounded-lg border border-green-500/50 bg-green-500/20 px-3 py-1.5 text-xs font-bold text-green-300"
                : "inline-flex items-center gap-1.5 rounded-lg bg-volt px-3 py-1.5 text-xs font-black text-slate-950 transition hover:brightness-110"
            }
          >
            {statusAll === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : statusAll === "saved" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            <span>
              {statusAll === "saved"
                ? "Subscribed to All Release & Lottery Emails!"
                : "Email Me All Release News & Lotteries"}
            </span>
          </button>
          {statusAll === "limit_reached" && (
            <Link href="/alerts" className="text-xs font-bold text-amber-300 underline">
              Max alerts reached (Manage) →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-volt/50 bg-gradient-to-r from-volt/15 via-panel to-indigo-950/40 p-5 shadow-lg shadow-black/25">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-slate-950">
              <Ticket className="h-3 w-3" /> All-Access Release &amp; Lottery Radar
            </span>
            <span className="rounded-full border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-bold text-indigo-200">
              Instant Email + Push Delivery
            </span>
          </div>
          <h2 className="text-base font-black text-white sm:text-lg">
            Never Miss an Online Lottery, Virtual Queue, or Major Pokémon TCG Release
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
            Get instant email alerts whenever <b className="text-white">Walmart+, Target, Amazon Invite-Only, Pokémon Center, Best Buy, or Sam&apos;s Club/Costco</b> open online collector lotteries, EQL draws, virtual queues, or major allocation waves.
          </p>
          {errorMsg && (
            <p className="pt-1 text-xs font-semibold text-amber-300">
              {errorMsg}{" "}
              <Link href="/alerts" className="underline hover:text-white">
                Manage your active alerts →
              </Link>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => subscribe("ALL_RELEASE_NEWS", setStatusAll)}
            className={
              statusAll === "saved"
                ? "inline-flex items-center justify-center gap-2 rounded-xl border border-green-500/50 bg-green-500/20 px-4 py-2.5 text-xs font-black text-green-300 sm:text-sm"
                : "inline-flex items-center justify-center gap-2 rounded-xl bg-volt px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-volt/15 transition hover:brightness-110 sm:text-sm"
            }
          >
            {statusAll === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : statusAll === "saved" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            <span>
              {statusAll === "saved"
                ? "All Release & Lottery Emails Active!"
                : "Email Me All Release News & Lotteries"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => subscribe("ONLINE_LOTTERIES", setStatusLotteries)}
            className={
              statusLotteries === "saved"
                ? "inline-flex items-center justify-center gap-1.5 rounded-xl border border-green-500/50 bg-green-500/20 px-3.5 py-2.5 text-xs font-bold text-green-300"
                : "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-xs font-bold text-slate-200 transition hover:border-volt/50 hover:text-volt"
            }
          >
            {statusLotteries === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : statusLotteries === "saved" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5 text-volt" />
            )}
            <span>
              {statusLotteries === "saved"
                ? "Lottery Alerts Active!"
                : "Online Lotteries & Queues Only"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
