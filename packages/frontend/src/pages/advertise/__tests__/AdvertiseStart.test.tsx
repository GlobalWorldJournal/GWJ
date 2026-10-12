import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  AdAvailability,
  AdBookingResponse,
  AdQuote,
  Advertiser,
  AdvertiserAuthResponse,
} from '@gwj/shared-types';
import { AD_DAILY_RATE_CENTS } from '@gwj/shared-types';
import { clearAdvertiserToken, setAdvertiserToken } from '../../../lib/advertiserSession';
import { addDays, toDay } from '../dates';
import { renderPage } from './testing';

const getAdvertiser = vi.fn<(...args: unknown[]) => Promise<Advertiser>>();
const getAdAvailability = vi.fn<(...args: unknown[]) => Promise<AdAvailability>>();
const getAdQuote = vi.fn<(...args: unknown[]) => Promise<AdQuote>>();
const uploadAdvertiserCreative = vi.fn<(...args: unknown[]) => Promise<{ url: string }>>();
const createAdBooking = vi.fn<(...args: unknown[]) => Promise<AdBookingResponse>>();
const registerAdvertiser = vi.fn<(...args: unknown[]) => Promise<AdvertiserAuthResponse>>();

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/api')>('../../../lib/api');
  return {
    ...actual,
    getAdvertiser: (...args: unknown[]) => getAdvertiser(...args),
    getAdAvailability: (...args: unknown[]) => getAdAvailability(...args),
    getAdQuote: (...args: unknown[]) => getAdQuote(...args),
    uploadAdvertiserCreative: (...args: unknown[]) => uploadAdvertiserCreative(...args),
    createAdBooking: (...args: unknown[]) => createAdBooking(...args),
    registerAdvertiser: (...args: unknown[]) => registerAdvertiser(...args),
  };
});

vi.mock('../../../lib/creative', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/creative')>('../../../lib/creative');
  return { ...actual, measureImage: vi.fn(async () => ({ width: 300, height: 250 })) };
});

const { AdvertiseStart } = await import('../AdvertiseStart');
const { ApiRequestError } = await import('../../../lib/api');

const TODAY = toDay(new Date());
const ADVERTISER: Advertiser = {
  id: 'adv-1',
  email: 'ads@acme.example',
  companyName: 'Acme',
  createdAt: '2026-10-01T00:00:00.000Z',
};
const CHECKOUT_URL = 'https://checkout.stripe.example/pay/cs_1';

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const mock of [
    getAdvertiser,
    getAdAvailability,
    getAdQuote,
    uploadAdvertiserCreative,
    createAdBooking,
    registerAdvertiser,
  ]) {
    mock.mockReset();
  }
  getAdvertiser.mockResolvedValue(ADVERTISER);
  getAdAvailability.mockResolvedValue({ variant: 'mrec', bookedDays: [] });
  getAdQuote.mockImplementation(async (variant, startDate, endDate) => {
    const days =
      (Date.parse(`${String(endDate)}T00:00:00Z`) - Date.parse(`${String(startDate)}T00:00:00Z`)) /
        86_400_000 +
      1;
    const rate = AD_DAILY_RATE_CENTS.mrec;
    return {
      variant: variant as 'mrec',
      days,
      dailyRateCents: rate,
      totalCents: days * rate,
      currency: 'usd',
    };
  });
  uploadAdvertiserCreative.mockResolvedValue({ url: 'https://cdn.example.test/ads/a.png' });
  assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
  });
  setAdvertiserToken('adv-token');
});

afterEach(() => {
  clearAdvertiserToken();
});

async function showDay(day: string) {
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const found = document.querySelector(`[data-date="${day}"]`);
    if (found) return found as HTMLButtonElement;
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  }
  throw new Error(`day ${day} not found`);
}

async function pickRange(first: string, last: string) {
  fireEvent.click(screen.getByRole('button', { name: /Medium rectangle/ }));
  fireEvent.click(await showDay(first));
  if (last !== first) fireEvent.click(await showDay(last));
}

async function fillCreative() {
  const file = new File(['x'], 'ad.png', { type: 'image/png' });
  fireEvent.change(await screen.findByTestId('creative-file'), { target: { files: [file] } });
  await waitFor(() => expect(uploadAdvertiserCreative).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText('Replace image')).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('https://'), {
    target: { value: 'https://acme.example/landing' },
  });
  fireEvent.change(screen.getByLabelText(/Ad name/), { target: { value: 'Acme spring sale' } });
}

