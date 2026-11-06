"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2 } from "lucide-react";

export function QuickAlertButton({
  machineId,
  anchorMinute,
  compact = false,
}: {
  machineId: string;
  anchorMinute?: number | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "saved">("idle");

  const minuteLabel =
    anchorMinute != null ? `:${String(anchorMinute).padStart(2, "0")} drop` : "drop";

  const handleTap = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === "loading" || status === "saved") return;

    setStatus("loading");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "machine_drop",
          machineId,
          leadMinutes: 10,
          channels: ["email", "push"],
        }),
      });

      if (res.status === 401) {
        const nextUrl = encodeURIComponent(`/machines/${machineId}`);
        router.push(`/sign-up?next=${nextUrl}`);
        return;
      }

      if (!res.ok) {
        const nextUrl = encodeURIComponent(`/machines/${machineId}`);
        router.push(`/sign-up?next=${nextUrl}`);
        return;
      }

      setStatus("saved");
    } catch {
      const nextUrl = encodeURIComponent(`/machines/${machineId}`);
      router.push(`/sign-up?next=${nextUrl}`);
    }
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      className={
        status === "saved"
          ? `inline-flex items-center justify-center gap-1.5 rounded-xl border border-green-500/50 bg-green-500/20 font-bold text-green-300 transition ${
              compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-xs sm:text-sm"
            }`
          : `inline-flex items-center justify-center gap-1.5 rounded-xl border border-volt/60 bg-volt/15 font-extrabold text-volt shadow-sm transition hover:bg-volt hover:text-slate-950 ${
              compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-xs sm:text-sm"
            }`
      }
    >
      {status === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : status === "saved" ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      {status === "saved"
        ? `10m Alert Set for ${minuteLabel}`
        : `Alert me 10m before ${minuteLabel}`}
    </button>
  );
}
