/**
 * Which Oxy files each of GWJ's records uses, read from the content itself —
 * the single source both the reference worker (one entity, after a change) and
 * the nightly reconciliation (every entity of a type) work from, so the two can
 * never disagree about what "in use" means. See `entities.ts` for the types.
 */
import { and, asc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import type { ArticleSnapshot, HeroImage, Seo } from '@gwj/shared-types';
import { getDb } from '../db/client';
import { adCampaigns } from '../db/schema/adCampaigns';
import { articleChannelPosts } from '../db/schema/articleChannelPosts';
import { articleRevisions } from '../db/schema/articleRevisions';
import { articles } from '../db/schema/articles';
import { writerPortraits } from '../db/schema/writerPortraits';
import type { MediaEntityType } from './entities';
import { parseSocialCardEntityId, socialCardEntityId } from './entities';
import type { OxyUrls } from './oxyUrls';

/** One use: entity `entityId` (of the type being listed) shows file `fileId`. */
export interface InventoryItem {
  fileId: string;
  entityId: string;
}

/** Rows read per query while streaming an inventory. */
const INVENTORY_PAGE = 200;

/** The fields of an article (or of one of its revisions) that can show a file. */
interface ArticleMedia {
  heroImage: HeroImage | null;
  body: string;
  seo: Seo;
}

function articleMediaText(media: ArticleMedia): string {
  // Only what is SHOWN: `source.imageUrl` is provenance (where an image was
  // copied from), never displayed.
  return `${JSON.stringify(media.heroImage ?? null)}\n${media.body}\n${media.seo.ogImage ?? ''}`;
}

function snapshotMedia(snapshot: ArticleSnapshot): ArticleMedia {
  return { heroImage: snapshot.heroImage, body: snapshot.body, seo: snapshot.seo };
}

/** The file an ad campaign's creative is, or none for a legacy/external URL. */
function adFiles(urls: OxyUrls, imageUrl: string): string[] {
  const fileId = urls.fileIdOf(imageUrl);
  return fileId ? [fileId] : [];
}

function cardFileOf(ref: Record<string, unknown>): string | null {
  return typeof ref.cardFileId === 'string' && ref.cardFileId.length > 0 ? ref.cardFileId : null;
}

async function articleFiles(urls: OxyUrls, articleId: string): Promise<string[]> {
  const db = getDb();
  const [row] = await db
    .select({ heroImage: articles.heroImage, body: articles.body, seo: articles.seo })
    .from(articles)
    .where(eq(articles.id, articleId));
  if (!row) return [];
  const revisions = await db
    .select({ snapshot: articleRevisions.snapshot })
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId));
  const text = [row, ...revisions.map((revision) => snapshotMedia(revision.snapshot))]
    .map(articleMediaText)
    .join('\n');
  return urls.fileIdsIn(text);
}

/** The Oxy files one entity uses NOW (none when it no longer exists). */
export async function filesOf(
  urls: OxyUrls,
  entityType: MediaEntityType,
  entityId: string,
): Promise<string[]> {
  const db = getDb();
  switch (entityType) {
    case 'article':
      return articleFiles(urls, entityId);
    case 'ad_campaign': {
      const [row] = await db
        .select({ imageUrl: adCampaigns.imageUrl })
        .from(adCampaigns)
        .where(eq(adCampaigns.id, entityId));
      return row ? adFiles(urls, row.imageUrl) : [];
    }
    case 'social_card': {
      const parsed = parseSocialCardEntityId(entityId);
      if (!parsed) return [];
      const [row] = await db
        .select({ ref: articleChannelPosts.ref })
        .from(articleChannelPosts)
        .where(
          and(
            eq(articleChannelPosts.articleId, parsed.articleId),
            eq(articleChannelPosts.channel, parsed.channel),
          ),
        );
      const fileId = row ? cardFileOf(row.ref) : null;
      return fileId ? [fileId] : [];
    }
    case 'writer_portrait': {
      const [row] = await db
        .select({ fileId: writerPortraits.oxyFileId })
        .from(writerPortraits)
        .where(eq(writerPortraits.username, entityId));
      return row ? [row.fileId] : [];
    }
  }
}

