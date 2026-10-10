import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES, type ArticleInput, type UploadResponse } from '@gwj/shared-types';
import { getDb } from '../../db/client';
import { articles } from '../../db/schema/articles';
import { jobsFor } from '../../channels/jobRepository';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { articleService, setDeliveryPlanner } from '../articleService';
import { createMediaService } from '../mediaService';
import type { UploadService } from '../uploadService';

let testDb: TestDatabase;

const stored: UploadResponse = {
  url: 'https://cdn.example.test/articles/abc-hero.webp',
  width: 1600,
  height: 1067,
  variants: [
    { width: 400, url: 'https://cdn.example.test/articles/abc-hero.w400.webp' },
    { width: 800, url: 'https://cdn.example.test/articles/abc-hero.w800.webp' },
  ],
};

function fakeUploads(): UploadService & { uploadImage: ReturnType<typeof vi.fn> } {
  return { uploadImage: vi.fn(async () => stored) };
}

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
  it('records an upload, and the same bytes again return the stored image (no new upload)', async () => {
    const uploads = fakeUploads();
    const media = createMediaService(uploads);
    const bytes = Buffer.from('the same photo');

    expect(await media.upload(bytes, 'a.jpg', 'image/jpeg')).toEqual(stored);
    expect(await media.upload(bytes, 'b.jpg', 'image/jpeg')).toEqual(stored);
    expect(uploads.uploadImage).toHaveBeenCalledTimes(1);
  });

  it("an article's hero image carries the recorded size and renditions — never the caller's", async () => {
    await createMediaService(fakeUploads()).upload(Buffer.from('photo'), 'h.jpg', 'image/jpeg');

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
      width: 1600,
      height: 1067,
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
    const unregister = setDeliveryPlanner(() => ['ch']);
    try {
      const article = await articleService.create(
        input({ heroImage: { url: stored.url, alt: 'A photo' } }),
      );
      // The upload is recorded only now (as the backfill would): saving the
      // same picture picks up its metadata, which posts do not show.
      await createMediaService(fakeUploads()).upload(Buffer.from('p'), 'h.jpg', 'image/jpeg');
      const saved = await articleService.update(article.id, {
        heroImage: { url: stored.url, alt: 'A photo' },
      });
      expect(saved.heroImage?.variants).toEqual(stored.variants);
      expect((await jobsFor(article.id)).map((job) => job.action)).toEqual(['publish']);

      await articleService.update(article.id, { heroImage: { url: stored.url, alt: 'New alt' } });
      expect((await jobsFor(article.id)).map((job) => job.action)).toEqual(['publish', 'update']);
    } finally {
      unregister();
    }
    expect(await getDb().$count(articles)).toBe(1);
  });
});
