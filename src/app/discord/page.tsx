import type { Metadata } from "next";
import { DiscordBotHub } from "@/components/DiscordBotHub";
import { getCurrentUser, isStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversational Discord Bot & Community Drop Worker",
  description:
    "Add the PackRadar Conversational Discord Bot or connect your Pokémon TCG server's #restocks webhook for live vending drop countdowns, ETB product sightings, and Q&A.",
};

export default async function DiscordPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <DiscordBotHub isStaff={isStaff(user)} signedIn={Boolean(user)} />
    </div>
  );
}
