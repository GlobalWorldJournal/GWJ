import { isDeepStrictEqual } from 'node:util';
import {
  type Article,
  type ArticleInput,
  type ArticleListQuery,
  type ArticleUpdate,
  type PaginatedArticles,
  type PopularArticlesQuery,
  type ArticleRevision,
  type ArticleRevisionSummary,
  type ArticleStatus,
  type Language,
  type Seo,
  slugify,
  stripCreditLines,
  stripPhotoCredit,
} from '@gwj/shared-types';
import { getDb } from '../db/client';
import { isRecordId, newRecordId } from '../db/ids';
import {
  deleteArticle,
  findArticleById,
  findArticleByIdForUpdate,
  findArticleBySlug,
  insertArticle,
  isSlugTaken,
  listArticles,
  recordSlugChange,
  findRedirectSlug,
  findDueScheduledIds,
  findTranslations,
  rowToArticle,
  updateArticle,
  type ArticleFilter,
  type Executor,
} from '../db/repositories/articleRepository';
import type { ArticleRow, NewArticleRow } from '../db/schema/articles';
import {
  findRevision,
  insertRevision,
  listRevisions,
  snapshotOf,
} from '../db/repositories/revisionRepository';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import { errorFields, logger } from '../logger';
import { enqueueJobs } from '../channels/jobRepository';
import { findMostViewed, recordView, utcDay } from '../db/repositories/viewRepository';
import { withImageMetadata } from './mediaService';
import type { ChannelJobAction } from '../db/schema/channelJobs';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fallback slug stem when a title slugifies to an empty string (e.g. all symbols). */
const FALLBACK_SLUG = 'article';

/**
 * Which distribution channels (fediverse, Telegram, …) should act on an
 * article change. Registered by the channels module at startup, so the
 * dependency points channels → articleService, never the reverse; without one
 * (tests, scripts) changes are simply not distributed.
 */
export type DeliveryPlanner = (language: Language, action: ChannelJobAction) => string[];

let deliveryPlanner: DeliveryPlanner | null = null;

/** Register the planner (channels module, at startup). Returns an unregister fn. */
export function setDeliveryPlanner(planner: DeliveryPlanner): () => void {
  deliveryPlanner = planner;
  return () => {
    if (deliveryPlanner === planner) deliveryPlanner = null;
  };
}

/** The article fields a distributed post shows: a change to one is worth an update. */
const DISTRIBUTED_FIELDS = [
  'title',
  'deck',
  'kicker',
  'body',
  'heroImage',
  'slug',
  'corrections',
] as const;

/**
 * A field as a distributed post shows it. The hero image's size and renditions
 * are server metadata (recorded on upload, backfilled for older images): a post
 * shows the picture and its words, so only those count as a change.
 */
function distributedValue(
  state: DistributionState,
  field: (typeof DISTRIBUTED_FIELDS)[number],
): unknown {
  if (field !== 'heroImage' || !state.heroImage) return state[field];
  const { url, alt, caption } = state.heroImage;
  return { url, alt, caption };
}

type DistributionState = Pick<
  ArticleRow,
  'status' | 'language' | (typeof DISTRIBUTED_FIELDS)[number]
>;

/** One distribution step: what to do to the article's posts in one edition's channels. */
interface DistributionStep {
  language: Language;
  action: ChannelJobAction;
}

/**
 * What an article change means for its distributed posts: going live
 * publishes, leaving public view retracts, a visible change to a live story
 * updates, and moving a live story to another edition retracts it from the
 * old edition's channels and publishes it to the new one's. Everything else
 * (drafts, internal fields) is not distributed.
 */
function distributionPlan(
  before: DistributionState | null,
  after: DistributionState,
): DistributionStep[] {
  const wasLive = before?.status === 'published';
  const isLive = after.status === 'published';
  if (!before || !wasLive) return isLive ? [{ language: after.language, action: 'publish' }] : [];
  if (!isLive) return [{ language: before.language, action: 'retract' }];
  if (before.language !== after.language) {
    return [
      { language: before.language, action: 'retract' },
      { language: after.language, action: 'publish' },
    ];
  }
  const changed = DISTRIBUTED_FIELDS.some(
    (field) => !sameValue(distributedValue(before, field), distributedValue(after, field)),
  );
  return changed ? [{ language: after.language, action: 'update' }] : [];
}

