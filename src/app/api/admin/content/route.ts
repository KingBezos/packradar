import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { comments, dropCandidates, machines, newsPosts, products, retailListings, sponsors, user } from "@/db/schema";
import { slugify } from "@/lib/geo";
import { loadCommentFlags } from "@/app/api/comments/flag/route";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireRole(["mod", "admin"]);
  const db = await getDb();
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section") || "all";

  const [newsList, sponsorList, machineList, retailList, commentList] = await Promise.all([
    section === "all" || section === "news"
      ? db.select().from(newsPosts).orderBy(desc(newsPosts.pinned), desc(newsPosts.publishedAt)).limit(100)
      : Promise.resolve([]),
    section === "all" || section === "sponsors"
      ? db.select().from(sponsors).orderBy(desc(sponsors.priority), desc(sponsors.createdAt))
      : Promise.resolve([]),
    section === "all" || section === "machines"
      ? db.select().from(machines).orderBy(machines.id).limit(400)
      : Promise.resolve([]),
    section === "all" || section === "retail"
      ? db
          .select({
            listing: retailListings,
            product: products,
          })
          .from(retailListings)
          .innerJoin(products, eq(products.id, retailListings.productId))
          .orderBy(desc(retailListings.inStock), products.name)
          .limit(200)
      : Promise.resolve([]),
    section === "all" || section === "comments"
      ? db
          .select({
            comment: comments,
            authorName: user.name,
            authorEmail: user.email,
          })
          .from(comments)
          .leftJoin(user, eq(user.id, comments.userId))
          .orderBy(desc(comments.createdAt))
          .limit(100)
      : Promise.resolve([]),
  ]);

  const flagsMap = await loadCommentFlags(db);
  const enrichedComments = commentList
    .map((c) => {
      const f = flagsMap[c.comment.id];
      return {
        ...c,
        flagCount: f?.uniqueIpHashes?.length ?? 0,
        flagReasons: f?.reasons ?? [],
      };
    })
    .sort((a, b) => b.flagCount - a.flagCount);

  return {
    news: newsList,
    sponsors: sponsorList,
    machines: machineList,
    retail: retailList,
    comments: enrichedComments,
  };
});

const PatchSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("news"),
    id: z.string(),
    title: z.string().min(3).max(240).optional(),
    summary: z.string().min(5).max(1000).optional(),
    body: z.string().nullable().optional(),
    category: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
    sourceName: z.string().nullable().optional(),
    author: z.string().optional(),
    pinned: z.boolean().optional(),
  }),
  z.object({
    entity: z.literal("machine"),
    id: z.string(),
    retailer: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    status: z.enum(["active", "broken", "removed", "unverified"]).optional(),
    stockStatus: z.enum(["stocked", "low", "out", "unknown"]).optional(),
    intervalMinutes: z.number().int().min(10).max(240).nullable().optional(),
    anchorMinute: z.number().int().min(0).max(59).nullable().optional(),
    accuracy: z.number().int().min(0).max(100).nullable().optional(),
    scheduleVerified: z.boolean().optional(),
  }),
  z.object({
    entity: z.literal("retail"),
    id: z.string(),
    inStock: z.boolean().optional(),
    price: z.number().nullable().optional(),
    url: z.string().url().optional(),
  }),
  z.object({
    entity: z.literal("sponsor"),
    id: z.string(),
    name: z.string().optional(),
    tagline: z.string().nullable().optional(),
    url: z.string().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    radiusMiles: z.number().nullable().optional(),
    active: z.boolean().optional(),
    priority: z.number().int().optional(),
  }),
  z.object({
    entity: z.literal("comment"),
    id: z.string(),
    body: z.string().min(1).max(1000),
  }),
]);

