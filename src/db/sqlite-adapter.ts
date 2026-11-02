/**
 * Ultra-lightweight SQLite-backed adapter implementing the PGlite client interface
 * for Drizzle ORM (`drizzle-orm/pglite`), using Node's built-in `node:sqlite`.
 *
 * Why this exists:
 * `@electric-sql/pglite` loads PostgreSQL 16 compiled to WebAssembly (`pglite.wasm` +
 * `initdb.wasm`), which allocates 530–640 MB of off-heap WASM memory and crashes
 * 512 MB containers (such as Render Free Tier).
 *
 * `node:sqlite` (`DatabaseSync`) is built into Node.js 22+, uses ~4 MB of RAM,
 * starts in <5ms, persists to disk (`./data/pglite/packradar.sqlite`), and supports
 * RETURNING, ON CONFLICT DO UPDATE, FILTER (WHERE ...), and NULLS LAST natively.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type QueryOptions = {
  rowMode?: "array" | "object";
  parsers?: Record<number, (val: unknown) => unknown>;
};

const columnDefaults: Record<string, Record<string, string>> = {};

function recordTableDefaults(createTableSql: string) {
  const m = createTableSql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"\s*\(([\s\S]*)\)$/i);
  if (!m) return;
  const table = m[1];
  const body = m[2];
  if (!columnDefaults[table]) columnDefaults[table] = {};

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/,\s*$/, "");
    const colMatch = line.match(/^"([^"]+)"\s+(.+)$/);
    if (!colMatch) continue;
    const col = colMatch[1];
    const rest = colMatch[2];
    const defMatch = rest.match(/\bDEFAULT\s+(.+?)(?:\s+NOT\s+NULL|\s+NULL|$)/i);
    if (defMatch) {
      let expr = defMatch[1].trim();
      if (/^now\(\)$/i.test(expr)) {
        expr = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
      } else if (/^true$/i.test(expr)) {
        expr = "1";
      } else if (/^false$/i.test(expr)) {
        expr = "0";
      } else {
        expr = expr.replace(/::[a-z0-9_ ]+/gi, "");
      }
      columnDefaults[table][col] = expr;
    } else {
      columnDefaults[table][col] = "NULL";
    }
  }
}

function replaceInsertDefaults(sql: string): string {
  const headerMatch = sql.match(/^\s*insert\s+into\s+"([^"]+)"\s*\(([^)]+)\)\s*values\s*/i);
  if (!headerMatch || !/\bdefault\b/i.test(sql)) return sql;

  const table = headerMatch[1];
  const cols = headerMatch[2]
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, ""));
  const tblDefaults = columnDefaults[table] || {};

  const prefixLen = headerMatch[0].length;
  const prefix = sql.slice(0, prefixLen);
  const rest = sql.slice(prefixLen);

  // Walk through value tuples (...) before any ON CONFLICT / RETURNING clause
  let out = prefix;
  let i = 0;
  const len = rest.length;
  let depth = 0;
  let colIdx = 0;

  while (i < len) {
    const ch = rest[i];

    // Outside tuple: check if we reached ON CONFLICT or RETURNING
    if (depth === 0) {
      const tail = rest.slice(i);
      if (/^\s*(on\s+conflict|returning)\b/i.test(tail)) {
        out += tail;
        break;
      }
    }

    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (rest[j] === "'" && rest[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (rest[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      out += rest.slice(i, j);
      i = j;
      continue;
    }

    if (ch === "(") {
      depth++;
      if (depth === 1) colIdx = 0;
      out += ch;
      i++;
      continue;
    }

    if (ch === ")") {
      depth--;
      out += ch;
      i++;
      continue;
    }

    if (ch === "," && depth === 1) {
      colIdx++;
      out += ch;
      i++;
      continue;
    }

    if (depth === 1 && /^[dD]efault\b/.test(rest.slice(i))) {
      const prev = i > 0 ? rest[i - 1] : "(";
      if (/[\s,(]/.test(prev)) {
        const colName = cols[colIdx];
        const replacement = (colName && tblDefaults[colName]) || "NULL";
        out += replacement;
        i += 7;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

function normalizeParam(val: unknown): string | number | bigint | Uint8Array | null {
  if (val === undefined || val === null) return null;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "number" || typeof val === "bigint" || typeof val === "string") return val;
  if (val instanceof Uint8Array) return val;
  return JSON.stringify(val);
}

/**
 * Translates PostgreSQL SQL & positional parameters ($1, $2, ...) into SQLite SQL & (?) parameters,
 * while preserving string literals and identifiers.
 */
export function translatePgToSqlite(
  pgSql: string,
  params: unknown[] = []
): { sql: string; sqliteParams: (string | number | bigint | Uint8Array | null)[] } {
  const sqliteParams: (string | number | bigint | Uint8Array | null)[] = [];
  let out = "";
  let i = 0;
  const len = pgSql.length;

  while (i < len) {
    const ch = pgSql[i];

    // Single-quoted string literal
    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (pgSql[j] === "'" && pgSql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (pgSql[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      out += pgSql.slice(i, j);
      i = j;
      continue;
    }

    // Double-quoted identifier
    if (ch === '"') {
      let j = i + 1;
      while (j < len) {
        if (pgSql[j] === '"' && pgSql[j + 1] === '"') {
          j += 2;
          continue;
        }
        if (pgSql[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      const ident = pgSql.slice(i, j);
      if (ident.toLowerCase() === '"public"' && pgSql[j] === ".") {
        i = j + 1;
        continue;
      }
      out += ident;
      i = j;
      continue;
    }

    // Positional parameter $1, $2, ...
    if (ch === "$" && i + 1 < len && pgSql[i + 1] >= "1" && pgSql[i + 1] <= "9") {
      let j = i + 1;
      while (j < len && pgSql[j] >= "0" && pgSql[j] <= "9") j++;
      const idx = Number.parseInt(pgSql.slice(i + 1, j), 10) - 1;
      sqliteParams.push(normalizeParam(params[idx]));
      out += "?";
      i = j;
      continue;
    }

    // Postgres typecast ::type
    if (ch === ":" && pgSql[i + 1] === ":") {
      const rest = pgSql.slice(i + 2);
      const m = rest.match(
        /^(timestamp with time zone|timestamp without time zone|double precision|character varying|timestamptz|timestamp|integer|boolean|varchar|numeric|float8|float4|float|jsonb|json|real|text|int8|int4|int2|int|uuid)\b(\[\])?/i
      );
      if (m) {
        i += 2 + m[0].length;
        continue;
      }
    }

    out += ch;
    i++;
  }

  // Transform Postgres keywords/functions outside literals
  let sql = out
    .replace(/\bILIKE\b/gi, "LIKE")
    .replace(/\bDEFAULT\s+now\(\)/gi, "DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
    .replace(/\bnow\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .replace(/\bDEFAULT\s+true\b/gi, "DEFAULT 1")
    .replace(/\bDEFAULT\s+false\b/gi, "DEFAULT 0")
    .replace(/\s+USING\s+btree\b/gi, "");

  sql = replaceInsertDefaults(sql);

  return { sql, sqliteParams };
}

export class SqlitePgClient {
  private sqlite: DatabaseSync;
  public closed = false;
  public waitReady: Promise<void>;
  private inTx = false;

  constructor(filePath: string) {
    if (filePath !== ":memory:") {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    this.sqlite = new DatabaseSync(filePath);
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA synchronous = NORMAL;");
    this.sqlite.exec("PRAGMA foreign_keys = OFF;");
    this.sqlite.exec("PRAGMA busy_timeout = 5000;");
    this.waitReady = Promise.resolve();
  }

  async query(
    queryString: string,
    params: unknown[] = [],
    options?: QueryOptions
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
    const trimmed = queryString.trim();
    if (!trimmed) return { rows: [] };

    // Handle transaction control statements
    if (/^(begin|start transaction)\b/i.test(trimmed)) {
      if (!this.inTx) {
        this.sqlite.exec("BEGIN");
        this.inTx = true;
      }
      return { rows: [] };
    }
    if (/^(commit|end)\b/i.test(trimmed)) {
      if (this.inTx) {
        this.sqlite.exec("COMMIT");
        this.inTx = false;
      }
      return { rows: [] };
    }
    if (/^rollback\b/i.test(trimmed) && !/to\s+savepoint/i.test(trimmed)) {
      if (this.inTx) {
        this.sqlite.exec("ROLLBACK");
        this.inTx = false;
      }
      return { rows: [] };
    }
    if (/^(create\s+schema|set\s+)/i.test(trimmed)) {
      return { rows: [] };
    }

    const { sql, sqliteParams } = translatePgToSqlite(trimmed, params);
    const stmt = this.sqlite.prepare(sql);
    const isArrayMode = options?.rowMode === "array";
    stmt.setReturnArrays(Boolean(isArrayMode));

    const returnsRows =
      /^\s*(select|pragma|with)\b/i.test(sql) || /\breturning\b/i.test(sql);

    if (returnsRows) {
      const rawRows = stmt.all(...sqliteParams) as unknown[];
      if (!isArrayMode) {
        const rows = rawRows.map((r) => ({ ...(r as Record<string, unknown>) }));
        return { rows };
      }
      return { rows: rawRows };
    }

    const res = stmt.run(...sqliteParams);
    return { rows: [], affectedRows: Number(res.changes ?? 0) };
  }

  async exec(sqlText: string): Promise<void> {
    const statements = sqlText
      .split(/--> statement-breakpoint|;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const raw of statements) {
      if (/^ALTER\s+TABLE\s+.*\s+ADD\s+CONSTRAINT\s+/i.test(raw)) {
        continue;
      }
      if (/^CREATE\s+SCHEMA\b/i.test(raw)) {
        continue;
      }
      recordTableDefaults(raw);
      const { sql } = translatePgToSqlite(raw, []);
      const idempotent = sql
        .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
        .replace(/^CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
        .replace(/^CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, "CREATE INDEX IF NOT EXISTS ");
      this.sqlite.exec(idempotent);
    }
  }

  async transaction<T>(fn: (txClient: this) => Promise<T>): Promise<T> {
    const manageTx = !this.inTx;
    if (manageTx) {
      this.sqlite.exec("BEGIN");
      this.inTx = true;
    }
    try {
      const result = await fn(this);
      if (manageTx && this.inTx) {
        this.sqlite.exec("COMMIT");
        this.inTx = false;
      }
      return result;
    } catch (err) {
      if (manageTx && this.inTx) {
        try {
          this.sqlite.exec("ROLLBACK");
        } catch {}
        this.inTx = false;
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.sqlite.close();
      this.closed = true;
    }
  }
}
