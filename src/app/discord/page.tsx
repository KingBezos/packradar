import type { Metadata } from "next";
import { DiscordBotHub } from "@/components/DiscordBotHub";

export const metadata: Metadata = {
  title: "Discord Bot & Auto-Invite Control Center",
  description:
    "Invite the PackRadar Discord Bot to your collector server for live vending machine drop countdowns, corridor predictions, and automatic restock harvesting.",
};

export default function DiscordPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <DiscordBotHub />
    </div>
  );
}
