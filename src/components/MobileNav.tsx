"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SearchBox } from "./SearchBox";

const LINKS = [
  ["/map", "Live Map"],
  ["/drive-plan", "Drive Plan (Coming Soon)"],
  ["/news", "News"],
  ["/releases", "Releases"],
  ["/drops", "Retail Drops"],
  ["/leaderboard", "Leaderboard"],
  ["/locations", "Browse by state"],
  ["/alerts", "My alerts"],
] as const;

export function MobileNav({ staff }: { staff: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);
  // Close when navigating.
  useEffect(() => setOpen(false), [pathname]);
  // Lock page scroll behind the menu.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Rendered into <body>: the header uses backdrop-blur, which would otherwise
  // trap this "fixed" overlay inside the 64px header and make it see-through.
  const overlay = (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#070b16] p-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(false)} className="p-2 text-white" aria-label="Close">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="mt-2">
        <SearchBox compact />
      </div>
      <nav className="mt-6 flex flex-col gap-1">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-lg font-semibold text-white hover:bg-panel-2">
            {label}
          </Link>
        ))}
        {staff && (
          <Link href="/admin" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-lg font-semibold text-volt hover:bg-panel-2">
            Admin
          </Link>
        )}
      </nav>
    </div>
  );

  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:text-white" aria-label="Menu">
        <Menu className="h-6 w-6" />
      </button>
      {open && mounted && createPortal(overlay, document.body)}
    </div>
  );
}
