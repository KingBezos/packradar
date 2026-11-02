/** Launch configuration: all core features and alerts are free for all signed-in users. */
export type Plan = "free";

export const PLAN_LIMITS: Record<
  string,
  { maxAlerts: number; maxLeadMinutes: number; channels: string[]; ads: boolean; historyDays: number }
> = {
  free: {
    maxAlerts: 25,
    maxLeadMinutes: 60,
    channels: ["email", "push", "discord", "inapp"],
    ads: true,
    historyDays: 90,
  },
  premium: {
    maxAlerts: 25,
    maxLeadMinutes: 60,
    channels: ["email", "push", "discord", "inapp"],
    ads: true,
    historyDays: 90,
  },
};

export function effectivePlan(_u?: { plan?: string | null; planExpiresAt?: Date | null } | null): Plan {
  return "free";
}
