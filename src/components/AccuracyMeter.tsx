import clsx from "clsx";
import { accuracyTier } from "@/lib/drops/accuracy";

const TIER = {
  verified: { label: "Verified", bar: "bg-gradient-to-r from-green-400 to-emerald-300", text: "text-green-300" },
  high: { label: "Confirmed", bar: "bg-gradient-to-r from-green-500 to-lime-400", text: "text-green-400" },
  medium: { label: "Likely", bar: "bg-gradient-to-r from-yellow-500 to-amber-300", text: "text-yellow-300" },
  low: { label: "Unconfirmed", bar: "bg-gradient-to-r from-orange-600 to-orange-400", text: "text-orange-300" },
} as const;

/** Accuracy meter: how sure we are about a drop time. */
export function AccuracyMeter({
  accuracy,
  verified,
  size = "md",
  showLabel = true,
}: {
  accuracy: number | null;
  verified: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  if (accuracy == null) {
    return <span className="text-xs text-muted">No data yet</span>;
  }
  const tier = accuracyTier(accuracy, verified);
  const t = TIER[tier];
  const pct = verified ? 100 : Math.round(accuracy);
  return (
    <div className="w-full">
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className={clsx("font-semibold", t.text)}>
            {tier === "verified" ? "✔ " : tier === "low" ? "? " : ""}
            {t.label}
          </span>
          <span className="font-mono font-bold tabular-nums text-white">{pct}%</span>
        </div>
      )}
      <div className={clsx("w-full overflow-hidden rounded-full bg-slate-800", size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2")}>
        <div className={clsx("h-full rounded-full transition-all", t.bar)} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
    </div>
  );
}
