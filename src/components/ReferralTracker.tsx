"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Gift, X } from "lucide-react";

export const REF_STORAGE_KEY = "pr_ref_code";

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
}

function ReferralTrackerInner({ signedIn }: { signedIn: boolean }) {
  const searchParams = useSearchParams();
  const pathname = usePathname() || "/";
  const [bannerRef, setBannerRef] = useState<string | null>(null);

  useEffect(() => {
    const urlRef = (searchParams?.get("ref") || "").trim();
    if (urlRef && urlRef.length <= 64) {
      try {
        localStorage.setItem(REF_STORAGE_KEY, urlRef);
      } catch {}
      if (!signedIn) {
        setBannerRef(urlRef);
      }
      fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: urlRef, claim: signedIn }),
      }).catch(() => {});
      return;
    }

    // Post-OAuth fallback: if user just signed in and had a stored referral code, claim once
    if (signedIn) {
      try {
        const stored = localStorage.getItem(REF_STORAGE_KEY);
        if (stored) {
          localStorage.removeItem(REF_STORAGE_KEY);
          fetch("/api/referrals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ref: stored, claim: true }),
          }).catch(() => {});
        }
      } catch {}
    }
  }, [searchParams, signedIn]);

  if (!bannerRef || signedIn || pathname.startsWith("/sign-up") || pathname.startsWith("/sign-in")) {
    return null;
  }

  return (
    <div className="border-b border-volt/30 bg-gradient-to-r from-yellow-500/15 via-panel to-emerald-500/15 px-4 py-2 text-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-slate-200">
          <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">
            <Gift className="h-3 w-3" /> Spotter Invite
          </span>
          <span>
            Invited by <b className="text-volt">@{bannerRef}</b> — create your free account to claim{" "}
            <b className="text-white">+5 Bonus Rep</b> &amp; unlock all live drop timers!
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/sign-up?next=${encodeURIComponent(pathname)}`}
            className="rounded-lg bg-volt px-2.5 py-1 text-[11px] font-extrabold text-slate-950 hover:brightness-110"
          >
            Claim Invite
          </Link>
          <button
            type="button"
            onClick={() => setBannerRef(null)}
            className="rounded p-1 text-slate-400 hover:text-white"
            aria-label="Dismiss invite banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReferralTracker({ signedIn }: { signedIn: boolean }) {
  return (
    <Suspense fallback={null}>
      <ReferralTrackerInner signedIn={signedIn} />
    </Suspense>
  );
}
