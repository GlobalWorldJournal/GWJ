import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { CATEGORIES } from '@gwj/shared-types';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { newRecordId } from '../../db/ids';
import { adCampaigns } from '../../db/schema/adCampaigns';
import { articleRevisions } from '../../db/schema/articleRevisions';
import { articles } from '../../db/schema/articles';
import { legacyMediaObjects } from '../../db/schema/legacyMediaObjects';
import { mediaAssets } from '../../db/schema/mediaAssets';
import { writerPortraits } from '../../db/schema/writerPortraits';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { createFakeOxyFiles, type FakeOxyFiles } from '../../test/fakeOxyFiles';
import { validPngBuffer } from '../../__tests__/imageFixtures';
import { createLegacyMedia } from '../legacy';
import { classifyKeys, runLegacyMigration, type LegacyBucket } from '../legacyMigration';

const CDN = 'https://cdn.example.test';
const legacy = createLegacyMedia(CDN);
let testDb: TestDatabase;
let oxy: FakeOxyFiles;

const BYTES = {
  'articles/u1-hero.webp': validPngBuffer(1600, 1000),
  'articles/u1-hero.w400.webp': validPngBuffer(400, 250),
  'articles/u2-inline.png': validPngBuffer(900, 700),
  'articles/u3-orphan.webp': validPngBuffer(700, 700),
  'articles/u4-ad.png': validPngBuffer(900, 300),
  'articles/u5-broken.png': validPngBuffer(640, 480),
  'writers/eleanorvance.png': validPngBuffer(512, 512),
  'social-cards/x-card.jpg': validPngBuffer(1080, 1350),
} as const;
type Key = keyof typeof BYTES;

function bucket(): LegacyBucket {
  return {
    async *list() {
      for (const [key, bytes] of Object.entries(BYTES)) yield { key, size: bytes.byteLength };
    },
    async get(key) {
      const bytes = BYTES[key as Key];
      if (!bytes) throw new Error('NoSuchKey');
      return { bytes, contentType: 'image/png' };
    },
  };
}

/** Oxy reports a different hash for the named objects (as if the bytes were altered). */
function corrupting(names: string[]): FakeOxyFiles {
  const fake = createFakeOxyFiles();
  const upload = fake.uploadImage;
  fake.uploadImage = async (bytes, mime, originalName) => {
    const stored = await upload(bytes, mime, originalName);
    return originalName && names.includes(originalName)
      ? { ...stored, sha256: 'f'.repeat(64) }
      : stored;
  };
  return fake;
}

const url = (key: Key) => `${CDN}/${key}`;

async function seedContent(): Promise<{ articleId: string; adId: string }> {
  const db = getDb();
  const articleId = newRecordId();
  const hero = {
    url: url('articles/u1-hero.webp'),
    alt: 'Hero',
    width: 1600,
    height: 1000,
    variants: [{ width: 400, url: url('articles/u1-hero.w400.webp') }],
  };
  await db.insert(articles).values({
    id: articleId,
    translationGroupId: articleId,
    slug: 'story',
    title: 'Story',
    category: CATEGORIES[0],
    author: 'Nate',
    body: `Lead.\n\n![Inline](${url('articles/u2-inline.png')})\n\n![Small](${url('articles/u1-hero.w400.webp')})`,
    heroImage: hero,
    seo: { ogImage: url('articles/u1-hero.webp') },
    status: 'draft',
  });
  await db.insert(articleRevisions).values({
    articleId,
    actor: 'nate',
    snapshot: {
      slug: 'story',
      title: 'Story (draft)',
      deck: null,
      kicker: null,
      category: CATEGORIES[0],
      language: 'en',
      author: 'Nate',
      body: `![Inline](${url('articles/u2-inline.png')})`,
      heroImage: hero,
      status: 'draft',
      featured: 0,
      tags: [],
      seo: {},
      source: null,
    },
  });
  const adId = newRecordId();
  await db.insert(adCampaigns).values({
    id: adId,
    advertiserName: 'Acme',
    advertiserEmail: 'ads@acme.example',
    imageUrl: url('articles/u4-ad.png'),
    clickUrl: 'https://acme.example',
    variant: 'inline',
    startsAt: new Date(Date.now() - 1000),
    endsAt: new Date(Date.now() + 86_400_000),
  });
  await db.insert(mediaAssets).values({
    url: url('articles/u1-hero.webp'),
    sha256: 'hash-of-the-submitted-bytes',
    width: 1600,
    height: 1000,
    variants: hero.variants,
  });
  return { articleId, adId };
}

