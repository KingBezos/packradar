"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck, Radio } from "lucide-react";
import { timeAgo } from "@/components/ui";

export function RetailScanBar({ lastScanAt }: { lastScanAt: string; nextScanAt?: string }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const runLiveScan = async () => {
    setScanning(true);
    setStatusMsg(null);
    try {
      const r = await fetch("/api/drops/scan", { method: "POST" });
      if (r.ok) {
        setStatusMsg("Verified retailer MSRP stock & updated live drop radar.");
        router.refresh();
      } else {
        setStatusMsg("Stock was verified just moments ago.");
      }
    } catch {
      setStatusMsg("Could not complete scan right now.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="card border-volt/30 bg-gradient-to-r from-panel via-panel-2 to-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-1 font-bold text-green-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Strict MSRP Stock Verifier
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-volt/40 bg-volt/10 px-2.5 py-1 font-bold text-volt">
            <Radio className="h-3 w-3 animate-pulse" /> Continuous Live Scanning Throughout the Day
          </span>
          <span className="text-slate-300">
            Last verified: <b className="text-white">{timeAgo(new Date(lastScanAt))}</b>
          </span>
        </div>

        <button
          type="button"
          onClick={runLiveScan}
          disabled={scanning}
          className="btn-ghost border border-line bg-bg/80 px-3 py-1.5 text-xs font-bold text-volt hover:border-volt/50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Verifying Retailers…" : "Verify Live Stock Now"}
        </button>
      </div>
      {statusMsg && <p className="mt-2 text-xs font-medium text-green-400">{statusMsg}</p>}
    </div>
  );
}
