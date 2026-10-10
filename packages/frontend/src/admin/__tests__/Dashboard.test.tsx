import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article, PaginatedArticles } from '@gwj/shared-types';
import { AuthContext, type AuthState } from '../useAuth';

const getAdminArticles = vi.fn<(...args: unknown[]) => Promise<PaginatedArticles>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, getAdminArticles: (...args: unknown[]) => getAdminArticles(...args) };
});

const { Dashboard } = await import('../Dashboard');

const article: Article = {
  id: 'a1',
  slug: 'story',
  title: 'A Story',
  category: 'World',
  language: 'es',
  author: 'Ana',
  body: 'Body',
  status: 'draft',
  featured: 0,
  tags: [],
  seo: {},
  publishedAt: null,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};

const authValue: AuthState = {
  token: 'jwt',
  user: { username: 'nate', role: 'admin' },
  isAuthenticated: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AuthContext.Provider value={authValue}>
          <Routes>
            <Route
              path="/admin"
              element={
                <>
                  <Dashboard />
                  <Location />
                </>
              }
            />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getAdminArticles.mockReset();
  getAdminArticles.mockResolvedValue({
    data: [article],
    pagination: { page: 2, limit: 25, total: 60, totalPages: 3 },
  });
});

describe('Dashboard filters', () => {
  it('reads its filters from the URL (ignoring unknown values) and pages through results', async () => {
    renderAt('/admin?status=draft&language=es&category=Nope&q=budget&page=2');
    await screen.findByText('A Story');
    expect(getAdminArticles).toHaveBeenCalledWith(
      'jwt',
      {
        status: 'draft',
        language: 'es',
        category: undefined,
        q: 'budget',
        page: 2,
        sort: 'latest',
        limit: 25,
      },
      expect.anything(),
    );
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Older →' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=3'));
  });

  it('changing a filter goes back to the first page', async () => {
    renderAt('/admin?page=2');
    await screen.findByText('A Story');
    fireEvent.change(screen.getByLabelText('Edition'), { target: { value: 'fr' } });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('?language=fr'));
  });

  it('an editor sees no delete action and no newsroom-management links', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin']}>
          <AuthContext.Provider value={{ ...authValue, user: { username: 'ana', role: 'editor' } }}>
            <Routes>
              <Route path="/admin" element={<Dashboard />} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('A Story');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Agent Tokens' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument();
  });
});
