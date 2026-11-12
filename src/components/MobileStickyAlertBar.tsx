"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Bell, CheckCircle2, Sparkles, X, Zap } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { getStoredReferralCode } from "./ReferralTracker";

const STICKY_DISMISS_KEY = "pr_mobile_sticky_dismissed_v1";

function MobileStickyInner() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [zipInput, setZipInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successHandle, setSuccessHandle] = useState<string | null>(null);

  const isTargetPage =
    pathname.startsWith("/search") ||
    pathname.startsWith("/map") ||
    pathname.startsWith("/machines/") ||
    pathname.startsWith("/locations") ||
    pathname.startsWith("/drops");

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STICKY_DISMISS_KEY) === "1") {
        setDismissed(true);
      }
    } catch {}
  }, []);

  const qParam = (searchParams?.get("q") || searchParams?.get("zip") || "").trim();
  const machineMatch = pathname.match(/^\/machines\/([A-Za-z0-9_-]+)/);
  const machineId = machineMatch ? machineMatch[1] : undefined;

  useEffect(() => {
    if (/^\d{5}$/.test(qParam)) {
      setZipInput(qParam);
    }
  }, [qParam]);

  if (!isTargetPage || dismissed) return null;

  let barTitle = "Get Drop Alerts for This Area";
  let barSubtitle = "10m pre-drop emails + Target/Walmart lotteries";
  if (qParam) {
    barTitle = `Get Drop Alerts for ${qParam}`;
    barSubtitle = "Unlock all exact :XX timers + lottery links";
  } else if (machineId) {
    barTitle = `Get 10-Min Alerts for ${machineId}`;
    barSubtitle = "Plus nearby machines & online lotteries";
  }

  const handleDismiss = () => {
    setDismissed(true);
    setExpanded(false);
    try {
      sessionStorage.setItem(STICKY_DISMISS_KEY, "1");
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const cleanZip = /^\d{5}$/.test(zipInput.trim())
        ? zipInput.trim()
        : /^\d{5}$/.test(qParam)
          ? qParam
          : undefined;

      const r = await fetch("/api/alerts/instant-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          zip: cleanZip,
          locationLabel: cleanZip ? `ZIP ${cleanZip}` : qParam || undefined,
          machineId,
          ref: getStoredReferralCode() ?? undefined,
          lotteryOnly: !cleanZip && !machineId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to enable alerts");
      setSuccessHandle(j.handle || "Spotter");
      if (j.signedIn) {
        setTimeout(() => {
          router.refresh();
        }, 900);
      }
    } catch (eObj) {
      setErr((eObj as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    const fullUrl =
      pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    await signIn.social({ provider: "google", callbackURL: fullUrl });
  };

  return (
    <>
      {/* Spacer so sticky bottom bar never overlaps bottom content on mobile */}
      <div className="h-16 md:hidden" aria-hidden />

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-volt/45 bg-slate-950/95 px-3.5 py-2.5 shadow-2xl shadow-black backdrop-blur-xl md:hidden">
        {successHandle ? (
          <div className="flex items-center justify-between gap-2 py-1">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Welcome @{successHandle}! Alerts active &amp; timers unlocked.</span>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded p-1 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : !expanded ? (
          <div className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-volt text-slate-950 shadow">
                <Bell className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-white">{barTitle}</p>
                <p className="truncate text-[11px] text-slate-300">{barSubtitle}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-volt px-3 py-2 text-xs font-black text-slate-950 shadow transition hover:brightness-110"
            >
              <Zap className="h-3.5 w-3.5" /> Free Alerts
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Dismiss alert bar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 py-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-black text-volt">
                <Sparkles className="h-3.5 w-3.5" /> {barTitle} (100% Free)
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
                aria-label="Collapse"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address…"
                  className="input flex-1 border-volt/40 bg-slate-900 py-2 text-sm text-white"
                />
                {!qParam && !machineId && (
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={zipInput}
                    onChange={(e) => setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="ZIP"
                    className="input w-20 border-line bg-slate-900 py-2 text-center font-mono text-sm text-white"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full justify-center py-2.5 text-xs font-black"
              >
                <Zap className="h-3.5 w-3.5" />
                {busy ? "Activating…" : "Unlock All Timers & Activate Alerts"}
              </button>
            </form>

            {err && <p className="text-[11px] font-semibold text-red-400">{err}</p>}

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <button
                type="button"
                onClick={handleGoogle}
                className="font-bold text-white underline decoration-slate-500 underline-offset-2"
              >
                Or continue with Google
              </button>
              <Link
                href={`/sign-in?next=${encodeURIComponent(pathname)}`}
                className="font-semibold text-volt hover:underline"
              >
                Already joined? Sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function MobileStickyAlertBar() {
  return (
    <Suspense fallback={null}>
      <MobileStickyInner />
    </Suspense>
  );
}
