import { describe, expect, it } from 'vitest';
import type { PublicArticle } from '@gwj/shared-types';
import { articleDataScript, readServerArticle } from '../serverData';

const ARTICLE: PublicArticle = {
  id: 'a'.repeat(24),
  slug: 'a-story',
  title: 'A story about </script><script>alert(1)</script>',
  category: 'World',
  language: 'en',
  author: 'Ana',
  body: 'Body.',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  publishedAt: '2026-06-23T00:00:00.000Z',
  createdAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:00:00.000Z',
};

function documentWith(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}

describe('server-embedded article data', () => {
  it('round-trips, and article text cannot close the script element', () => {
    const script = articleDataScript(ARTICLE);
    expect(script).not.toContain('</script><script>');
    const doc = documentWith(script);
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(readServerArticle(doc)).toEqual(ARTICLE);
  });

  it('ignores a page without data, or with malformed data', () => {
    expect(readServerArticle(documentWith('<p>no data</p>'))).toBeNull();
    expect(
      readServerArticle(
        documentWith('<script type="application/json" id="gwj-article">{not json</script>'),
      ),
    ).toBeNull();
  });
});
