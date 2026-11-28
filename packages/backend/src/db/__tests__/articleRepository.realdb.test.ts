import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { CATEGORIES, type Language } from '@gwj/shared-types';
import { count } from 'drizzle-orm';
import { getDb } from '../client';
import { newRecordId } from '../ids';
import {
  type ArticleFilter,
  type ArticlePage,
  findArticleById,
  insertArticle,
  listArticles,
  listingQuery,
} from '../repositories/articleRepository';
import { articles } from '../schema/articles';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';

let testDb: TestDatabase;

/**
 * The listing as it was run before: every column, and the total from a second
 * `count(*)` over the same WHERE. The new form (no `search_vector`, a search
 * counted by `count(*) over ()`) must return exactly this, minus the vector.
 */
async function twoQueryListing(
  filter: ArticleFilter,
  page: number,
  limit: number,
): Promise<ArticlePage> {
  const listing = listingQuery(filter);
  if (!listing) return { rows: [], total: 0 };
  const [rows, totals] = await Promise.all([
    getDb()
      .select()
      .from(articles)
      .where(listing.where)
      .orderBy(...listing.order)
      .limit(limit)
      .offset((page - 1) * limit),
    getDb().select({ total: count() }).from(articles).where(listing.where),
  ]);
  return {
    rows: rows.map(({ searchVector: _searchVector, ...row }) => row),
    total: totals[0]?.total ?? 0,
  };
}

const TEXTS: Record<Language, { title: string; body: string }[]> = {
  en: [
    { title: 'Markets rally as central banks signal cuts', body: 'Markets rose. Banks cut.' },
    { title: 'Central bank holds rates', body: 'The central bank held rates; markets shrugged.' },
    { title: 'Tech shares slide', body: 'Chip makers fell while banks gained.' },
    { title: 'Markets rally as central banks signal cuts', body: 'Markets rose. Banks cut.' },
    { title: 'Elections reshape the budget', body: 'Parliament debates the budget and markets.' },
  ],
  es: [
    { title: 'Los mercados suben tras el banco central', body: 'Los mercados subieron.' },
    { title: 'El banco central mantiene los tipos', body: 'Los mercados reaccionan al banco.' },
    { title: 'Las tecnológicas caen', body: 'Los fabricantes de chips bajan; markets cerraron.' },
  ],
  fr: [
    { title: 'Les marchés montent après la banque centrale', body: 'Les marchés ont monté.' },
    { title: 'La banque centrale maintient ses taux', body: 'Les marchés et la banque.' },
  ],
};

beforeAll(async () => {
  testDb = await useTestDatabase();
  const base = Date.UTC(2026, 10, 1);
  let n = 0;
  // Three rounds of every text: ties in relevance, drafts, featured weights and
  // equal publication times, so every tie-break of the ORDER BY is exercised.
  for (let round = 0; round < 3; round += 1) {
    for (const [language, texts] of Object.entries(TEXTS) as [Language, typeof TEXTS.en][]) {
      for (const text of texts) {
        n += 1;
        const published = n % 4 !== 0;
        const id = newRecordId(new Date(base + n * 1000));
        const at = new Date(base + (n % 5) * 3_600_000);
        await insertArticle(getDb(), {
          id,
          translationGroupId: id,
          slug: `story-${n}`,
          title: text.title,
          deck: n % 3 === 0 ? `Deck about markets ${n}` : null,
          category: CATEGORIES[n % CATEGORIES.length] ?? CATEGORIES[0],
          language,
          author: n % 2 === 0 ? 'Ana' : 'Ben',
          body: text.body,
          status: published ? 'published' : 'draft',
          featured: n % 6 === 0 ? 2 : 0,
          tags: n % 2 === 0 ? ['economy'] : [],
          seo: {},
          publishedAt: published ? at : null,
          firstPublishedAt: published ? at : null,
          createdAt: at,
          updatedAt: at,
        });
      }
    }
  }
});

afterAll(async () => {
  await testDb.drop();
});

const SEARCHES = [
  'markets',
  'markets banks',
  'markets rally central banks signal cuts',
  '"central bank"',
  'markets -banks',
  'mercados banco',
  'marchés',
  'the',
  'zzzz',
];

describe('listArticles — the same answer as the two-query form', () => {
  it('every search, edition, status and page (including past the last)', async () => {
    let compared = 0;
    for (const q of SEARCHES) {
      for (const language of [undefined, 'en', 'es'] as const) {
        for (const status of [undefined, 'published'] as const) {
          const filter: ArticleFilter = { q, language, status };
          for (let page = 1; page <= 6; page += 1) {
            const expected = await twoQueryListing(filter, page, 4);
            const actual = await listArticles(filter, page, 4);
            expect(actual).toEqual(expected);
            for (const row of actual.rows) expect(Object.keys(row)).not.toContain('searchVector');
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(SEARCHES.length * 3 * 2 * 6);
  });

  it('a search that matches rows reports its total on every page', async () => {
    const all = await listArticles({ q: 'markets' }, 1, 100);
    expect(all.total).toBeGreaterThan(10);
    expect(all.rows).toHaveLength(all.total);
    const past = await listArticles({ q: 'markets' }, 100, 4);
    expect(past).toEqual({ rows: [], total: all.total });
  });

  it('the listings without a search, every order and filter', async () => {
    const filters: ArticleFilter[] = [
      { status: 'published', language: 'en' },
      { status: 'published' },
      {},
      { latestFirst: true },
      { status: 'published', category: CATEGORIES[1] },
      { featuredOnly: true },
      { author: 'Ana', tag: 'economy' },
    ];
    for (const filter of filters) {
      for (let page = 1; page <= 5; page += 1) {
        expect(await listArticles(filter, page, 7)).toEqual(await twoQueryListing(filter, page, 7));
      }
    }
  });

  it('a single read returns the row without the search vector', async () => {
    const [first] = (await listArticles({}, 1, 1)).rows;
    if (!first) throw new Error('no fixture rows');
    const row = await findArticleById(first.id);
    expect(row).toEqual(first);
    expect(Object.keys(row ?? {})).not.toContain('searchVector');
  });
});
