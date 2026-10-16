import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { CATEGORIES, type ArticleInput } from '@gwj/shared-types';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb } from '../../db/client';
import { articles } from '../../db/schema/articles';
import { mediaAssets } from '../../db/schema/mediaAssets';
import { jobsFor } from '../../channels/jobRepository';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { createFakeOxyFiles, FakeOxyError } from '../../test/fakeOxyFiles';
import { validGifBuffer, validPngBuffer } from '../../__tests__/imageFixtures';
import { articleService, setDeliveryPlanner } from '../articleService';
import { createMediaService } from '../mediaService';
import { optimizeToWebp } from '../imageOptimizer';

let testDb: TestDatabase;

const input = (overrides: Partial<ArticleInput> = {}): ArticleInput => ({
  title: 'Pictured',
  category: CATEGORIES[0],
  language: 'en',
  author: 'Nate',
  body: 'Body.',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  ...overrides,
});

/** A photo carrying EXIF (a camera's GPS position is the kind of thing it holds). */
async function photoWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#336699' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'Somebody', Artist: 'A camera owner' } })
    .toBuffer();
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

describe('mediaService', () => {
  it('stores a GWJ-owned WebP without the source metadata, downscaled, with Oxy renditions', async () => {
    const oxy = createFakeOxyFiles();
    const media = createMediaService(oxy);
    const stored = await media.upload(await photoWithExif(), 'Lead Photo.JPG', 'image/jpeg', {
      uploadedBy: 'nate',
    });

    const fileId = oxy.fileIdOf(stored.url);
    if (!fileId) throw new Error('not an Oxy URL');
    const file = oxy.files.get(fileId);
    expect(file?.mime).toBe('image/webp');
    expect(file?.originalName).toBe('lead-photo.webp');
    const meta = await sharp(Buffer.from(file?.bytes ?? new Uint8Array())).metadata();
    expect(meta.exif).toBeUndefined();
    expect(stored).toMatchObject({ width: 1600, height: 1067 });
    expect(stored.variants).toEqual([
      { width: 320, url: oxy.url(fileId, 'w320') },
      { width: 640, url: oxy.url(fileId, 'w640') },
      { width: 1280, url: oxy.url(fileId, 'w1280') },
    ]);

    const [row] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.url, stored.url));
    expect(row).toMatchObject({
      oxyFileId: fileId,
      sha256: file?.sha256,
      mime: 'image/webp',
      uploadedBy: 'nate',
    });
  });

  it('the same bytes again answer the same file and row, keeping the first uploader', async () => {
    const oxy = createFakeOxyFiles();
    const media = createMediaService(oxy);
    const bytes = validPngBuffer();
    const first = await media.upload(bytes, 'a.png', 'image/png', { uploadedBy: 'nate' });
    const second = await media.upload(bytes, 'b.png', 'image/png', { uploadedBy: 'agent:bot' });
    expect(second.url).toBe(first.url);
    expect(oxy.files.size).toBe(1);
    const rows = await getDb().select().from(mediaAssets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.uploadedBy).toBe('nate');
  });

  it('keeps a GIF as a GIF (its animation) with no renditions', async () => {
    const oxy = createFakeOxyFiles();
    const stored = await createMediaService(oxy).upload(validGifBuffer(), 'a.gif', 'image/gif', {
      uploadedBy: 'nate',
    });
    expect(oxy.files.get(oxy.fileIdOf(stored.url) ?? '')?.mime).toBe('image/gif');
    expect(stored.variants).toEqual([]);
  });

  it('a taken-down image (451) is a final 422 the caller can act on', async () => {
    const oxy = createFakeOxyFiles();
    oxy.failNext = new FakeOxyError(451, 'CONTENT_BLOCKED');
    await expect(
      createMediaService(oxy).upload(validPngBuffer(), 'a.png', 'image/png', {
        uploadedBy: 'nate',
      }),
    ).rejects.toMatchObject({ status: 422, details: { reason: 'content-blocked' } });
  });

  it('imports by URL through Oxy, verifies the bytes read back, and stores the processed image', async () => {
    const oxy = createFakeOxyFiles();
    const source = validPngBuffer(1000, 800);
    oxy.remote.set('https://images.example.com/a.png', { bytes: source, mime: 'image/png' });
    const stored = await createMediaService(oxy).importFromUrl(
      'https://images.example.com/a.png',
      undefined,
      { uploadedBy: 'agent:newsroom' },
    );
    // Two files: the raw import (unreferenced, collected by Oxy) and the processed one shown.
    const raw = [...oxy.files.values()].find(
      (file) => file.sha256 === createHash('sha256').update(source).digest('hex'),
    );
    expect(raw).toBeDefined();
    expect(oxy.fileIdOf(stored.url)).not.toBe(raw?.fileId);
    expect(oxy.files.get(oxy.fileIdOf(stored.url) ?? '')?.mime).toBe('image/webp');
  });

  it("an article's hero image carries the recorded size, type and renditions — never the caller's", async () => {
    const oxy = createFakeOxyFiles();
    const stored = await createMediaService(oxy).upload(
      validPngBuffer(1400, 900),
      'h.png',
      'image/png',
      { uploadedBy: 'nate' },
    );

    const article = await articleService.create(
      input({
        heroImage: {
          url: stored.url,
          alt: 'A photo',
          width: 10,
          variants: [{ width: 1, url: 'https://evil.example/x.webp' }],
        },
      }),
    );
    expect(article.heroImage).toMatchObject({
      url: stored.url,
      alt: 'A photo',
      width: 1400,
      height: 900,
      mime: 'image/webp',
      variants: stored.variants,
    });

    const external = await articleService.create(
      input({
        title: 'Elsewhere',
        heroImage: { url: 'https://other.example/pic.jpg', alt: 'x', width: 99 },
      }),
    );
    expect(external.heroImage).toMatchObject({ url: 'https://other.example/pic.jpg', alt: 'x' });
    expect(external.heroImage).not.toHaveProperty('width');
  });

  it('new image metadata on a live story is not a change its distributed posts must show', async () => {
    const oxy = createFakeOxyFiles();
    const media = createMediaService(oxy);
    const bytes = validPngBuffer(1400, 900);
    // Learn the URL the bytes will have without recording them yet.
    const url = oxy.url((await oxy.uploadImage(await toWebp(bytes), 'image/webp')).fileId);
    const unregister = setDeliveryPlanner(() => ['ch']);
    try {
      const article = await articleService.create(input({ heroImage: { url, alt: 'A photo' } }));
      const stored = await media.upload(bytes, 'h.png', 'image/png', { uploadedBy: 'nate' });
      expect(stored.url).toBe(url);
      const saved = await articleService.update(article.id, { heroImage: { url, alt: 'A photo' } });
      expect(saved.heroImage?.variants).toEqual(stored.variants);
      expect((await jobsFor(article.id)).map((job) => job.action)).toEqual(['publish']);

      await articleService.update(article.id, { heroImage: { url, alt: 'New alt' } });
      expect((await jobsFor(article.id)).map((job) => job.action)).toEqual(['publish', 'update']);
    } finally {
      unregister();
    }
    expect(await getDb().$count(articles)).toBe(1);
  });
});

/** What the media service stores for a PNG: its WebP re-encode (deterministic). */
async function toWebp(png: Buffer): Promise<Buffer> {
  return (await optimizeToWebp(png)).buffer;
}
