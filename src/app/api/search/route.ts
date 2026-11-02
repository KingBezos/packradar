import { route } from "@/lib/api";
import { searchMachines, toMapMachine } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const radius = Math.min(100, Number(url.searchParams.get("radius")) || 25);
  const r = await searchMachines(q, radius);
  return {
    center: r.center,
    machines: r.machines.map((m) => ({ ...toMapMachine(m), distance: m.distance ?? null, zip: m.zip })),
  };
});
