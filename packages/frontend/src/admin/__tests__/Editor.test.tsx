import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Article } from '@gwj/shared-types'
import { AuthContext, type AuthState } from '../useAuth'

const getAdminArticle = vi.fn<(...args: unknown[]) => Promise<Article>>()
const updateArticle = vi.fn<(...args: unknown[]) => Promise<Article>>()
const publishArticle = vi.fn<(...args: unknown[]) => Promise<Article>>()
const unpublishArticle = vi.fn<(...args: unknown[]) => Promise<Article>>()

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    getAdminArticle: (...args: unknown[]) => getAdminArticle(...args),
    updateArticle: (...args: unknown[]) => updateArticle(...args),
    publishArticle: (...args: unknown[]) => publishArticle(...args),
    unpublishArticle: (...args: unknown[]) => unpublishArticle(...args),
  }
})

const { Editor } = await import('../Editor')

const ARTICLE_ID = 'a'.repeat(24)

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: ARTICLE_ID,
    slug: 'original-headline',
    title: 'Original headline',
    category: 'World',
    language: 'en',
    author: 'Sofia Marchetti',
    body: 'The story.',
    status: 'published',
    featured: 3,
    tags: ['nato'],
    seo: { metaTitle: 'Agent title', metaDescription: 'Agent description' },
    source: { name: 'Wire', articleUrl: 'https://example.com/original' },
    publishedAt: '2026-06-23T10:00:00.000Z',
    firstPublishedAt: '2026-06-23T10:00:00.000Z',
    createdAt: '2026-06-23T09:00:00.000Z',
    updatedAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

const authValue: AuthState = {
  token: 'test-token',
  user: { username: 'nate', role: 'admin' },
  isAuthenticated: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/articles/${ARTICLE_ID}`]}>
        <AuthContext.Provider value={authValue}>
          <Routes>
            <Route path="/admin/articles/:id" element={<Editor />} />
            <Route path="/admin" element={<p>Dashboard</p>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getAdminArticle.mockReset()
  updateArticle.mockReset()
  publishArticle.mockReset()
  unpublishArticle.mockReset()
})

describe('Editor', () => {
  it('loads the article by id (not from a first-page listing)', async () => {
    getAdminArticle.mockResolvedValueOnce(article())
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Original headline')).toBeInTheDocument())
    expect(getAdminArticle).toHaveBeenCalledWith('test-token', ARTICLE_ID, expect.anything())
    expect(screen.getByText('https://example.com/original')).toBeInTheDocument()
  })

  it('updating a live story never sends a status and keeps its SEO fields', async () => {
    getAdminArticle.mockResolvedValueOnce(article())
    updateArticle.mockImplementation(async () => article({ title: 'Sharper headline' }))
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('Original headline')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('Original headline'), { target: { value: 'Sharper headline' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(updateArticle).toHaveBeenCalledTimes(1))
    const [, id, patch] = updateArticle.mock.calls[0] ?? []
    expect(id).toBe(ARTICLE_ID)
    expect(patch).not.toHaveProperty('status')
    expect(patch).toMatchObject({
      title: 'Sharper headline',
      seo: { metaTitle: 'Agent title', metaDescription: 'Agent description', ogImage: '' },
      slug: undefined,
    })
    expect(publishArticle).not.toHaveBeenCalled()
  })

  it('a draft offers Publish; a live story offers Unpublish', async () => {
    getAdminArticle.mockResolvedValueOnce(article({ status: 'draft', publishedAt: null, firstPublishedAt: null }))
    renderEditor()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument()
  })
})
