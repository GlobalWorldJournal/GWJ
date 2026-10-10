import { describe, it, expect } from 'vitest';
import type { Article } from '@gwj/shared-types';
import { sortForHome } from '../Home';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a',
    slug: 'a-story',
    title: 'A Story',
    deck: 'A short deck.',
    kicker: 'World',
    category: 'World',
    language: 'en',
    author: 'Jane Reporter',
    body: 'The body of the article.',
    status: 'published',
    featured: 0,
    tags: [],
    seo: {},
    publishedAt: '2026-06-23T12:00:00.000Z',
    createdAt: '2026-06-23T10:00:00.000Z',
    updatedAt: '2026-06-23T11:00:00.000Z',
    ...overrides,
  };
}

describe('sortForHome', () => {
  it('leads with the newest story, not the one an old seed script happened to rank highest', () => {
    const oldFeatured = makeArticle({
      id: 'old',
      title: 'Old Featured Seed Story',
      featured: 52,
      publishedAt: '2026-06-23T12:00:00.000Z',
    });
    const freshUnfeatured = makeArticle({
      id: 'fresh',
      title: 'Fresh Unfeatured Story',
      featured: 0,
      publishedAt: '2026-10-10T15:35:47.000Z',
    });

    const sorted = sortForHome([oldFeatured, freshUnfeatured]);

    expect(sorted.map((a) => a.id)).toEqual(['fresh', 'old']);
  });

  it('still uses featured as a tiebreak between stories published at the same moment', () => {
    const sameMinute = '2026-10-10T15:35:47.000Z';
    const lowRank = makeArticle({
      id: 'low',
      title: 'Low Rank Story',
      featured: 0,
      publishedAt: sameMinute,
    });
    const highRank = makeArticle({
      id: 'high',
      title: 'High Rank Story',
      featured: 5,
      publishedAt: sameMinute,
    });

    const sorted = sortForHome([lowRank, highRank]);

    expect(sorted.map((a) => a.id)).toEqual(['high', 'low']);
  });

  it('falls back to createdAt when publishedAt is null (a draft that was later force-published without it)', () => {
    const earlier = makeArticle({
      id: 'earlier',
      publishedAt: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    const later = makeArticle({
      id: 'later',
      publishedAt: null,
      createdAt: '2026-10-09T00:00:00.000Z',
    });

    const sorted = sortForHome([earlier, later]);

    expect(sorted.map((a) => a.id)).toEqual(['later', 'earlier']);
  });

  it('does not mutate the array it was given', () => {
    const first = makeArticle({ id: 'first', publishedAt: '2026-06-23T12:00:00.000Z' });
    const second = makeArticle({ id: 'second', publishedAt: '2026-10-10T12:00:00.000Z' });
    const original = [first, second];

    sortForHome(original);

    expect(original.map((a) => a.id)).toEqual(['first', 'second']);
  });
});
