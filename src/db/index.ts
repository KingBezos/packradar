/**
 * Database client.
 *  - Local dev / Single-container: PGlite (embedded Postgres, stored in ./data/pglite) tuned for low RAM.
 *  - Cloud DB: set DATABASE_URL=postgres://… (Neon, Supabase, Render Postgres, etc.)
 *
 * A single instance is stored on globalThis so every Next.js bundle in the
 * process (instrumentation, route handlers, pages) shares one connection.
 */
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

type Holder = {
  db: DB;
  kind: "pglite" | "postgres";
  pgliteClient?: PGlite;
  dir?: string;
  ready?: Promise<void>;
};

const g = globalThis as unknown as { __packradarDb?: Holder };

function migrationsFolder() {
  return path.join(process.cwd(), "drizzle");
}

export function getPgliteDir() {
  return (
    process.env.PGLITE_DIR ||
    (process.env.VERCEL ? "/tmp/packradar-pglite" : path.join(process.cwd(), "data", "pglite"))
  );
}

function create(): Holder {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzlePostgres(client, { schema }) as unknown as DB;
    return { db, kind: "postgres" };
  }
  const dir = getPgliteDir();
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir, {
    relaxedDurability: true,
    initialMemory: 128 * 1024 * 1024,
    startParams: [
      ...PGlite.defaultStartParams,
      "-c",
      "shared_buffers=8MB",
      "-c",
      "work_mem=1MB",
      "-c",
      "maintenance_work_mem=4MB",
      "-c",
      "wal_buffers=512kB",
      "-c",
      "temp_buffers=1MB",
    ],
  });
  const db = drizzlePglite(client, { schema });
  return { db, kind: "pglite", pgliteClient: client, dir };
}

function holder(): Holder {
  if (!g.__packradarDb) g.__packradarDb = create();
  return g.__packradarDb;
}

/** Synchronous handle (used by Better Auth). Migrations run at server start. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const real = holder().db as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

/** Run pending migrations and initial seed exactly once per process. */
export function ensureMigrated(): Promise<void> {
  const h = holder();
  if (!h.ready) {
    h.ready = (async () => {
      if (h.kind === "pglite") {
        const seededMarker = h.dir ? path.join(h.dir, ".seeded-v2") : null;
        if (seededMarker && fs.existsSync(seededMarker) && h.pgliteClient) {
          await h.pgliteClient.waitReady;
          return;
        }
        await migratePglite(h.db, { migrationsFolder: migrationsFolder() });
        const { seedIfEmpty } = await import("./seed");
        await seedIfEmpty(h.db);
        if (seededMarker) {
          try {
            fs.writeFileSync(seededMarker, new Date().toISOString(), "utf8");
          } catch {}
        }
      } else {
        await migratePostgres(h.db as never, { migrationsFolder: migrationsFolder() });
        const { seedIfEmpty } = await import("./seed");
        await seedIfEmpty(h.db);
      }
    })().catch((e) => {
      h.ready = undefined;
      throw e;
    });
  }
  return h.ready;
}

/** Await migrations, then return the db. Use this in server code. */
export async function getDb(): Promise<DB> {
  await ensureMigrated();
  return holder().db;
}

export async function closeDb(): Promise<void> {
  const h = g.__packradarDb;
  if (h?.pgliteClient && !h.pgliteClient.closed) {
    await h.pgliteClient.close();
  }
  g.__packradarDb = undefined;
}

export { schema };
