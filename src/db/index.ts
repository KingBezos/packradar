/**
 * Database client.
 *  - Local dev: PGlite (embedded Postgres, stored in ./data/pglite). No install needed.
 *  - Production: set DATABASE_URL=postgres://… (Neon, Supabase, Railway, etc.)
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
  ready?: Promise<void>;
};

const g = globalThis as unknown as { __packradarDb?: Holder };

function migrationsFolder() {
  return path.join(process.cwd(), "drizzle");
}

function create(): Holder {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzlePostgres(client, { schema }) as unknown as DB;
    return { db, kind: "postgres" };
  }
  const dir =
    process.env.PGLITE_DIR ||
    (process.env.VERCEL ? "/tmp/packradar-pglite" : path.join(process.cwd(), "data", "pglite"));
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir, { relaxedDurability: true });
  const db = drizzlePglite(client, { schema });
  return { db, kind: "pglite" };
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
        await migratePglite(h.db, { migrationsFolder: migrationsFolder() });
      } else {
        await migratePostgres(h.db as never, { migrationsFolder: migrationsFolder() });
      }
      const { seedIfEmpty } = await import("./seed");
      await seedIfEmpty(h.db);
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

export { schema };
