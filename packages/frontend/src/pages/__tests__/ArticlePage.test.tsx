import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article, PaginatedArticles } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';

const getArticle = vi.fn<(slug: string, signal?: AbortSignal) => Promise<Article>>();
const getArticles =
  vi.fn<(query?: Record<string, unknown>, signal?: AbortSignal) => Promise<PaginatedArticles>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getArticle: (slug: string, signal?: AbortSignal) => getArticle(slug, signal),
    getArticles: (query?: Record<string, unknown>, signal?: AbortSignal) =>
      getArticles(query, signal),
  };
});

// Imported AFTER the mock so the page picks up the mocked api module.
const { ArticlePage } = await import('../ArticlePage');

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'main',
    slug: 'lead-story',
    title: 'The Lead Story',
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

function paginate(data: Article[]): PaginatedArticles {
  return { data, pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 } };
}

function renderPage(lang: 'en' | 'es' = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/article/lead-story']}>
        <LanguageProvider lang={lang}>
          <Routes>
            <Route path="/article/:slug" element={<ArticlePage />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ArticlePage', () => {
  beforeEach(() => {
    getArticle.mockReset();
    getArticles.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the article, an edition-aware rail and related sections', async () => {
    const main = makeArticle();
    const others = [
      makeArticle({ id: 'w2', slug: 'world-two', title: 'World Two', author: 'Jane Reporter' }),
      makeArticle({ id: 'w3', slug: 'world-three', title: 'World Three', author: 'Other Writer' }),
    ];
    getArticle.mockResolvedValue(main);
    getArticles.mockResolvedValue(paginate([main, ...others]));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'The Lead Story' })).toBeInTheDocument();

    // Most Popular fills the rail and excludes the current article.
    expect(await screen.findByRole('heading', { name: 'Most Popular' })).toBeInTheDocument();
    // "More in World" related band renders cross-links.
    expect(await screen.findByRole('heading', { name: 'More in World' })).toBeInTheDocument();
    // "World Two" appears as a cross-link (related grid and author list).
    expect((await screen.findAllByRole('heading', { name: 'World Two' })).length).toBeGreaterThan(
      0,
    );
    // "More from Jane Reporter" lists the author's other story.
    expect(
      await screen.findByRole('heading', { name: 'More from Jane Reporter' }),
    ).toBeInTheDocument();
  });

  it('passes the active edition language when fetching rail/related articles', async () => {
    const main = makeArticle({ language: 'es', category: 'Markets' });
    getArticle.mockResolvedValue(main);
    getArticles.mockResolvedValue(paginate([main]));

    renderPage('es');

    await screen.findByRole('heading', { name: 'The Lead Story' });

    await waitFor(() => {
      expect(getArticles).toHaveBeenCalled();
    });
    for (const call of getArticles.mock.calls) {
      expect(call[0]).toMatchObject({ language: 'es' });
    }
  });

  it('still renders the article when the rail/related data is empty', async () => {
    const main = makeArticle();
    getArticle.mockResolvedValue(main);
    getArticles.mockResolvedValue(paginate([main]));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'The Lead Story' })).toBeInTheDocument();
    // No other stories → no related band, no Most Popular, but no crash.
    expect(screen.queryByRole('heading', { name: 'More in World' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Most Popular' })).not.toBeInTheDocument();
  });
});
