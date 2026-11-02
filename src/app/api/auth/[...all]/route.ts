import { toNextJsHandler } from "better-auth/next-js";
import { getAuth, reloadAuth } from "@/lib/auth";
import { ensureMigrated } from "@/db";

function syncAuthOrigin(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return;
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("192.168.") ? "http" : "https");
  const origin = `${proto}://${host}`;
  if (process.env.BETTER_AUTH_URL !== origin) {
    process.env.BETTER_AUTH_URL = origin;
    reloadAuth();
  }
}

export async function GET(req: Request) {
  await ensureMigrated();
  syncAuthOrigin(req);
  return toNextJsHandler(getAuth()).GET(req);
}

export async function POST(req: Request) {
  await ensureMigrated();
  syncAuthOrigin(req);
  return toNextJsHandler(getAuth()).POST(req);
}
