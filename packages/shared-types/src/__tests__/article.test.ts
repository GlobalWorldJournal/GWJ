import { describe, it, expect } from 'bun:test';
import {
  ArticleInputSchema,
  ArticleUpdateSchema,
  ContentBlockSchema,
  ArticleListQuerySchema,
  PublicArticleListQuerySchema,
  slugify,
  CATEGORIES,
} from '../index';

describe('slugify', () => {
  it('slugifies titles', () => {
    expect(slugify('Global Equities Climb, Again!')).toBe('global-equities-climb-again');
  });
  it('strips diacritics', () => {
    expect(slugify('Crónica del Mercado')).toBe('cronica-del-mercado');
  });
  it('collapses whitespace and dashes', () => {
    expect(slugify('  a   --  b ')).toBe('a-b');
  });
});

describe('ArticleInputSchema', () => {
  it('rejects unknown category', () => {
    const r = ArticleInputSchema.safeParse({
      title: 'X',
      category: 'Sports',
      author: 'n',
      body: [],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a valid article input and applies defaults', () => {
    const r = ArticleInputSchema.safeParse({
      title: 'X',
      category: CATEGORIES[0],
      author: 'n',
      body: '# Heading\n\nA markdown paragraph.',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('draft');
      expect(r.data.featured).toBe(0);
      expect(r.data.tags).toEqual([]);
    }
  });
  it('rejects empty title', () => {
    const r = ArticleInputSchema.safeParse({ title: '', category: CATEGORIES[0], author: 'n' });
    expect(r.success).toBe(false);
  });
});

describe('ContentBlockSchema', () => {
  it('validates an image block url', () => {
    const bad = ContentBlockSchema.safeParse({ type: 'image', url: 'not-a-url' });
    expect(bad.success).toBe(false);
    const ok = ContentBlockSchema.safeParse({ type: 'image', url: 'https://cdn.x/y.jpg' });
    expect(ok.success).toBe(true);
  });
  it('requires at least one list item', () => {
    const r = ContentBlockSchema.safeParse({ type: 'list', items: [] });
    expect(r.success).toBe(false);
  });
});

describe('ArticleUpdateSchema', () => {
  it('allows partial updates', () => {
    const r = ArticleUpdateSchema.safeParse({ title: 'New title only' });
    expect(r.success).toBe(true);
  });
});

describe('ArticleListQuerySchema', () => {
  it('coerces page/limit from strings and applies defaults', () => {
    const r = ArticleListQuerySchema.safeParse({ page: '2' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(2);
      expect(r.data.limit).toBe(20);
    }
  });
  it('caps limit at 50', () => {
    const r = ArticleListQuerySchema.safeParse({ limit: '500' });
    expect(r.success).toBe(false);
  });
  it('reads featured "false" as false and "true" as true (not truthy-string coercion)', () => {
    expect(ArticleListQuerySchema.parse({ featured: 'false' }).featured).toBe(false);
    expect(ArticleListQuerySchema.parse({ featured: 'true' }).featured).toBe(true);
    expect(ArticleListQuerySchema.parse({ featured: false }).featured).toBe(false);
    expect(ArticleListQuerySchema.safeParse({ featured: 'yes' }).success).toBe(false);
  });
});

describe('PublicArticleListQuerySchema', () => {
  it('drops a requested status so readers can never ask for drafts', () => {
    const r = PublicArticleListQuerySchema.parse({ status: 'draft', q: 'merger' });
    expect(r).not.toHaveProperty('status');
    expect(r.q).toBe('merger');
  });
});

describe('ArticleInputSchema — no provenance', () => {
  it('drops outlet provenance and photo credits a client still sends', () => {
    const r = ArticleInputSchema.parse({
      title: 'A story',
      category: 'World',
      author: 'Nate',
      body: 'Body',
      heroImage: {
        url: 'https://cdn.example.test/a.webp',
        alt: 'A',
        credit: 'Source: wire.example',
      },
      source: { name: 'Wire', articleUrl: 'https://example.com/a' },
      sources: [{ name: 'Wire', articleUrl: 'https://example.com/a' }],
    });
    expect(r).not.toHaveProperty('source');
    expect(r).not.toHaveProperty('sources');
    expect(r.heroImage).not.toHaveProperty('credit');
  });
});
