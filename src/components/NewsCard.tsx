import Link from "next/link";
import type { NewsPost } from "@/db/schema";
import { CategoryBadge, timeAgo } from "./ui";

export function NewsCard({ post, large }: { post: NewsPost; large?: boolean }) {
  return (
    <Link href={`/news/${post.slug}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-volt/40">
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imageUrl} alt="" className={large ? "h-56 w-full object-cover" : "h-36 w-full object-cover"} loading="lazy" />
      ) : (
        <div className={`flex w-full items-center justify-center bg-gradient-to-br from-panel-2 to-bg ${large ? "h-56" : "h-36"}`}>
          <span className="text-4xl">{post.category === "drop-report" ? "📊" : post.category === "vending" ? "⚡" : post.category === "releases" ? "🗓️" : "📰"}</span>
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <CategoryBadge category={post.category} />
          {post.pinned && <span className="text-volt">📌 Pinned</span>}
          <span suppressHydrationWarning>{timeAgo(post.publishedAt)}</span>
        </div>
        <h3 className={`mt-2 font-bold leading-snug text-white group-hover:text-volt ${large ? "text-xl" : "text-base"}`}>{post.title}</h3>
        <p className="mt-1 line-clamp-3 text-sm text-muted">{post.summary}</p>
        {post.sourceName && <p className="mt-auto pt-3 text-xs text-muted">via {post.sourceName}</p>}
      </div>
    </Link>
  );
}
