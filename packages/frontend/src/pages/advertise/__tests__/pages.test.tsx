import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import {
  AD_DAILY_RATE_CENTS,
  AD_TERMS_VERSION,
  AD_VARIANTS,
  type AdvertiserCampaign,
  type Language,
} from '@gwj/shared-types';
import { clearAdvertiserToken, setAdvertiserToken } from '../../../lib/advertiserSession';
import { ADVERTISE_COPY, fill } from '../copy';
import { TERMS_COPY } from '../termsCopy';
import { renderPage } from './testing';

const getAdvertiserCampaigns =
  vi.fn<(...args: unknown[]) => Promise<{ data: AdvertiserCampaign[] }>>();

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/api')>('../../../lib/api');
  return {
    ...actual,
    getAdvertiserCampaigns: (...args: unknown[]) => getAdvertiserCampaigns(...args),
  };
});

const { Dashboard } = await import('../Dashboard');
const { Success } = await import('../Success');
const { AdvertisingTerms } = await import('../AdvertisingTerms');
const { Advertise } = await import('../../static/Advertise');

const LANGUAGES: Language[] = ['en', 'es', 'fr'];
const CHECKOUT_URL = 'https://checkout.stripe.example/pay/cs_2';

function campaign(overrides: Partial<AdvertiserCampaign> = {}): AdvertiserCampaign {
  return {
    id: 'c1',
    variant: 'mrec',
    startDate: '2026-11-01',
    endDate: '2026-11-03',
    imageUrl: 'https://cdn.example.test/ads/a.png',
    clickUrl: 'https://acme.example/',
    adName: 'Acme spring sale',
    status: 'scheduled',
    amountCents: 12000,
    currency: 'usd',
    createdAt: '2026-10-13T10:00:00.000Z',
    holdExpiresAt: null,
    checkoutUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  getAdvertiserCampaigns.mockReset();
  setAdvertiserToken('adv-token');
});

afterEach(() => {
  clearAdvertiserToken();
});

describe('Dashboard', () => {
  it('shows each campaign with its status, dates and amount', async () => {
    getAdvertiserCampaigns.mockResolvedValue({
      data: [
        campaign({ id: 'a', status: 'live', adName: 'Live one' }),
        campaign({ id: 'b', status: 'removed', adName: 'Removed one' }),
        campaign({ id: 'c', status: 'expired', adName: 'Expired one', amountCents: null }),
      ],
    });
    renderPage(<Dashboard />);
    await screen.findByText('Live one');
    const badges = screen.getAllByTestId('campaign-status').map((node) => node.textContent);
    expect(badges).toEqual(['Live', 'Removed', 'Expired']);
    expect(screen.getAllByText(/November 1, 2026 – November 3, 2026/)).toHaveLength(3);
    expect(screen.getAllByText(/Amount: \$120/)).toHaveLength(2);
  });

  it('offers Pay now while a booking awaits payment', async () => {
    getAdvertiserCampaigns.mockResolvedValue({
      data: [
        campaign({
          status: 'awaiting_payment',
          checkoutUrl: CHECKOUT_URL,
          holdExpiresAt: '2026-10-13T12:00:00.000Z',
        }),
      ],
    });
    renderPage(<Dashboard />);
    expect(await screen.findByRole('link', { name: 'Pay now' })).toHaveAttribute(
      'href',
      CHECKOUT_URL,
    );
    expect(screen.getByText(/Held until/)).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in without calling the API', () => {
    clearAdvertiserToken();
    renderPage(<Dashboard />);
    expect(screen.getByText('Sign in to see your ads.')).toBeInTheDocument();
    expect(getAdvertiserCampaigns).not.toHaveBeenCalled();
  });
});

