import { CONFIRMED_ACCURACY_THRESHOLD, type DropSchedule } from "@/lib/drops/schedule";
import type { MapMachine } from "@/lib/queries";

export function scheduleOf(m: MapMachine): DropSchedule | null {
  if (m.i == null || m.a == null) return null;
  return { intervalMinutes: m.i, anchorMinute: m.a, activeStartMinute: m.s, activeEndMinute: m.e, daysMask: m.d, timezone: m.tz };
}

export function isUnconfirmed(m: MapMachine) {
  return m.i != null && !m.v && (m.acc ?? 0) < CONFIRMED_ACCURACY_THRESHOLD;
}
