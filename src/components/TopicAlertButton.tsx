"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2, Sparkles } from "lucide-react";

export function TopicAlertButton({
  topicKeyword,
  path,
  kind = "news",
  retailer,
  compact = false,
  buttonLabel,
}: {
  topicKeyword: string;
  path: string;
  kind?: "news" | "product_restock" | "release";
  retailer?: string;
  compact?: boolean;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "saved" | "limit_reached">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cleanKeyword = topicKeyword.trim().slice(0, 60);
  const returnPath = path.includes("?") ? `${path}&autoAlert=1` : `${path}?autoAlert=1`;

  async function subscribeNow() {
    if (status === "loading" || status === "saved") return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          keyword: cleanKeyword,
          retailer: retailer || undefined,
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
          setStatus("limit_reached");
          setErrorMsg(data.error);
          return;
        }
        router.push(`/sign-up?next=${encodeURIComponent(returnPath)}`);
        return;
      }

      setStatus("saved");
    } catch {
      router.push(`/sign-up?next=${encodeURIComponent(returnPath)}`);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoAlert") === "1" && status === "idle") {
      void subscribeNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void subscribeNow();
  };

  if (compact) {
    if (status === "limit_reached") {
      return (
        <Link
          href="/alerts"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25"
        >
          <Bell className="h-3 w-3" /> Max Alerts Reached (Manage) →
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={handleClick}
        className={
          status === "saved"
            ? "inline-flex items-center gap-1 rounded-lg border border-green-500/50 bg-green-500/20 px-2.5 py-1 text-[11px] font-bold text-green-300 transition"
            : "inline-flex items-center gap-1 rounded-lg border border-volt/60 bg-volt/15 px-2.5 py-1 text-[11px] font-extrabold text-volt transition hover:bg-volt hover:text-slate-950"
        }
        title="Get instant email & push alerts when new SKUs, restocks, or updates drop for this story"
      >
        {status === "loading" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : status === "saved" ? (
          <Check className="h-3 w-3" />
        ) : (
          <Bell className="h-3 w-3" />
        )}
        <span>
          {status === "saved" ? "Alert Saved!" : buttonLabel || "Get Alerts"}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-volt/45 bg-gradient-to-r from-volt/15 via-panel to-panel-2 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-slate-950">
              <Sparkles className="h-3 w-3" /> Live Drop &amp; SKU Alert
            </span>
            <span className="text-xs font-semibold text-slate-300">
              Uses 1 alert slot · Instant Email &amp; Push notification
            </span>
          </div>
          <p className="text-sm font-black text-white sm:text-base">
            Want instant alerts when SKUs, online queues, or store pallets go live for this drop?
          </p>
          <p className="text-xs text-slate-300">
            Track <b className="text-volt">{cleanKeyword}</b> — we&apos;ll ping you as soon as restock updates or SKU
            links drop.
          </p>
          {status === "limit_reached" && errorMsg && (
            <p className="pt-1 text-xs font-semibold text-amber-300">
              {errorMsg}{" "}
              <Link href="/alerts" className="underline hover:text-white">
                Manage your active alerts →
              </Link>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClick}
            className={
              status === "saved"
                ? "inline-flex items-center justify-center gap-2 rounded-xl border border-green-500/50 bg-green-500/20 px-4 py-2.5 text-xs font-black text-green-300 sm:text-sm"
                : "inline-flex items-center justify-center gap-2 rounded-xl bg-volt px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-volt/10 transition hover:brightness-110 sm:text-sm"
            }
          >
            {status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === "saved" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            <span>
              {status === "saved"
                ? "Alert Active for This Drop!"
                : buttonLabel || "Get Alerts for This Drop"}
            </span>
          </button>
          {status === "saved" && (
            <Link
              href="/alerts"
              className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs font-bold text-slate-200 hover:border-volt/50 hover:text-volt"
            >
              View My Alerts →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