describe('Success', () => {
  it('keeps checking until the booking is confirmed', async () => {
    getAdvertiserCampaigns
      .mockResolvedValueOnce({ data: [campaign({ status: 'awaiting_payment' })] })
      .mockResolvedValue({ data: [campaign({ status: 'scheduled' })] });
    renderPage(<Success />, 'en', '/advertise/success?campaign=c1');
    expect(await screen.findByText(/Confirming your payment/)).toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByText(/scheduled and will go live by itself/)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    expect(getAdvertiserCampaigns.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AdvertisingTerms', () => {
  it.each(LANGUAGES)('renders the %s terms with their key clauses', (lang) => {
    renderPage(<AdvertisingTerms />, lang);
    const copy = TERMS_COPY[lang];
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(copy.sections.length);
    expect(screen.getByRole('heading', { level: 2, name: /^1\./ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'advertising@globalworldjournal.com' })).toBeVisible();
  });

  it('states the no-refund and removal-at-discretion clauses in English', () => {
    renderPage(<AdvertisingTerms />, 'en');
    expect(screen.getByText(/ALL PAYMENTS ARE FINAL AND NON-REFUNDABLE/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /at our sole discretion and at any time, to reject, remove, pause or replace/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/refund the amount you paid for the affected days in full/),
    ).toBeInTheDocument();
    expect(screen.getByText(/about 35 minutes/)).toBeInTheDocument();
  });

  it.each([
    ['es', /DEFINITIVOS Y NO REEMBOLSABLES/, /a nuestra entera discreción/],
    ['fr', /DÉFINITIFS ET NON REMBOURSABLES/, /à notre seule discrétion/],
  ] as const)('states the %s clauses', (lang, noRefund, discretion) => {
    renderPage(<AdvertisingTerms />, lang);
    expect(screen.getByText(noRefund)).toBeInTheDocument();
    expect(screen.getByText(discretion)).toBeInTheDocument();
  });

  it('shows the version from the shared constant', () => {
    renderPage(<AdvertisingTerms />, 'en');
    expect(AD_TERMS_VERSION).toBe('2026-10-13');
    expect(screen.getByText(/Version October 13, 2026/)).toBeInTheDocument();
  });
});

describe('Advertise page', () => {
  it('has a Place an ad button and prices every slot from the shared rates', () => {
    renderPage(<Advertise />);
    expect(screen.getByRole('link', { name: 'Place an ad' })).toHaveAttribute(
      'href',
      '/advertise/start',
    );
    for (const variant of AD_VARIANTS) {
      const dollars = AD_DAILY_RATE_CENTS[variant] / 100;
      expect(screen.getByText(`$${dollars}`)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Advertising Terms' })).toHaveAttribute(
      'href',
      '/advertising-terms',
    );
  });
});

describe('localized copy', () => {
  it('is complete in every language, with the same placeholders', () => {
    const english = ADVERTISE_COPY.en;
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    function walk(en: unknown, other: unknown, path: string) {
      if (typeof en === 'string') {
        expect(typeof other, path).toBe('string');
        expect(String(other).trim(), path).not.toBe('');
        expect(placeholders(String(other)), path).toEqual(placeholders(en));
        return;
      }
      expect(other, path).toBeTypeOf('object');
      for (const [key, value] of Object.entries(en as Record<string, unknown>)) {
        walk(value, (other as Record<string, unknown>)[key], `${path}.${key}`);
      }
    }
    for (const lang of LANGUAGES) walk(english, ADVERTISE_COPY[lang], lang);
    for (const lang of LANGUAGES) {
      expect(fill(ADVERTISE_COPY[lang].pay, { amount: '$40' })).toContain('$40');
    }
  });

  it('has the same terms structure in every language', () => {
    const english = TERMS_COPY.en;
    for (const lang of LANGUAGES) {
      const copy = TERMS_COPY[lang];
      expect(copy.sections.map((s) => s.paragraphs.length)).toEqual(
        english.sections.map((s) => s.paragraphs.length),
      );
      expect(copy.sections.map((s) => s.items?.length ?? 0)).toEqual(
        english.sections.map((s) => s.items?.length ?? 0),
      );
    }
  });
});
