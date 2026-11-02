import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LiveTicker } from "@/components/LiveTicker";
import { ServiceWorker } from "@/components/ServiceWorker";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE = process.env.SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "PackRadar – Pokémon TCG Vending Machine Drop Times, Live",
    template: "%s · PackRadar",
  },
  description:
    "Live drop times for Pokémon TCG vending machines near you. See which machines are about to drop, crowd-confirmed accuracy, alerts, news and release dates.",
  keywords: ["pokemon vending machine", "pokemon card vending machine drop time", "pokemon tcg restock", "vending machine locator", "pokemon card drops"],
  openGraph: { type: "website", siteName: "PackRadar", url: SITE },
  twitter: { card: "summary_large_image" },
  applicationName: "PackRadar",
  appleWebApp: { capable: true, title: "PackRadar", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#070b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Navbar />
        <LiveTicker />
        <main className="flex-1">{children}</main>
        <Footer />
        <ServiceWorker />
      </body>
    </html>
  );
}