beforeAll(async () => {
  testDb = await useTestDatabase();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

afterAll(async () => {
  await testDb.drop();
});

describe('classifyKeys', () => {
  it('knows renditions (only beside their image), portraits and social cards', () => {
    const classes = classifyKeys([
      'articles/a.webp',
      'articles/a.w400.webp',
      'articles/lonely.w800.webp',
      'writers/x.png',
      'social-cards/c.jpg',
    ]);
    expect(classes.get('articles/a.w400.webp')).toEqual({
      kind: 'rendition',
      imageKey: 'articles/a.webp',
      renditionWidth: 400,
    });
    expect(classes.get('articles/lonely.w800.webp')?.kind).toBe('image');
    expect(classes.get('writers/x.png')?.kind).toBe('writer_portrait');
    expect(classes.get('social-cards/c.jpg')?.kind).toBe('social_card');
  });
});

describe('the legacy bucket migration', () => {
  it('preview reports what it would do and writes nothing', async () => {
    await seedContent();
    oxy = createFakeOxyFiles();
    const report = await runLegacyMigration({ bucket: bucket(), oxy, legacy }, 'preview');
    expect(report.verdict).toBe('PREVIEW');
    expect(report.inventory).toMatchObject({
      objects: 8,
      byKind: { image: 5, rendition: 1, social_card: 1, writer_portrait: 1 },
    });
    expect(report.copy.pending).toBe(7);
    expect(report.rewrite).toMatchObject({
      articles: 1,
      revisions: 1,
      adCampaigns: 1,
      mediaAssets: 1,
      writerPortraits: 1,
    });
    expect(oxy.files.size).toBe(0);
    expect(await getDb().$count(legacyMediaObjects)).toBe(0);
    const [article] = await getDb().select().from(articles);
    expect(article?.heroImage?.url).toBe(url('articles/u1-hero.webp'));
  });

  it('apply copies verbatim, verifies hashes, rewrites the content, references what is shown — and PASSes', async () => {
    const { articleId, adId } = await seedContent();
    oxy = corrupting(['u5-broken.png']);
    const report = await runLegacyMigration({ bucket: bucket(), oxy, legacy }, 'apply');

    // The unused object that failed verification is named — by id and hash, never key — but does not block.
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      kind: 'image',
      reason: 'sha256-mismatch',
      inUse: false,
      sha256: createHash('sha256').update(BYTES['articles/u5-broken.png']).digest('hex'),
    });
    expect(report.copy).toMatchObject({ copied: 6, mapped: 1, failed: 1 });
    expect(report.verify).toEqual({
      checked: 6,
      missing: 0,
      mismatched: 0,
      legacyUrlsRemaining: 0,
    });
    expect(report.verdict).toBe('PASS');
    const printed = JSON.stringify(report);
    expect(printed).not.toContain(CDN);
    expect(printed).not.toContain('u1-hero');

    const rows = await getDb().select().from(legacyMediaObjects);
    const fileOf = (key: Key) => rows.find((row) => row.key === key)?.oxyFileId ?? '';
    // Copied byte for byte.
    expect(oxy.files.get(fileOf('articles/u2-inline.png'))?.sha256).toBe(
      createHash('sha256').update(BYTES['articles/u2-inline.png']).digest('hex'),
    );

    const [article] = await getDb().select().from(articles).where(eq(articles.id, articleId));
    const hero = fileOf('articles/u1-hero.webp');
    expect(article?.heroImage).toMatchObject({
      url: oxy.url(hero),
      mime: 'image/png',
      variants: [320, 640, 1280].map((width) => ({
        width,
        url: oxy.url(hero, `w${width}` as 'w320'),
      })),
    });
    expect(article?.body).toContain(oxy.url(fileOf('articles/u2-inline.png')));
    expect(article?.body).toContain(oxy.url(hero, 'w640'));
    expect(article?.seo.ogImage).toBe(oxy.url(hero));
    // A technical fill-in, not an edit.
    expect(article?.updatedAt.getTime()).toBe(article?.createdAt.getTime());

    const [revision] = await getDb().select().from(articleRevisions);
    expect(revision?.snapshot.body).toContain(oxy.url(fileOf('articles/u2-inline.png')));
    const [ad] = await getDb().select().from(adCampaigns).where(eq(adCampaigns.id, adId));
    expect(ad?.imageUrl).toBe(oxy.url(fileOf('articles/u4-ad.png')));
    const [media] = await getDb().select().from(mediaAssets);
    expect(media).toMatchObject({ url: oxy.url(hero), oxyFileId: hero });
    const [portrait] = await getDb().select().from(writerPortraits);
    expect(portrait).toMatchObject({
      username: 'eleanorvance',
      oxyFileId: fileOf('writers/eleanorvance.png'),
      uploadedBy: 'migration',
    });

    // What is shown is referenced; orphans and old cards are left to Oxy's lifecycle.
    expect(oxy.referencesOf('article', articleId).sort()).toEqual(
      [hero, fileOf('articles/u2-inline.png')].sort(),
    );
    expect(oxy.referencesOf('ad_campaign', adId)).toEqual([fileOf('articles/u4-ad.png')]);
    expect(oxy.referencesOf('writer_portrait', 'eleanorvance')).toEqual([
      fileOf('writers/eleanorvance.png'),
    ]);
    const referenced = new Set([...oxy.references].map((key) => key.split('|')[2]));
    expect(referenced.has(fileOf('articles/u3-orphan.webp'))).toBe(false);
    expect(referenced.has(fileOf('social-cards/x-card.jpg'))).toBe(false);

    // Re-running is safe: nothing is copied twice.
    const files = oxy.files.size;
    const again = await runLegacyMigration({ bucket: bucket(), oxy, legacy }, 'apply');
    expect(again.copy.alreadyCopied).toBe(6);
    expect(again.verdict).toBe('PASS');
    expect(oxy.files.size).toBe(files);
  });

  it('a failure in something GWJ shows FAILs the run, and a later run resumes and passes', async () => {
    await seedContent();
    const corrupted = ['u2-inline.png'];
    oxy = corrupting(corrupted);
    const failed = await runLegacyMigration({ bucket: bucket(), oxy, legacy }, 'apply');
    expect(failed.verdict).toBe('FAIL');
    expect(failed.failures).toEqual([
      expect.objectContaining({ reason: 'sha256-mismatch', inUse: true }),
    ]);
    expect(failed.rewrite.unresolved).toMatchObject({ articles: 1, article_revisions: 1 });

    corrupted.length = 0; // whatever went wrong is fixed
    const resumed = await runLegacyMigration({ bucket: bucket(), oxy, legacy }, 'apply');
    expect(resumed.copy.copied).toBe(1);
    expect(resumed.verdict).toBe('PASS');
  });
});
