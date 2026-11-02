import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertSubscriptions, machines, notifications, products } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { effectivePlan, PLAN_LIMITS } from "@/lib/plans";
import { AlertsManager, type SubView } from "@/components/AccountClient";
import { timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My alerts" };

export default async function AlertsPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  const db = await getDb();
  const rows = await db
    .select({ s: alertSubscriptions, m: machines, p: products })
    .from(alertSubscriptions)
    .leftJoin(machines, eq(machines.id, alertSubscriptions.machineId))
    .leftJoin(products, eq(products.id, alertSubscriptions.productId))
    .where(eq(alertSubscriptions.userId, u.id))
    .orderBy(desc(alertSubscriptions.createdAt));
  const inbox = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, u.id))
    .orderBy(desc(notifications.createdAt))
    .limit(25);
  const plan = effectivePlan(u);
  const subs: SubView[] = rows.map(({ s, m, p }) => ({
    id: s.id,
    kind: s.kind,
    title: m
      ? `${m.retailer} – ${m.street}, ${m.city}`
      : s.kind === "area_drop"
        ? `Within ${s.radiusMiles} mi of ${s.keyword ?? (u.homeZip ? `ZIP ${u.homeZip}` : "your location")}`
        : p?.name ?? s.keyword ?? s.kind,
    href: m ? `/machines/${m.id}` : undefined,
    lead: s.leadMinutes,
    channels: s.channels,
    active: s.active,
  }));
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-black text-white">My alerts</h1>
      <div className="mt-6">
        <AlertsManager subs={subs} plan={plan} maxAlerts={PLAN_LIMITS[plan].maxAlerts} maxLead={PLAN_LIMITS[plan].maxLeadMinutes} homeZip={u.homeZip} />
      </div>
      <h2 className="mb-3 mt-10 text-xl font-bold text-white">Recent notifications</h2>
      <div className="card divide-y divide-line">
        {inbox.length === 0 && <p className="p-5 text-sm text-muted">Nothing yet.</p>}
        {inbox.map((n) => (
          <div key={n.id} className="p-4 text-sm">
            <p className="font-semibold text-white">{n.title}</p>
            <p className="text-muted">{n.body}</p>
            <p className="mt-1 text-[11px] text-muted">{n.channel} · {n.status} · {timeAgo(n.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
