"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Gift,
  LockOpen,
  Sparkles,
  Ticket,
  Zap,
} from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { getStoredReferralCode } from "./ReferralTracker";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
      />
      <path
        fill="#34A853"
        d="M3.6 7.4l3.2 2.4C7.7 7.6 9.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.6 7.4z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.5c2.5 0 4.7-.8 6.3-2.3l-2.9-2.4c-.8.6-1.9 1-3.4 1-3.8 0-5.2-2.5-5.5-3.8l-3.2 2.5c1.5 3 4.7 5 8.7 5z"
      />
      <path
        fill="#4285F4"
        d="M21.1 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.3-1.1 2.4-2.1 3.1l2.9 2.4c1.7-1.6 2.8-4 2.8-7.8z"
      />
    </svg>
  );
}

export function InstantZipAlertBanner({
  query,
  locationLabel,
  lat,
  lng,
  machineCount,
  signedIn,
  userHandle,
}: {
  query: string;
  locationLabel?: string | null;
  lat?: number | null;
  lng?: number | null;
  machineCount: number;
  signedIn: boolean;
  userHandle?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{
    handle: string;
    existingLoggedOutAccount?: boolean;
    referralUrl?: string;
  } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const cleanZip = /^\d{5}$/.test(query.trim()) ? query.trim() : undefined;
  const displayArea =
    locationLabel && cleanZip && !locationLabel.includes(cleanZip)
      ? `${locationLabel} (${cleanZip})`
      : locationLabel || (query ? query : "your area");

  // Listen for clicks on soft-gated MachineCards (#instant-zip-capture) to focus input smoothly
  useEffect(() => {
    const onFocusCapture = () => {
      inputRef.current?.focus();
    };
    window.addEventListener("packradar:focus-zip-capture", onFocusCapture);
    return () => window.removeEventListener("packradar:focus-zip-capture", onFocusCapture);
  }, []);

  const submitInstantAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/alerts/instant-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signedIn ? undefined : email.trim(),
          zip: cleanZip,
          locationLabel: displayArea,
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          ref: getStoredReferralCode() ?? undefined,
          lotteryOnly: machineCount === 0,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not activate alerts");
      setDone({
        handle: j.handle || userHandle || "Spotter",
        existingLoggedOutAccount: Boolean(j.existingLoggedOutAccount),
        referralUrl: j.referralUrl,
      });
      if (j.signedIn) {
        router.refresh();
      }
    } catch (errObj) {
      setErr((errObj as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleOneTap = async () => {
    setGoogleBusy(true);
    setErr(null);
    const callbackURL = query ? `/search?q=${encodeURIComponent(query)}` : "/search";
    const res = await signIn.social({ provider: "google", callbackURL });
    if (res?.error) {
      setGoogleBusy(false);
      setErr(res.error.message ?? "Google sign-in unavailable — enter your email above for 1-click access!");
    }
  };

  const copyInviteLink = (relUrl?: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://packradar.onrender.com";
    const full = `${origin}${relUrl || `/?ref=${encodeURIComponent(done?.handle || userHandle || "")}`}`;
    navigator.clipboard?.writeText(full);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2200);
  };

  // ── Success State ──
  if (done) {
    return (
      <div
        id="instant-zip-capture"
        className="mt-5 rounded-2xl border border-emerald-400/50 bg-gradient-to-r from-emerald-500/15 via-panel to-yellow-500/10 p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-base font-black text-white">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              {done.existingLoggedOutAccount
                ? `Alerts added for ${displayArea}!`
                : `You're in, @${done.handle}! All ${machineCount > 0 ? `${machineCount} live drop timers & ` : ""}alerts are active.`}
            </p>
            <p className="text-xs text-slate-300 sm:text-sm">
              {done.existingLoggedOutAccount ? (
                <>
                  We activated local drop &amp; online lottery alerts on your account.{" "}
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(query ? `/search?q=${query}` : "/search")}`}
                    className="font-bold text-volt underline"
                  >
                    Sign in here to unlock all live `:XX` timers →
                  </Link>
                </>
              ) : machineCount > 0 ? (
                <>
                  We&apos;ll email you <b>10 minutes before drops near {displayArea}</b> plus instant{" "}
                  <b>Target, Walmart, Pokémon Center &amp; Costco</b> online lottery links.
                </>
              ) : (
                <>
                  We&apos;ll email you immediately when <b>Target, Walmart, Pokémon Center, Sam&apos;s Club &amp; Costco</b>{" "}
                  online lotteries or queues go live — and the moment a vending kiosk is added near <b>{displayArea}</b>!
                </>
              )}
            </p>
          </div>
          {!done.existingLoggedOutAccount && (
            <button
              type="button"
              onClick={() => copyInviteLink(done.referralUrl)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-volt px-3.5 py-2 text-xs font-extrabold text-slate-950 transition hover:brightness-110"
            >
              {copiedInvite ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedInvite ? "Invite Link Copied!" : "Copy Invite Link (+25 Rep / Friend)"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Already Signed-In State ──
  if (signedIn) {
    return (
      <div
        id="instant-zip-capture"
        className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-volt/35 bg-gradient-to-r from-yellow-500/10 via-panel to-panel p-4"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-volt/20 text-volt">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">
              {machineCount > 0
                ? `Want 10-min pre-drop emails for all ${machineCount} machines near ${displayArea} + online lotteries?`
                : `No vending kiosks near ${displayArea} yet — activate Target, Walmart & Pokémon Center online lottery alerts!`}
            </p>
            <p className="text-xs text-muted">
              1 tap adds {displayArea} + Target/Walmart/Pokémon Center release &amp; lottery alerts to @{userHandle}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => submitInstantAlert()}
            className="btn-primary py-2 text-xs font-extrabold"
          >
            <Zap className="h-3.5 w-3.5" />
            {busy ? "Activating…" : machineCount > 0 ? `Watch ${displayArea} (1-Click)` : "Get Online Lottery Alerts"}
          </button>
          <Link
            href="/alerts"
            className="btn-ghost border-line py-2 text-xs font-semibold text-slate-300 hover:text-white"
          >
            <Gift className="h-3.5 w-3.5 text-volt" /> Invite Friends (+25 Rep)
          </Link>
        </div>
      </div>
    );
  }

  // ── Logged-Out Zero-Machines State (NY, FL, PA, NJ, etc.) ──
  if (machineCount === 0) {
    return (
      <div
        id="instant-zip-capture"
        className="mt-6 rounded-2xl border border-volt/45 bg-gradient-to-br from-yellow-500/15 via-panel to-sky-500/10 p-6 shadow-xl"
      >
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-slate-950">
              <Ticket className="h-3.5 w-3.5" /> Online Lottery &amp; Retail Restock Radar
            </span>
            <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-200">
              No Official Vending Kiosks Near {displayArea} Yet
            </span>
          </div>

          <h2 className="text-xl font-black text-white sm:text-2xl">
            No kiosks in {displayArea} yet — get instant{" "}
            <span className="text-volt">Target, Walmart, Pokémon Center &amp; Costco</span> online drop alerts!
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Pokémon Center hasn&apos;t installed grocery kiosks near <b className="text-white">{displayArea}</b> yet,
            but collectors in your state catch MSRP ETBs &amp; Booster Bundles through{" "}
            <b className="text-white">online lotteries, virtual queues, and flash retail restocks</b>. Enter your email
            — <b className="text-volt">1 click</b> alerts you the moment online drops go live <i>and</i> notifies you if
            a kiosk opens near {displayArea}.
          </p>

          <form onSubmit={submitInstantAlert} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              ref={inputRef}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email for 1-click lottery & restock alerts…"
              className="input flex-1 border-volt/40 bg-slate-950/90 py-3 text-sm text-white placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="btn-primary justify-center px-5 py-3 text-sm font-black shadow-lg shadow-yellow-500/15"
            >
              <Zap className="h-4 w-4" />
              {busy ? "Activating…" : "Get Instant Lottery Alerts"}
            </button>
            <button
              type="button"
              disabled={googleBusy}
              onClick={handleGoogleOneTap}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-extrabold text-slate-950 shadow transition hover:bg-slate-100 disabled:opacity-50"
            >
              <GoogleIcon />
              Google
            </button>
          </form>
          {err && <p className="text-xs font-semibold text-red-400">{err}</p>}
          <p className="text-[11px] text-slate-400">
            ✓ 100% free · Instant account creation · Unsubscribe anytime in 1 click
          </p>
        </div>
      </div>
    );
  }

  // ── Logged-Out Standard Search Results State (Machines Found!) ──
  const lockedCount = Math.max(0, machineCount - 1);
  return (
    <div
      id="instant-zip-capture"
      className="mt-5 rounded-2xl border border-volt/45 bg-gradient-to-r from-yellow-500/15 via-panel to-emerald-500/10 p-4 shadow-lg sm:p-5"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
              <Sparkles className="h-3 w-3" /> 1-Click Free Unlock
            </span>
            {lockedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                <LockOpen className="h-3 w-3" /> Instantly unlocks all {machineCount} exact `:XX` timers below
              </span>
            )}
          </div>
          <Link
            href={`/sign-in?next=${encodeURIComponent(query ? `/search?q=${query}` : "/search")}`}
            className="text-xs font-semibold text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-volt"
          >
            Already a member? Sign in
          </Link>
        </div>

        <p className="text-sm font-extrabold leading-snug text-white sm:text-base">
          🔔 Want a heads-up 10 min before {machineCount === 1 ? "this machine" : `these ${machineCount} machines`} near{" "}
          <span className="text-volt">{displayArea}</span> drop + Target/Walmart lottery links?{" "}
          <span className="text-slate-200 font-semibold">Enter your email — 1 click.</span>
        </p>

        <form onSubmit={submitInstantAlert} className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`Enter your email to watch ${displayArea} & unlock all ${machineCount} timers…`}
            className="input flex-1 border-volt/40 bg-slate-950/90 py-2.5 text-sm text-white placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-primary shrink-0 justify-center px-5 py-2.5 text-xs font-black sm:text-sm"
          >
            <Zap className="h-4 w-4" />
            {busy ? "Unlocking…" : `Unlock All ${machineCount} Timers & Alerts`}
          </button>
          <button
            type="button"
            disabled={googleBusy}
            onClick={handleGoogleOneTap}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-950 shadow transition hover:bg-slate-100 disabled:opacity-50"
            title="1-Click Sign Up with Google"
          >
            <GoogleIcon />
            <span className="sm:hidden">Continue with Google</span>
            <span className="hidden sm:inline">Google</span>
          </button>
        </form>
        {err && <p className="text-xs font-semibold text-red-400">{err}</p>}
      </div>
    </div>
  );
}
