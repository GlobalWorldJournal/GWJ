import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import type { PublicArticle } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';
import { SiteLayout } from '../SiteLayout';
import { ArticleCard } from '../ArticleCard';

const STORY: PublicArticle = {
  id: 'a'.repeat(24),
  slug: 'markets-rally',
  title: 'Markets rally on rate-cut hopes',
  deck: 'Stocks rose across the board.',
  kicker: 'Markets',
  category: 'Markets',
  language: 'en',
  author: 'Eleanor Vance',
  body: 'Body.',
  heroImage: { url: 'https://cdn.example.test/a.webp', alt: 'Traders on the floor' },
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  publishedAt: '2026-06-23T00:00:00.000Z',
  createdAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:00:00.000Z',
};

function Page() {
  return (
    <section>
      <h1>Markets</h1>
      <ArticleCard article={STORY} variant="feature" showImage />
      <ArticleCard article={{ ...STORY, id: 'b'.repeat(24) }} variant="list" showImage />
    </section>
  );
}

async function violations(path: string) {
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider lang="en">
          <Routes>
            <Route element={<SiteLayout />}>
              <Route path="*" element={<Page />} />
            </Route>
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // jsdom has no layout, so colour contrast cannot be computed here.
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help}`);
}

describe('reader shell accessibility (axe)', () => {
  it('has no serious or critical violations on a section page', async () => {
    expect(await violations('/markets')).toEqual([]);
  });

  it('has exactly one h1 per page and a skip link to the main content', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/markets']}>
          <LanguageProvider lang="en">
            <Routes>
              <Route element={<SiteLayout />}>
                <Route path="*" element={<Page />} />
              </Route>
            </Routes>
          </LanguageProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('a[href="#main"]')?.textContent).toBe('Skip to content');
    expect(container.querySelector('main#main')).not.toBeNull();
  });
});
