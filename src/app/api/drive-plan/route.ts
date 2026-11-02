import { z } from "zod";
import { and, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import { route, json, rateLimit } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { effectivePlan } from "@/lib/plans";
import { getDb } from "@/db";
import { favorites, machines } from "@/db/schema";
import { boundingBox, haversineMiles } from "@/lib/geo";
import { machineSchedule } from "@/lib/drops/engine";
import { DEFAULT_PLAN_OPTIONS, googleMapsUrl, planDrive, type PlanMachine } from "@/lib/drive/planner";

const Body = z.object({
  start: z.object({ lat: z.number().min(17).max(72), lng: z.number().min(-180).max(-60) }),
  startAt: z.string().datetime().optional(), // defaults to now
  radiusMiles: z.number().min(1).max(100).default(25),
  horizonMin: z.number().int().min(30).max(480).default(180),
  maxStops: z.number().int().min(1).max(15).default(8),
  avgSpeedMph: z.number().min(10).max(70).default(DEFAULT_PLAN_OPTIONS.avgSpeedMph),
  dwellMin: z.number().int().min(1).max(30).default(6),
  maxWaitMin: z.number().int().min(0).max(45).default(12),
  minAccuracy: z.number().min(0).max(100).default(0),
  onlyFavorites: z.boolean().default(false),
  returnToStart: z.boolean().default(false),
});

export const POST = route(async () => {
  return Response.json(
    { error: "Drive Plan route efficiency is coming soon! Create a free account to get notified when it unlocks." },
    { status: 503 },
  );
});
