"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;
    if (pathname.startsWith("/admin")) return; // Don't pollute visitor stats with admin's own /admin views

    const fullKey = `${pathname}${window.location.search}`;
    if (lastTrackedRef.current === fullKey) return;
    lastTrackedRef.current = fullKey;

    let vid = "";
    try {
      vid = localStorage.getItem("pr_vid") || "";
      if (!vid) {
        vid = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("pr_vid", vid);
      }
    } catch {}

    const sp = new URLSearchParams(window.location.search);
    const utmSource = sp.get("utm_source") || sp.get("ref") || sp.get("source") || null;
    const isWebdriver = Boolean(navigator.webdriver);
    const screenWidth = window.screen?.width ?? window.innerWidth ?? 0;

    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || "",
        utmSource,
        clientVisitorId: vid,
        isWebdriver,
        screenWidth,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
