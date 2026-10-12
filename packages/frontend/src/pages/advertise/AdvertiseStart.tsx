import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AD_DAILY_RATE_CENTS,
  AD_MAX_ADVANCE_DAYS,
  AD_MAX_DAYS,
  AD_MIN_DAYS,
  AD_VARIANTS,
  type AdVariant,
} from '@gwj/shared-types';
import {
  ApiRequestError,
  createAdBooking,
  getAdQuote,
  getAdAvailability,
  getAdvertiser,
} from '../../lib/api';
import { clearAdvertiserToken, useAdvertiserToken } from '../../lib/advertiserSession';
import { formatDay, formatMoney } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { AccountStep, TermsCheckbox } from './AccountStep';
import { Calendar } from './Calendar';
import { ADVERTISE_COPY, fill, type AdvertiseCopy } from './copy';
import { CreativeStep } from './CreativeStep';
import { bookingWindow, daysBetween, eachDay, toDay } from './dates';
import { SlotShape } from './SlotShape';
import { BUTTON_CLASS, BUTTON_QUIET_CLASS } from './ui';

const HTTP_STATUS_CONFLICT = 409;
const HTTP_STATUS_UNAUTHORIZED = 401;

function isHttpsUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value.trim())) return false;
  try {
    return new URL(value.trim()).hostname.includes('.');
  } catch {
    return false;
  }
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-ink pt-4" aria-label={title}>
      <h2 className="mb-4 flex items-baseline gap-3">
        <span className="label text-[0.75rem] font-bold text-accent">{number}</span>
        <span className="headline text-2xl text-ink">{title}</span>
      </h2>
      {children}
    </section>
  );
}

interface Range {
  start: string;
  end: string;
}

