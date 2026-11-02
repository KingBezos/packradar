"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if ("serviceWorker" in navigator && process.env.NODE_ENV !== "production") {
      // Register in dev too so push can be tested locally.
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const FALLBACK_VAPID_PUBLIC_KEY =
  "BPovxSR0d6QAzApgRb0cEsXVZITSwa3Xia8Xz54LBUp1R3yeU084qZq6tUvY0Ycc6y1yksZNlzUPsaeZrL5TlSA";

/** Ask permission + subscribe this browser to push. */
export async function enablePush(): Promise<string> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || FALLBACK_VAPID_PUBLIC_KEY;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "This browser doesn't support push notifications.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Notifications were blocked in browser permissions.";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return r.ok ? "ok" : "Couldn't save subscription.";
}
