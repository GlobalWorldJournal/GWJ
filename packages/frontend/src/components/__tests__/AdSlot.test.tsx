import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActiveAdResponse, AdVariant } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';

const getActiveAdCampaign = vi.fn<(...args: unknown[]) => Promise<ActiveAdResponse>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getActiveAdCampaign: (...args: unknown[]) => getActiveAdCampaign(...args),
  };
});

const { AdSlot } = await import('../AdSlot');

function renderSlot(variant: AdVariant) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider lang="en">
        <AdSlot variant={variant} />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getActiveAdCampaign.mockReset();
  window.adsbygoogle = [];
});

describe('AdSlot', () => {
  it('renders an active direct campaign instead of AdSense, labelled as an advertisement', async () => {
    getActiveAdCampaign.mockResolvedValue({
      campaign: {
        id: 'c1',
        advertiserName: 'Acme Coffee',
        imageUrl: 'https://cdn.example.test/articles/acme.webp',
        clickUrl: 'https://acme.example/',
        variant: 'leaderboard',
      },
    });
    const { container } = renderSlot('leaderboard');

    const link = await screen.findByRole('link', { name: 'Acme Coffee' });
    expect(link).toHaveAttribute('href', 'https://acme.example/');
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
    expect(screen.getByRole('img', { name: 'Acme Coffee' })).toHaveAttribute(
      'src',
      'https://cdn.example.test/articles/acme.webp',
    );
    expect(screen.getByText('Advertisement')).toBeInTheDocument();
    expect(container.querySelector('ins.adsbygoogle')).toBeNull();
    expect(window.adsbygoogle).toEqual([]);
    expect(getActiveAdCampaign.mock.calls[0]?.[0]).toBe('leaderboard');
  });

  it('falls back to the AdSense unit when no campaign is booked', async () => {
    getActiveAdCampaign.mockResolvedValue({ campaign: null });
    const { container } = renderSlot('mrec');

    await waitFor(() => expect(container.querySelector('ins.adsbygoogle')).not.toBeNull());
    const ins = container.querySelector('ins.adsbygoogle');
    expect(ins).toHaveAttribute('data-ad-slot', '9970398867');
    expect(ins).toHaveAttribute('data-ad-format', 'rectangle');
    expect(window.adsbygoogle).toHaveLength(1);
    expect(screen.getByText('Advertisement')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('contains an AdSense push that throws instead of unmounting the page', async () => {
    getActiveAdCampaign.mockResolvedValue({ campaign: null });
    const tagError = new Error('adsbygoogle.push() error: All ins elements already have ads');
    // jsdom has no reportError (every browser Vite 6 targets does): install a spy.
    const reportError = vi.fn<(error: unknown) => void>();
    window.reportError = reportError;
    // Once adsbygoogle.js has loaded, the queue's push is AdSense's own, which throws.
    const loaded: unknown[] = [];
    loaded.push = () => {
      throw tagError;
    };
    window.adsbygoogle = loaded;
    const { container } = renderSlot('leaderboard');

    await waitFor(() => expect(container.querySelector('ins.adsbygoogle')).not.toBeNull());
    expect(reportError).toHaveBeenCalledWith(tagError);
    expect(screen.getByText('Advertisement')).toBeInTheDocument();
    Reflect.deleteProperty(window, 'reportError');
  });

  it('falls back to the AdSense unit when the lookup fails', async () => {
    getActiveAdCampaign.mockRejectedValue(new Error('network down'));
    const { container } = renderSlot('inline');

    await waitFor(() => expect(container.querySelector('ins.adsbygoogle')).not.toBeNull());
    expect(container.querySelector('ins.adsbygoogle')).toHaveAttribute(
      'data-ad-slot',
      '4865326127',
    );
  });
});
