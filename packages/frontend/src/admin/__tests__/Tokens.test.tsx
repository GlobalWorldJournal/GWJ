import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiToken, CreatedApiToken } from '@gwj/shared-types';
import { AuthContext, type AuthState } from '../useAuth';

const getApiTokens = vi.fn<(...args: unknown[]) => Promise<ApiToken[]>>();
const createApiToken = vi.fn<(...args: unknown[]) => Promise<CreatedApiToken>>();
const revokeApiToken = vi.fn<(...args: unknown[]) => Promise<ApiToken>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getApiTokens: (...args: unknown[]) => getApiTokens(...args),
    createApiToken: (...args: unknown[]) => createApiToken(...args),
    revokeApiToken: (...args: unknown[]) => revokeApiToken(...args),
  };
});

const { Tokens } = await import('../Tokens');

const listed: ApiToken = {
  id: 't1',
  name: 'mcp-server',
  scopes: ['articles:write', 'articles:publish', 'media:upload'],
  createdAt: '2026-10-10T10:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
};

const authValue: AuthState = {
  token: 'jwt',
  user: { username: 'nate', role: 'admin' },
  isAuthenticated: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <Tokens />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getApiTokens.mockReset();
  createApiToken.mockReset();
  revokeApiToken.mockReset();
  getApiTokens.mockResolvedValue([listed]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Agent tokens page', () => {
  it('creates a token with the chosen scopes and shows its secret once', async () => {
    createApiToken.mockResolvedValue({
      ...listed,
      id: 't2',
      name: 'newsroom',
      token: 'gwj_secret',
    });
    renderPage();
    await screen.findByText('mcp-server');

    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'newsroom' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /media:upload/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));

    await waitFor(() =>
      expect(createApiToken).toHaveBeenCalledWith('jwt', {
        name: 'newsroom',
        scopes: ['articles:write', 'articles:publish'],
      }),
    );
    const notice = await screen.findByRole('status');
    expect(within(notice).getByText('gwj_secret')).toBeInTheDocument();
    fireEvent.click(within(notice).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('gwj_secret')).not.toBeInTheDocument();
  });

  it('refuses an invalid name without calling the API', async () => {
    renderPage();
    await screen.findByText('mcp-server');
    fireEvent.change(screen.getByLabelText('Agent name'), { target: { value: 'Bad Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('lowercase letters');
    expect(createApiToken).not.toHaveBeenCalled();
  });

  it('revokes a token after confirmation', async () => {
    revokeApiToken.mockResolvedValue({ ...listed, revokedAt: '2026-10-10T12:00:00.000Z' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revokeApiToken).toHaveBeenCalledWith('jwt', 't1'));
  });
});
