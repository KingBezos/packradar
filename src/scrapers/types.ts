import type { DB } from "@/db";

export type ScrapeContext = {
  db: DB;
  log: (msg: string) => void;
  /** Adapter-specific options (e.g. { mode: "metros" }). */
  options: Record<string, unknown>;
};

export type ScrapeResult = {
  found: number;
  created: number;
  updated: number;
  status?: "success" | "partial" | "skipped";
  note?: string;
};

export type Adapter = {
  name: string;
  label: string;
  description: string;
  /** Included in the daily job. */
  daily: boolean;
  run: (ctx: ScrapeContext) => Promise<ScrapeResult>;
};
