import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIES, type ArticleInput, type ArticleListQuery } from '@gwj/shared-types';
import { articleService, onArticlePublished } from '../articleService';
import { NotFoundError } from '../../errors';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';

let testDb: TestDatabase;

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

  it('publish() fires the published listener only on the draft→published transition', async () => {
    const seen: string[] = [];
    const off = onArticlePublished((a) => seen.push(a.id));
    try {
      const draft = await articleService.create(baseInput());
      await articleService.publish(draft.id);
      await articleService.publish(draft.id);
      await articleService.update(draft.id, { deck: 'Correction' });
      expect(seen).toEqual([draft.id]);
    } finally {
      off();
    }
  });

  it('fans out exactly once per article, even across unpublish → re-publish', async () => {
    const seen: string[] = [];
    const off = onArticlePublished((a) => seen.push(a.id));
    try {
      const draft = await articleService.create(baseInput());
      await articleService.publish(draft.id);
      await articleService.unpublish(draft.id);
      await articleService.publish(draft.id);
      await articleService.update(draft.id, { status: 'draft' });
      await articleService.update(draft.id, { status: 'published' });
      const born = await articleService.create(
        baseInput({ title: 'Born live', status: 'published' }),
      );
      await articleService.unpublish(born.id);
      await articleService.publish(born.id);
      expect(seen).toEqual([draft.id, born.id]);
    } finally {
      off();
    }
  });

  it('orders listings by featured, then publishedAt DESC with NULLS LAST (where Mongo put a null), then createdAt', async () => {
    const draft = await articleService.create(baseInput({ title: 'Draft', featured: 5 }));
    const older = await articleService.create(
      baseInput({ title: 'Older', featured: 5, status: 'published' }),
    );
    await new Promise((r) => setTimeout(r, 15));
    const newer = await articleService.create(
      baseInput({ title: 'Newer', featured: 5, status: 'published' }),
    );
    const top = await articleService.create(baseInput({ title: 'Top', featured: 9 }));
    const result = await articleService.list(baseQuery(), { includeAll: true });
    expect(result.data.map((a) => a.id)).toEqual([top.id, newer.id, older.id, draft.id]);
  });

  it('featured=true keeps only featured > 0; author narrows to one byline', async () => {
    await articleService.create(baseInput({ title: 'Plain', featured: 0, status: 'published' }));
    const featured = await articleService.create(
      baseInput({ title: 'Pick', featured: 3, status: 'published', author: 'Ada' }),
    );
    expect(
      (await articleService.list(baseQuery({ featured: true }))).data.map((a) => a.id),
    ).toEqual([featured.id]);
    expect(
      (await articleService.list(baseQuery(), { author: 'Ada' })).data.map((a) => a.id),
    ).toEqual([featured.id]);
  });

  it('paginates with a stable total', async () => {
    for (let i = 0; i < 5; i += 1)
      await articleService.create(baseInput({ title: `Story ${i}`, status: 'published' }));
    const page2 = await articleService.list(baseQuery({ page: 2, limit: 2 }));
    expect(page2.data).toHaveLength(2);
    expect(page2.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });
});

