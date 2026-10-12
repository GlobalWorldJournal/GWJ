import { z } from 'zod';
import { AdVariantSchema } from './ads';

/**
 * Self-serve advertising: an advertiser signs up, picks a slot and dates,
 * uploads a creative, pays through Stripe Checkout, and the ad publishes by itself.
 * Each slot (`AdVariant`) holds ONE paid booking per day.
 */

/** Bumped whenever the advertising terms change; stored with each acceptance. */
export const AD_TERMS_VERSION = '2026-10-13';

/** Prices are fixed per slot per day, in USD cents. */
export const AD_CURRENCY = 'usd';
export const AD_DAILY_RATE_CENTS: Record<z.infer<typeof AdVariantSchema>, number> = {
  leaderboard: 6000,
  mrec: 4000,
  inline: 5000,
};
export const AD_MIN_DAYS = 1;
export const AD_MAX_DAYS = 30;
/** How far ahead a booking may start. */
export const AD_MAX_ADVANCE_DAYS = 90;
/** A slot is held for the advertiser while they pay; Stripe's session lasts 30 minutes. */
export const AD_HOLD_MINUTES = 35;

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const AdvertiserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  companyName: z.string(),
  createdAt: z.string().datetime(),
});
export type Advertiser = z.infer<typeof AdvertiserSchema>;

export const AdvertiserRegisterInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(10).max(200),
  companyName: z.string().trim().min(1).max(200),
  /** Must be literally true: the terms (no refunds, removal at our discretion) are accepted. */
  acceptTerms: z.literal(true),
});
export type AdvertiserRegisterInput = z.infer<typeof AdvertiserRegisterInputSchema>;

export const AdvertiserLoginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
});
export type AdvertiserLoginInput = z.infer<typeof AdvertiserLoginInputSchema>;

export const AdvertiserAuthResponseSchema = z.object({
  token: z.string(),
  advertiser: AdvertiserSchema,
});
export type AdvertiserAuthResponse = z.infer<typeof AdvertiserAuthResponseSchema>;

/** Public: the days a slot is already taken, so the calendar can grey them out. */
export const AdAvailabilityQuerySchema = z.object({
  variant: AdVariantSchema,
  /** First day shown (YYYY-MM-DD, UTC). */
  from: DateOnlySchema,
  /** Last day shown (YYYY-MM-DD, UTC). */
  to: DateOnlySchema,
});
export type AdAvailabilityQuery = z.infer<typeof AdAvailabilityQuerySchema>;

export const AdAvailabilitySchema = z.object({
  variant: AdVariantSchema,
  /** Every taken day in the range (YYYY-MM-DD), a held-but-unpaid slot included. */
  bookedDays: z.array(DateOnlySchema),
});
export type AdAvailability = z.infer<typeof AdAvailabilitySchema>;

export const AdQuoteQuerySchema = z.object({
  variant: AdVariantSchema,
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
});
export type AdQuoteQuery = z.infer<typeof AdQuoteQuerySchema>;

export const AdQuoteSchema = z.object({
  variant: AdVariantSchema,
  days: z.number().int(),
  dailyRateCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.string(),
});
export type AdQuote = z.infer<typeof AdQuoteSchema>;

/** Reserve a slot for the dates and get the Stripe Checkout link to pay for it. */
export const AdBookingInputSchema = z.object({
  variant: AdVariantSchema,
  /** First and last day shown, inclusive (YYYY-MM-DD, UTC). */
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  /** The uploaded creative (the URL returned by the creative upload). */
  imageUrl: z.string().trim().url().max(2000),
  /** Where a click goes (http/https only; checked server-side). */
  clickUrl: z.string().trim().url().max(2000),
  /** Shown as the image's alt text. */
  adName: z.string().trim().min(1).max(200),
  /** Must be true: the advertiser re-accepts the current terms at checkout. */
  acceptTerms: z.literal(true),
  /** Locale of the page, so Stripe Checkout and the return URLs match. */
  language: z.enum(['en', 'es', 'fr']).default('en'),
});
export type AdBookingInput = z.infer<typeof AdBookingInputSchema>;

export const AdBookingResponseSchema = z.object({
  campaignId: z.string(),
  checkoutUrl: z.string().url(),
  holdExpiresAt: z.string().datetime(),
  totalCents: z.number().int(),
});
export type AdBookingResponse = z.infer<typeof AdBookingResponseSchema>;

/**
 * What an advertiser sees for each of their bookings:
 * `awaiting_payment` (slot held), `scheduled` (paid, not started), `live`,
 * `ended`, `removed` (taken down by us; terms: no refund), `expired` (never paid).
 */
export const ADVERTISER_CAMPAIGN_STATUSES = [
  'awaiting_payment',
  'scheduled',
  'live',
  'ended',
  'removed',
  'expired',
] as const;
export const AdvertiserCampaignSchema = z.object({
  id: z.string(),
  variant: AdVariantSchema,
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  imageUrl: z.string(),
  clickUrl: z.string(),
  adName: z.string(),
  status: z.enum(ADVERTISER_CAMPAIGN_STATUSES),
  amountCents: z.number().int().nullable(),
  currency: z.string(),
  createdAt: z.string().datetime(),
  /** Only while `awaiting_payment`: when the held slot is released. */
  holdExpiresAt: z.string().datetime().nullable(),
  /** Only while `awaiting_payment`: resume paying. */
  checkoutUrl: z.string().url().nullable(),
});
export type AdvertiserCampaign = z.infer<typeof AdvertiserCampaignSchema>;

export const AdvertiserCampaignListSchema = z.object({ data: z.array(AdvertiserCampaignSchema) });
export type AdvertiserCampaignList = z.infer<typeof AdvertiserCampaignListSchema>;

/** The creative upload result. */
export const AdCreativeUploadSchema = z.object({ url: z.string().url() });
export type AdCreativeUpload = z.infer<typeof AdCreativeUploadSchema>;
