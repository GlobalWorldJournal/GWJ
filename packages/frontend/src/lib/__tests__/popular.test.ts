import { describe, expect, it } from 'vitest';
import type { PublicArticle } from '@gwj/shared-types';
import { mostPopularRail } from '../popular';

const story = (id: string): PublicArticle => ({
  id,
  slug: id,
  title: id,
  category: 'World',
  language: 'en',
  author: 'A',
  body: '',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  publishedAt: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
});

describe('mostPopularRail', () => {
  it('ranks the most read first, tops up with the newest, never repeats or includes the excluded', () => {
    const ranked = [story('b'), story('current'), story('a')];
    const latest = [story('a'), story('c'), story('d'), story('e')];
    expect(mostPopularRail(ranked, latest, 4, 'current').map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('is just the newest stories while nothing has been read', () => {
    expect(mostPopularRail([], [story('x'), story('y')], 6).map((s) => s.id)).toEqual(['x', 'y']);
  });
});
