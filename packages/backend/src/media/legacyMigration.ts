/**
 * The one-time move of the legacy `gwj-media` bucket into Oxy Files (run by
 * `migrateToOxy.ts`; procedure in docs/OXY-FILES.md). Resumable: every object
 * and its outcome is a row of `legacy_media_objects`, and a re-run only does
 * what is not done. Nothing is ever deleted — not in the bucket, not in Oxy.
 *
 * 1. INVENTORY every object of the bucket and classify it (`LEGACY_MEDIA_KINDS`).
 * 2. COPY each object (renditions excepted) VERBATIM into a GWJ-owned Oxy file
 *    and require Oxy's SHA-256 of what it stored to equal the SHA-256 of the
 *    bucket's bytes; a mismatch is a failure, never accepted. A rendition is
 *    MAPPED to its image's file (Oxy renders its own renditions).
 * 3. REWRITE every legacy URL in GWJ's content to the Oxy URL it was copied to
 *    — articles (hero, body, og:image), their revisions, ad creatives, the
 *    media registry — as a technical fill-in, not an edit: no `updated_at`, no
 *    revision, no redistribution. Roster portraits get their `writer_portraits` row.
 * 4. RECONCILE GWJ's references with Oxy (ADR 0041 D6), so every copied file
 *    that GWJ shows is referenced before Oxy's lifecycle sweep could collect it.
 *    A copied object nothing shows (an orphan upload, an old social card) is
 *    left unreferenced: Oxy trashes it after a day and purges it 30 days later
 *    (D5) — exactly what GWJ, which never deleted, should have done.
 * 5. VERIFY: every copied file is in Oxy with the recorded hash, and no legacy
 *    URL is left in the content.
 *
 * `preview` does steps 1 and 3 in memory and writes nothing anywhere.
 * Reports carry counts, row ids and SHA-256s — never a key or a URL.
 */
import { createHash } from 'node:crypto';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { ArticleSnapshot, HeroImage, Seo } from '@gwj/shared-types';
import { validateImageBuffer } from '@gwj/shared-types/image-validation';
import { getDb } from '../db/client';
import { adCampaigns } from '../db/schema/adCampaigns';
import { articleRevisions } from '../db/schema/articleRevisions';
import { articles } from '../db/schema/articles';
import {
  legacyMediaObjects,
  type LegacyMediaKind,
  type LegacyMediaObjectRow,
} from '../db/schema/legacyMediaObjects';
import { mediaAssets } from '../db/schema/mediaAssets';
import { writerPortraits } from '../db/schema/writerPortraits';
import { errorFields, logger } from '../logger';
import type { MediaEntityType } from './entities';
import type { LegacyMedia } from './legacy';
import type { OxyFiles } from './oxyFiles';
import { runDueReconciliations } from './reconcile';
import type { MediaReconcileResult } from '../db/schema/mediaReconcileRuns';

/** One object of the legacy bucket. */
export interface LegacyBucketObject {
  key: string;
  size: number;
  etag?: string;
}

/** Read access to the legacy bucket (S3 in production, a map in tests). */
export interface LegacyBucket {
  list(): AsyncIterable<LegacyBucketObject>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType?: string }>;
}

export type MigrationMode = 'preview' | 'apply';

export interface MigrationFailure {
  /** `legacy_media_objects.id` (0 in a preview, which stores nothing). */
  objectId: number;
  kind: LegacyMediaKind;
  sha256: string | null;
  reason: string;
  /** Whether GWJ's content shows it (a failure that blocks the verdict). */
  inUse: boolean;
}

export interface MigrationReport {
  mode: MigrationMode;
  inventory: { objects: number; bytes: number; byKind: Record<LegacyMediaKind, number> };
  copy: { copied: number; alreadyCopied: number; mapped: number; failed: number; pending: number };
  rewrite: {
    articles: number;
    revisions: number;
    adCampaigns: number;
    mediaAssets: number;
    writerPortraits: number;
    /** Legacy URLs in the content whose object is not (yet) in Oxy, by table. */
    unresolved: Record<string, number>;
  };
  reconcile: Partial<Record<MediaEntityType, MediaReconcileResult>>;
  verify: { checked: number; missing: number; mismatched: number; legacyUrlsRemaining: number };
  failures: MigrationFailure[];
  verdict: 'PASS' | 'FAIL' | 'PREVIEW';
}

