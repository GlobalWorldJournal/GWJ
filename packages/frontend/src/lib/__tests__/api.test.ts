import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { PaginatedArticles } from '@gwj/shared-types';
import { getArticles, ApiContractError, ApiRequestError } from '../api';

const validPayload: PaginatedArticles = {
  data: [
    {
      id: 'a1',
      slug: 'a-valid-article',
      title: 'A Valid Article',
      deck: 'A deck.',
      kicker: 'World',
      category: 'World',
      language: 'en',
      author: 'Reporter',
      body: 'Body text.',
      status: 'published',
      featured: 0,
      tags: [],
      seo: {},
      publishedAt: '2026-06-23T12:00:00.000Z',
      createdAt: '2026-06-23T10:00:00.000Z',
      updatedAt: '2026-06-23T11:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  const response = {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  };
  return vi.fn().mockResolvedValue(response);
}

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parses a valid PaginatedArticles payload', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(validPayload));

    const result = await getArticles({ limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.slug).toBe('a-valid-article');
    expect(result.pagination.total).toBe(1);
  });

  it('throws ApiContractError on a malformed payload', async () => {
    const malformed = {
      data: [{ id: 'x', title: 123 }], // wrong shape
      pagination: { page: 'one' },
    };
    vi.stubGlobal('fetch', mockFetchOnce(malformed));

    await expect(getArticles()).rejects.toBeInstanceOf(ApiContractError);
  });

  it('throws ApiRequestError on a non-2xx response', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ error: 'Server exploded' }, { ok: false, status: 500 }));

    await expect(getArticles()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('forwards query params to the request URL', async () => {
    const fetchMock = mockFetchOnce(validPayload);
    vi.stubGlobal('fetch', fetchMock);

    await getArticles({ category: 'Tech', featured: true, page: 2, limit: 5 });

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('category=Tech');
    expect(calledUrl).toContain('featured=true');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=5');
  });
});
