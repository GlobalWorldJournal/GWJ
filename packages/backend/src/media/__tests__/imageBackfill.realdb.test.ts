import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES, type ArticleInput } from '@gwj/shared-types';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { articleService, setDeliveryPlanner } from '../../services/articleService';
import { jobsFor } from '../../channels/jobRepository';
import type { UploadService } from '../../services/uploadService';
import { backfillHeroImages } from '../imageBackfill';

let testDb: TestDatabase;

const CDN = 'https://cdn.example.test/articles';

function fakeUploads(): UploadService & { addRenditions: ReturnType<typeof vi.fn> } {
  return {
    uploadImage: vi.fn(),
    addRenditions: vi.fn(async (url: string) =>
      url.startsWith(CDN)
        ? {
            bytes: Buffer.from(url),
            width: 1600,
            height: 900,
            variants: [{ width: 400, url: url.replace(/\.webp$/, '.w400.webp') }],
          }
        : null,
    ),
  };
}

const input = (title: string, url: string): ArticleInput => ({
  title,
  category: CATEGORIES[0],
  language: 'en',
  author: 'Nate',
  body: 'Body.',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  heroImage: { url, alt: 'alt' },
});

beforeAll(async () => {
  testDb = await useTestDatabase();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

afterAll(async () => {
  await testDb.drop();
});

describe('backfillHeroImages', () => {
  it('fills size and renditions once per image, without editing the articles', async () => {
    const unregister = setDeliveryPlanner(() => ['ch']);
    try {
      const a = await articleService.create(input('A', `${CDN}/a.webp`));
      const b = await articleService.create(input('B', `${CDN}/a.webp`)); // same picture
      const c = await articleService.create(input('C', 'https://elsewhere.example/c.jpg'));
      const uploads = fakeUploads();

      expect(await backfillHeroImages(uploads, { dryRun: false })).toEqual({
        filled: 1,
        articles: 2,
        external: 1,
        failed: 0,
      });
      const filled = await articleService.getById(a.id);
      expect(filled.heroImage).toMatchObject({
        url: `${CDN}/a.webp`,
        alt: 'alt',
        width: 1600,
        height: 900,
        variants: [{ width: 400, url: `${CDN}/a.w400.webp` }],
      });
      // Not an edit: no new "updated" time, no history entry, no redistribution.
      expect(filled.updatedAt).toBe(a.updatedAt);
      expect(await articleService.listRevisions(a.id)).toEqual([]);
      expect((await jobsFor(a.id)).map((job) => job.action)).toEqual(['publish']);
      expect((await articleService.getById(b.id)).heroImage?.width).toBe(1600);
      expect((await articleService.getById(c.id)).heroImage).not.toHaveProperty('width');

      // A second run finds only the external image left, and fills nothing.
      expect(await backfillHeroImages(uploads, { dryRun: false })).toMatchObject({ filled: 0 });
      expect(uploads.addRenditions).toHaveBeenCalledTimes(3);
    } finally {
      unregister();
    }
  });

  it('a dry run writes nothing', async () => {
    const article = await articleService.create(input('A', `${CDN}/a.webp`));
    const uploads = fakeUploads();
    expect(await backfillHeroImages(uploads, { dryRun: true })).toMatchObject({ filled: 0 });
    expect(uploads.addRenditions).not.toHaveBeenCalled();
    expect((await articleService.getById(article.id)).heroImage).not.toHaveProperty('width');
  });

  it('a failing image is reported and the run goes on', async () => {
    await articleService.create(input('A', `${CDN}/broken.webp`));
    await articleService.create(input('B', `${CDN}/fine.webp`));
    const uploads = fakeUploads();
    const working = uploads.addRenditions.getMockImplementation();
    uploads.addRenditions.mockImplementation(async (url: string) => {
      if (url.endsWith('broken.webp')) throw new Error('NoSuchKey');
      return working?.(url);
    });
    expect(await backfillHeroImages(uploads, { dryRun: false })).toMatchObject({
      filled: 1,
      failed: 1,
    });
  });
});
