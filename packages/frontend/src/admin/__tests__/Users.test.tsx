import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@gwj/shared-types';
import { AuthContext, type AuthState } from '../useAuth';

const getUsers = vi.fn<(...args: unknown[]) => Promise<User[]>>();
const createUser = vi.fn<(...args: unknown[]) => Promise<User>>();
const updateUser = vi.fn<(...args: unknown[]) => Promise<User>>();
const changePassword = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getUsers: (...args: unknown[]) => getUsers(...args),
    createUser: (...args: unknown[]) => createUser(...args),
    updateUser: (...args: unknown[]) => updateUser(...args),
    changePassword: (...args: unknown[]) => changePassword(...args),
  };
});

const { Users } = await import('../Users');
const { Account } = await import('../Account');

const person = (overrides: Partial<User>): User => ({
  id: 'u',
  username: 'u',
  role: 'editor',
  createdAt: '2026-10-10T10:00:00.000Z',
  disabledAt: null,
  ...overrides,
});

const authValue: AuthState = {
  token: 'jwt',
  user: { username: 'nate', role: 'admin' },
  isAuthenticated: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function renderWithAuth(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>{element}</AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of [getUsers, createUser, updateUser, changePassword]) mock.mockReset();
  getUsers.mockResolvedValue([
    person({ id: 'me', username: 'nate', role: 'admin' }),
    person({ id: 'ana', username: 'ana' }),
  ]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('People page', () => {
  it('adds an editor, changes a role and deactivates — but never edits your own account', async () => {
    createUser.mockResolvedValue(person({ id: 'new', username: 'new.person' }));
    updateUser.mockResolvedValue(person({ id: 'ana', username: 'ana' }));
    renderWithAuth(<Users />);
    await screen.findByText('ana');

    // Your own row has no controls.
    expect(screen.queryByLabelText('Role of nate')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new.person' } });
    fireEvent.change(screen.getByLabelText('Initial password'), {
      target: { value: 'twelve-chars-plus' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith('jwt', {
        username: 'new.person',
        password: 'twelve-chars-plus',
        role: 'editor',
      }),
    );

    fireEvent.change(screen.getByLabelText('Role of ana'), { target: { value: 'admin' } });
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('jwt', 'ana', { role: 'admin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('jwt', 'ana', { disabled: true }));
  });
});

describe('Account page', () => {
  it('refuses mismatched new passwords, then changes it', async () => {
    changePassword.mockResolvedValue(undefined);
    renderWithAuth(<Account />);
    const fill = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });

    fill('Current password', 'old-password');
    fill('New password (12+ characters)', 'a-new-password!');
    fill('New password, again', 'a-different-one!');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(changePassword).not.toHaveBeenCalled();

    fill('New password, again', 'a-new-password!');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith('jwt', {
        currentPassword: 'old-password',
        newPassword: 'a-new-password!',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.');
  });
});
