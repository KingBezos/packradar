"use client";

import { LockOpen } from "lucide-react";

export function UnlockTimerButton({ label }: { label: string }) {
  const handleUnlockScroll = (e: React.MouseEvent) => {
    if (typeof window !== "undefined") {
      const el = document.getElementById("instant-zip-capture");
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.dispatchEvent(new CustomEvent("packradar:focus-zip-capture"));
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleUnlockScroll}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-volt/50 bg-gradient-to-r from-yellow-500/20 to-amber-500/15 px-3 py-2 text-xs font-extrabold text-volt transition hover:border-volt hover:bg-volt hover:text-slate-950"
    >
      <LockOpen className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
