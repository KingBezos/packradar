import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Package, ShoppingCart, Sparkles, Bell, ExternalLink } from "lucide-react";
import { getReleases } from "@/lib/queries";
import { ReleaseCountdown } from "@/components/ReleaseCountdown";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pokémon TCG Set & Product Release Calendar – ETBs, Booster Bundles, Boxes & Collections",
  description:
    "Complete Pokémon TCG release calendar featuring expansion sets and individual product SKUs (Elite Trainer Boxes, Booster Bundles, Booster Boxes, Premium Collections, Blisters & Tins) with visuals and MSRP.",
};

export type SetProductRelease = {
  skuName: string;
  productType: "ETB" | "PC Exclusive ETB" | "Booster Bundle" | "Booster Box" | "Premium Collection" | "Blister / Tin";
  releaseDate: string;
  msrp: number;
  packs: string;
  imageUrl: string;
  highlights: string;
};

export type EnrichedSetRelease = {
  slug: string;
  name: string;
  series: string;
  releaseDate: string;
  cardCount: number;
  heroImage: string;
  description: string;
  sourceUrl: string;
  products: SetProductRelease[];
};

export const FULL_RELEASE_CATALOG: EnrichedSetRelease[] = [
  {
    slug: "delta-reign",
    name: "Mega Evolution — Delta Reign",
    series: "Mega Evolution Series",
    releaseDate: "2026-11-06",
    cardCount: 225,
    heroImage: "https://images.pokemontcg.io/swsh7/218_hires.png",
    description:
      "Holiday flagship expansion bringing back Delta Species dual-type Pokémon alongside Mega Rayquaza ex and Mega Gardevoir ex Special Illustration Rares.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "Delta Reign Pokémon Center Elite Trainer Box",
        productType: "PC Exclusive ETB",
        releaseDate: "2026-11-06",
        msrp: 59.99,
        packs: "11 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh7/218_hires.png",
        highlights: "Includes Pokémon Center stamped illustration rare promo + 11 packs & 65 sleeves",
      },
      {
        skuName: "Delta Reign Elite Trainer Box (Rayquaza)",
        productType: "ETB",
        releaseDate: "2026-11-06",
        msrp: 49.99,
        packs: "9 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh12pt5/102_hires.png",
        highlights: "9 Delta Reign booster packs, full-art promo card, dice, markers & collector box",
      },
      {
        skuName: "Delta Reign Booster Display Box (36 Packs)",
        productType: "Booster Box",
        releaseDate: "2026-11-06",
        msrp: 161.64,
        packs: "36 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh7/110_hires.png",
        highlights: "Sealed 36-pack hobby display box for set completion and chase pulls",
      },
      {
        skuName: "Delta Reign Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2026-11-06",
        msrp: 26.94,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh7/217_hires.png",
        highlights: "Compact 6-pack bundle — primary SKU stocked inside Pokémon Automated Vending Machines",
      },
      {
        skuName: "Mega Rayquaza ex Delta Premium Collection",
        productType: "Premium Collection",
        releaseDate: "2026-11-20",
        msrp: 39.99,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/cel25/76A_hires.png",
        highlights: "Etched foil Mega Rayquaza ex promo, magnetic card protector & 6 booster packs",
      },
    ],
  },
  {
    slug: "30th-celebration",
    name: "Pokémon TCG: 30th Anniversary Celebration",
    series: "Special Holiday Expansion",
    releaseDate: "2026-09-16",
    cardCount: 210,
    heroImage: "https://images.pokemontcg.io/cel25/25_hires.png",
    description:
      "Special 30th Anniversary expansion celebrating three decades of Pokémon with classic base-era reprints, gold etched cards, and special collection boxes.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "30th Celebration Ultra-Premium Collection",
        productType: "Premium Collection",
        releaseDate: "2026-09-16",
        msrp: 119.99,
        packs: "16 Celebration Packs",
        imageUrl: "https://images.pokemontcg.io/cel25/25_hires.png",
        highlights: "2 metal commemorative cards, stitched playmat, 16 booster packs & gold coin",
      },
      {
        skuName: "30th Celebration Elite Trainer Box",
        productType: "ETB",
        releaseDate: "2026-09-16",
        msrp: 54.99,
        packs: "10 Celebration Packs",
        imageUrl: "https://images.pokemontcg.io/cel25/24_hires.png",
        highlights: "10 special 30th Anniversary packs + Classic foil promo & anniversary sleeves",
      },
      {
        skuName: "30th Celebration Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2026-09-16",
        msrp: 26.94,
        packs: "6 Celebration Packs",
        imageUrl: "https://images.pokemontcg.io/cel25/2_hires.png",
        highlights: "6-pack bundle releasing at major retailers & Pokémon Center vending kiosks",
      },
      {
        skuName: "30th Anniversary Collector Chest Lunchbox Tin",
        productType: "Blister / Tin",
        releaseDate: "2026-09-16",
        msrp: 29.99,
        packs: "6 Celebration Packs",
        imageUrl: "https://images.pokemontcg.io/cel25/4_hires.png",
        highlights: "Metal collector tin with 3 foil starter promos, mini portfolio & sticker sheets",
      },
    ],
  },
  {
    slug: "pitch-black",
    name: "Mega Evolution — Pitch Black",
    series: "Mega Evolution Series",
    releaseDate: "2026-07-17",
    cardCount: 195,
    heroImage: "https://images.pokemontcg.io/swsh12pt5/GG50_hires.png",
    description:
      "Summer expansion spotlighting Darkrai, Giratina, and Gengar in shadowy Special Illustration Rare artwork.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "Pitch Black Elite Trainer Box (Darkrai)",
        productType: "ETB",
        releaseDate: "2026-07-17",
        msrp: 49.99,
        packs: "9 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh12pt5/GG50_hires.png",
        highlights: "9 Pitch Black packs + full-art Darkrai illustration promo & dark-foil sleeves",
      },
      {
        skuName: "Pitch Black Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2026-07-17",
        msrp: 26.94,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh11/186_hires.png",
        highlights: "6 booster packs — stocked in grocery vending machines & big-box retail",
      },
      {
        skuName: "Pitch Black 3-Pack Checklane Blisters",
        productType: "Blister / Tin",
        releaseDate: "2026-07-17",
        msrp: 13.99,
        packs: "3 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh8/271_hires.png",
        highlights: "3 Pitch Black booster packs + cosmos holo promo card",
      },
    ],
  },
  {
    slug: "chaos-rising",
    name: "Mega Evolution — Chaos Rising",
    series: "Mega Evolution Series",
    releaseDate: "2026-05-22",
    cardCount: 185,
    heroImage: "https://images.pokemontcg.io/xy2/108_hires.png",
    description:
      "Spring expansion featuring Mega Charizard X ex, Mega Lucario ex, and high-impact Stadium Trainer cards.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "Chaos Rising Elite Trainer Box",
        productType: "ETB",
        releaseDate: "2026-05-22",
        msrp: 49.99,
        packs: "9 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/xy2/108_hires.png",
        highlights: "9 booster packs + full-art Lucario promo & 65 art sleeves",
      },
      {
        skuName: "Chaos Rising Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2026-05-22",
        msrp: 26.94,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/swsh12pt5/160_hires.png",
        highlights: "6 booster packs at MSRP across Target, Best Buy, Walmart & vending kiosks",
      },
      {
        skuName: "Chaos Rising Booster Box (36 Packs)",
        productType: "Booster Box",
        releaseDate: "2026-05-22",
        msrp: 161.64,
        packs: "36 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/xy2/69_hires.png",
        highlights: "Full 36-pack sealed display box",
      },
    ],
  },
  {
    slug: "destined-rivals",
    name: "Scarlet & Violet — Destined Rivals (Team Rocket)",
    series: "Scarlet & Violet Series",
    releaseDate: "2025-05-30",
    cardCount: 244,
    heroImage: "https://images.pokemontcg.io/sv3pt5/150_hires.png",
    description:
      "Team Rocket returns vs. Ethan, Cynthia, and Steven! Features Team Rocket's Mewtwo ex, Cynthia's Garchomp ex, and Ethan's Ho-Oh ex.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "Destined Rivals Pokémon Center Elite Trainer Box",
        productType: "PC Exclusive ETB",
        releaseDate: "2025-05-30",
        msrp: 59.99,
        packs: "11 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv3pt5/150_hires.png",
        highlights: "11 packs + Team Rocket's Wobbuffet stamped promo & Rocket emblem sleeves",
      },
      {
        skuName: "Destined Rivals Elite Trainer Box (Team Rocket)",
        productType: "ETB",
        releaseDate: "2025-05-30",
        msrp: 49.99,
        packs: "9 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv4/240_hires.png",
        highlights: "9 Destined Rivals packs + full-art Team Rocket's Wobbuffet promo",
      },
      {
        skuName: "Destined Rivals Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2025-05-30",
        msrp: 26.94,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv6/210_hires.png",
        highlights: "6-pack bundle heavily stocked in Pokémon Center vending machines & Target/Best Buy",
      },
      {
        skuName: "Destined Rivals Booster Box (36 Packs)",
        productType: "Booster Box",
        releaseDate: "2025-05-30",
        msrp: 161.64,
        packs: "36 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv3pt5/205_hires.png",
        highlights: "36-pack sealed display box",
      },
    ],
  },
  {
    slug: "prismatic-evolutions",
    name: "Scarlet & Violet — Prismatic Evolutions",
    series: "Scarlet & Violet Special Set",
    releaseDate: "2025-01-17",
    cardCount: 180,
    heroImage: "https://images.pokemontcg.io/sv8pt5/161_hires.png",
    description:
      "The Eeveelution Stellar Tera special expansion featuring Umbreon ex, Sylveon ex, Espeon ex, Master Ball reverse holos, and God Packs.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "Prismatic Evolutions Super-Premium Collection (Eevee)",
        productType: "Premium Collection",
        releaseDate: "2025-05-16",
        msrp: 89.99,
        packs: "15 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv8pt5/161_hires.png",
        highlights: "15 Prismatic Evolutions packs + furry Eevee deck box, playmat & fruit Eevee ex promo",
      },
      {
        skuName: "Prismatic Evolutions Elite Trainer Box (Eevee)",
        productType: "ETB",
        releaseDate: "2025-01-17",
        msrp: 49.99,
        packs: "9 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv8pt5/167_hires.png",
        highlights: "9 Prismatic Evolutions packs + Eevee full-art promo & Stellar sleeves",
      },
      {
        skuName: "Prismatic Evolutions Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2025-03-07",
        msrp: 26.94,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv8pt5/155_hires.png",
        highlights: "6-pack Booster Bundle — #1 most-wanted vending machine & retail restock SKU",
      },
      {
        skuName: "Prismatic Evolutions Surprise Box & Mini Tins",
        productType: "Blister / Tin",
        releaseDate: "2025-02-07",
        msrp: 22.99,
        packs: "4 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv8pt5/149_hires.png",
        highlights: "4 packs + 1 of 9 stamped Stellar Tera Eeveelution ex promo cards",
      },
    ],
  },
  {
    slug: "journey-together",
    name: "Scarlet & Violet — Journey Together",
    series: "Scarlet & Violet Series",
    releaseDate: "2025-03-28",
    cardCount: 190,
    heroImage: "https://images.pokemontcg.io/sv7/170_hires.png",
    description:
      "Trainer's Pokémon return! Spotlights N's Zoroark ex, Lillie's Clefairy ex, Iono's Bellibolt ex, and Hop's Zacian ex.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "Journey Together Elite Trainer Box",
        productType: "ETB",
        releaseDate: "2025-03-28",
        msrp: 49.99,
        packs: "9 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv7/170_hires.png",
        highlights: "9 Journey Together packs + N's Zorua full-art illustration rare promo",
      },
      {
        skuName: "Journey Together Enhanced Booster Box (36 Packs)",
        productType: "Booster Box",
        releaseDate: "2025-03-28",
        msrp: 161.64,
        packs: "36 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv7/168_hires.png",
        highlights: "Includes stamped N's Reshiram box-topper promo inside every sealed display box",
      },
      {
        skuName: "Journey Together Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2025-03-28",
        msrp: 26.94,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv7/164_hires.png",
        highlights: "6-pack Booster Bundle stocked across grocery vending machines & retail",
      },
      {
        skuName: "Iono's Bellibolt ex Premium Collection",
        productType: "Premium Collection",
        releaseDate: "2025-04-11",
        msrp: 39.99,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv2/269_hires.png",
        highlights: "Full-art Iono's Bellibolt ex promo, acrylic standees & 6 booster packs",
      },
    ],
  },
  {
    slug: "surging-sparks",
    name: "Scarlet & Violet — Surging Sparks",
    series: "Scarlet & Violet Series",
    releaseDate: "2024-11-08",
    cardCount: 252,
    heroImage: "https://images.pokemontcg.io/sv8/238_hires.png",
    description:
      "Headlined by Stellar Tera Pikachu ex Special Illustration Rare, Latias ex, Milotic ex, and Hydreigon ex.",
    sourceUrl: "https://www.pokemon.com/us/pokemon-tcg",
    products: [
      {
        skuName: "Surging Sparks Elite Trainer Box (Pikachu ex)",
        productType: "ETB",
        releaseDate: "2024-11-08",
        msrp: 49.99,
        packs: "9 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv8/238_hires.png",
        highlights: "9 Surging Sparks booster packs + Magneton illustration rare promo",
      },
      {
        skuName: "Surging Sparks Booster Bundle (6 Packs)",
        productType: "Booster Bundle",
        releaseDate: "2024-11-08",
        msrp: 26.94,
        packs: "6 Booster Packs",
        imageUrl: "https://images.pokemontcg.io/sv8/239_hires.png",
        highlights: "6-pack Booster Bundle stocked in Pokémon Automated Vending Machines",
      },
    ],
  },
];

