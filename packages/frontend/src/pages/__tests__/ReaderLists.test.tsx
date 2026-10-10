import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PaginatedPublicArticles, PublicArticle } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';

const getArticles =
  vi.fn<
    (query: Record<string, unknown>, signal?: AbortSignal) => Promise<PaginatedPublicArticles>
  >();
const searchArticles = vi.fn<(...args: unknown[]) => Promise<PaginatedPublicArticles>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getArticles: (query: Record<string, unknown>, signal?: AbortSignal) =>
      getArticles(query, signal),
    searchArticles: (...args: unknown[]) => searchArticles(...args),
  };
});

const { Category } = await import('../Category');
const { AuthorPage } = await import('../AuthorPage');
const { Search } = await import('../Search');

function story(n: number): PublicArticle {
  return {
    id: String(n).padStart(24, '0'),
    slug: `story-${n}`,
    title: `Story ${n}`,
    category: 'World',
    language: 'en',
    author: 'Eleanor Vance',
    body: 'Body.',
    status: 'published',
    featured: 0,
    tags: [],
    seo: {},
    publishedAt: '2026-06-23T00:00:00.000Z',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
  };
}

function page(numbers: number[], pageNo: number, totalPages: number): PaginatedPublicArticles {
  return {
    data: numbers.map(story),
    pagination: { page: pageNo, limit: 20, total: 0, totalPages },
  };
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider lang="en">
          <Routes>
            <Route path="/search" element={<Search />} />
            <Route path="/author/:slug" element={<AuthorPage />} />
            <Route path="/:category" element={<Category />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getArticles.mockReset();
  searchArticles.mockReset();
});

describe('reader lists', () => {
  it('a section shows every page: "Load more" appends the next one, then disappears', async () => {
    getArticles.mockImplementation(async (query) =>
      query.page === 1 ? page([1, 2], 1, 2) : page([3], 2, 2),
    );
    renderAt('/world');
    expect(await screen.findByText('Story 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Story 3')).toBeInTheDocument();
    expect(screen.getByText('Story 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull());
  });

  it('a writer page asks the API for that writer\\u2019s stories, newest first', async () => {
    getArticles.mockResolvedValue(page([1], 1, 1));
    renderAt('/author/eleanor-vance');
    expect(await screen.findByText('Story 1')).toBeInTheDocument();
    expect(getArticles.mock.calls[0]?.[0]).toMatchObject({
      author: 'Eleanor Vance',
      sort: 'latest',
    });
  });

  it('an unknown writer is reported, not an empty page', () => {
    renderAt('/author/nobody-here');
    expect(screen.getByText('Author not found.')).toBeInTheDocument();
  });

  it('search shows the URL\\u2019s query in the box and its results', async () => {
    searchArticles.mockResolvedValue(page([7], 1, 1));
    renderAt('/search?q=NATO');
    expect(screen.getByDisplayValue('NATO')).toBeInTheDocument();
    expect(await screen.findByText('Story 7')).toBeInTheDocument();
    expect(searchArticles.mock.calls[0]?.[0]).toBe('NATO');
  });
});