const RENDITION_KEY = /^(.*)\.w(\d+)\.webp$/;
const WRITER_KEY = /^writers\/([a-z0-9]+)\.png$/;
const SOCIAL_CARD_PREFIX = 'social-cards/';
const PAGE = 200;

interface Classified {
  kind: LegacyMediaKind;
  imageKey: string | null;
  renditionWidth: number | null;
}

function withoutExtension(key: string): string {
  return key.replace(/\.[^./]+$/, '');
}

/** Classify every key; a rendition needs its image to be in the bucket. */
export function classifyKeys(keys: readonly string[]): Map<string, Classified> {
  const imagesByStem = new Map<string, string>();
  for (const key of keys) {
    if (!RENDITION_KEY.test(key)) imagesByStem.set(withoutExtension(key), key);
  }
  const result = new Map<string, Classified>();
  for (const key of keys) {
    const rendition = RENDITION_KEY.exec(key);
    const imageKey = rendition?.[1] ? imagesByStem.get(rendition[1]) : undefined;
    if (rendition && imageKey) {
      result.set(key, { kind: 'rendition', imageKey, renditionWidth: Number(rendition[2]) });
    } else if (WRITER_KEY.test(key)) {
      result.set(key, { kind: 'writer_portrait', imageKey: null, renditionWidth: null });
    } else if (key.startsWith(SOCIAL_CARD_PREFIX)) {
      result.set(key, { kind: 'social_card', imageKey: null, renditionWidth: null });
    } else {
      result.set(key, { kind: 'image', imageKey: null, renditionWidth: null });
    }
  }
  return result;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Where a legacy key now lives: its file, and the rung standing in for a rendition. */
interface Target {
  fileId: string;
  rendition: number | null;
  mime: string | null;
}

/** Everything the rewrite needs to turn a legacy URL into an Oxy one. */
class UrlMap {
  constructor(
    private readonly targets: Map<string, Target>,
    private readonly oxy: OxyFiles,
    private readonly legacy: LegacyMedia,
  ) {}

  unresolved = 0;

  /** `text` with every resolvable legacy URL rewritten; unresolvable ones counted. */
  rewriteText(text: string): string {
    return this.legacy.replaceIn(text, (key) => {
      const target = this.targets.get(key);
      if (!target) {
        this.unresolved += 1;
        return null;
      }
      return target.rendition
        ? this.oxy.url(target.fileId, this.oxy.rungFor(target.rendition))
        : this.oxy.url(target.fileId);
    });
  }

  /** A hero image rewritten, with Oxy renditions in place of the legacy ones. */
  rewriteHero(hero: HeroImage | null): HeroImage | null {
    if (!hero) return hero;
    const key = this.legacy.keyOf(hero.url);
    const target = key ? this.targets.get(key) : undefined;
    if (!key) return hero;
    if (!target) {
      this.unresolved += 1;
      return hero;
    }
    const mime = target.mime ?? hero.mime;
    const variants = target.rendition
      ? []
      : this.oxy.variantsFor(target.fileId, hero.width, mime ?? '');
    const { variants: _legacyVariants, ...rest } = hero;
    return {
      ...rest,
      url: this.rewriteText(hero.url),
      ...(mime ? { mime } : {}),
      ...(variants.length > 0 ? { variants } : {}),
    };
  }

  rewriteSeo(seo: Seo): Seo {
    return seo.ogImage ? { ...seo, ogImage: this.rewriteText(seo.ogImage) } : seo;
  }
}

function emptyReport(mode: MigrationMode): MigrationReport {
  return {
    mode,
    inventory: {
      objects: 0,
      bytes: 0,
      byKind: { image: 0, rendition: 0, social_card: 0, writer_portrait: 0 },
    },
    copy: { copied: 0, alreadyCopied: 0, mapped: 0, failed: 0, pending: 0 },
    rewrite: {
      articles: 0,
      revisions: 0,
      adCampaigns: 0,
      mediaAssets: 0,
      writerPortraits: 0,
      unresolved: {},
    },
    reconcile: {},
    verify: { checked: 0, missing: 0, mismatched: 0, legacyUrlsRemaining: 0 },
    failures: [],
    verdict: mode === 'preview' ? 'PREVIEW' : 'FAIL',
  };
}

export interface MigrationDeps {
  bucket: LegacyBucket;
  oxy: OxyFiles;
  legacy: LegacyMedia;
}

/** Step 1: list and classify; in `apply`, record new objects (resumable). */
async function inventory(
  deps: MigrationDeps,
  report: MigrationReport,
  mode: MigrationMode,
): Promise<LegacyBucketObject[]> {
  const objects: LegacyBucketObject[] = [];
  for await (const object of deps.bucket.list()) objects.push(object);
  const classes = classifyKeys(objects.map((object) => object.key));
  report.inventory.objects = objects.length;
  for (const object of objects) {
    report.inventory.bytes += object.size;
    const kind = classes.get(object.key)?.kind ?? 'image';
    report.inventory.byKind[kind] += 1;
  }
  if (mode === 'apply') {
    for (let start = 0; start < objects.length; start += PAGE) {
      const rows = objects.slice(start, start + PAGE).map((object) => {
        const classified = classes.get(object.key);
        return {
          key: object.key,
          kind: classified?.kind ?? 'image',
          imageKey: classified?.imageKey ?? null,
          renditionWidth: classified?.renditionWidth ?? null,
          size: object.size,
          etag: object.etag ?? null,
        };
      });
      await getDb().insert(legacyMediaObjects).values(rows).onConflictDoNothing();
    }
  }
  return objects;
}

/** Step 2: copy one object, verifying the hash Oxy reports against the bucket's bytes. */
async function copyOne(deps: MigrationDeps, row: LegacyMediaObjectRow): Promise<void> {
  const db = getDb();
  try {
    const { bytes, contentType } = await deps.bucket.get(row.key);
    const sha256 = sha256Of(bytes);
    const sniffed = validateImageBuffer(Buffer.from(bytes), { minWidth: 1, minHeight: 1 });
    const mime = sniffed.ok ? sniffed.mime : (contentType ?? 'application/octet-stream');
    const stored = await deps.oxy.uploadImage(bytes, mime, row.key.split('/').pop());
    if (stored.sha256 !== sha256) {
      await db
        .update(legacyMediaObjects)
        .set({
          status: 'failed',
          sha256,
          contentType: mime,
          error: 'sha256-mismatch',
          attempts: sql`${legacyMediaObjects.attempts} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(legacyMediaObjects.id, row.id));
      return;
    }
    await db
      .update(legacyMediaObjects)
      .set({
        status: 'copied',
        sha256,
        contentType: mime,
        oxyFileId: stored.fileId,
        error: null,
        attempts: sql`${legacyMediaObjects.attempts} + 1`,
        copiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(legacyMediaObjects.id, row.id));
  } catch (err) {
    logger.warn('legacy media: copy failed', { objectId: row.id, ...errorFields(err) });
    await db
      .update(legacyMediaObjects)
      .set({
        status: 'failed',
        error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        attempts: sql`${legacyMediaObjects.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(legacyMediaObjects.id, row.id));
  }
}

async function copyAll(deps: MigrationDeps, report: MigrationReport): Promise<void> {
  const db = getDb();
  report.copy.alreadyCopied = await db.$count(
    legacyMediaObjects,
    eq(legacyMediaObjects.status, 'copied'),
  );
  let after = 0;
  for (;;) {
    const page = await db
      .select()
      .from(legacyMediaObjects)
      .where(
        and(
          gt(legacyMediaObjects.id, after),
          inArray(legacyMediaObjects.status, ['pending', 'failed']),
          sql`${legacyMediaObjects.kind} <> 'rendition'`,
        ),
      )
      .orderBy(asc(legacyMediaObjects.id))
      .limit(PAGE);
    for (const row of page) await copyOne(deps, row);
    const last = page[page.length - 1];
    if (!last) break;
    after = last.id;
  }
  // Renditions follow their image.
  await db.execute(sql`
    update ${legacyMediaObjects} as r
       set status = 'mapped', oxy_file_id = i.oxy_file_id, sha256 = null, error = null,
           updated_at = now()
      from ${legacyMediaObjects} as i
     where r.kind = 'rendition' and r.status <> 'mapped'
       and i.key = r.image_key and i.status = 'copied'`);
  const counts = await db
    .select({ status: legacyMediaObjects.status, n: sql<number>`count(*)::int` })
    .from(legacyMediaObjects)
    .groupBy(legacyMediaObjects.status);
  for (const { status, n } of counts) {
    if (status === 'copied') report.copy.copied = n;
    else if (status === 'mapped') report.copy.mapped = n;
    else if (status === 'failed') report.copy.failed = n;
    else report.copy.pending = n;
  }
  report.copy.copied -= Math.min(report.copy.copied, report.copy.alreadyCopied);
}

async function loadTargets(): Promise<Map<string, Target>> {
  const rows = await getDb()
    .select({
      key: legacyMediaObjects.key,
      kind: legacyMediaObjects.kind,
      fileId: legacyMediaObjects.oxyFileId,
      width: legacyMediaObjects.renditionWidth,
      mime: legacyMediaObjects.contentType,
    })
    .from(legacyMediaObjects)
    .where(inArray(legacyMediaObjects.status, ['copied', 'mapped']));
  const targets = new Map<string, Target>();
  for (const row of rows) {
    if (!row.fileId) continue;
    targets.set(row.key, {
      fileId: row.fileId,
      rendition: row.kind === 'rendition' ? (row.width ?? 2048) : null,
      mime: row.kind === 'rendition' ? 'image/webp' : row.mime,
    });
  }
  return targets;
}

function articleMedia(row: { heroImage: HeroImage | null; body: string; seo: Seo }, map: UrlMap) {
  return {
    heroImage: map.rewriteHero(row.heroImage),
    body: map.rewriteText(row.body),
    seo: map.rewriteSeo(row.seo),
  };
}

/** Step 3 (and the preview's dry run of it): rewrite legacy URLs in every table. */
async function rewriteContent(
  deps: MigrationDeps,
  report: MigrationReport,
  targets: Map<string, Target>,
  write: boolean,
): Promise<void> {
  const db = getDb();
  const legacyLike = `${deps.legacy.cdnBase}/%`;
  const count = (table: string, map: UrlMap) => {
    if (map.unresolved > 0) {
      report.rewrite.unresolved[table] = (report.rewrite.unresolved[table] ?? 0) + map.unresolved;
    }
  };

  // Articles.
  {
    const map = new UrlMap(targets, deps.oxy, deps.legacy);
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
        .where(
          and(
            gt(articles.id, after),
            sql`(${articles.heroImage}::text like ${`%${legacyLike}`} or ${articles.body} like ${`%${legacyLike}`} or ${articles.seo}::text like ${`%${legacyLike}`})`,
          ),
        )
        .orderBy(asc(articles.id))
        .limit(PAGE);
      for (const row of page) {
        const next = articleMedia(row, map);
        const before = { heroImage: row.heroImage, body: row.body, seo: row.seo };
        if (JSON.stringify(next) === JSON.stringify(before)) continue;
        report.rewrite.articles += 1;
        if (write) await db.update(articles).set(next).where(eq(articles.id, row.id));
      }
      const last = page[page.length - 1];
      if (!last || page.length < PAGE) break;
      after = last.id;
    }
    count('articles', map);
  }

  // Revisions.
  {
    const map = new UrlMap(targets, deps.oxy, deps.legacy);
    let after = 0;
    for (;;) {
      const page = await db
        .select({ id: articleRevisions.id, snapshot: articleRevisions.snapshot })
        .from(articleRevisions)
        .where(
          and(
            gt(articleRevisions.id, after),
            sql`${articleRevisions.snapshot}::text like ${`%${legacyLike}`}`,
          ),
        )
        .orderBy(asc(articleRevisions.id))
        .limit(PAGE);
      for (const row of page) {
        const media = articleMedia(row.snapshot, map);
        const snapshot: ArticleSnapshot = { ...row.snapshot, ...media };
        if (JSON.stringify(snapshot) === JSON.stringify(row.snapshot)) continue;
        report.rewrite.revisions += 1;
        if (write) {
          await db
            .update(articleRevisions)
            .set({ snapshot })
            .where(eq(articleRevisions.id, row.id));
        }
      }
      const last = page[page.length - 1];
      if (!last || page.length < PAGE) break;
      after = last.id;
    }
    count('article_revisions', map);
  }

  // Ad creatives.
  {
    const map = new UrlMap(targets, deps.oxy, deps.legacy);
    const rows = await db
      .select({ id: adCampaigns.id, imageUrl: adCampaigns.imageUrl })
      .from(adCampaigns)
      .where(sql`${adCampaigns.imageUrl} like ${legacyLike}`);
    for (const row of rows) {
      const imageUrl = map.rewriteText(row.imageUrl);
      if (imageUrl === row.imageUrl) continue;
      report.rewrite.adCampaigns += 1;
      if (write) await db.update(adCampaigns).set({ imageUrl }).where(eq(adCampaigns.id, row.id));
    }
    count('ad_campaigns', map);
  }

  // The media registry: a legacy row becomes the row of the Oxy file it was copied to.
  {
    const map = new UrlMap(targets, deps.oxy, deps.legacy);
    const rows = await db
      .select()
      .from(mediaAssets)
      .where(sql`${mediaAssets.url} like ${legacyLike}`);
    for (const row of rows) {
      const key = deps.legacy.keyOf(row.url);
      const target = key ? targets.get(key) : undefined;
      if (!target || target.rendition) {
        map.unresolved += 1;
        continue;
      }
      report.rewrite.mediaAssets += 1;
      if (!write) continue;
      const url = deps.oxy.url(target.fileId);
      const [copied] = await db
        .select({ sha256: legacyMediaObjects.sha256 })
        .from(legacyMediaObjects)
        .where(eq(legacyMediaObjects.key, key ?? ''));
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ url: mediaAssets.url })
          .from(mediaAssets)
          .where(eq(mediaAssets.url, url));
        if (existing) {
          // Two legacy objects with the same bytes are one Oxy file: one row.
          await tx.delete(mediaAssets).where(eq(mediaAssets.url, row.url));
          return;
        }
        await tx
          .update(mediaAssets)
          .set({
            url,
            oxyFileId: target.fileId,
            sha256: copied?.sha256 ?? row.sha256,
            mime: target.mime ?? row.mime,
            variants: deps.oxy.variantsFor(target.fileId, row.width, target.mime ?? ''),
          })
          .where(eq(mediaAssets.url, row.url));
      });
    }
    count('media_assets', map);
  }

  // Roster portraits.
  for (const [key, target] of targets) {
    const username = WRITER_KEY.exec(key)?.[1];
    if (!username) continue;
    report.rewrite.writerPortraits += 1;
    if (write) {
      await db
        .insert(writerPortraits)
        .values({ username, oxyFileId: target.fileId, uploadedBy: 'migration' })
        .onConflictDoNothing();
    }
  }
}