export const PATCH = route(async (req) => {
  await requireRole(["mod", "admin"]);
  const b = PatchSchema.parse(await json(req));
  const db = await getDb();

  if (b.entity === "news") {
    const patch: Partial<typeof newsPosts.$inferInsert> = {};
    if (b.title !== undefined) patch.title = b.title;
    if (b.summary !== undefined) patch.summary = b.summary;
    if (b.body !== undefined) patch.body = b.body;
    if (b.category !== undefined) patch.category = b.category;
    if (b.imageUrl !== undefined) patch.imageUrl = b.imageUrl || null;
    if (b.sourceName !== undefined) patch.sourceName = b.sourceName || null;
    if (b.author !== undefined) patch.author = b.author;
    if (b.pinned !== undefined) patch.pinned = b.pinned;
    await db.update(newsPosts).set(patch).where(eq(newsPosts.id, b.id));
    return { ok: true };
  }

  if (b.entity === "machine") {
    const patch: Partial<typeof machines.$inferInsert> = { updatedAt: new Date() };
    if (b.retailer !== undefined) patch.retailer = b.retailer;
    if (b.street !== undefined) patch.street = b.street;
    if (b.city !== undefined) patch.city = b.city;
    if (b.state !== undefined) patch.state = b.state;
    if (b.zip !== undefined) patch.zip = b.zip;
    if (b.status !== undefined) patch.status = b.status;
    if (b.stockStatus !== undefined) {
      patch.stockStatus = b.stockStatus;
      patch.stockUpdatedAt = new Date();
    }
    if (b.intervalMinutes !== undefined) patch.intervalMinutes = b.intervalMinutes;
    if (b.anchorMinute !== undefined) patch.anchorMinute = b.anchorMinute;
    if (b.accuracy !== undefined) patch.accuracy = b.accuracy;
    if (b.scheduleVerified !== undefined) patch.scheduleVerified = b.scheduleVerified;
    await db.update(machines).set(patch).where(eq(machines.id, b.id));
    const [mRow] = await db.select().from(machines).where(eq(machines.id, b.id));
    if (mRow?.activeCandidateId) {
      const candPatch: Partial<typeof dropCandidates.$inferInsert> = {};
      if (b.intervalMinutes != null) candPatch.intervalMinutes = b.intervalMinutes;
      if (b.anchorMinute != null) candPatch.anchorMinute = b.anchorMinute;
      if (b.accuracy != null) candPatch.accuracy = b.accuracy;
      if (b.scheduleVerified !== undefined) candPatch.verified = b.scheduleVerified;
      if (Object.keys(candPatch).length > 0) {
        await db.update(dropCandidates).set(candPatch).where(eq(dropCandidates.id, mRow.activeCandidateId));
      }
    }
    return { ok: true };
  }

  if (b.entity === "retail") {
    const patch: Partial<typeof retailListings.$inferInsert> = { lastCheckedAt: new Date() };
    if (b.inStock !== undefined) {
      patch.inStock = b.inStock;
      if (b.inStock) patch.lastInStockAt = new Date();
    }
    if (b.price !== undefined) patch.price = b.price;
    if (b.url !== undefined) patch.url = b.url;
    await db.update(retailListings).set(patch).where(eq(retailListings.id, b.id));
    return { ok: true };
  }

  if (b.entity === "sponsor") {
    const patch: Partial<typeof sponsors.$inferInsert> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.tagline !== undefined) patch.tagline = b.tagline;
    if (b.url !== undefined) patch.url = b.url;
    if (b.city !== undefined) patch.city = b.city;
    if (b.state !== undefined) patch.state = b.state;
    if (b.radiusMiles !== undefined) patch.radiusMiles = b.radiusMiles;
    if (b.active !== undefined) patch.active = b.active;
    if (b.priority !== undefined) patch.priority = b.priority;
    await db.update(sponsors).set(patch).where(eq(sponsors.id, b.id));
    return { ok: true };
  }

  if (b.entity === "comment") {
    await db.update(comments).set({ body: b.body }).where(eq(comments.id, b.id));
    return { ok: true };
  }

  return { ok: true };
});

const CreateNewsSchema = z.object({
  title: z.string().min(4).max(240),
  summary: z.string().min(8).max(1000),
  body: z.string().optional().nullable(),
  category: z.string().default("tcg"),
  imageUrl: z.string().optional().nullable(),
  pinned: z.boolean().default(false),
  sourceName: z.string().optional().nullable(),
});

export const POST = route(async (req) => {
  const admin = await requireRole(["mod", "admin"]);
  const b = CreateNewsSchema.parse(await json(req));
  const db = await getDb();
  const slug = `${slugify(b.title)}-${Date.now().toString(36).slice(-4)}`;
  const [created] = await db
    .insert(newsPosts)
    .values({
      slug,
      title: b.title,
      summary: b.summary,
      body: b.body || b.summary,
      category: b.category,
      imageUrl: b.imageUrl || "https://images.pokemontcg.io/sv8pt5/161_hires.png",
      pinned: b.pinned,
      author: admin.name || "King_Bezos",
      sourceName: b.sourceName || "PackRadar Editorial",
      autoGenerated: false,
      publishedAt: new Date(),
    })
    .returning();
  return { ok: true, post: created };
});

export const DELETE = route(async (req) => {
  await requireRole(["admin"]);
  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity");
  const id = searchParams.get("id");
  if (!entity || !id) throw new Error("entity and id required");
  const db = await getDb();

  if (entity === "news") {
    await db.delete(newsPosts).where(eq(newsPosts.id, id));
  } else if (entity === "sponsor") {
    await db.delete(sponsors).where(eq(sponsors.id, id));
  } else if (entity === "retail") {
    await db.delete(retailListings).where(eq(retailListings.id, id));
  } else if (entity === "comment") {
    await db.delete(comments).where(eq(comments.id, id));
  } else {
    throw new Error(`Unknown entity ${entity}`);
  }
  return { ok: true };
});
