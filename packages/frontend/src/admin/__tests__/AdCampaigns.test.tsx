import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdCampaign, PaginatedAdCampaigns } from '@gwj/shared-types';
import { AuthContext, type AuthState } from '../useAuth';

const getAdminAdCampaigns = vi.fn<(...args: unknown[]) => Promise<PaginatedAdCampaigns>>();
const updateAdCampaign = vi.fn<(...args: unknown[]) => Promise<AdCampaign>>();
const deleteAdCampaign = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getAdminAdCampaigns: (...args: unknown[]) => getAdminAdCampaigns(...args),
    updateAdCampaign: (...args: unknown[]) => updateAdCampaign(...args),
    deleteAdCampaign: (...args: unknown[]) => deleteAdCampaign(...args),
  };
});

const { AdCampaigns } = await import('../AdCampaigns');

const HOUR_MS = 60 * 60 * 1000;

function campaign(overrides: Partial<AdCampaign> = {}): AdCampaign {
  return {
    id: 'camp-1',
    advertiserName: 'Acme Coffee',
    advertiserEmail: 'ads@acme.example',
    imageUrl: 'https://cdn.example.test/articles/acme.webp',
    clickUrl: 'https://acme.example/',
    variant: 'mrec',
    startsAt: new Date(Date.now() - HOUR_MS).toISOString(),
    endsAt: new Date(Date.now() + HOUR_MS).toISOString(),
    status: 'active',
    createdAt: '2026-10-11T10:00:00.000Z',
    updatedAt: '2026-10-11T10:00:00.000Z',
    ...overrides,
  };
}

function paginate(data: AdCampaign[]): PaginatedAdCampaigns {
  return { data, pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 } };
}

const authValue: AuthState = {
  token: 'test-token',
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
          <AdCampaigns />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getAdminAdCampaigns.mockReset();
  updateAdCampaign.mockReset();
  deleteAdCampaign.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdCampaigns', () => {
  it('lists a campaign serving now as Live, with its advertiser and slot', async () => {
    getAdminAdCampaigns.mockResolvedValue(paginate([campaign()]));
    renderPage();
    await waitFor(() => expect(screen.getByText('Acme Coffee')).toBeInTheDocument());
    expect(screen.getByText(/ads@acme\.example/)).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getAllByText('Medium rectangle (300×250)').length).toBeGreaterThan(0);
  });

  it('pauses an active campaign', async () => {
    getAdminAdCampaigns.mockResolvedValue(paginate([campaign()]));
    updateAdCampaign.mockResolvedValue(campaign({ status: 'paused' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(updateAdCampaign).toHaveBeenCalledWith('test-token', 'camp-1', { status: 'paused' }),
    );
  });

  it('resumes a paused campaign and deletes after confirmation', async () => {
    getAdminAdCampaigns.mockResolvedValue(paginate([campaign({ status: 'paused' })]));
    updateAdCampaign.mockResolvedValue(campaign());
    deleteAdCampaign.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() =>
      expect(updateAdCampaign).toHaveBeenCalledWith('test-token', 'camp-1', { status: 'active' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteAdCampaign).toHaveBeenCalledWith('test-token', 'camp-1'));
  });
});

describe('AdCampaigns self-serve statuses', () => {
  it('labels pending and expired campaigns', async () => {
    getAdminAdCampaigns.mockResolvedValue(
      paginate([
        campaign({ id: 'p', status: 'pending', advertiserName: 'Pending Co' }),
        campaign({ id: 'e', status: 'expired', advertiserName: 'Expired Co' }),
      ]),
    );
    renderPage();
    expect(await screen.findByText('Pending Co')).toBeInTheDocument();
    expect(screen.getAllByText('Pending payment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
  });
});
