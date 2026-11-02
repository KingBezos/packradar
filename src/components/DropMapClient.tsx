"use client";

import dynamic from "next/dynamic";
import type { DropMapProps } from "./DropMap";

const Inner = dynamic(() => import("./DropMap").then((m) => m.DropMap), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded-2xl border border-line bg-panel" style={{ height: "60vh" }} />,
});

/** Client-only wrapper (MapLibre needs `window`). */
export function DropMapClient(props: DropMapProps) {
  return <Inner {...props} />;
}
