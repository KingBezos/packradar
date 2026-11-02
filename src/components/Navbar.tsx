import Link from "next/link";
import { Bell, Map, Newspaper, CalendarDays, ShoppingCart, Trophy, Shield, Route, Bot } from "lucide-react";
import { Logo } from "./ui";
import { getCurrentUser, isStaff } from "@/lib/session";
import { UserMenu } from "./UserMenu";
import { SearchBox } from "./SearchBox";
import { MobileNav } from "./MobileNav";

export const NAV = [
  { href: "/map", label: "Map", icon: "map" },
  { href: "/drive-plan", label: "Drive Plan", icon: "route" },
  { href: "/discord", label: "Discord Bot", icon: "bot" },
  { href: "/news", label: "News", icon: "news" },
  { href: "/releases", label: "Releases", icon: "cal" },
  { href: "/drops", label: "Retail Drops", icon: "cart" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
] as const;

const ICONS = {
  map: Map,
  route: Route,
  bot: Bot,
  news: Newspaper,
  cal: CalendarDays,
  cart: ShoppingCart,
  trophy: Trophy,
};

export async function Navbar() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const Icon = ICONS[n.icon];
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-panel-2 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {n.label}
                {n.href === "/drive-plan" && (
                  <span className="rounded-full border border-volt/40 bg-volt/15 px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wider text-volt">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
          {isStaff(user) && (
            <Link href="/admin" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-volt hover:bg-panel-2">
              <Shield className="h-4 w-4" /> Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto hidden w-64 md:block">
          <SearchBox compact />
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            <Link href="/alerts" className="rounded-lg p-2 text-muted hover:bg-panel-2 hover:text-white" title="Alerts">
              <Bell className="h-5 w-5" />
            </Link>
            <UserMenu name={user.name} image={user.image} reputation={user.reputation} plan={user.plan} staff={isStaff(user)} />
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link href="/sign-in" className="btn-ghost hidden sm:inline-flex">
              Sign in
            </Link>
            <Link href="/sign-up" className="btn-primary">
              Join free
            </Link>
          </div>
        )}
        <MobileNav staff={isStaff(user)} />
      </div>
    </header>
  );
}
