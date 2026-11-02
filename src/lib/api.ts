import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/session";
import { ensureMigrated } from "@/db";

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wrap a route handler: JSON responses + consistent error mapping. */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      await ensureMigrated();
      const r = await fn(req, ctx);
      return r instanceof Response ? r : NextResponse.json(r ?? { ok: true });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      }
      const msg = (e as Error).message || "Server error";
      const status = /not found/i.test(msg) ? 404 : /limit|too many/i.test(msg) ? 429 : 500;
      if (status === 500) console.error(e);
      return NextResponse.json({ error: msg }, { status });
    }
  };
}

/** Very small in-memory rate limiter (per key, sliding window). */
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new Error("Too many requests – slow down a little");
  arr.push(now);
  buckets.set(key, arr);
}

export async function json<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