/**
 * Queue the distribution steps for an article — in the caller's transaction,
 * so a committed change is always distributed and a rolled-back one never is.
 * The outbox worker (channels/outbox.ts) does the actual work.
 */
async function enqueueDistribution(
  tx: Executor,
  articleId: string,
  steps: readonly DistributionStep[],
): Promise<void> {
  const planner = deliveryPlanner;
  if (!planner) return;
  await enqueueJobs(
    tx,
    steps.flatMap(({ language, action }) =>
      planner(language, action).map((channel) => ({ articleId, channel, action })),
    ),
  );
}

/**
 * Generate a slug unique across the table. Starts from the title's slug and
 * appends `-2`, `-3`, … until no OTHER article claims it. The `articles_slug_unique`
 * constraint remains the authority: a concurrent writer that wins the race makes
 * this insert fail with 23505, which the error handler answers as 409.
 */
async function generateUniqueSlug(
  executor: Executor,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title) || FALLBACK_SLUG;
  let candidate = base;
  let suffix = 2;
  while (await isSlugTaken(executor, candidate, excludeId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Claim an explicitly requested slug, or fail with 409 if another article holds or reserves it. */
async function claimSlug(executor: Executor, slug: string, articleId?: string): Promise<string> {
  if (await isSlugTaken(executor, slug, articleId)) {
    throw new ConflictError('Slug already in use', { slug });
  }
  return slug;
}

/**
 * Merge an SEO patch over the stored values: a key the patch omits is kept (an
 * agent setting only `metaTitle` must not wipe `metaDescription`), and a key set
 * to the empty string is cleared.
 */
function mergeSeo(current: Seo, patch: Seo): Seo {
  const merged: Seo = { ...current, ...patch };
  for (const key of Object.keys(merged) as (keyof Seo)[]) {
    if (merged[key] === undefined || merged[key] === '') delete merged[key];
  }
  return merged;
}

/**
 * The publish timestamps for a transition INTO published. A re-publish restores
 * the original date rather than re-dating the story to "now" (which reordered the
 * front page), and `firstPublishedAt` is stamped exactly once.
 */
function publishStamps(
  current: Pick<ArticleRow, 'firstPublishedAt'>,
  now: Date,
): Partial<NewArticleRow> {
  const first = current.firstPublishedAt ?? now;
  // Going live fulfils (or overrides) any schedule.
  return { status: 'published', publishedAt: first, firstPublishedAt: first, scheduledAt: null };
}

/** The actor recorded when the scheduler publishes a due draft. */
export const SCHEDULER_ACTOR = 'scheduler';

/** A schedule is only meaningful on a draft: refuse it on a live article. */
function assertSchedulable(scheduledAt: string | null | undefined, status: ArticleStatus): void {
  if (scheduledAt && status === 'published') {
    throw new BadRequestError(
      'Only a draft can be scheduled: this article is (or is being) published',
      {
        scheduledAt,
      },
    );
  }
}

/**
 * The translation group an article joins when it is declared a translation of
 * `translationOf`: that article's group. Refuses a target that does not exist,
 * and a group that already has an edition in `language` (the unique constraint
 * is the race-proof backstop; this gives the caller a precise error).
 */
async function translationGroupFor(
  executor: Executor,
  translationOf: string,
  language: Language,
  articleId: string,
): Promise<string> {
  const target = isRecordId(translationOf) ? await findArticleById(translationOf, executor) : null;
  if (!target)
    throw new BadRequestError('translationOf: no article with that id', { translationOf });
  await assertEditionFree(executor, target.translationGroupId, language, articleId);
  return target.translationGroupId;
}

/** Refuse a second article in the same language within one story's group. */
async function assertEditionFree(
  executor: Executor,
  groupId: string,
  language: Language,
  articleId: string,
): Promise<void> {
  const editions = await findTranslations(executor, groupId, articleId, false);
  const clash = editions.find((edition) => edition.language === language);
  if (clash) {
    throw new ConflictError(`This story already has an edition in ${language}`, {
      language,
      articleId: clash.id,
      slug: clash.slug,
    });
  }
}

/** An article with its other language editions attached (single-article responses). */
async function withTranslations(row: ArticleRow, publishedOnly: boolean): Promise<Article> {
  const translations = await findTranslations(
    getDb(),
    row.translationGroupId,
    row.id,
    publishedOnly,
  );
  return { ...rowToArticle(row), translations };
}

function buildPaginated(
  rows: ArticleRow[],
  total: number,
  page: number,
  limit: number,
): PaginatedArticles {
  return {
    data: rows.map(rowToArticle),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

/**
 * Decide whether a field was modified by comparing values, not references. A JSON
 * round trip drops `undefined` keys first, so `{ url, caption: undefined }` from a
 * patch equals the stored `{ url }`.
 */
function sameValue(a: unknown, b: unknown): boolean {
  const normalize = (v: unknown): unknown =>
    v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return isDeepStrictEqual(normalize(a), normalize(b));
}

/**
 * Run a read-modify-write on one article inside a transaction with the row locked
 * (`SELECT … FOR UPDATE`), so two concurrent publishes cannot both observe "draft"
 * and both fan out. Only columns whose value actually changes are written, and
 * `updated_at` moves only when something did — a re-save of identical values is a
 * no-op.
 */
/** The actor recorded for changes no person or agent made directly. */
export const SYSTEM_ACTOR = 'system';

async function mutateArticle(
  id: string,
  actor: string,
  apply: (current: ArticleRow, tx: Executor) => Promise<Partial<NewArticleRow>>,
): Promise<{ before: ArticleRow; after: ArticleRow }> {
  if (!isRecordId(id)) throw new NotFoundError('Article not found');
  return getDb().transaction(async (tx) => {
    const current = await findArticleByIdForUpdate(tx, id);
    if (!current) throw new NotFoundError('Article not found');
    const proposed = await apply(current, tx);
    const changes: Partial<NewArticleRow> = {};
    for (const [key, value] of Object.entries(proposed) as [keyof NewArticleRow, unknown][]) {
      if (value === undefined) continue;
      if (!sameValue(value, current[key as keyof ArticleRow])) {
        Object.assign(changes, { [key]: value });
      }
    }
    if (Object.keys(changes).length === 0) return { before: current, after: current };
    // History and distribution, in the same transaction as the change itself.
    await insertRevision(tx, id, snapshotOf(current), actor);
    const after = await updateArticle(tx, id, { ...changes, updatedAt: new Date() });
    await enqueueDistribution(tx, id, distributionPlan(current, after));
    return { before: current, after };
  });
}

/** Options controlling whether a listing is restricted to published articles. */
export interface ListOptions {
  /**
   * When true, drafts are visible and `query.status` is honoured (admin path).
   * Otherwise the listing is ALWAYS published-only, whatever status was asked for.
   */
  includeAll?: boolean;
  /** Restrict to a single exact author (the ActivityPub writer-outbox path). */
  author?: string;
}

/** Options controlling whether a single fetch may return a draft. */
export interface GetOptions {
  /** When true, drafts are returned too (admin path); default is published-only. */
  includeDrafts?: boolean;
}

export interface ArticleService {
  list(query: ArticleListQuery, options?: ListOptions): Promise<PaginatedArticles>;
  getBySlug(slug: string, options?: GetOptions): Promise<Article>;
  getById(id: string): Promise<Article>;
  create(input: ArticleInput): Promise<Article>;
  /** `actor` (the admin/agent username) is recorded in the article's history. */
  update(id: string, patch: ArticleUpdate, actor?: string): Promise<Article>;
  publish(id: string, actor?: string): Promise<Article>;
  unpublish(id: string, actor?: string): Promise<Article>;
  /** The article's history, newest first. */
  listRevisions(id: string): Promise<ArticleRevisionSummary[]>;
  getRevision(id: string, revisionId: number): Promise<ArticleRevision>;
  /**
   * Put the article's content back to a revision's snapshot (status and slug
   * stay as they are). Recorded as a change itself, so a restore can be undone.
   */
  restoreRevision(id: string, revisionId: number, actor?: string): Promise<Article>;
  remove(id: string): Promise<void>;
  search(q: string, query: ArticleListQuery): Promise<PaginatedArticles>;
  /** The current slug of the PUBLISHED article that used to live at `oldSlug`. */
  findRedirectSlug(oldSlug: string): Promise<string | null>;
  /**
   * Append a dated public correction. Corrections are never edited or removed
   * (a restore leaves them in place); the change is recorded in the history.
   */
  addCorrection(id: string, text: string, actor?: string): Promise<Article>;
  /**
   * Remove the hero image (a takedown of the image alone). A partial patch
   * cannot express "unset", so this is its own operation; on a live story the
   * distributed posts are updated to drop the image too.
   */
  removeHeroImage(id: string, actor?: string): Promise<Article>;
  /** Count a reader's view of a published article (anything else counts nothing). */
  recordView(id: string, at?: Date): Promise<void>;
  /** An edition's most viewed published stories over the last `days` (UTC, today included). */
  popular(query: PopularArticlesQuery, now?: Date): Promise<Article[]>;
  /** Publish every draft whose schedule has come; returns the ids it published. */
  publishDue(now?: Date): Promise<string[]>;
}

export const articleService: ArticleService = {
  async list(query, options) {
    const filter: ArticleFilter = {};
    if (!options?.includeAll) {
      // A public listing only ever surfaces published work — a requested status is
      // ignored here, so `?status=draft` can never leak an unpublished story.
      filter.status = 'published';
    } else if (query.status) {
      filter.status = query.status;
    }
    if (query.category) filter.category = query.category;
    if (query.language) filter.language = query.language;
    if (query.featured) filter.featuredOnly = true;
    if (query.tag) filter.tag = query.tag;
    if (query.sort === 'latest') filter.latestFirst = true;
    // The ActivityPub writer outbox pins its own author; otherwise the query's.
    const author = options?.author ?? query.author;
    if (author !== undefined) filter.author = author;

    // Free-text search (headline, deck, body). Lets the admin/MCP check for an EXISTING
    // similar story before writing a new one — incl. drafts on the admin path —
    // so the newsroom does not publish duplicates.
    const q = query.q?.trim();
    if (q) filter.q = q;

    const { rows, total } = await listArticles(filter, query.page, query.limit);
    return buildPaginated(rows, total, query.page, query.limit);
  },

  async getBySlug(slug, options) {
    const publishedOnly = !options?.includeDrafts;
    const row = await findArticleBySlug(slug, publishedOnly);
    if (!row) throw new NotFoundError('Article not found');
    return withTranslations(row, publishedOnly);
  },

  async getById(id) {
    // A malformed id is a resource that does not exist (404), not a server error.
    const row = isRecordId(id) ? await findArticleById(id) : null;
    if (!row) throw new NotFoundError('Article not found');
    return withTranslations(row, false);
  },

  async create(input) {
    assertSchedulable(input.scheduledAt, input.status);
    const now = new Date();
    const id = newRecordId(now);
    const row = await getDb().transaction(async (db) => {
      const inserted = await insertArticle(db, {
        id,
        // Its own story unless declared an edition of an existing one.
        translationGroupId: input.translationOf
          ? await translationGroupFor(db, input.translationOf, input.language, id)
          : id,
        slug: input.slug
          ? await claimSlug(db, input.slug)
          : await generateUniqueSlug(db, input.title),
        title: input.title,
        deck: input.deck,
        kicker: input.kicker,
        category: input.category,
        language: input.language,
        author: input.author,
        body: input.body,
        heroImage: input.heroImage ? await withImageMetadata(input.heroImage) : input.heroImage,
        status: input.status,
        featured: input.featured,
        tags: input.tags,
        seo: input.seo,
        publishedAt: input.status === 'published' ? now : null,
        firstPublishedAt: input.status === 'published' ? now : null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdAt: now,
        updatedAt: now,
      });
      // A story created directly in the published state is distributed at once.
      await enqueueDistribution(db, inserted.id, distributionPlan(null, inserted));
      return inserted;
    });
    return rowToArticle(row);
  },

  async update(id, patch, actor = SYSTEM_ACTOR) {
    const { after } = await mutateArticle(id, actor, async (current, tx) => {
      const changes: Partial<NewArticleRow> = {
        title: patch.title,
        deck: patch.deck,
        kicker: patch.kicker,
        category: patch.category,
        language: patch.language,
        author: patch.author,
        body: patch.body,
        heroImage: patch.heroImage ? await withImageMetadata(patch.heroImage) : patch.heroImage,
        featured: patch.featured,
        tags: patch.tags,
        seo: patch.seo ? mergeSeo(current.seo, patch.seo) : undefined,
      };

      // Slugs are frozen once an article has ever been live, so links shared on
      // the fediverse, Telegram and search engines never break. Before that the
      // slug follows the title. An explicit slug change is always honoured, and a
      // previously public slug keeps redirecting to the new one.
      const everPublished = current.firstPublishedAt !== null || current.status === 'published';
      let nextSlug: string | undefined;
      if (patch.slug !== undefined && patch.slug !== current.slug) {
        nextSlug = await claimSlug(tx, patch.slug, id);
      } else if (
        patch.slug === undefined &&
        !everPublished &&
        patch.title !== undefined &&
        patch.title !== current.title
      ) {
        nextSlug = await generateUniqueSlug(tx, patch.title, id);
      }
      if (nextSlug !== undefined) {
        changes.slug = nextSlug;
        if (everPublished) await recordSlugChange(tx, id, current.slug, nextSlug);
      }

      // Joining another story's group, or changing language within its own: either
      // way the (group, language) pair must stay unique.
      const language = patch.language ?? current.language;
      if (patch.translationOf !== undefined && patch.translationOf !== id) {
        changes.translationGroupId = await translationGroupFor(
          tx,
          patch.translationOf,
          language,
          id,
        );
      } else if (language !== current.language) {
        await assertEditionFree(tx, current.translationGroupId, language, id);
      }

      if (patch.status !== undefined && patch.status !== current.status) {
        if (patch.status === 'published')
          Object.assign(changes, publishStamps(current, new Date()));
        else Object.assign(changes, { status: patch.status, publishedAt: null });
      }

      if (patch.scheduledAt !== undefined) {
        assertSchedulable(patch.scheduledAt, changes.status ?? current.status);
        changes.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
      }
      return changes;
    });
    return rowToArticle(after);
  },

  async publish(id, actor = SYSTEM_ACTOR) {
    const { after } = await mutateArticle(id, actor, async (current) =>
      current.status === 'published' ? {} : publishStamps(current, new Date()),
    );
    return rowToArticle(after);
  },

  async unpublish(id, actor = SYSTEM_ACTOR) {
    // `firstPublishedAt` is kept: the slug stays frozen and a later re-publish
    // restores the original date. The distributed posts are retracted (queued
    // by mutateArticle) and published again if the story goes live again.
    const { after } = await mutateArticle(id, actor, async () => ({
      status: 'draft',
      publishedAt: null,
    }));
    return rowToArticle(after);
  },

  async findRedirectSlug(oldSlug) {
    return findRedirectSlug(oldSlug);
  },

  async addCorrection(id, text, actor = SYSTEM_ACTOR) {
    const { after } = await mutateArticle(id, actor, async (current) => ({
      corrections: [...current.corrections, { at: new Date().toISOString(), text }],
    }));
    return withTranslations(after, false);
  },

  async removeHeroImage(id, actor = SYSTEM_ACTOR) {
    const { after } = await mutateArticle(id, actor, async () => ({ heroImage: null }));
    return withTranslations(after, false);
  },

  async recordView(id, at = new Date()) {
    if (isRecordId(id)) await recordView(id, utcDay(at));
  },

  async popular(query, now = new Date()) {
    const since = new Date(now.getTime() - (query.days - 1) * DAY_MS);
    const rows = await findMostViewed(query.language, utcDay(since), query.limit);
    return rows.map(rowToArticle);
  },

  async publishDue(now = new Date()) {
    const published: string[] = [];
    for (const id of await findDueScheduledIds(now)) {
      try {
        // Re-checked under the row lock: a schedule cancelled or moved since the
        // lookup is respected, and two backend tasks running this at once publish
        // (and queue its distribution) exactly once.
        const { before, after } = await mutateArticle(id, SCHEDULER_ACTOR, async (current) =>
          current.status === 'draft' && current.scheduledAt !== null && current.scheduledAt <= now
            ? publishStamps(current, now)
            : {},
        );
        if (after.status === 'published' && before.status !== 'published') published.push(id);
      } catch (err) {
        logger.error('scheduled publish failed', { articleId: id, ...errorFields(err) });
      }
    }
    return published;
  },

  async listRevisions(id) {
    if (!isRecordId(id) || !(await findArticleById(id)))
      throw new NotFoundError('Article not found');
    return listRevisions(id);
  },

  async getRevision(id, revisionId) {
    const revision = isRecordId(id) ? await findRevision(id, revisionId) : null;
    if (!revision) throw new NotFoundError('Revision not found');
    return revision;
  },

  async restoreRevision(id, revisionId, actor = SYSTEM_ACTOR) {
    const { snapshot } = await articleService.getRevision(id, revisionId);
    const { after } = await mutateArticle(id, actor, async (current, tx) => {
      // The story's other editions keep their language: a restore may not
      // collide with one of them.
      if (snapshot.language !== current.language) {
        await assertEditionFree(tx, current.translationGroupId, snapshot.language, id);
      }
      // Content only. Whether the story is live, and its URL, are not history
      // to roll back: those change through publish/unpublish and an explicit slug.
      return {
        title: snapshot.title,
        deck: snapshot.deck,
        kicker: snapshot.kicker,
        category: snapshot.category,
        language: snapshot.language,
        author: snapshot.author,
        // History recorded before the credit rule still holds outlet credits.
        body: stripCreditLines(snapshot.body),
        heroImage: snapshot.heroImage && {
          ...snapshot.heroImage,
          ...(snapshot.heroImage.caption !== undefined
            ? { caption: stripPhotoCredit(snapshot.heroImage.caption) }
            : {}),
        },
        featured: snapshot.featured,
        tags: snapshot.tags,
        seo: snapshot.seo,
      };
    });
    return withTranslations(after, false);
  },

  async remove(id) {
    if (!isRecordId(id)) throw new NotFoundError('Article not found');
    await getDb().transaction(async (tx) => {
      const current = await findArticleByIdForUpdate(tx, id);
      if (!current) throw new NotFoundError('Article not found');
      await deleteArticle(id, tx);
      // Whatever was ever distributed is taken down: retraction needs only the
      // id and the recorded posts, not the deleted row.
      if (current.firstPublishedAt !== null) {
        await enqueueDistribution(tx, id, [{ language: current.language, action: 'retract' }]);
      }
    });
  },

  async search(q, query) {
    // Public search: published work only, whatever status the caller asked for.
    const filter: ArticleFilter = { status: 'published', q };
    if (query.category) filter.category = query.category;
    if (query.language) filter.language = query.language;
    if (query.tag) filter.tag = query.tag;
    if (query.author) filter.author = query.author;
    const { rows, total } = await listArticles(filter, query.page, query.limit);
    return buildPaginated(rows, total, query.page, query.limit);
  },
};