/** Step 5: every copied file is in Oxy with the hash recorded; no legacy URL is left. */
async function verify(deps: MigrationDeps, report: MigrationReport): Promise<void> {
  const inOxy = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await deps.oxy.listFiles(cursor);
    for (const file of page.files) inOxy.set(file.fileId, file.sha256);
    cursor = page.nextCursor;
  } while (cursor);
  const copied = await getDb()
    .select({
      id: legacyMediaObjects.id,
      fileId: legacyMediaObjects.oxyFileId,
      sha256: legacyMediaObjects.sha256,
    })
    .from(legacyMediaObjects)
    .where(eq(legacyMediaObjects.status, 'copied'));
  for (const row of copied) {
    report.verify.checked += 1;
    const stored = row.fileId ? inOxy.get(row.fileId) : undefined;
    if (stored === undefined) report.verify.missing += 1;
    else if (stored !== row.sha256) report.verify.mismatched += 1;
  }
  report.verify.legacyUrlsRemaining = await countLegacyUrls(deps.legacy);
}

/** Legacy URLs still in the content (articles, revisions, ads, media registry). */
export async function countLegacyUrls(legacy: LegacyMedia): Promise<number> {
  const db = getDb();
  const like = `%${legacy.cdnBase}/%`;
  let total = 0;
  const articleRows = await db
    .select({ heroImage: articles.heroImage, body: articles.body, seo: articles.seo })
    .from(articles)
    .where(
      sql`(${articles.heroImage}::text like ${like} or ${articles.body} like ${like} or ${articles.seo}::text like ${like})`,
    );
  for (const row of articleRows) total += legacy.urlsIn(JSON.stringify(row)).length;
  const revisionRows = await db
    .select({ snapshot: articleRevisions.snapshot })
    .from(articleRevisions)
    .where(sql`${articleRevisions.snapshot}::text like ${like}`);
  for (const row of revisionRows) {
    const { heroImage, body, seo } = row.snapshot;
    total += legacy.urlsIn(JSON.stringify({ heroImage, body, seo })).length;
  }
  total += await db.$count(adCampaigns, sql`${adCampaigns.imageUrl} like ${like}`);
  total += await db.$count(mediaAssets, sql`${mediaAssets.url} like ${like}`);
  return total;
}

