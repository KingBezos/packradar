"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Bell } from "lucide-react";
import { Avatar } from "./ui";
import { signOut } from "@/lib/auth-client";

export function UserMenu({
  name,
  image,
  reputation,
}: {
  name: string;
  image: string | null;
  reputation: number;
  plan?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 py-1 pl-1 pr-3 text-sm hover:border-slate-500"
      >
        <Avatar name={name} image={image} />
        <span className="hidden max-w-28 truncate font-medium sm:inline">{name}</span>
        <span className="font-mono text-xs text-volt">{reputation}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-line bg-[#0e1526] p-1 shadow-2xl"
          onMouseLeave={() => setOpen(false)}
        >
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel-2"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4" /> Profile
          </Link>
          <Link
            href="/alerts"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel-2"
            onClick={() => setOpen(false)}
          >
            <Bell className="h-4 w-4" /> My alerts
          </Link>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-panel-2"
            onClick={async () => {
              await signOut();
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
