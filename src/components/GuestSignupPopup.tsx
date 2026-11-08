"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Newspaper, MapPin, Trophy, Sparkles, X, ArrowRight, LogIn } from "lucide-react";
import { signIn } from "@/lib/auth-client";

const DISMISS_STORAGE_KEY = "packradar_guest_popup_dismissed_v1";
const DISMISS_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours before auto-showing again if dismissed

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

export function GuestSignupPopup() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [minimizedPill, setMinimizedPill] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const isAuthRoute =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  useEffect(() => {
    if (isAuthRoute) {
      setVisible(false);
      setOpen(false);
      return;
    }

    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (raw) {
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS) {
          setMinimizedPill(true);
          return;
        }
      }
    } catch {}

    let triggered = false;
    const triggerPopup = () => {
      if (triggered) return;
      triggered = true;
      setOpen(true);
      requestAnimationFrame(() => {
        setTimeout(() => setVisible(true), 30);
      });
    };

    const timer = setTimeout(triggerPopup, 4200);
    const onScroll = () => {
      if (window.scrollY > 260) {
        triggerPopup();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isAuthRoute]);

  if (isAuthRoute) return null;

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {}
    setTimeout(() => {
      setOpen(false);
      setMinimizedPill(true);
    }, 350);
  };

  const handleReopenFromPill = () => {
    setMinimizedPill(false);
    setOpen(true);
    requestAnimationFrame(() => {
      setTimeout(() => setVisible(true), 30);
    });
  };

  const saveReturnPath = () => {
    try {
      sessionStorage.setItem("pr_return_to", pathname);
    } catch {}
  };

  const handleGoogleLogin = async () => {
    saveReturnPath();
    setGoogleBusy(true);
    const res = await signIn.social({ provider: "google", callbackURL: pathname });
    if (res?.error) {
      setGoogleBusy(false);
      window.location.href = `/sign-up?next=${encodeURIComponent(pathname)}`;
    }
  };

  const nextQuery = `?next=${encodeURIComponent(pathname)}`;

  return (
    <>
      {/* Minimized floating pill after dismissal so guests can still open it anytime */}
      {minimizedPill && !open && (
        <div className="fixed bottom-4 right-4 z-40 animate-fade-in">
          <button
            type="button"
            onClick={handleReopenFromPill}
            className="group flex items-center gap-2 rounded-full border border-volt/50 bg-slate-950/95 px-4 py-2.5 text-xs font-extrabold text-white shadow-xl shadow-black/60 backdrop-blur-md transition hover:scale-105 hover:border-volt hover:bg-slate-900"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-volt text-slate-950">
              <Bell className="h-3 w-3" />
            </span>
            <span>Get Free Drop &amp; News Alerts</span>
            <span className="rounded-full bg-volt/20 px-2 py-0.5 text-[10px] font-black text-volt">
              Join Free
            </span>
          </button>
        </div>
      )}

      {/* Full Fade-In Enticing Modal Popup */}
      {open && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-500 ease-out ${
            visible ? "bg-black/75 opacity-100 backdrop-blur-sm" : "pointer-events-none bg-black/0 opacity-0"
          }`}
          onClick={handleDismiss}
        >
          <div
            className={`relative w-full max-w-lg overflow-hidden rounded-2xl border border-volt/40 bg-gradient-to-b from-slate-900 via-[#0b1122] to-[#070b16] p-6 shadow-2xl shadow-black/80 transition-all duration-500 ease-out sm:p-7 ${
              visible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-6 scale-95 opacity-0"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-volt/20 blur-3xl" />

            {/* Close button */}
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Close popup"
              className="absolute right-4 top-4 rounded-lg border border-line/80 bg-panel-2/80 p-1.5 text-slate-400 transition hover:border-volt/50 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-volt/40 bg-volt/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-volt">
              <Sparkles className="h-3.5 w-3.5" /> Free Collector Account Perks
            </div>

            {/* Headline */}
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Never Walk Up to a &ldquo;Sold Out&rdquo; Screen Again ⚡
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              Create a free PackRadar account or log in to unlock full live restock tracking, custom drop alerts, and breaking TCG allocation news:
            </p>

            {/* Benefits Grid */}
            <div className="mt-4 space-y-2.5 rounded-xl border border-line/80 bg-slate-950/65 p-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-volt/20 text-volt">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-white">
                    Instant Vending &amp; Retail Restock Alerts
                  </div>
                  <p className="text-slate-300">
                    Get notified 10 minutes before your local machine&apos;s <span className="font-mono text-volt">:XX</span> hourly cooldown unlocks—plus alerts for big-box drops like the <b>$34.98 Sam&apos;s Club 151 &amp; 30th Mini Tins</b>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
                  <Newspaper className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-white">
                    Breaking TCG News, Reprint Waves &amp; Pallet Intel
                  </div>
                  <p className="text-slate-300">
                    Early access to warehouse pallet counts, Prismatic Evolutions &amp; Destined Rivals reprint schedules, and 2026 set release alerts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-white">
                    Save Your Home ZIP &amp; Track Favorite Kiosks
                  </div>
                  <p className="text-slate-300">
                    Automatically load machines near your ZIP code with crowd-confirmed stock checks across 1,923+ kiosks.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                  <Trophy className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-white">
                    Earn Daily Spotter Ranks &amp; Win Monthly TCG Prizes
                  </div>
                  <p className="text-slate-300">
                    Log drops and stock checks to climb from <i>Rookie Spotter</i> to <i>Master Ball Spotter</i> and win free Booster Bundles &amp; ETBs.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={googleBusy}
                onClick={handleGoogleLogin}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-slate-950 shadow-lg transition hover:bg-slate-100 disabled:opacity-60"
              >
                <GoogleIcon />
                {googleBusy ? "Connecting to Google…" : "Continue with Google (1-Click Free Account)"}
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  href={`/sign-up${nextQuery}`}
                  onClick={saveReturnPath}
                  className="btn-primary justify-center py-2.5 text-xs font-extrabold"
                >
                  Create Free Account <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/sign-in${nextQuery}`}
                  onClick={saveReturnPath}
                  className="btn-ghost justify-center border-line bg-panel-2/90 py-2.5 text-xs font-bold text-white hover:border-volt/50"
                >
                  <LogIn className="h-3.5 w-3.5" /> Log In
                </Link>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>✓ 100% Free to join · Includes 2 instant drop alerts</span>
              <button
                type="button"
                onClick={handleDismiss}
                className="font-semibold text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-white"
              >
                Continue as guest
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