describe('articleService.search — Mongo $text semantics on tsvector', () => {
  async function published(
    title: string,
    deck?: string,
    extra: Partial<ArticleInput> = {},
  ): Promise<string> {
    return (await articleService.create(baseInput({ title, deck, status: 'published', ...extra })))
      .id;
  }

  it('bare terms are OR-ed and stemmed (english)', async () => {
    const oil = await published('Oil prices climbing');
    const gold = await published('Gold rallies');
    await published('Unrelated weather story');
    const result = await articleService.search('oil gold', baseQuery());
    expect(result.data.map((a) => a.id).sort()).toEqual([oil, gold].sort());
    expect((await articleService.search('climb', baseQuery())).data.map((a) => a.id)).toEqual([
      oil,
    ]);
  });

  it('searches the body too, ranking a deck match above a body-only match', async () => {
    const byDeck = await published('Headline', 'Inflation cools');
    const byBody = await published('Other', undefined, {
      body: 'Inflation is mentioned only in the body.',
    });
    expect((await articleService.search('inflation', baseQuery())).data.map((a) => a.id)).toEqual([
      byDeck,
      byBody,
    ]);
  });

  it('a quoted phrase must match as a phrase; bare terms then only rank', async () => {
    const exact = await published('Central bank raises rates');
    await published('Rates rise as the bank in central Asia waits');
    const result = await articleService.search('"central bank" rates', baseQuery());
    expect(result.data.map((a) => a.id)).toEqual([exact]);
  });

  it('-term excludes; exclusions alone and stop words alone match nothing', async () => {
    const keep = await published('Markets rally on earnings');
    await published('Markets slump on tariffs');
    expect(
      (await articleService.search('markets -tariffs', baseQuery())).data.map((a) => a.id),
    ).toEqual([keep]);
    expect((await articleService.search('-tariffs', baseQuery())).data).toEqual([]);
    expect((await articleService.search('the and of', baseQuery())).data).toEqual([]);
  });

  it('ranks the better match first', async () => {
    const weak = await published('Energy outlook', 'A note on policy');
    const strong = await published('Energy energy energy', 'Energy policy and energy prices');
    const result = await articleService.search('energy', baseQuery());
    expect(result.data.map((a) => a.id)).toEqual([strong, weak]);
  });

  it('public search and list exclude drafts even when a status is requested; admin list(q) includes them', async () => {
    const draft = await articleService.create(baseInput({ title: 'Secret merger draft' }));
    expect((await articleService.search('merger', baseQuery())).data).toEqual([]);
    expect((await articleService.search('merger', baseQuery({ status: 'draft' }))).data).toEqual(
      [],
    );
    expect((await articleService.list(baseQuery({ q: 'merger', status: 'draft' }))).data).toEqual(
      [],
    );
    expect(
      (await articleService.list(baseQuery({ q: 'merger' }), { includeAll: true })).data.map(
        (a) => a.id,
      ),
    ).toEqual([draft.id]);
  });
});

