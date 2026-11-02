/**
 * Database client.
 *  - Local dev / Single-container (Render Free 512MB, etc.): Built-in `node:sqlite` via
 *    `SqlitePgClient` (uses ~4 MB RAM instead of PGlite WASM's 590 MB RAM).
 *  - Cloud DB: set DATABASE_URL=postgres://… (Neon, Supabase, Render Postgres, etc.)
 *
 * A single instance is stored on globalThis so every Next.js bundle in the
 * process (instrumentation, route handlers, pages) shares one connection.
 */
import path from "node:path";
import fs from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { PgBoolean, PgTimestamp } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { SqlitePgClient } from "./sqlite-adapter";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

type Holder = {
  db: DB;
  kind: "sqlite" | "postgres";
  sqliteClient?: SqlitePgClient;
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
    (process.env.VERCEL ? "/tmp/packradar-db" : path.join(process.cwd(), "data", "pglite"))
  );
}

function patchColumnsForSqlite() {
  const toBool = (v: unknown): boolean =>
    v === null || v === undefined
      ? (v as unknown as boolean)
      : Boolean(v === true || v === 1 || v === "1" || v === "true" || v === "t");
  const fromBool = (v: unknown) =>
    v === null || v === undefined ? v : v ? 1 : 0;
  const toDate = (v: unknown): Date => {
    if (v === null || v === undefined) return v as unknown as Date;
    if (v instanceof Date) return v;
    if (typeof v === "number") return new Date(v);
    const s = String(v);
    const iso = /[Z+-]\d*$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
    return new Date(iso);
  };
  const fromDate = (v: unknown) => {
    if (v === null || v === undefined) return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "number") return new Date(v).toISOString();
    return String(v);
  };

  PgBoolean.prototype.mapFromDriverValue = toBool;
  PgBoolean.prototype.mapToDriverValue = fromBool;
  PgTimestamp.prototype.mapFromDriverValue = toDate;
  PgTimestamp.prototype.mapToDriverValue = fromDate as (v: Date) => string;

  for (const tbl of Object.values(schema)) {
    if (!tbl || typeof tbl !== "object") continue;
    for (const col of Object.values(tbl as unknown as Record<string, unknown>)) {
      if (!col || typeof col !== "object") continue;
      const c = col as { columnType?: string; mapFromDriverValue?: unknown; mapToDriverValue?: unknown };
      if (c.columnType === "PgBoolean") {
        c.mapFromDriverValue = toBool;
        c.mapToDriverValue = fromBool;
      } else if (c.columnType === "PgTimestamp") {
        c.mapFromDriverValue = toDate;
        c.mapToDriverValue = fromDate;
      }
    }
  }
}

function create(): Holder {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzlePostgres(client, { schema }) as unknown as DB;
    return { db, kind: "postgres" };
  }
  patchColumnsForSqlite();
  const dir = getPgliteDir();
  fs.mkdirSync(dir, { recursive: true });
  const sqliteFile = path.join(dir, "packradar.sqlite");
  const client = new SqlitePgClient(sqliteFile);
  const db = drizzlePglite(client as unknown as PGlite, { schema });
  return { db, kind: "sqlite", sqliteClient: client, dir };
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
      if (h.kind === "sqlite" && h.sqliteClient) {
        const initSqlPath = path.join(migrationsFolder(), "0000_init.sql");
        if (fs.existsSync(initSqlPath)) {
          const sqlText = fs.readFileSync(initSqlPath, "utf8");
          await h.sqliteClient.exec(sqlText);
        }
        const { seedIfEmpty } = await import("./seed");
        await seedIfEmpty(h.db);
        if (h.dir) {
          try {
            fs.writeFileSync(path.join(h.dir, ".seeded-v2"), new Date().toISOString(), "utf8");
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
  if (h?.sqliteClient && !h.sqliteClient.closed) {
    await h.sqliteClient.close();
  }
  g.__packradarDb = undefined;
}

export { schema };
