import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article, PaginatedArticles } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';

const getArticles = vi.fn<() => Promise<PaginatedArticles>>();
const getPopularArticles = vi.fn<() => Promise<{ data: Article[] }>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getArticles: () => getArticles(),
    getPopularArticles: () => getPopularArticles(),
  };
});

const { PageWithRail, RailLayout } = await import('../PageWithRail');

const story: Article = {
  id: 'read',
  slug: 'most-read',
  title: 'Most Read Story',
  category: 'World',
  language: 'en',
  author: 'Jane Reporter',
  body: 'Body.',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  publishedAt: '2026-06-23T12:00:00.000Z',
  createdAt: '2026-06-23T10:00:00.000Z',
  updatedAt: '2026-06-23T11:00:00.000Z',
};

function renderAt(path: string, tree: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider lang="en">{tree}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PageWithRail', () => {
  it('puts the page in the main column and the shared rail beside it', async () => {
    getArticles.mockResolvedValue({
      data: [story],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    getPopularArticles.mockResolvedValue({ data: [story] });
    renderAt(
      '/privacy',
      <Routes>
        <Route element={<RailLayout />}>
          <Route path="/privacy" element={<h1>Privacy Notice</h1>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByRole('heading', { name: 'Privacy Notice' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Most Popular' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Most Read Story/ }).getAttribute('href')).toBe(
      '/article/most-read',
    );
  });

  it('leaves the story it is wrapped around out of the ranking and renders the bottom band', async () => {
    getArticles.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    getPopularArticles.mockResolvedValue({ data: [story] });
    renderAt(
      '/',
      <PageWithRail exclude="read" bottom={<p>Bottom band</p>}>
        <p>Main column</p>
      </PageWithRail>,
    );

    expect(screen.getByText('Main column')).toBeInTheDocument();
    expect(screen.getByText('Bottom band')).toBeInTheDocument();
    await vi.waitFor(() => expect(getPopularArticles).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Most Read Story/ })).toBeNull();
  });
});