/** Failures worth naming: which ones GWJ's content shows decides the verdict. */
async function collectFailures(deps: MigrationDeps, report: MigrationReport): Promise<void> {
  const failed = await getDb()
    .select()
    .from(legacyMediaObjects)
    .where(eq(legacyMediaObjects.status, 'failed'))
    .orderBy(asc(legacyMediaObjects.id));
  if (failed.length === 0) return;
  const shown = await keysShownInContent(deps.legacy);
  report.failures = failed.map((row) => ({
    objectId: row.id,
    kind: row.kind,
    sha256: row.sha256,
    reason: row.error ?? 'unknown',
    inUse: shown.has(row.key) || row.kind === 'writer_portrait',
  }));
}

async function keysShownInContent(legacy: LegacyMedia): Promise<Set<string>> {
  const db = getDb();
  const like = `%${legacy.cdnBase}/%`;
  const keys = new Set<string>();
  const add = (text: string) => {
    for (const url of legacy.urlsIn(text)) {
      const key = legacy.keyOf(url);
      if (key) keys.add(key);
    }
  };
  for (const row of await db
    .select({ heroImage: articles.heroImage, body: articles.body, seo: articles.seo })
    .from(articles)
    .where(
      sql`(${articles.heroImage}::text like ${like} or ${articles.body} like ${like} or ${articles.seo}::text like ${like})`,
    )) {
    add(JSON.stringify(row));
  }
  for (const row of await db
    .select({ snapshot: articleRevisions.snapshot })
    .from(articleRevisions)
    .where(sql`${articleRevisions.snapshot}::text like ${like}`)) {
    add(JSON.stringify(row.snapshot));
  }
  for (const row of await db
    .select({ imageUrl: adCampaigns.imageUrl })
    .from(adCampaigns)
    .where(sql`${adCampaigns.imageUrl} like ${like}`)) {
    add(row.imageUrl);
  }
  return keys;
}

