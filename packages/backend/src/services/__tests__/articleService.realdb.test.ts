import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIES, type ArticleInput, type ArticleListQuery } from '@gwj/shared-types';
import { articleService, setDeliveryPlanner } from '../articleService';
import { jobsFor } from '../../channels/jobRepository';
import { NotFoundError } from '../../errors';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';

let testDb: TestDatabase;

/** The distribution actions queued for an article (with a planner registered). */
const plannedActions = async (id: string) => (await jobsFor(id)).map((job) => job.action);

const baseInput = (overrides: Partial<ArticleInput> = {}): ArticleInput => ({
  title: 'Global Equities Climb, Again!',
  category: CATEGORIES[0],
  language: 'en',
  author: 'Nate',
  body: '# Markets\n\nMarkets rose **today**.',
  status: 'draft',
  featured: 0,
  tags: [],
  seo: {},
  ...overrides,
});

const baseQuery = (overrides: Partial<ArticleListQuery> = {}): ArticleListQuery => ({
  page: 1,
  limit: 20,
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

describe('articleService', () => {
  it('generates a slug from the title', async () => {
    const article = await articleService.create(baseInput());
    expect(article.slug).toBe('global-equities-climb-again');
  });

  it('appends a numeric suffix on slug collision', async () => {
    const a = await articleService.create(baseInput());
    const b = await articleService.create(baseInput());
    const c = await articleService.create(baseInput());
    expect(a.slug).toBe('global-equities-climb-again');
    expect(b.slug).toBe('global-equities-climb-again-2');
    expect(c.slug).toBe('global-equities-climb-again-3');
  });

  it('publish() sets status and stamps publishedAt', async () => {
    const draft = await articleService.create(baseInput());
    expect(draft.status).toBe('draft');
    expect(draft.publishedAt).toBeNull();

    const published = await articleService.publish(draft.id);
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();
  });

  it('re-publish after unpublish restores the original publishedAt', async () => {
    const draft = await articleService.create(baseInput());
    const first = await articleService.publish(draft.id);
    expect(first.publishedAt).not.toBeNull();
    expect(first.firstPublishedAt).toBe(first.publishedAt);

    const unpublished = await articleService.unpublish(draft.id);
    expect(unpublished.publishedAt).toBeNull();
    expect(unpublished.firstPublishedAt).toBe(first.publishedAt);

    await new Promise((r) => setTimeout(r, 15));
    const second = await articleService.publish(draft.id);
    expect(second.publishedAt).toBe(first.publishedAt);

    // The same holds for the status patch the CMS/MCP can send.
    await articleService.update(draft.id, { status: 'draft' });
    const viaPatch = await articleService.update(draft.id, { status: 'published' });
    expect(viaPatch.publishedAt).toBe(first.publishedAt);
  });

  it('public list excludes drafts', async () => {
    await articleService.create(baseInput({ title: 'Draft One' }));
    const toPublish = await articleService.create(baseInput({ title: 'Published One' }));
    await articleService.publish(toPublish.id);

    const result = await articleService.list(baseQuery());
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.title).toBe('Published One');
    expect(result.pagination.total).toBe(1);
  });

  it('admin list (includeAll) returns drafts', async () => {
    await articleService.create(baseInput({ title: 'Draft One' }));
    const toPublish = await articleService.create(baseInput({ title: 'Published One' }));
    await articleService.publish(toPublish.id);

    const result = await articleService.list(baseQuery(), { includeAll: true });
    expect(result.data).toHaveLength(2);
  });

  it('update() applies a partial patch', async () => {
    const article = await articleService.create(baseInput({ deck: 'Old deck' }));
    const updated = await articleService.update(article.id, { deck: 'New deck' });
    expect(updated.deck).toBe('New deck');
    expect(updated.title).toBe(article.title);
    // Untouched slug stays stable when the title is unchanged.
    expect(updated.slug).toBe(article.slug);
  });

  it('update() re-slugs when the title changes', async () => {
    const article = await articleService.create(baseInput({ title: 'First Title' }));
    const updated = await articleService.update(article.id, { title: 'Second Title' });
    expect(updated.slug).toBe('second-title');
  });

  it('getBySlug() only returns published articles', async () => {
    const draft = await articleService.create(baseInput({ title: 'Hidden Draft' }));
    await expect(articleService.getBySlug(draft.slug)).rejects.toThrow();

    await articleService.publish(draft.id);
    const found = await articleService.getBySlug(draft.slug);
    expect(found.id).toBe(draft.id);
  });
});

describe('articleService — PostgreSQL port semantics', () => {
  it('mints 24-hex ids (the ObjectId shape every existing id already has)', async () => {
    const article = await articleService.create(baseInput());
    expect(article.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('a malformed or unknown id is a 404, never a 500', async () => {
    await expect(articleService.getById('not-an-id')).rejects.toBeInstanceOf(NotFoundError);
    await expect(articleService.getById('0123456789abcdef01234567')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(articleService.update('nope', { deck: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(articleService.remove('0123456789abcdef01234567')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('omits absent optional fields from the DTO, as the Mongo mapping did', async () => {
    const article = await articleService.create(baseInput());
    expect('deck' in article && article.deck !== undefined).toBe(false);
    expect(article.heroImage).toBeUndefined();
    expect(article.source).toBeUndefined();
    expect(article.seo).toEqual({
      metaTitle: undefined,
      metaDescription: undefined,
      ogImage: undefined,
    });
  });

  it('round-trips the sub-documents (heroImage, seo, source) and tags', async () => {
    const article = await articleService.create(
      baseInput({
        heroImage: { url: 'https://cdn.example.test/a.jpg', alt: 'Alt', credit: 'AP' },
        seo: { metaTitle: 'Meta' },
        source: { name: 'Wire', articleUrl: 'https://wire.example/a' },
        tags: ['a', 'b'],
      }),
    );
    const read = await articleService.getById(article.id);
    expect(read.heroImage).toEqual({
      url: 'https://cdn.example.test/a.jpg',
      alt: 'Alt',
      credit: 'AP',
      caption: undefined,
    });
    expect(read.seo.metaTitle).toBe('Meta');
    expect(read.source?.articleUrl).toBe('https://wire.example/a');
    expect(read.tags).toEqual(['a', 'b']);
  });

  it('a patch that changes nothing is a no-op save: updatedAt does not move', async () => {
    const article = await articleService.create(baseInput({ deck: 'Same' }));
    await new Promise((r) => setTimeout(r, 15));
    const same = await articleService.update(article.id, { deck: 'Same', tags: [] });
    expect(same.updatedAt).toBe(article.updatedAt);
    const changed = await articleService.update(article.id, { deck: 'Different' });
    expect(changed.updatedAt > article.updatedAt).toBe(true);
  });

  it('queues distribution in the transaction of each change: publish, update, retract', async () => {
    const unregister = setDeliveryPlanner(() => ['ch']);
    try {
      const draft = await articleService.create(baseInput());
      await articleService.update(draft.id, { deck: 'Draft edit' });
      await articleService.publish(draft.id);
      await articleService.publish(draft.id);
      await articleService.update(draft.id, { deck: 'Correction' });
      await articleService.update(draft.id, { featured: 1 });
      await articleService.unpublish(draft.id);
      await articleService.update(draft.id, { status: 'published' });
      expect(await plannedActions(draft.id)).toEqual(['publish', 'update', 'retract', 'publish']);

      const born = await articleService.create(
        baseInput({ title: 'Born live', status: 'published' }),
      );
      await articleService.remove(born.id);
      expect(await plannedActions(born.id)).toEqual(['publish', 'retract']);
    } finally {
      unregister();
    }
  });

  it('a refused change queues nothing, and deleting a never-published draft retracts nothing', async () => {
    const unregister = setDeliveryPlanner(() => ['ch']);
    try {
      const taken = await articleService.create(baseInput({ title: 'Taken' }));
      const draft = await articleService.create(baseInput({ title: 'Other' }));
      await expect(
        articleService.update(draft.id, { status: 'published', slug: taken.slug }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await plannedActions(draft.id)).toEqual([]);

      await articleService.remove(draft.id);
      expect(await plannedActions(draft.id)).toEqual([]);
    } finally {
      unregister();
    }
  });

  it('answers 404 for an unknown article or a revision of another article', async () => {
    const a = await articleService.create(baseInput({ title: 'A', deck: 'one' }));
    const b = await articleService.create(baseInput({ title: 'B' }));
    await articleService.update(a.id, { deck: 'two' });
    const [revisionOfA] = await articleService.listRevisions(a.id);
    await expect(articleService.listRevisions('f'.repeat(24))).rejects.toMatchObject({
      status: 404,
    });
    await expect(articleService.getRevision(b.id, revisionOfA?.id ?? 0)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('articleService — scheduled publishing', () => {
  const at = (iso: string) => new Date(iso);

  it('publishes a scheduled draft once it is due — not before — and is distributed once', async () => {
    const unregister = setDeliveryPlanner(() => ['ch']);
    try {
      const draft = await articleService.create(
        baseInput({ title: 'Morning briefing', scheduledAt: '2026-10-11T07:00:00.000Z' }),
      );
      expect(draft.scheduledAt).toBe('2026-10-11T07:00:00.000Z');

      expect(await articleService.publishDue(at('2026-10-11T06:59:59Z'))).toEqual([]);
      expect(await articleService.publishDue(at('2026-10-11T07:00:00Z'))).toEqual([draft.id]);
      // A second tick (or a second backend task) finds nothing left to do.
      expect(await articleService.publishDue(at('2026-10-11T07:00:30Z'))).toEqual([]);

      const live = await articleService.getById(draft.id);
      expect(live.status).toBe('published');
      expect(live.scheduledAt).toBeNull();
      expect(live.publishedAt).toBe('2026-10-11T07:00:00.000Z');
      expect(await plannedActions(draft.id)).toEqual(['publish']);
      expect((await articleService.listRevisions(draft.id))[0]?.actor).toBe('scheduler');
    } finally {
      unregister();
    }
  });

  it('a cancelled or moved schedule is respected; publishing by hand clears it', async () => {
    const cancelled = await articleService.create(
      baseInput({ title: 'Cancelled', scheduledAt: '2026-10-11T07:00:00.000Z' }),
    );
    await articleService.update(cancelled.id, { scheduledAt: null });
    const moved = await articleService.create(
      baseInput({ title: 'Moved', scheduledAt: '2026-10-11T07:00:00.000Z' }),
    );
    await articleService.update(moved.id, { scheduledAt: '2026-10-12T07:00:00.000Z' });
    expect(await articleService.publishDue(at('2026-10-11T08:00:00Z'))).toEqual([]);

    const byHand = await articleService.publish(moved.id);
    expect(byHand.scheduledAt).toBeNull();
  });

  it('refuses to schedule an article that is live or being published', async () => {
    await expect(
      articleService.create(
        baseInput({
          title: 'Contradiction',
          status: 'published',
          scheduledAt: '2026-10-11T07:00:00.000Z',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    const live = await articleService.create(baseInput({ title: 'Live', status: 'published' }));
    await expect(
      articleService.update(live.id, { scheduledAt: '2026-10-11T07:00:00.000Z' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('articleService — corrections', () => {
  it('appends dated public corrections that a restore leaves in place', async () => {
    const article = await articleService.create(
      baseInput({ title: 'Vote set for Tuesday', status: 'published' }),
    );
    await articleService.update(article.id, { title: 'Vote set for Wednesday' });
    const corrected = await articleService.addCorrection(
      article.id,
      'An earlier version misstated the day of the vote.',
      'harper',
    );
    expect(corrected.corrections).toEqual([
      { at: expect.any(String), text: 'An earlier version misstated the day of the vote.' },
    ]);
    expect((await articleService.listRevisions(article.id))[0]?.actor).toBe('harper');

    const [, beforeTitleFix] = await articleService.listRevisions(article.id);
    const restored = await articleService.restoreRevision(article.id, beforeTitleFix?.id ?? 0);
    expect(restored.title).toBe('Vote set for Tuesday');
    expect(restored.corrections).toHaveLength(1);

    const publicView = await articleService.getBySlug(article.slug);
    expect(publicView.corrections).toHaveLength(1);
  });
});

describe('articleService.list — sort', () => {
  it('latest ignores the featured rank; the default stays editorial', async () => {
    const lead = await articleService.create(
      baseInput({ title: 'Older lead', featured: 9, status: 'published' }),
    );
    await new Promise((r) => setTimeout(r, 15));
    const fresh = await articleService.create(
      baseInput({ title: 'Fresh brief', status: 'published' }),
    );
    expect((await articleService.list(baseQuery())).data.map((a) => a.id)).toEqual([
      lead.id,
      fresh.id,
    ]);
    expect(
      (await articleService.list(baseQuery({ sort: 'latest' }))).data.map((a) => a.id),
    ).toEqual([fresh.id, lead.id]);
  });
});

describe('articleService — views and Most Popular', () => {
  const at = (iso: string) => new Date(iso);

  it('ranks an edition by views over the window; drafts and unknown ids count nothing', async () => {
    const quiet = await articleService.create(baseInput({ title: 'Quiet', status: 'published' }));
    const busy = await articleService.create(baseInput({ title: 'Busy', status: 'published' }));
    const spanish = await articleService.create(
      baseInput({ title: 'Noticia', language: 'es', status: 'published' }),
    );
    const draft = await articleService.create(baseInput({ title: 'Draft' }));

    const today = at('2026-10-10T12:00:00Z');
    await articleService.recordView(quiet.id, today);
    for (let i = 0; i < 3; i += 1) await articleService.recordView(busy.id, today);
    await articleService.recordView(spanish.id, today);
    await articleService.recordView(draft.id, today);
    await articleService.recordView('f'.repeat(24), today);
    await articleService.recordView('not-an-id', today);

    const popular = await articleService.popular({ language: 'en', days: 1, limit: 6 }, today);
    expect(popular.map((a) => a.title)).toEqual(['Busy', 'Quiet']);
    const es = await articleService.popular({ language: 'es', days: 1, limit: 6 }, today);
    expect(es.map((a) => a.title)).toEqual(['Noticia']);
  });

  it('only counts days inside the window, and stops ranking an unpublished story', async () => {
    const old = await articleService.create(baseInput({ title: 'Old news', status: 'published' }));
    const fresh = await articleService.create(baseInput({ title: 'Fresh', status: 'published' }));
    for (let i = 0; i < 5; i += 1)
      await articleService.recordView(old.id, at('2026-10-07T12:00:00Z'));
    await articleService.recordView(fresh.id, at('2026-10-09T23:59:00Z'));

    const now = at('2026-10-10T08:00:00Z');
    expect(
      (await articleService.popular({ language: 'en', days: 2, limit: 6 }, now)).map(
        (a) => a.title,
      ),
    ).toEqual(['Fresh']);
    expect(
      (await articleService.popular({ language: 'en', days: 7, limit: 6 }, now)).map(
        (a) => a.title,
      ),
    ).toEqual(['Old news', 'Fresh']);

    await articleService.unpublish(old.id);
    expect(
      (await articleService.popular({ language: 'en', days: 7, limit: 6 }, now)).map(
        (a) => a.title,
      ),
    ).toEqual(['Fresh']);
  });
});