describe('articleService — stable slugs and SEO patches', () => {
  it('a never-published draft follows its title, without reserving the old slug', async () => {
    const draft = await articleService.create(baseInput({ title: 'Working title' }));
    const renamed = await articleService.update(draft.id, { title: 'Final headline' });
    expect(renamed.slug).toBe('final-headline');
    const other = await articleService.create(baseInput({ title: 'Working title' }));
    expect(other.slug).toBe('working-title');
  });

  it('a published (or once-published) article keeps its slug when the title changes', async () => {
    const article = await articleService.create(
      baseInput({ title: 'Original headline', status: 'published' }),
    );
    const edited = await articleService.update(article.id, { title: 'Sharper headline' });
    expect(edited.slug).toBe('original-headline');

    await articleService.unpublish(article.id);
    const editedDraft = await articleService.update(article.id, { title: 'Even sharper headline' });
    expect(editedDraft.slug).toBe('original-headline');
  });

  it('an explicit slug change redirects the old slug, which no other article can claim', async () => {
    const article = await articleService.create(
      baseInput({ title: 'Original headline', status: 'published' }),
    );
    const moved = await articleService.update(article.id, { slug: 'new-url' });
    expect(moved.slug).toBe('new-url');
    expect(await articleService.findRedirectSlug('original-headline')).toBe('new-url');

    const copycat = await articleService.create(baseInput({ title: 'Original headline' }));
    expect(copycat.slug).toBe('original-headline-2');
    await expect(
      articleService.create(baseInput({ slug: 'original-headline' })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(articleService.update(copycat.id, { slug: 'new-url' })).rejects.toMatchObject({
      status: 409,
    });

    // Moving back to its own old slug reclaims it; the intermediate one redirects.
    const back = await articleService.update(article.id, { slug: 'original-headline' });
    expect(back.slug).toBe('original-headline');
    expect(await articleService.findRedirectSlug('original-headline')).toBeNull();
    expect(await articleService.findRedirectSlug('new-url')).toBe('original-headline');
  });

  it('does not redirect to an unpublished article', async () => {
    const article = await articleService.create(
      baseInput({ title: 'Original headline', status: 'published' }),
    );
    await articleService.update(article.id, { slug: 'new-url' });
    await articleService.unpublish(article.id);
    expect(await articleService.findRedirectSlug('original-headline')).toBeNull();
  });

  it('merges SEO patches: omitted keys are kept, empty strings clear', async () => {
    const article = await articleService.create(
      baseInput({
        seo: {
          metaTitle: 'Title',
          metaDescription: 'Description',
          ogImage: 'https://cdn.example.test/a.webp',
        },
      }),
    );
    const retitled = await articleService.update(article.id, { seo: { metaTitle: 'New title' } });
    expect(retitled.seo).toEqual({
      metaTitle: 'New title',
      metaDescription: 'Description',
      ogImage: 'https://cdn.example.test/a.webp',
    });
    const cleared = await articleService.update(article.id, {
      seo: { metaDescription: '', ogImage: '' },
    });
    expect(cleared.seo).toEqual({ metaTitle: 'New title' });
  });
});

describe('articleService — linked translations', () => {
  it('an article starts as its own story; a translation joins the original story', async () => {
    const en = await articleService.create(
      baseInput({ title: 'Central bank holds rates', status: 'published' }),
    );
    expect(en.translationGroupId).toBe(en.id);

    const es = await articleService.create(
      baseInput({
        title: 'El banco central mantiene los tipos',
        language: 'es',
        translationOf: en.id,
        status: 'published',
      }),
    );
    expect(es.translationGroupId).toBe(en.id);

    // A third edition may point at ANY member of the story, not only the original.
    const fr = await articleService.create(
      baseInput({
        title: 'La banque centrale maintient ses taux',
        language: 'fr',
        translationOf: es.id,
      }),
    );
    expect(fr.translationGroupId).toBe(en.id);

    const adminView = await articleService.getById(en.id);
    expect(adminView.translations?.map((t) => [t.language, t.slug, t.status])).toEqual([
      ['es', es.slug, 'published'],
      ['fr', fr.slug, 'draft'],
    ]);

    // Readers only see published editions.
    const publicView = await articleService.getBySlug(en.slug);
    expect(publicView.translations?.map((t) => t.language)).toEqual(['es']);
  });

  it('refuses a second edition in the same language, and an unknown original', async () => {
    const en = await articleService.create(baseInput({ title: 'Original story' }));
    await articleService.create(
      baseInput({ title: 'Historia original', language: 'es', translationOf: en.id }),
    );
    await expect(
      articleService.create(
        baseInput({ title: 'Otra versión', language: 'es', translationOf: en.id }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      articleService.create(
        baseInput({ title: 'English twin', language: 'en', translationOf: en.id }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      articleService.create(
        baseInput({ title: 'Orphan', language: 'fr', translationOf: 'f'.repeat(24) }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('links two existing articles later, and guards a language change inside a story', async () => {
    const en = await articleService.create(baseInput({ title: 'Story in English' }));
    const es = await articleService.create(
      baseInput({ title: 'Historia en español', language: 'es' }),
    );
    const linked = await articleService.update(es.id, { translationOf: en.id });
    expect(linked.translationGroupId).toBe(en.id);
    expect((await articleService.getById(en.id)).translations?.map((t) => t.id)).toEqual([es.id]);

    await expect(articleService.update(es.id, { language: 'en' })).rejects.toMatchObject({
      status: 409,
    });
    expect((await articleService.update(es.id, { language: 'fr' })).language).toBe('fr');
  });
});

describe('articleService.search — body, weights, editions and filters', () => {
  const published = (overrides: Partial<ArticleInput>) =>
    articleService.create(baseInput({ status: 'published', ...overrides }));

  it('finds a word that appears only in the body, ranking headline matches first', async () => {
    const bodyOnly = await published({
      title: 'Quarterly results',
      body: 'Margins improved on semiconductor demand.',
    });
    const headline = await published({
      title: 'Semiconductor shortage eases',
      body: 'Supply chains recovered.',
    });
    const result = await articleService.search('semiconductor', baseQuery());
    expect(result.data.map((a) => a.id)).toEqual([headline.id, bodyOnly.id]);
  });

  it('parses the query in each edition’s language, with or without a language filter', async () => {
    const es = await published({ title: 'Los precios subieron en septiembre', language: 'es' });
    // Only the Spanish stemmer reduces both "subir" and "subieron" to the same lexeme.
    expect(
      (await articleService.search('subir', baseQuery({ language: 'es' }))).data.map((a) => a.id),
    ).toEqual([es.id]);
    expect((await articleService.search('subir', baseQuery())).data.map((a) => a.id)).toEqual([
      es.id,
    ]);
    expect(
      (await articleService.list(baseQuery({ q: 'subir' }), { includeAll: true })).data.map(
        (a) => a.id,
      ),
    ).toEqual([es.id]);
  });

  it('filters listings and searches by exact tag and author', async () => {
    const tagged = await published({
      title: 'NATO summit opens',
      tags: ['NATO', 'Ukraine'],
      author: 'Harper Reyes',
    });
    await published({ title: 'NATO budget talks', tags: ['Budget'], author: 'Sofia Marchetti' });
    expect(
      (await articleService.list(baseQuery({ tag: 'Ukraine' }))).data.map((a) => a.id),
    ).toEqual([tagged.id]);
    expect(
      (await articleService.list(baseQuery({ author: 'Harper Reyes' }))).data.map((a) => a.id),
    ).toEqual([tagged.id]);
    expect(
      (await articleService.search('nato', baseQuery({ tag: 'NATO' }))).data.map((a) => a.id),
    ).toEqual([tagged.id]);
  });
});

describe('articleService — revisions', () => {
  it('records the state BEFORE each real change, with who made it; a no-op records nothing', async () => {
    const article = await articleService.create(baseInput({ title: 'First draft', deck: 'v1' }));
    await articleService.update(article.id, { deck: 'v2' }, 'eleanor');
    await articleService.update(article.id, { deck: 'v2' }, 'eleanor');
    await articleService.publish(article.id, 'gwj-agent');

    const history = await articleService.listRevisions(article.id);
    expect(history.map((r) => [r.actor, r.status])).toEqual([
      ['gwj-agent', 'draft'],
      ['eleanor', 'draft'],
    ]);
    const oldest = await articleService.getRevision(article.id, history[1]?.id ?? 0);
    expect(oldest.snapshot.deck).toBe('v1');
  });

  it('restores content (even clearing a hero image) without touching status or URL, and can be undone', async () => {
    const article = await articleService.create(
      baseInput({ title: 'Original headline', body: 'Original body.', status: 'published' }),
    );
    await articleService.update(article.id, {
      title: 'Rewritten headline',
      body: 'Rewritten body.',
      heroImage: { url: 'https://cdn.example.test/new.webp', alt: 'New' },
    });
    const [beforeRewrite] = await articleService.listRevisions(article.id);

    const restored = await articleService.restoreRevision(
      article.id,
      beforeRewrite?.id ?? 0,
      'nate',
    );
    expect(restored.title).toBe('Original headline');
    expect(restored.body).toBe('Original body.');
    expect(restored.heroImage).toBeUndefined();
    expect(restored.status).toBe('published');
    expect(restored.slug).toBe(article.slug);

    // The restore itself is history: undoing it brings the rewrite back.
    const [beforeRestore] = await articleService.listRevisions(article.id);
    expect(beforeRestore?.actor).toBe('nate');
    const undone = await articleService.restoreRevision(article.id, beforeRestore?.id ?? 0);
    expect(undone.title).toBe('Rewritten headline');
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

  it('publishes a scheduled draft once it is due — not before — and fans out once', async () => {
    const seen: string[] = [];
    const off = onArticlePublished((a) => seen.push(a.id));
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
      expect(seen).toEqual([draft.id]);
      expect((await articleService.listRevisions(draft.id))[0]?.actor).toBe('scheduler');
    } finally {
      off();
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