/** Run the migration (see the module header). */
export async function runLegacyMigration(
  deps: MigrationDeps,
  mode: MigrationMode,
): Promise<MigrationReport> {
  const report = emptyReport(mode);
  const objects = await inventory(deps, report, mode);

  if (mode === 'preview') {
    // What WOULD resolve: every object the bucket holds, as if copied.
    const classes = classifyKeys(objects.map((object) => object.key));
    const targets = new Map<string, Target>();
    for (const object of objects) {
      const classified = classes.get(object.key);
      targets.set(object.key, {
        fileId: 'previewfile0',
        rendition: classified?.kind === 'rendition' ? classified.renditionWidth : null,
        mime: null,
      });
    }
    report.copy.pending = objects.filter(
      (object) => classes.get(object.key)?.kind !== 'rendition',
    ).length;
    await rewriteContent(deps, report, targets, false);
    report.verify.legacyUrlsRemaining = await countLegacyUrls(deps.legacy);
    return report;
  }

  await copyAll(deps, report);
  await rewriteContent(deps, report, await loadTargets(), true);
  report.reconcile = await runDueReconciliations(deps.oxy, { force: true });
  await verify(deps, report);
  await collectFailures(deps, report);
  const blocking = report.failures.filter((failure) => failure.inUse).length;
  report.verdict =
    blocking === 0 &&
    report.verify.missing === 0 &&
    report.verify.mismatched === 0 &&
    report.verify.legacyUrlsRemaining === 0 &&
    Object.keys(report.reconcile).length > 0
      ? 'PASS'
      : 'FAIL';
  return report;
}