describe('AdvertiseStart', () => {
  it('walks through every step and redirects to Stripe Checkout', async () => {
    const start = addDays(TODAY, 1);
    const end = addDays(TODAY, 3);
    createAdBooking.mockResolvedValue({
      campaignId: 'c1',
      checkoutUrl: CHECKOUT_URL,
      holdExpiresAt: '2026-10-13T12:00:00.000Z',
      totalCents: 3 * AD_DAILY_RATE_CENTS.mrec,
    });
    renderPage(<AdvertiseStart />);

    expect(await screen.findByText(/Acme \(ads@acme.example\)/)).toBeInTheDocument();
    await pickRange(start, end);
    await waitFor(() => expect(screen.getByTestId('summary-total')).toHaveTextContent('$120'));
    expect(getAdQuote).toHaveBeenCalledWith('mrec', start, end, expect.anything());

    await fillCreative();
    const pay = await screen.findByRole('button', { name: 'Pay $120' });
    expect(pay).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(pay).toBeEnabled();
    fireEvent.click(pay);

    await waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(createAdBooking).toHaveBeenCalledWith('adv-token', {
      variant: 'mrec',
      startDate: start,
      endDate: end,
      imageUrl: 'https://cdn.example.test/ads/a.png',
      clickUrl: 'https://acme.example/landing',
      adName: 'Acme spring sale',
      acceptTerms: true,
      language: 'en',
    });
  });

  it('greys out booked days and refuses a range that crosses one', async () => {
    const booked = addDays(TODAY, 2);
    getAdAvailability.mockResolvedValue({ variant: 'mrec', bookedDays: [booked] });
    renderPage(<AdvertiseStart />);
    fireEvent.click(await screen.findByRole('button', { name: /Medium rectangle/ }));
    await waitFor(() => expect(getAdAvailability).toHaveBeenCalled());

    await waitFor(async () => expect(await showDay(booked)).toBeDisabled());
    fireEvent.click(await showDay(addDays(TODAY, 1)));
    fireEvent.click(await showDay(addDays(TODAY, 3)));
    expect(await screen.findByRole('alert')).toHaveTextContent(/booked day or is too long/);
    expect(screen.getByTestId('summary-total')).toHaveTextContent('$40');
  });

  it('shows a clear message and refreshes availability on a 409', async () => {
    createAdBooking.mockRejectedValue(new ApiRequestError(409, 'Those days were just taken'));
    renderPage(<AdvertiseStart />);
    await pickRange(addDays(TODAY, 1), addDays(TODAY, 1));
    await fillCreative();
    fireEvent.click(await screen.findByRole('checkbox'));
    const callsBefore = getAdAvailability.mock.calls.length;
    fireEvent.click(await screen.findByRole('button', { name: /^Pay/ }));

    expect(await screen.findByText(/Someone just booked some of those days/)).toBeInTheDocument();
    await waitFor(() => expect(getAdAvailability.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(assign).not.toHaveBeenCalled();
  });

  it('rejects an image of the wrong shape before uploading it', async () => {
    const creative = await import('../../../lib/creative');
    vi.mocked(creative.measureImage).mockResolvedValueOnce({ width: 1000, height: 200 });
    renderPage(<AdvertiseStart />);
    await pickRange(addDays(TODAY, 1), addDays(TODAY, 1));
    const file = new File(['x'], 'wide.png', { type: 'image/png' });
    fireEvent.change(await screen.findByTestId('creative-file'), { target: { files: [file] } });
    expect(await screen.findByText(/wrong shape for this slot/)).toBeInTheDocument();
    expect(uploadAdvertiserCreative).not.toHaveBeenCalled();
  });

  it('requires the terms before an account can be created', async () => {
    clearAdvertiserToken();
    registerAdvertiser.mockResolvedValue({ token: 'new-token', advertiser: ADVERTISER });
    renderPage(<AdvertiseStart />);

    fireEvent.change(await screen.findByLabelText('Company or brand name'), {
      target: { value: 'Acme' },
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ads@acme.example' } });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'correct horse battery' },
    });
    const submit = screen.getByRole('button', { name: 'Create account' });
    expect(submit).toBeDisabled();

    const terms = screen.getByRole('checkbox');
    expect(within(terms.closest('label') as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      '/advertising-terms',
    );
    fireEvent.click(terms);
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(registerAdvertiser).toHaveBeenCalledWith({
        email: 'ads@acme.example',
        password: 'correct horse battery',
        companyName: 'Acme',
        acceptTerms: true,
      }),
    );
    expect(await screen.findByText('Choose a slot')).toBeInTheDocument();
  });
});
