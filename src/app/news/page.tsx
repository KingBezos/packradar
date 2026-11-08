import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { NewsCard } from "@/components/NewsCard";
import { ReleaseNewsAlertBanner } from "@/components/ReleaseNewsAlertBanner";
import { CATEGORY_LABEL } from "@/components/ui";
import { latestNews } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pokémon News, Online Lotteries & Daily Drop Reports" };

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ cat?: string; page?: string }> }) {
  const { cat, page } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const per = 18;
  const posts = await latestNews(per + 1, cat, (p - 1) * per);
  const hasMore = posts.length > per;
  const shown = posts.slice(0, per);
  const cats = ["vending", "drop-report", "releases", "tcg", "games", "anime"];
  const href = (c?: string, pg = 1) => `/news?${new URLSearchParams({ ...(c ? { cat: c } : {}), ...(pg > 1 ? { page: String(pg) } : {}) })}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-black text-white">Pokémon Release News, Online Lotteries &amp; Drop Radar</h1>
      <p className="mt-1 text-muted">
        Breaking Pokémon TCG release updates, Walmart/Target/Amazon online lottery windows, and our automated Daily Drop Report.
      </p>
      <div className="mt-5">
        <ReleaseNewsAlertBanner currentPath="/news" />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/news" className={clsx("chip", !cat && "border-volt text-volt")}>All</Link>
        {cats.map((c) => (
          <Link key={c} href={href(c)} className={clsx("chip", cat === c && "border-volt text-volt")}>{CATEGORY_LABEL[c]}</Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((n, i) => (
          <NewsCard key={n.id} post={n} large={i === 0 && p === 1} />
        ))}
      </div>
      <div className="mt-8 flex justify-between">
        {p > 1 ? <Link className="btn-ghost" href={href(cat, p - 1)}>← Newer</Link> : <span />}
        {hasMore && <Link className="btn-ghost" href={href(cat, p + 1)}>Older →</Link>}
      </div>
    </div>
  );
}
