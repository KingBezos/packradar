import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isStaff } from "@/lib/session";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin Command Center", robots: { index: false } };

export default async function AdminPage() {
  const u = await getCurrentUser();
  if (!u) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="card p-8">
          <h1 className="text-2xl font-black text-white">Admin Sign-In Required</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in with your administrator account to manage users, machines, retail drops, and background bots.
          </p>
          <Link href="/sign-in?next=/admin" className="btn-volt mt-5 inline-flex">
            Sign in to Admin →
          </Link>
        </div>
      </div>
    );
  }
  if (!isStaff(u)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="card p-8">
          <h1 className="text-2xl font-black text-white">Admin Access Only</h1>
          <p className="mt-2 text-sm text-muted">
            Your account (<span className="text-white">{u.email}</span>) does not currently have administrator permissions.
          </p>
          <Link href="/" className="btn-ghost mt-5 inline-flex">
            ← Back to Map
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Admin Command Center</h1>
          <p className="mt-1 text-sm text-muted">
            Manage registered users, drop confirmations, scraper bots, news articles, and sponsors.
          </p>
        </div>
        <span className="rounded-full border border-volt/40 bg-volt/10 px-3 py-1 text-xs font-bold text-volt">
          Signed in as {u.email} ({u.role})
        </span>
      </div>
      <AdminPanel isAdmin={u.role === "admin"} />
    </div>
  );
}