/** The booking wizard: account, slot and dates, creative, review and pay; one page with a live price. */
export function AdvertiseStart() {
  const { lang } = useLang();
  const copy = ADVERTISE_COPY[lang];
  const token = useAdvertiserToken();
  const queryClient = useQueryClient();

  const [today] = useState(() => toDay(new Date()));
  const window_ = bookingWindow(today);

  const [variant, setVariant] = useState<AdVariant | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [clickUrl, setClickUrl] = useState('');
  const [adName, setAdName] = useState('');
  const [accepted, setAccepted] = useState(false);

  const me = useQuery({
    queryKey: ['advertiser', 'me', token],
    queryFn: async ({ signal }) => {
      if (!token) throw new Error('Not signed in');
      try {
        return await getAdvertiser(token, signal);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === HTTP_STATUS_UNAUTHORIZED) {
          clearAdvertiserToken();
        }
        throw error;
      }
    },
    enabled: Boolean(token),
    retry: false,
  });

  const availability = useQuery({
    queryKey: ['ad-availability', variant, window_.first, window_.lastEnd],
    queryFn: ({ signal }) => {
      if (!variant) throw new Error('No slot chosen');
      return getAdAvailability(variant, window_.first, window_.lastEnd, signal);
    },
    enabled: variant !== null,
    retry: false,
  });
  const booked = new Set(availability.data?.bookedDays ?? []);

  const quote = useQuery({
    queryKey: ['ad-quote', variant, range?.start, range?.end],
    queryFn: ({ signal }) => {
      if (!variant || !range) throw new Error('Nothing to quote');
      return getAdQuote(variant, range.start, range.end, signal);
    },
    enabled: variant !== null && range !== null,
    retry: false,
  });

  const days = range ? daysBetween(range.start, range.end) : 0;
  const dailyRate = variant ? AD_DAILY_RATE_CENTS[variant] : 0;
  const totalCents = quote.data?.totalCents ?? days * dailyRate;

  function chooseVariant(next: AdVariant) {
    if (next === variant) return;
    setVariant(next);
    setRange(null);
    setNotice(null);
    // The image was checked against the previous slot's shape.
    setImageUrl(null);
  }

  /** First click starts a one-day booking; a later click on a following day extends it. */
  function pickDay(day: string) {
    setNotice(null);
    const extending = range !== null && range.start === range.end && day > range.start;
    if (!extending || !range) {
      setRange({ start: day, end: day });
      return;
    }
    const tooLong = daysBetween(range.start, day) > AD_MAX_DAYS;
    const blocked = eachDay(range.start, day).some((d) => booked.has(d));
    if (tooLong || blocked) {
      setNotice(copy.rangeBlocked);
      setRange({ start: day, end: day });
      return;
    }
    setRange({ start: range.start, end: day });
  }

  function isDayDisabled(day: string): boolean {
    const extending = range !== null && range.start === range.end && day > range.start;
    return !extending && day > window_.lastStart;
  }

  const clickUrlValid = isHttpsUrl(clickUrl);
  const creativeReady = imageUrl !== null && clickUrlValid && adName.trim() !== '';
  const ready = token !== null && variant !== null && range !== null && creativeReady && accepted;

  const book = useMutation({
    mutationFn: () => {
      if (!token || !variant || !range || !imageUrl) throw new Error('Incomplete booking');
      return createAdBooking(token, {
        variant,
        startDate: range.start,
        endDate: range.end,
        imageUrl,
        clickUrl: clickUrl.trim(),
        adName: adName.trim(),
        acceptTerms: true,
        language: lang,
      });
    },
    onSuccess: (response) => {
      window.location.assign(response.checkoutUrl);
    },
    onError: async (error) => {
      if (error instanceof ApiRequestError && error.status === HTTP_STATUS_CONFLICT) {
        setRange(null);
        setNotice(copy.bookingConflict);
        await queryClient.invalidateQueries({ queryKey: ['ad-availability'] });
      } else if (error instanceof ApiRequestError && error.status === HTTP_STATUS_UNAUTHORIZED) {
        clearAdvertiserToken();
      }
    },
  });

  const bookError = book.error;
  // A conflict is reported beside the calendar (the dates are cleared); anything else, here.
  const conflict =
    bookError instanceof ApiRequestError && bookError.status === HTTP_STATUS_CONFLICT;
  const bookMessage = bookError && !conflict ? copy.bookingFailed : null;

  const redirecting = book.isSuccess;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.wizardTitle}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          {copy.wizardIntro}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-10">
          <Step number={1} title={copy.stepAccount}>
            {token ? (
              <div className="flex flex-wrap items-center gap-4 font-body text-ink">
                <p>
                  {copy.signedInAs}{' '}
                  <strong>{me.data ? `${me.data.companyName} (${me.data.email})` : '…'}</strong>
                </p>
                <button type="button" onClick={clearAdvertiserToken} className={BUTTON_QUIET_CLASS}>
                  {copy.signOut}
                </button>
              </div>
            ) : (
              <AccountStep copy={copy} />
            )}
          </Step>

          {token ? (
            <Step number={2} title={copy.stepSlot}>
              <SlotAndDates
                copy={copy}
                variant={variant}
                onVariant={chooseVariant}
                range={range}
                notice={notice}
                booked={booked}
                loadingFailed={availability.isError}
                first={window_.first}
                last={window_.lastEnd}
                isDisabled={isDayDisabled}
                onPick={pickDay}
              />
            </Step>
          ) : null}

          {token && variant && range ? (
            <Step number={3} title={copy.stepCreative}>
              <CreativeStep
                copy={copy}
                token={token}
                variant={variant}
                imageUrl={imageUrl}
                onImage={setImageUrl}
                clickUrl={clickUrl}
                onClickUrl={setClickUrl}
                adName={adName}
                onAdName={setAdName}
                clickUrlValid={clickUrlValid}
              />
            </Step>
          ) : null}

          {token && variant && range && creativeReady ? (
            <Step number={4} title={copy.stepPay}>
              <div className="flex max-w-xl flex-col gap-4">
                <TermsCheckbox copy={copy} checked={accepted} onChange={setAccepted} />
                {accepted ? null : (
                  <p className="font-label text-[0.8rem] text-muted">{copy.mustAcceptTerms}</p>
                )}
                {bookMessage ? (
                  <p role="alert" className="font-label text-[0.9rem] text-accent">
                    {bookMessage}
                  </p>
                ) : null}
                <div>
                  <button
                    type="button"
                    disabled={!ready || book.isPending || redirecting}
                    onClick={() => book.mutate()}
                    className={BUTTON_CLASS}
                  >
                    {book.isPending || redirecting
                      ? copy.paying
                      : fill(copy.pay, { amount: formatMoney(totalCents, lang) })}
                  </button>
                </div>
                <p className="font-label text-[0.75rem] text-muted">{copy.finalNote}</p>
              </div>
            </Step>
          ) : null}
        </div>

        <aside
          className="self-start border border-ink p-4 lg:sticky lg:top-4"
          aria-label={copy.summaryTitle}
        >
          <h2 className="label mb-3 text-[0.75rem] font-bold text-ink">{copy.summaryTitle}</h2>
          <Summary
            copy={copy}
            variant={variant}
            range={range}
            days={days}
            dailyRate={dailyRate}
            totalCents={totalCents}
          />
        </aside>
      </div>
    </div>
  );
}

