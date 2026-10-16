import { and, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import {
  AD_CURRENCY,
  AD_DAILY_RATE_CENTS,
  AD_HOLD_MINUTES,
  AD_MAX_ADVANCE_DAYS,
  AD_MAX_DAYS,
  AD_MIN_DAYS,
  AD_TERMS_VERSION,
  type AdAvailability,
  type AdAvailabilityQuery,
  type AdBookingInput,
  type AdBookingResponse,
  type AdQuote,
  type AdQuoteQuery,
  type AdVariant,
  type AdvertiserCampaign,
} from '@gwj/shared-types';
import { getDb } from '../db/client';
import { enqueueReferenceSync } from '../media/referenceJobs';
import { newRecordId } from '../db/ids';
import { adCampaigns, type AdCampaignRow } from '../db/schema/adCampaigns';
import type { AdvertiserRow } from '../db/schema/advertisers';
import {
  BadGatewayError,
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
} from '../errors';
import { errorFields, logger } from '../logger';
import type { PaymentEvent, StripeGateway } from './stripeGateway';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** Stripe refuses a Checkout session that lives under 30 minutes; the margin absorbs latency. */
const CHECKOUT_SESSION_MINUTES = 30;
const CHECKOUT_SESSION_MARGIN_SECONDS = 60;
/** The availability calendar never needs more than a booking window plus a month. */
const MAX_AVAILABILITY_DAYS = AD_MAX_ADVANCE_DAYS + AD_MAX_DAYS + 31;
const PAYMENTS_NOT_CONFIGURED = 'Payments are not configured';
const DATES_TAKEN = 'Those dates were just taken';
const DAY_LENGTH = 10;

/** Statuses that keep a slot taken regardless of time (paused is a reversible hold). */
const HOLDING_STATUSES = ['active', 'paused'] as const;

export interface AdBookingOptions {
  /** Null while Stripe is not configured: bookings answer 503. */
  gateway: StripeGateway | null;
  /** The public reader site origin, for Checkout's return URLs. */
  siteUrl: string;
  /**
   * Whether a creative URL is an image GWJ stored (an upload through our
   * uploader): a booking may not point the slot at anyone else's image.
   */
  isOwnCreative: (url: string) => Promise<boolean>;
  clock?: () => Date;
}

export interface AdBookingService {
  quote(query: AdQuoteQuery): AdQuote;
  availability(query: AdAvailabilityQuery): Promise<AdAvailability>;
  reserve(advertiser: AdvertiserRow, input: AdBookingInput): Promise<AdBookingResponse>;
  advertiserCampaigns(advertiser: AdvertiserRow): Promise<AdvertiserCampaign[]>;
  /** Verify and apply a Stripe webhook; throws WebhookSignatureError on a bad signature. */
  handleWebhook(rawBody: Buffer, signature: string): Promise<void>;
}

/** Parse a strict YYYY-MM-DD (a real calendar day) as 00:00:00Z. */
function parseDay(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, DAY_LENGTH) !== value)
    throw new BadRequestError(`${field} is not a valid date`);
  return date;
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, DAY_LENGTH);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

interface Window {
  start: Date;
  /** Exclusive: 00:00Z of the day after the last booked day. */
  endExclusive: Date;
  days: number;
}

function validateWindow(startDate: string, endDate: string, now: Date): Window {
  const start = parseDay(startDate, 'startDate');
  const end = parseDay(endDate, 'endDate');
  const today = startOfUtcDay(now);
  if (start < today) throw new BadRequestError('startDate cannot be in the past');
  if (end < start) throw new BadRequestError('endDate cannot be before startDate');
  if (start.getTime() > today.getTime() + AD_MAX_ADVANCE_DAYS * DAY_MS)
    throw new BadRequestError(`Bookings open at most ${AD_MAX_ADVANCE_DAYS} days ahead`);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days < AD_MIN_DAYS || days > AD_MAX_DAYS)
    throw new BadRequestError(`A booking runs ${AD_MIN_DAYS} to ${AD_MAX_DAYS} days`);
  return { start, endExclusive: new Date(end.getTime() + DAY_MS), days };
}

function quoteFor(variant: AdVariant, days: number): AdQuote {
  const dailyRateCents = AD_DAILY_RATE_CENTS[variant];
  return {
    variant,
    days,
    dailyRateCents,
    totalCents: dailyRateCents * days,
    currency: AD_CURRENCY,
  };
}

/** A row that keeps its slot taken at `now`: running/paused, or pending with a live hold. */
function takesSlot(now: Date) {
  return or(
    inArray(adCampaigns.status, HOLDING_STATUSES),
    and(eq(adCampaigns.status, 'pending'), gt(adCampaigns.holdExpiresAt, now)),
  );
}

