import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ProfileForm } from "@/components/AccountClient";
import { reputationBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  const b = reputationBadge(u.reputation);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-black text-white">{u.name}</h1>
      <p className="mt-1 text-muted">{u.email} · <span className={b.color}>{b.label}</span> · <b className="text-volt">{u.reputation} rep</b></p>
      <div className="mt-6"><ProfileForm name={u.name} homeZip={u.homeZip} discord={u.discordWebhookUrl} qs={u.quietHoursStart} qe={u.quietHoursEnd} /></div>
    </div>
  );
}
