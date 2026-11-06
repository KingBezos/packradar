import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNewsPost } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { Markdown } from "@/components/Markdown";
import { CategoryBadge, Avatar, timeAgo } from "@/components/ui";
import { CommentForm, CommentFlagButton } from "@/components/MachineActions";
import { SponsorSlot } from "@/components/SponsorSlot";
import { ShareButtons } from "@/components/ShareButtons";
import { TopicAlertButton } from "@/components/TopicAlertButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getNewsPost(slug);
  if (!r) return { title: "Not found" };
  return {
    title: r.post.title,
    description: r.post.summary,
    openGraph: {
      title: `${r.post.title} | PackRadar`,
      description: r.post.summary ?? undefined,
      url: `https://packradar.onrender.com/news/${r.post.slug}`,
      siteName: "PackRadar — Pokémon Vending & Retail Drop Radar",
      images: r.post.imageUrl ? [{ url: r.post.imageUrl }] : undefined,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: r.post.title,
      description: r.post.summary ?? undefined,
      images: r.post.imageUrl ? [r.post.imageUrl] : undefined,
    },
  };
}

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [r, user] = await Promise.all([getNewsPost(slug), getCurrentUser()]);
  if (!r) notFound();
  const { post, comments } = r;
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/news" className="text-sm text-muted hover:text-white">← All news</Link>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        <CategoryBadge category={post.category} />
        <span>{post.publishedAt.toLocaleDateString("en-US", { dateStyle: "long" })}</span>
        <span>· {post.author}</span>
      </div>
      <h1 className="mt-3 text-3xl font-black leading-tight text-white">{post.title}</h1>
      <div className="mt-4 space-y-3">
        <TopicAlertButton
          topicKeyword={post.title}
          path={`/news/${post.slug}`}
          kind="news"
          buttonLabel="Get Alerts for This Drop"
        />
        <ShareButtons path={`/news/${post.slug}`} title={post.title} summary={post.summary ?? undefined} />
      </div>
      {post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imageUrl} alt="" className="mt-5 max-h-96 w-full rounded-2xl object-cover" />
      )}
      {post.body ? (
        <Markdown source={post.body} />
      ) : (
        <p className="prose-pr mt-5 text-lg">{post.summary}</p>
      )}
      <div className="mt-8 space-y-3">
        <TopicAlertButton
          topicKeyword={post.title}
          path={`/news/${post.slug}`}
          kind="news"
          buttonLabel="Get Alerts for This Drop"
        />
        <ShareButtons path={`/news/${post.slug}`} title={post.title} summary={post.summary ?? undefined} />
      </div>
      {post.sourceUrl && (
        <a
          href={post.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="btn-ghost mt-6"
        >
          Read the full story at {post.sourceName ?? "the source"} ↗
        </a>
      )}
      <div className="mt-8"><SponsorSlot placement="feed" /></div>
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-white">Comments ({comments.length})</h2>
        <CommentForm targetType="news" targetId={post.id} signedIn={Boolean(user)} />
        <ul className="mt-5 space-y-4">
          {comments.map(({ c, name, image }) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={name} image={image} />
              <div>
                <p className="text-sm">
                  <b className="text-white">{name}</b> <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                  <CommentFlagButton commentId={c.id} signedIn={Boolean(user)} />
                </p>
                <p className="text-sm text-slate-300">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
