"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, LocateFixed, Loader2 } from "lucide-react";
import clsx from "clsx";

export function SearchBox({ compact, initial = "", autoFocus }: { compact?: boolean; initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [locating, setLocating] = useState(false);

  const go = (query: string) => {
    const clean = query.trim();
    if (!clean) return;
    try {
      if (typeof window !== "undefined" && window.location.pathname === "/search") {
        const vid = localStorage.getItem("pr_vid") || "";
        void fetch("/api/analytics/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "/search",
            referrer: document.referrer || "",
            searchQuery: clean,
            clientVisitorId: vid,
            isWebdriver: Boolean(navigator.webdriver),
            screenWidth: window.screen?.width ?? window.innerWidth ?? 0,
          }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
    router.push(`/search?q=${encodeURIComponent(clean)}`);
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        go(`${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`);
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className={clsx("relative flex items-center", !compact && "w-full")}
    >
      <Search className={clsx("pointer-events-none absolute left-3 text-muted", compact ? "h-4 w-4" : "h-5 w-5")} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder={compact ? "ZIP, city, store, Q-code…" : "Search by ZIP, city, store, or machine ID (Q01234)…"}
        className={clsx("input", compact ? "py-1.5 pl-9 pr-9" : "py-4 pl-11 pr-32 text-base")}
        aria-label="Search machines"
      />
      <button
        type="button"
        onClick={locate}
        title="Use my location"
        className={clsx("absolute text-muted hover:text-volt", compact ? "right-2" : "right-[6.5rem]")}
      >
        {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className={compact ? "h-4 w-4" : "h-5 w-5"} />}
      </button>
      {!compact && (
        <button type="submit" className="btn-primary absolute right-2 py-2.5">
          Search
        </button>
      )}
    </form>
  );
}