function overlapping(variant: AdVariant, start: Date, endExclusive: Date, now: Date) {
  return and(
    eq(adCampaigns.variant, variant),
    lt(adCampaigns.startsAt, endExclusive),
    gt(adCampaigns.endsAt, start),
    takesSlot(now),
  );
}

function languagePrefix(language: AdBookingInput['language']): string {
  return language === 'en' ? '' : `/${language}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function toAdvertiserCampaign(row: AdCampaignRow, now: Date): AdvertiserCampaign {
  const holdValid = row.holdExpiresAt !== null && row.holdExpiresAt > now;
  let status: AdvertiserCampaign['status'];
  if (row.status === 'expired') status = 'expired';
  else if (row.status === 'cancelled') status = 'removed';
  else if (row.status === 'pending') status = holdValid ? 'awaiting_payment' : 'expired';
  else if (now < row.startsAt) status = 'scheduled';
  else if (now < row.endsAt) status = 'live';
  else status = 'ended';
  const awaiting = status === 'awaiting_payment';
  return {
    id: row.id,
    variant: row.variant,
    startDate: dayString(row.startsAt),
    endDate: dayString(new Date(row.endsAt.getTime() - DAY_MS)),
    imageUrl: row.imageUrl,
    clickUrl: row.clickUrl,
    adName: row.adName ?? row.advertiserName,
    status,
    amountCents: row.amountCents,
    currency: AD_CURRENCY,
    createdAt: row.createdAt.toISOString(),
    holdExpiresAt: awaiting && row.holdExpiresAt ? row.holdExpiresAt.toISOString() : null,
    checkoutUrl: awaiting ? row.checkoutUrl : null,
  };
}

export function createAdBookingService(options: AdBookingOptions): AdBookingService {
  const clock = options.clock ?? (() => new Date());

  function requireGateway(): StripeGateway {
    if (!options.gateway) throw new ServiceUnavailableError(PAYMENTS_NOT_CONFIGURED);
    return options.gateway;
  }

  async function markExpired(id: string): Promise<void> {
    await getDb()
      .update(adCampaigns)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.status, 'pending')));
  }

  async function onCompleted(
    event: Extract<PaymentEvent, { type: 'checkout.session.completed' }>,
  ): Promise<void> {
    if (!event.paid) return;
    const db = getDb();
    const now = clock();
    // The one transition that publishes the ad. Conditional on `pending`, so a
    // replayed event matches nothing and changes nothing.
    const activated = await db
      .update(adCampaigns)
      .set({ status: 'active', paidAt: now, updatedAt: now })
      .where(
        and(eq(adCampaigns.stripeSessionId, event.sessionId), eq(adCampaigns.status, 'pending')),
      )
      .returning({ id: adCampaigns.id });
    if (activated.length > 0) return;

    // Paid, but the booking is no longer pending (hold swept, or removed by an
    // admin meanwhile): refund in full. Claiming `paid_at` first makes this happen
    // once however often Stripe retries; a failed refund releases the claim so the
    // retry tries again.
    const claimed = await db
      .update(adCampaigns)
      .set({ paidAt: now, updatedAt: now })
      .where(
        and(
          eq(adCampaigns.stripeSessionId, event.sessionId),
          inArray(adCampaigns.status, ['expired', 'cancelled', 'paused']),
          sql`${adCampaigns.paidAt} is null`,
        ),
      )
      .returning({ id: adCampaigns.id });
    const claimedRow = claimed[0];
    if (!claimedRow) return;
    if (!event.paymentIntentId) {
      logger.error('paid checkout session has no payment intent to refund', {
        campaignId: claimedRow.id,
      });
      return;
    }
    try {
      await requireGateway().refundPaymentIntent(
        event.paymentIntentId,
        `ad-refund-${event.sessionId}`,
      );
      logger.warn('refunded a payment for a booking that was no longer pending', {
        campaignId: claimedRow.id,
      });
    } catch (err) {
      await db.update(adCampaigns).set({ paidAt: null }).where(eq(adCampaigns.id, claimedRow.id));
      throw err;
    }
  }

  return {
    quote(query) {
      const window = validateWindow(query.startDate, query.endDate, clock());
      return quoteFor(query.variant, window.days);
    },

    async availability(query) {
      const from = parseDay(query.from, 'from');
      const to = parseDay(query.to, 'to');
      if (to < from) throw new BadRequestError('to cannot be before from');
      const spanDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
      if (spanDays > MAX_AVAILABILITY_DAYS)
        throw new BadRequestError(`Ask for at most ${MAX_AVAILABILITY_DAYS} days at a time`);
      const rangeEnd = new Date(to.getTime() + DAY_MS);
      const rows = await getDb()
        .select({ startsAt: adCampaigns.startsAt, endsAt: adCampaigns.endsAt })
        .from(adCampaigns)
        .where(overlapping(query.variant, from, rangeEnd, clock()));
      const bookedDays: string[] = [];
      for (let day = from.getTime(); day < rangeEnd.getTime(); day += DAY_MS) {
        const dayEnd = day + DAY_MS;
        if (rows.some((r) => r.startsAt.getTime() < dayEnd && r.endsAt.getTime() > day))
          bookedDays.push(dayString(new Date(day)));
      }
      return { variant: query.variant, bookedDays };
    },

    async reserve(advertiser, input) {
      const gateway = requireGateway();
      const now = clock();
      const window = validateWindow(input.startDate, input.endDate, now);
      if (!isHttpUrl(input.clickUrl)) throw new BadRequestError('clickUrl must be an http(s) URL');
      if (!(await options.isOwnCreative(input.imageUrl)))
        throw new BadRequestError('imageUrl must be a creative uploaded through our uploader');
      const quote = quoteFor(input.variant, window.days);
      const holdExpiresAt = new Date(now.getTime() + AD_HOLD_MINUTES * MINUTE_MS);

      const held = await getDb().transaction(async (tx) => {
        // One booking at a time per slot: the lock is released at commit, and the
        // overlap re-check below then sees everything a previous holder committed.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`ad-slot:${input.variant}`}))`,
        );
        await tx
          .update(adCampaigns)
          .set({ status: 'expired', updatedAt: now })
          .where(
            and(
              eq(adCampaigns.variant, input.variant),
              eq(adCampaigns.status, 'pending'),
              lt(adCampaigns.holdExpiresAt, now),
            ),
          );
        const clash = await tx
          .select({ id: adCampaigns.id })
          .from(adCampaigns)
          .where(overlapping(input.variant, window.start, window.endExclusive, now))
          .limit(1);
        if (clash.length > 0) throw new ConflictError(DATES_TAKEN);
        const [row] = await tx
          .insert(adCampaigns)
          .values({
            id: newRecordId(now),
            advertiserName: advertiser.companyName,
            advertiserEmail: advertiser.email,
            imageUrl: input.imageUrl,
            clickUrl: input.clickUrl,
            variant: input.variant,
            startsAt: window.start,
            endsAt: window.endExclusive,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            advertiserId: advertiser.id,
            adName: input.adName,
            amountCents: quote.totalCents,
            holdExpiresAt,
            termsVersion: AD_TERMS_VERSION,
          })
          .returning();
        if (!row) throw new Error('insert into ad_campaigns returned no row');
        await enqueueReferenceSync(tx, 'ad_campaign', [row.id]);
        return row;
      });

      const prefix = languagePrefix(input.language);
      try {
        const session = await gateway.createCheckoutSession({
          campaignId: held.id,
          amountCents: quote.totalCents,
          currency: AD_CURRENCY,
          productName: `Global World Journal ad: ${input.variant}, ${input.startDate} to ${input.endDate}`,
          customerEmail: advertiser.email,
          successUrl: `${options.siteUrl}${prefix}/advertise/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${options.siteUrl}${prefix}/advertise/dashboard`,
          expiresAtSeconds:
            Math.floor(now.getTime() / 1000) +
            CHECKOUT_SESSION_MINUTES * 60 +
            CHECKOUT_SESSION_MARGIN_SECONDS,
          locale: input.language,
        });
        await getDb()
          .update(adCampaigns)
          .set({
            stripeSessionId: session.sessionId,
            checkoutUrl: session.url,
            updatedAt: new Date(),
          })
          .where(eq(adCampaigns.id, held.id));
        return {
          campaignId: held.id,
          checkoutUrl: session.url,
          holdExpiresAt: holdExpiresAt.toISOString(),
          totalCents: quote.totalCents,
        };
      } catch (err) {
        // Free the slot at once rather than leaving it held for 35 minutes.
        await markExpired(held.id);
        if (err instanceof BadGatewayError) throw err;
        logger.error('checkout session setup failed', errorFields(err));
        throw new BadGatewayError('The payment provider is unavailable; please try again');
      }
    },

    async advertiserCampaigns(advertiser) {
      const now = clock();
      const rows = await getDb()
        .select()
        .from(adCampaigns)
        .where(eq(adCampaigns.advertiserId, advertiser.id))
        .orderBy(desc(adCampaigns.createdAt), desc(adCampaigns.id));
      return rows.map((row) => toAdvertiserCampaign(row, now));
    },

    async handleWebhook(rawBody, signature) {
      const event = await requireGateway().constructWebhookEvent(rawBody, signature);
      if (!event) return;
      if (event.type === 'checkout.session.completed') {
        await onCompleted(event);
        return;
      }
      await getDb()
        .update(adCampaigns)
        .set({ status: 'expired', updatedAt: clock() })
        .where(
          and(eq(adCampaigns.stripeSessionId, event.sessionId), eq(adCampaigns.status, 'pending')),
        );
    },
  };
}