async function* articleInventory(urls: OxyUrls): AsyncGenerator<InventoryItem> {
  const db = getDb();
  let after = '';
  for (;;) {
    const page = await db
      .select({
        id: articles.id,
        heroImage: articles.heroImage,
        body: articles.body,
        seo: articles.seo,
      })
      .from(articles)
      .where(gt(articles.id, after))
      .orderBy(asc(articles.id))
      .limit(INVENTORY_PAGE);
    if (page.length === 0) return;
    const ids = page.map((row) => row.id);
    const revisions = await db
      .select({ articleId: articleRevisions.articleId, snapshot: articleRevisions.snapshot })
      .from(articleRevisions)
      .where(inArray(articleRevisions.articleId, ids));
    const texts = new Map<string, string[]>(page.map((row) => [row.id, [articleMediaText(row)]]));
    for (const revision of revisions) {
      texts.get(revision.articleId)?.push(articleMediaText(snapshotMedia(revision.snapshot)));
    }
    for (const [entityId, parts] of texts) {
      for (const fileId of urls.fileIdsIn(parts.join('\n'))) yield { fileId, entityId };
    }
    after = ids[ids.length - 1] ?? after;
    if (page.length < INVENTORY_PAGE) return;
  }
}

async function* adInventory(urls: OxyUrls): AsyncGenerator<InventoryItem> {
  const db = getDb();
  let after = '';
  for (;;) {
    const page = await db
      .select({ id: adCampaigns.id, imageUrl: adCampaigns.imageUrl })
      .from(adCampaigns)
      .where(gt(adCampaigns.id, after))
      .orderBy(asc(adCampaigns.id))
      .limit(INVENTORY_PAGE);
    for (const row of page) {
      for (const fileId of adFiles(urls, row.imageUrl)) yield { fileId, entityId: row.id };
    }
    const last = page[page.length - 1];
    if (!last || page.length < INVENTORY_PAGE) return;
    after = last.id;
  }
}

async function* socialCardInventory(): AsyncGenerator<InventoryItem> {
  const db = getDb();
  let after = 0;
  for (;;) {
    const page = await db
      .select({
        id: articleChannelPosts.id,
        articleId: articleChannelPosts.articleId,
        channel: articleChannelPosts.channel,
        ref: articleChannelPosts.ref,
      })
      .from(articleChannelPosts)
      .where(and(gt(articleChannelPosts.id, after), sql`${articleChannelPosts.ref} ? 'cardFileId'`))
      .orderBy(asc(articleChannelPosts.id))
      .limit(INVENTORY_PAGE);
    for (const row of page) {
      const fileId = cardFileOf(row.ref);
      if (fileId) yield { fileId, entityId: socialCardEntityId(row.articleId, row.channel) };
    }
    const last = page[page.length - 1];
    if (!last || page.length < INVENTORY_PAGE) return;
    after = last.id;
  }
}

async function* portraitInventory(): AsyncGenerator<InventoryItem> {
  const rows = await getDb()
    .select({ username: writerPortraits.username, fileId: writerPortraits.oxyFileId })
    .from(writerPortraits)
    .where(isNotNull(writerPortraits.oxyFileId))
    .orderBy(asc(writerPortraits.username));
  for (const row of rows) yield { fileId: row.fileId, entityId: row.username };
}

/** Every use of a file by every entity of `entityType`, streamed from the content. */
export function inventoryOf(
  urls: OxyUrls,
  entityType: MediaEntityType,
): AsyncGenerator<InventoryItem> {
  switch (entityType) {
    case 'article':
      return articleInventory(urls);
    case 'ad_campaign':
      return adInventory(urls);
    case 'social_card':
      return socialCardInventory();
    case 'writer_portrait':
      return portraitInventory();
  }
}
