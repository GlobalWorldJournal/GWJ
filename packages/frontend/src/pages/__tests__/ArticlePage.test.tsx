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

describe('ArticlePage reader extras', () => {
  beforeEach(() => {
    getArticle.mockReset();
    getArticles.mockReset();
    getArticles.mockResolvedValue(paginate([]));
  });

  it('shows reading time, the update time, corrections, topics and sharing', async () => {
    getArticle.mockResolvedValueOnce(
      makeArticle({
        body: Array.from({ length: 460 }, () => 'word').join(' '),
        publishedAt: '2026-06-23T12:00:00.000Z',
        updatedAt: '2026-06-24T09:30:00.000Z',
        tags: ['NATO', 'Ukraine'],
        corrections: [
          { at: '2026-06-24T09:30:00.000Z', text: 'An earlier version misstated the date.' },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('· 2 min read')).toBeInTheDocument();
    expect(screen.getByText(/^Updated June 24, 2026/)).toBeInTheDocument();
    expect(screen.getByText('An earlier version misstated the date.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ukraine' }).getAttribute('href')).toBe('/tag/Ukraine');
    const onX = screen.getByRole('link', { name: 'Share on X' });
    expect(onX.getAttribute('href')).toContain(encodeURIComponent('/article/lead-story'));
  });

  it('formats dates and the section in the edition language', async () => {
    getArticle.mockResolvedValueOnce(makeArticle({ language: 'es' }));
    renderPage('es');
    expect(await screen.findByText('· 23 de junio de 2026')).toBeInTheDocument();
    expect(screen.getByText('· Mundo')).toBeInTheDocument();
  });
});

describe('ArticlePage with the article embedded by the server', () => {
  it('renders at once from the seeded cache, without fetching the article again', () => {
    getArticle.mockReset();
    getArticles.mockReset();
    getArticles.mockResolvedValue(paginate([]));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    client.setQueryData(['article', 'lead-story'], makeArticle());
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/article/lead-story']}>
          <LanguageProvider lang="en">
            <Routes>
              <Route path="/article/:slug" element={<ArticlePage />} />
            </Routes>
          </LanguageProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Synchronously on the first render: no skeleton, no request.
    expect(screen.getByRole('heading', { level: 1, name: 'The Lead Story' })).toBeInTheDocument();
    expect(getArticle).not.toHaveBeenCalled();
  });
});