const PRODUCT_BADGE_STYLE: Record<SetProductRelease["productType"], string> = {
  "PC Exclusive ETB": "border-red-500/40 bg-red-500/15 text-red-200",
  ETB: "border-volt/40 bg-volt/15 text-volt",
  "Booster Bundle": "border-green-500/40 bg-green-500/15 text-green-300",
  "Booster Box": "border-purple-500/40 bg-purple-500/15 text-purple-200",
  "Premium Collection": "border-sky-500/40 bg-sky-500/15 text-sky-200",
  "Blister / Tin": "border-amber-500/40 bg-amber-500/15 text-amber-200",
};

export default async function ReleasesPage() {
  const dbReleases = await getReleases();
  const today = new Date().toISOString().slice(0, 10);

  // Merge DB releases with our rich product-level catalog so every set shows full SKU breakdowns & artwork
  const catalogSlugs = new Set(FULL_RELEASE_CATALOG.map((c) => c.slug));
  const extraFromDb: EnrichedSetRelease[] = dbReleases
    .filter((r) => !catalogSlugs.has(r.slug))
    .map((r, idx) => {
      const fallbackArt = [
        "https://images.pokemontcg.io/sv4pt5/234_hires.png",
        "https://images.pokemontcg.io/sv3pt5/199_hires.png",
        "https://images.pokemontcg.io/sv6pt5/92_hires.png",
      ][idx % 3];
      const img = r.imageUrl || fallbackArt;
      const date = r.releaseDate ?? "2026-01-30";
      return {
        slug: r.slug,
        name: r.name,
        series: "Pokémon TCG Expansion",
        releaseDate: date,
        cardCount: r.cardCount ?? 190,
        heroImage: img,
        description:
          r.description ||
          `${r.name} English Pokémon TCG expansion releasing in Elite Trainer Boxes, Booster Bundles, and 3-Pack Blisters across retail and vending machines.`,
        sourceUrl: r.sourceUrl || "https://www.pokemon.com/us/pokemon-tcg",
        products: [
          {
            skuName: `${r.name} Elite Trainer Box (ETB)`,
            productType: "ETB",
            releaseDate: date,
            msrp: 49.99,
            packs: "9 Booster Packs",
            imageUrl: img,
            highlights: `9 ${r.name} booster packs, full-art illustration rare promo & collector sleeves`,
          },
          {
            skuName: `${r.name} Booster Bundle (6 Packs)`,
            productType: "Booster Bundle",
            releaseDate: date,
            msrp: 26.94,
            packs: "6 Booster Packs",
            imageUrl: img,
            highlights: `6 ${r.name} booster packs — stocked in Pokémon Center vending machines & major retail`,
          },
        ],
      };
    });

  const allSets = [...FULL_RELEASE_CATALOG, ...extraFromDb].sort((a, b) =>
    b.releaseDate.localeCompare(a.releaseDate),
  );
  const upcomingSets = allSets
    .filter((s) => s.releaseDate >= today)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const releasedSets = allSets
    .filter((s) => s.releaseDate < today)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

  const renderSetSection = (set: EnrichedSetRelease) => (
    <div key={set.slug} className="card overflow-hidden border-line/90 p-0">
      {/* Set Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-gradient-to-r from-panel-2 via-panel to-panel-2 p-5">
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-volt/30 bg-bg p-1 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={set.heroImage}
              alt={set.name}
              className="h-full w-full rounded-lg object-contain"
              loading="lazy"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-volt/40 bg-volt/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-volt">
                {set.series}
              </span>
              <span className="font-mono text-xs text-slate-300">
                Release: <b className="text-white">{set.releaseDate}</b> · {set.cardCount}+ Cards
              </span>
            </div>
            <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{set.name}</h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-300 sm:text-sm">{set.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ReleaseCountdown date={set.releaseDate} />
          <Link href="/drops" className="btn-ghost text-xs">
            <ShoppingCart className="h-3.5 w-3.5 text-volt" /> Check Live Stock
          </Link>
        </div>
      </div>

      {/* Individual Product Releases for this Set */}
      <div className="p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted">
          <Package className="h-3.5 w-3.5 text-volt" /> Product Lineup &amp; Sealed SKUs ({set.products.length} Products)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {set.products.map((prod) => (
            <div
              key={prod.skuName}
              className="flex gap-3.5 rounded-xl border border-line bg-panel-2/60 p-3.5 transition hover:border-volt/40"
            >
              <div className="relative flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-bg p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prod.imageUrl}
                  alt={prod.skuName}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      PRODUCT_BADGE_STYLE[prod.productType]
                    }`}
                  >
                    {prod.productType}
                  </span>
                  <span className="rounded bg-bg px-2 py-0.5 font-mono text-xs font-bold text-volt">
                    MSRP ${prod.msrp.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1.5 font-bold text-white">{prod.skuName}</p>
                <p className="mt-0.5 text-xs text-slate-300">{prod.highlights}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  <span>
                    📦 <b className="text-slate-200">{prod.packs}</b> · Drops {prod.releaseDate}
                  </span>
                  <Link href="/drops" className="inline-flex items-center gap-1 font-semibold text-volt hover:underline">
                    Track Retailers <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <span className="chip border-volt/30 text-volt">
            <CalendarDays className="h-3.5 w-3.5" /> Expansion Sets &amp; Individual Product SKUs
          </span>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">
            Pokémon TCG Set &amp; Product Release Calendar
          </h1>
          <p className="mt-1 text-sm text-muted">
            Every English expansion set alongside its full sealed product lineup — Elite Trainer Boxes, Pokémon Center
            Exclusives, Booster Bundles, Booster Boxes &amp; Special Collections. Vending machines typically receive new
            set ETBs &amp; Booster Bundles within 24–72 hours of street date.
          </p>
        </div>
        <Link href="/alerts" className="btn-primary">
          <Bell className="h-4 w-4" /> Get Release Alerts
        </Link>
      </div>

      {upcomingSets.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-black text-white">
            <Sparkles className="h-5 w-5 text-volt" /> Upcoming Set &amp; Product Releases
          </h2>
          <div className="space-y-5">{upcomingSets.map(renderSetSection)}</div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-black text-white">
          <Package className="h-5 w-5 text-volt" /> Current &amp; Recent Set Product Lineups (In Vending &amp; Retail Rotation)
        </h2>
        <div className="space-y-5">{releasedSets.map(renderSetSection)}</div>
      </section>
    </div>
  );
}
