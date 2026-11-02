"use client";

import { useNow } from "./live";

/** Days/hours until a YYYY-MM-DD release date. */
export function ReleaseCountdown({ date }: { date: string }) {
  const now = useNow(60_000);
  const target = new Date(`${date}T00:00:00`).getTime();
  const diff = target - now;
  if (diff <= 0) {
    return <span className="rounded-full bg-green-500/15 px-2 py-1 text-xs font-bold text-green-400">Out now</span>;
  }
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return (
    <span className="whitespace-nowrap rounded-full bg-volt/10 px-2 py-1 font-mono text-xs font-bold text-volt" suppressHydrationWarning>
      {days > 0 ? `${days}d ${hours}h` : `${hours}h`}
    </span>
  );
}
