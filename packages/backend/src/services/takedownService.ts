import { count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type {
  PaginatedTakedownRequests,
  TakedownAction,
  TakedownListQuery,
  TakedownRequestInput,
  TakedownRequestRecord,
} from '@gwj/shared-types';
import { getDb } from '../db/client';
import { isRecordId, newRecordId } from '../db/ids';
import { articles } from '../db/schema/articles';
import { takedownRequests, type TakedownRequestRow } from '../db/schema/takedownRequests';
import { articleService } from './articleService';
import { NotFoundError } from '../errors';

/** Map a row to its public/admin DTO (absent optional values omitted, as before). */
export function takedownRequestToDTO(row: TakedownRequestRow): TakedownRequestRecord {
  return {
    id: row.id,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    articleUrl: row.articleUrl ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    claimType: row.claimType,
    explanation: row.explanation,
    goodFaithAssertion: true,
    status: row.status,
    articleId: row.articleId,
    resolution: row.resolution ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Best-effort match of a submitted URL to one of our own articles: either it
 * names the story's own page (`/article/<slug>`), or it is the CDN/original
 * URL we recorded internally when the newsroom copied the image. Returns
 * null rather than guessing when nothing matches — a request with no
 * resolved article still gets reviewed, just without a one-click action.
 */
async function resolveArticleId(input: TakedownRequestInput): Promise<string | null> {
  const db = getDb();
  const slugMatch = input.articleUrl ? /\/article\/([^/?#]+)/.exec(input.articleUrl) : null;
  const slug = slugMatch?.[1];
  if (slug) {
    const [bySlug] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);
    if (bySlug) return bySlug.id;
  }
  const urls = [input.articleUrl, input.imageUrl].filter((u): u is string => !!u);
  if (urls.length === 0) return null;
  const provenance: SQL[] = [
    inArray(sql`${articles.heroImage}->>'url'`, urls),
    inArray(sql`${articles.source}->>'articleUrl'`, urls),
    inArray(sql`${articles.source}->>'imageUrl'`, urls),
  ];
  // Oldest first, so the match is deterministic when several articles carry the URL.
  const [byProvenance] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(or(...provenance))
    .orderBy(articles.createdAt, articles.id)
    .limit(1);
  return byProvenance?.id ?? null;
}

async function findRowById(id: string): Promise<TakedownRequestRow> {
  const [row] = isRecordId(id)
    ? await getDb().select().from(takedownRequests).where(eq(takedownRequests.id, id)).limit(1)
    : [];
  if (!row) throw new NotFoundError('Takedown request not found');
  return row;
}

export interface TakedownService {
  create(input: TakedownRequestInput): Promise<TakedownRequestRecord>;
  list(query: TakedownListQuery): Promise<PaginatedTakedownRequests>;
  getById(id: string): Promise<TakedownRequestRecord>;
  /** Resolve a request, applying its action to the article as `actor`. */
  action(id: string, action: TakedownAction, actor?: string): Promise<TakedownRequestRecord>;
}

export const takedownService: TakedownService = {
  async create(input) {
    const articleId = await resolveArticleId(input);
    const now = new Date();
    const [row] = await getDb()
      .insert(takedownRequests)
      .values({
        id: newRecordId(now),
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        articleUrl: input.articleUrl,
        imageUrl: input.imageUrl,
        claimType: input.claimType,
        explanation: input.explanation,
        goodFaithAssertion: input.goodFaithAssertion,
        status: 'pending',
        articleId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error('insert into takedown_requests returned no row');
    return takedownRequestToDTO(row);
  },

  async list(query) {
    const db = getDb();
    const where = query.status ? eq(takedownRequests.status, query.status) : undefined;
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(takedownRequests)
        .where(where)
        .orderBy(desc(takedownRequests.createdAt), desc(takedownRequests.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db.select({ total: count() }).from(takedownRequests).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      data: rows.map(takedownRequestToDTO),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },

  async getById(id) {
    return takedownRequestToDTO(await findRowById(id));
  },

  async action(id, action, actor) {
    const current = await findRowById(id);
    if (action.status === 'actioned' && action.apply !== 'none' && current.articleId) {
      // Through the article service, so the change is in the article's history
      // and its distributed posts (fediverse, Telegram) are retracted or updated.
      if (action.apply === 'unpublish') await articleService.unpublish(current.articleId, actor);
      else if (action.apply === 'clear-hero-image') {
        await articleService.removeHeroImage(current.articleId, actor);
      }
    }
    const changes: Partial<Pick<TakedownRequestRow, 'status' | 'resolution'>> = {};
    if (action.status !== current.status) changes.status = action.status;
    if (action.resolution !== undefined && action.resolution !== current.resolution)
      changes.resolution = action.resolution;
    // No change, no write: re-applying the same decision does not move updatedAt.
    if (Object.keys(changes).length === 0) return takedownRequestToDTO(current);
    const [row] = await getDb()
      .update(takedownRequests)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(takedownRequests.id, id))
      .returning();
    if (!row) throw new NotFoundError('Takedown request not found');
    return takedownRequestToDTO(row);
  },
};
