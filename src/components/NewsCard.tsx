import Link from "next/link";
import type { NewsPost } from "@/db/schema";
import { CategoryBadge, timeAgo } from "./ui";
import { ShareButtons } from "./ShareButtons";

export function NewsCard({ post, large }: { post: NewsPost; large?: boolean }) {
  return (
    <div className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-volt/40">
      <Link href={`/news/${post.slug}`} className="block">
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt=""
            className={large ? "h-56 w-full object-cover" : "h-36 w-full object-cover"}
            loading="lazy"
          />
        ) : (
          <div
            className={`flex w-full items-center justify-center bg-gradient-to-br from-panel-2 to-bg ${
              large ? "h-56" : "h-36"
            }`}
          >
            <span className="text-4xl">
              {post.category === "drop-report"
                ? "📊"
                : post.category === "vending"
                  ? "⚡"
                  : post.category === "releases"
                    ? "🗓️"
                    : "📰"}
            </span>
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <CategoryBadge category={post.category} />
          {post.pinned && <span className="font-bold text-volt">📌 Breaking</span>}
          <span suppressHydrationWarning>{timeAgo(post.publishedAt)}</span>
        </div>
        <Link href={`/news/${post.slug}`} className="mt-2 block">
          <h3
            className={`font-bold leading-snug text-white group-hover:text-volt ${
              large ? "text-xl" : "text-base"
            }`}
          >
            {post.title}
          </h3>
          <p className="mt-1 line-clamp-3 text-sm text-muted">{post.summary}</p>
        </Link>
        <div className="mt-auto pt-3 space-y-2">
          {post.sourceName && <p className="text-xs text-muted">via {post.sourceName}</p>}
          <ShareButtons
            path={`/news/${post.slug}`}
            title={post.title}
            summary={post.summary ?? undefined}
            compact
          />
        </div>
      </div>
    </div>
  );
}
