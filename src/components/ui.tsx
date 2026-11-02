import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={clsx("flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <defs>
          <radialGradient id="lg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#facc15" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="15" fill="#0e1526" stroke="#facc15" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="10" fill="none" stroke="#facc15" strokeOpacity="0.35" />
        <circle cx="16" cy="16" r="5" fill="none" stroke="#facc15" strokeOpacity="0.35" />
        <path d="M16 16 L16 1 A15 15 0 0 1 29 9 Z" fill="url(#lg)" />
        <path d="M13 6 L19 6 L15.5 14 L20 14 L12 26 L14.5 17 L10.5 17 Z" fill="#facc15" />
        <circle cx="23" cy="20" r="1.8" fill="#22c55e" />
      </svg>
      <span className="text-lg">
        Pack<span className="text-volt">Radar</span>
      </span>
    </Link>
  );
}

export function SectionTitle({ title, href, cta, icon }: { title: string; href?: string; cta?: string; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="flex items-center gap-2 text-xl font-bold text-white">
        {icon}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-sm font-medium text-volt hover:underline">
          {cta ?? "View all"} →
        </Link>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-semibold text-white">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function timeAgo(d: Date | string | number): string {
  const ms = Date.now() - new Date(d).getTime();
  const s = Math.round(ms / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const CATEGORY_LABEL: Record<string, string> = {
  vending: "Vending",
  "drop-report": "Drop Report",
  releases: "Releases",
  tcg: "TCG",
  games: "Games",
  anime: "Anime",
  general: "News",
};

export const CATEGORY_COLOR: Record<string, string> = {
  vending: "bg-volt/15 text-volt border-volt/30",
  "drop-report": "bg-green-500/15 text-green-400 border-green-500/30",
  releases: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  tcg: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  games: "bg-red-500/15 text-red-300 border-red-500/30",
  anime: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  general: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={clsx("rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", CATEGORY_COLOR[category] ?? CATEGORY_COLOR.general)}>
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

export function Avatar({ name, size = 28 }: { name: string; image?: string | null; size?: number }) {
  const safeName = (name || "Spotter").trim();
  const hue = [...safeName].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full text-xs font-extrabold text-slate-950"
      style={{ width: size, height: size, background: `hsl(${hue} 80% 65%)` }}
      title={safeName}
    >
      {safeName.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function reputationBadge(rep: number): { label: string; color: string } {
  if (rep <= -5) return { label: "Flagged Spammer (Muted)", color: "text-red-400" };
  if (rep < 0) return { label: "Probation (-Rep)", color: "text-amber-300" };
  if (rep >= 1000) return { label: "Legend", color: "text-volt" };
  if (rep >= 300) return { label: "Elite Tracker", color: "text-purple-300" };
  if (rep >= 100) return { label: "Ace Spotter", color: "text-sky-300" };
  if (rep >= 25) return { label: "Trainer", color: "text-green-400" };
  return { label: "Rookie", color: "text-muted" };
}
