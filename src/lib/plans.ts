/** Launch configuration: 10 alerts for free users (will increase for paid tiers later). */
export type Plan = "free" | "premium";

export const PLAN_LIMITS: Record<
  string,
  { maxAlerts: number; maxLeadMinutes: number; channels: string[]; ads: boolean; historyDays: number }
> = {
  free: {
    maxAlerts: 10,
    maxLeadMinutes: 60,
    channels: ["email", "push", "discord", "inapp"],
    ads: true,
    historyDays: 90,
  },
  premium: {
    maxAlerts: 50,
    maxLeadMinutes: 60,
    channels: ["email", "push", "discord", "inapp"],
    ads: false,
    historyDays: 365,
  },
};

export function effectivePlan(u?: { plan?: string | null; planExpiresAt?: Date | null } | null): Plan {
  if (u?.plan === "premium") return "premium";
  return "free";
}