function SlotAndDates({
  copy,
  variant,
  onVariant,
  range,
  notice,
  booked,
  loadingFailed,
  first,
  last,
  isDisabled,
  onPick,
}: {
  copy: AdvertiseCopy;
  variant: AdVariant | null;
  onVariant: (variant: AdVariant) => void;
  range: Range | null;
  notice: string | null;
  booked: ReadonlySet<string>;
  loadingFailed: boolean;
  first: string;
  last: string;
  isDisabled: (day: string) => boolean;
  onPick: (day: string) => void;
}) {
  const { lang } = useLang();
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="label mb-2 text-[0.625rem] text-ink-soft">{copy.chooseSlot}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {AD_VARIANTS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={variant === option}
              onClick={() => onVariant(option)}
              className={`flex flex-col gap-2 border p-3 text-left ${
                variant === option
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-rule hover:border-ink'
              }`}
            >
              <span className="flex h-16 items-center">
                <SlotShape variant={option} />
              </span>
              <span className="headline text-lg text-ink">{copy.slots[option].name}</span>
              <span className="label text-[0.625rem] text-muted">{copy.slots[option].size}</span>
              <span className="font-label text-sm text-ink">
                {formatMoney(AD_DAILY_RATE_CENTS[option], lang)} {copy.perDay}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {variant ? (
        <div>
          <p className="label mb-1 text-[0.625rem] text-ink-soft">{copy.chooseDates}</p>
          <p className="mb-3 max-w-xl font-label text-[0.8rem] text-muted">
            {fill(copy.dateHint, {
              min: AD_MIN_DAYS,
              max: AD_MAX_DAYS,
              advance: AD_MAX_ADVANCE_DAYS,
            })}
          </p>
          {loadingFailed ? (
            <p role="alert" className="mb-2 font-label text-[0.85rem] text-accent">
              {copy.availabilityFailed}
            </p>
          ) : null}
          {notice ? (
            <p role="alert" className="mb-2 font-label text-[0.85rem] text-accent">
              {notice}
            </p>
          ) : null}
          <Calendar
            copy={copy}
            first={first}
            last={last}
            booked={booked}
            start={range?.start ?? null}
            end={range?.end ?? null}
            isDisabled={isDisabled}
            onPick={onPick}
          />
          <p className="mt-2 font-label text-[0.8rem] text-ink-soft">
            {range
              ? `${formatDay(range.start, lang)} – ${formatDay(range.end, lang)}`
              : copy.noDates}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Summary({
  copy,
  variant,
  range,
  days,
  dailyRate,
  totalCents,
}: {
  copy: AdvertiseCopy;
  variant: AdVariant | null;
  range: Range | null;
  days: number;
  dailyRate: number;
  totalCents: number;
}) {
  const { lang } = useLang();
  if (!variant) {
    return <p className="font-body text-sm text-muted">{copy.summaryEmpty}</p>;
  }
  return (
    <dl className="flex flex-col gap-2 font-label text-sm text-ink">
      <Row label={copy.summarySlot} value={copy.slots[variant].name} />
      <Row label={copy.summaryRate} value={formatMoney(dailyRate, lang)} />
      {range ? (
        <>
          <Row
            label={copy.summaryDates}
            value={`${formatDay(range.start, lang)} – ${formatDay(range.end, lang)}`}
          />
          <Row label={copy.summaryDays} value={String(days)} />
          <div className="mt-1 flex items-baseline justify-between border-t border-ink pt-2">
            <dt className="label text-[0.75rem] font-bold">{copy.summaryTotal}</dt>
            <dd className="headline text-2xl" data-testid="summary-total">
              {formatMoney(totalCents, lang)}
            </dd>
          </div>
        </>
      ) : (
        <p className="font-body text-sm text-muted">{copy.summaryEmpty}</p>
      )}
      <p className="mt-2 font-label text-[0.75rem] text-muted">{copy.holdNote}</p>
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="label text-[0.625rem] text-ink-soft">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
