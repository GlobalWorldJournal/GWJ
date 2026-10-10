import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PaginatedTakedownRequests, TakedownRequestRecord } from '@gwj/shared-types'
import { AuthContext, type AuthState } from '../useAuth'

const getAdminTakedownRequests = vi.fn<(...args: unknown[]) => Promise<PaginatedTakedownRequests>>()
const actionTakedownRequest = vi.fn<(...args: unknown[]) => Promise<TakedownRequestRecord>>()

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return {
    ...actual,
    getAdminTakedownRequests: (...args: unknown[]) => getAdminTakedownRequests(...args),
    actionTakedownRequest: (...args: unknown[]) => actionTakedownRequest(...args),
  }
})

const { Takedowns } = await import('../Takedowns')

function record(overrides: Partial<TakedownRequestRecord> = {}): TakedownRequestRecord {
  return {
    id: 'req-1',
    requesterName: 'Jamie Rights-Holder',
    requesterEmail: 'jamie@example.com',
    claimType: 'copyright',
    explanation: 'That is my photo.',
    goodFaithAssertion: true,
    status: 'pending',
    articleId: 'article-1',
    createdAt: '2026-06-23T10:00:00.000Z',
    updatedAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  }
}

function paginate(data: TakedownRequestRecord[]): PaginatedTakedownRequests {
  return { data, pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 } }
}

const authValue: AuthState = {
  token: 'test-token',
  user: { username: 'nate', role: 'admin' },
  isAuthenticated: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <Takedowns />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getAdminTakedownRequests.mockReset()
  actionTakedownRequest.mockReset()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'prompt').mockReturnValue('Confirmed rights holder.')
})

describe('Takedowns', () => {
  it('lists a pending request with its requester and matched article', async () => {
    getAdminTakedownRequests.mockResolvedValueOnce(paginate([record()]))
    renderPage()
    // The name renders in its own <span> (bold), the email as surrounding text —
    // two separate text nodes, so match the name alone rather than the full line.
    await waitFor(() => expect(screen.getByText('Jamie Rights-Holder')).toBeInTheDocument())
    expect(screen.getByText(/jamie@example\.com/)).toBeInTheDocument()
    expect(screen.getByText('View matched article')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unpublish article/i })).toBeEnabled()
  })

  it('disables the article actions when nothing resolved automatically', async () => {
    getAdminTakedownRequests.mockResolvedValueOnce(paginate([record({ articleId: null })]))
    renderPage()
    await waitFor(() => expect(screen.getByText(/no article matched automatically/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /unpublish article/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /remove image only/i })).toBeDisabled()
  })

  it('unpublishing confirms, then calls the action API with apply: "unpublish"', async () => {
    // mockResolvedValue (not Once): the action's success invalidates and
    // refetches this same list query, which needs an answer too.
    getAdminTakedownRequests.mockResolvedValue(paginate([record()]))
    actionTakedownRequest.mockResolvedValueOnce(record({ status: 'actioned' }))
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /unpublish article/i }))
    fireEvent.click(screen.getByRole('button', { name: /unpublish article/i }))
    await waitFor(() =>
      expect(actionTakedownRequest).toHaveBeenCalledWith('test-token', 'req-1', {
        status: 'actioned',
        apply: 'unpublish',
        resolution: 'Confirmed rights holder.',
      }),
    )
  })

  it('dismissing a request calls the action API with apply: "none"', async () => {
    getAdminTakedownRequests.mockResolvedValue(paginate([record()]))
    actionTakedownRequest.mockResolvedValueOnce(record({ status: 'dismissed' }))
    renderPage()
    // Exact match: the status FILTER button is labeled "Dismissed" (plural/past
    // tense), the row ACTION button "Dismiss" — a case-insensitive /dismiss/i
    // matches both and getByRole then (correctly) complains of ambiguity.
    await waitFor(() => screen.getByRole('button', { name: 'Dismiss' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(actionTakedownRequest).toHaveBeenCalledWith('test-token', 'req-1', {
        status: 'dismissed',
        apply: 'none',
        resolution: 'Confirmed rights holder.',
      }),
    )
  })

  it('filtering by status re-queries with that status', async () => {
    getAdminTakedownRequests.mockResolvedValue(paginate([]))
    renderPage()
    await waitFor(() => expect(getAdminTakedownRequests).toHaveBeenCalledWith('test-token', { status: 'pending', limit: 50 }, expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: 'Actioned' }))
    await waitFor(() => expect(getAdminTakedownRequests).toHaveBeenCalledWith('test-token', { status: 'actioned', limit: 50 }, expect.anything()))
  })
})
