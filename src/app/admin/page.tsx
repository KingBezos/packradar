import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/session";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  const u = await getCurrentUser();
  if (!isStaff(u)) notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-black text-white">Admin</h1>
      <AdminPanel isAdmin={u!.role === "admin"} />
    </div>
  );
}
