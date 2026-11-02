/**
 * Pre-initializes and seeds `./data/pglite` in a standalone process during `postbuild`
 * so `initdb.wasm` (220 MB) is freed before `next start` runs on 512 MB containers.
 */
import fs from "node:fs";
import path from "node:path";
import { closeDb, ensureMigrated, getPgliteDir } from "../src/db";

async function main() {
  if (process.env.DATABASE_URL || process.env.VERCEL) {
    console.log("[preseed] Skipping local PGlite preseed (external DB or Vercel detected).");
    return;
  }
  const dir = getPgliteDir();
  const marker = path.join(dir, ".seeded-v2");
  if (fs.existsSync(marker) && fs.existsSync(path.join(dir, "PG_VERSION"))) {
    console.log("[preseed] Database already pre-seeded at", dir);
    return;
  }
  console.log("[preseed] Initializing and seeding PGlite database at", dir);
  await ensureMigrated();
  await closeDb();
  console.log("[preseed] PGlite database pre-seeded and cleanly closed.");
}

main().catch((err) => {
  console.error("[preseed] Warning:", err);
  process.exit(0);
});
