import type { Metadata } from "next";
import { DropMapClient } from "@/components/DropMapClient";
import { getMapMachines } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Pokémon Vending Machine Map",
  description: "Every Pokémon TCG vending machine in the US with live countdowns: yellow before a drop, green right after.",
};

export default async function MapPage() {
  const initialMachines = await getMapMachines();
  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4">
      <DropMapClient machines={initialMachines} height="calc(100vh - 180px)" showList />
    </div>
  );
}
