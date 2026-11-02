import Link from "next/link";
import { Logo } from "./ui";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line/80 bg-panel/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-md text-sm text-muted">
            Live drop times for Pokémon TCG vending machines across the US, powered by the community. Plus news, releases and retail drop alerts.
          </p>
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold text-white">Explore</p>
          <ul className="space-y-1.5 text-muted">
            <li><Link className="hover:text-white" href="/map">Live map</Link></li>
            <li><Link className="hover:text-white" href="/locations">Machines by state</Link></li>
            <li><Link className="hover:text-white" href="/news">News</Link></li>
            <li><Link className="hover:text-white" href="/releases">Release calendar</Link></li>
            <li><Link className="hover:text-white" href="/drops">Retail drops</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold text-white">PackRadar</p>
          <ul className="space-y-1.5 text-muted">
            <li><Link className="hover:text-white" href="/about">How it works</Link></li>
            <li><Link className="hover:text-white" href="/drive-plan">Drive Plan (Coming Soon)</Link></li>
            <li><Link className="hover:text-white" href="/advertise">Advertise / local shops</Link></li>
            <li><Link className="hover:text-white" href="/terms">Terms & disclaimer</Link></li>
            <li><Link className="hover:text-white" href="/privacy">Privacy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line/60">
        <p className="mx-auto max-w-7xl px-4 py-5 text-[11px] leading-relaxed text-muted">
          PackRadar is an unofficial, fan-made project. It is not affiliated with, endorsed, sponsored, or approved by Nintendo, Creatures Inc.,
          GAME FREAK inc., The Pokémon Company, The Pokémon Company International, or any retailer. Pokémon and all related names are trademarks of their
          respective owners. Drop times, stock levels and machine locations are community-sourced and automatically gathered estimates. They may be
          inaccurate and are provided “as is” without warranty. Always follow store rules and be respectful to staff and other collectors.
        </p>
      </div>
    </footer>
  );
}
