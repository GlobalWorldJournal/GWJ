import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { CATEGORIES, type ArticleInput, type TakedownRequestInput } from '@gwj/shared-types';
import { takedownService } from '../takedownService';
import { NotFoundError } from '../../errors';
import { articleService, setDeliveryPlanner } from '../articleService';
import { jobsFor } from '../../channels/jobRepository';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';

let testDb: TestDatabase;

const baseArticle = (overrides: Partial<ArticleInput> = {}): ArticleInput => ({
  title: 'A Story With A Borrowed Photo',
  category: CATEGORIES[0],
  language: 'en',
  author: 'Nate',
  body: '# Story\n\nSomething happened.',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  heroImage: {
    url: 'https://cdn.globalworldjournal.com/articles/photo.jpg',
    alt: 'A photo',
  },
  ...overrides,
});

const baseInput = (overrides: Partial<TakedownRequestInput> = {}): TakedownRequestInput => ({
  requesterName: 'Jamie Rights-Holder',
  requesterEmail: 'jamie@example.com',
  claimType: 'copyright',
  explanation: 'That is my photograph, used without a license.',
  goodFaithAssertion: true,
  ...overrides,
});

beforeAll(async () => {
  testDb = await useTestDatabase();
});

afterEach(async () => {
  await testDb.truncateAll();
});

afterAll(async () => {
  await testDb.drop();
});

describe('takedownService', () => {
  it('creates a pending request with no article match when nothing resolves', async () => {
    const record = await takedownService.create(
      baseInput({ imageUrl: 'https://unrelated.example/photo.jpg' }),
    );
    expect(record.status).toBe('pending');
    expect(record.articleId).toBeNull();
  });

  it('resolves the article by its own /article/<slug> URL', async () => {
    const article = await articleService.create(baseArticle());
    const record = await takedownService.create(
      baseInput({ articleUrl: `https://globalworldjournal.com/article/${article.slug}` }),
    );
    expect(record.articleId).toBe(article.id);
  });

  it('resolves the article by our own CDN hero image URL', async () => {
    const article = await articleService.create(baseArticle());
    const record = await takedownService.create(
      baseInput({ imageUrl: 'https://cdn.globalworldjournal.com/articles/photo.jpg' }),
    );
    expect(record.articleId).toBe(article.id);
  });

  it('action("dismissed") records a resolution without touching the article', async () => {
    const article = await articleService.create(baseArticle());
    const record = await takedownService.create(
      baseInput({ imageUrl: 'https://cdn.globalworldjournal.com/articles/photo.jpg' }),
    );
    const dismissed = await takedownService.action(record.id, {
      status: 'dismissed',
      resolution: 'No credible claim; the image is wire-service licensed.',
      apply: 'none',
    });
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.resolution).toContain('wire-service');
    const stillThere = await articleService.getById(article.id);
    expect(stillThere.status).toBe('published');
    expect(stillThere.heroImage?.url).toBe(article.heroImage?.url);
  });

  it('action("actioned", apply: "unpublish") takes the whole article down', async () => {
    const article = await articleService.create(baseArticle());
    const record = await takedownService.create(
      baseInput({ imageUrl: 'https://cdn.globalworldjournal.com/articles/photo.jpg' }),
    );
    await takedownService.action(record.id, { status: 'actioned', apply: 'unpublish' });
    const after = await articleService.getById(article.id);
    expect(after.status).toBe('draft');
  });

  it('action("actioned", apply: "clear-hero-image") removes just the image, leaves the article published', async () => {
    const article = await articleService.create(baseArticle());
    const record = await takedownService.create(
      baseInput({ imageUrl: 'https://cdn.globalworldjournal.com/articles/photo.jpg' }),
    );
    const actioned = await takedownService.action(record.id, {
      status: 'actioned',
      apply: 'clear-hero-image',
    });
    expect(actioned.status).toBe('actioned');
    const after = await articleService.getById(article.id);
    expect(after.status).toBe('published');
    expect(after.heroImage).toBeUndefined();
  });

  it('applies its action through the article service: history and distribution follow', async () => {
    const unregister = setDeliveryPlanner(() => ['ch']);
    try {
      const article = await articleService.create(baseArticle());
      const record = await takedownService.create(
        baseInput({ imageUrl: 'https://cdn.globalworldjournal.com/articles/photo.jpg' }),
      );
      await takedownService.action(
        record.id,
        { status: 'actioned', apply: 'clear-hero-image' },
        'user:nate',
      );
      const [revision] = await articleService.listRevisions(article.id);
      expect(revision?.actor).toBe('user:nate');
      // The live posts drop the image too.
      expect((await jobsFor(article.id)).map((job) => job.action)).toEqual(['publish', 'update']);
    } finally {
      unregister();
    }
  });

  it('lists requests newest first, filterable by status', async () => {
    const first = await takedownService.create(baseInput({ requesterEmail: 'a@example.com' }));
    // Requests made in the same millisecond have no defined order (random-id tie-break).
    await new Promise((r) => setTimeout(r, 15));
    const second = await takedownService.create(baseInput({ requesterEmail: 'b@example.com' }));
    await takedownService.action(first.id, { status: 'dismissed', apply: 'none' });

    const all = await takedownService.list({ page: 1, limit: 20 });
    expect(all.data.map((r) => r.id)).toEqual([second.id, first.id]);

    const pending = await takedownService.list({ status: 'pending', page: 1, limit: 20 });
    expect(pending.data.map((r) => r.id)).toEqual([second.id]);
  });
});

describe('takedownService — PostgreSQL semantics', () => {
  it('a malformed or unknown id is a 404', async () => {
    await expect(takedownService.getById('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      takedownService.action('0123456789abcdef01234567', { status: 'dismissed', apply: 'none' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('clear-hero-image stamps the article updatedAt', async () => {
    const article = await articleService.create(baseArticle());
    const record = await takedownService.create(
      baseInput({ imageUrl: 'https://cdn.globalworldjournal.com/articles/photo.jpg' }),
    );
    await new Promise((r) => setTimeout(r, 15));
    await takedownService.action(record.id, { status: 'actioned', apply: 'clear-hero-image' });
    const after = await articleService.getById(article.id);
    expect(after.heroImage).toBeUndefined();
    expect(after.updatedAt > article.updatedAt).toBe(true);
  });

  it('re-applying the same decision is a no-op save: updatedAt does not move', async () => {
    const record = await takedownService.create(baseInput());
    const first = await takedownService.action(record.id, {
      status: 'dismissed',
      resolution: 'Licensed',
      apply: 'none',
    });
    await new Promise((r) => setTimeout(r, 15));
    const again = await takedownService.action(record.id, {
      status: 'dismissed',
      resolution: 'Licensed',
      apply: 'none',
    });
    expect(again.updatedAt).toBe(first.updatedAt);
  });
});
