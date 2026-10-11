import { z } from 'zod';

/**
 * The ad slots the reader site lays out (the frontend's `AdSlot` variants):
 * a 728×90 leaderboard, a 300×250 medium rectangle, and a full-width in-feed unit.
 */
export const AD_VARIANTS = ['leaderboard', 'mrec', 'inline'] as const;
export const AdVariantSchema = z.enum(AD_VARIANTS);
export type AdVariant = z.infer<typeof AdVariantSchema>;

/**
 * `active` serves inside its start/end window; `paused` is a reversible hold;
 * `cancelled` ends the booking for good (kept for the record, never served).
 */
export const AD_CAMPAIGN_STATUSES = ['active', 'paused', 'cancelled'] as const;
export const AdCampaignStatusSchema = z.enum(AD_CAMPAIGN_STATUSES);
export type AdCampaignStatus = z.infer<typeof AdCampaignStatusSchema>;

/**
 * The dimension floor for an uploaded creative: the narrowest slot is 300px wide
 * (mrec) and the shortest is 90px tall (leaderboard). The article-image floor
 * (600×400) would reject every standard IAB banner size.
 */
export const AD_CREATIVE_MIN_WIDTH = 300;
export const AD_CREATIVE_MIN_HEIGHT = 90;

/** Only http(s) links: a `javascript:` click-through would run on our origin. */
const HttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), { message: 'Must be an http(s) URL' });

const AdCampaignFieldsSchema = z.object({
  advertiserName: z.string().trim().min(1).max(200),
  advertiserEmail: z.string().trim().email().max(320),
  imageUrl: HttpUrlSchema,
  clickUrl: HttpUrlSchema,
  variant: AdVariantSchema,
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: AdCampaignStatusSchema,
});

function endsAfterStart(value: { startsAt?: string; endsAt?: string }): boolean {
  if (value.startsAt === undefined || value.endsAt === undefined) return true;
  return Date.parse(value.endsAt) > Date.parse(value.startsAt);
}

const END_AFTER_START = { message: 'endsAt must be after startsAt', path: ['endsAt'] };

/** Admin create payload. */
export const AdCampaignInputSchema = AdCampaignFieldsSchema.extend({
  status: AdCampaignStatusSchema.default('active'),
}).refine(endsAfterStart, END_AFTER_START);
export type AdCampaignInput = z.infer<typeof AdCampaignInputSchema>;

/** Admin partial update (pause/resume/cancel is a `status` patch). */
export const AdCampaignUpdateSchema = AdCampaignFieldsSchema.partial().refine(
  endsAfterStart,
  END_AFTER_START,
);
export type AdCampaignUpdate = z.infer<typeof AdCampaignUpdateSchema>;

/** Full record returned to admins. */
export const AdCampaignSchema = AdCampaignFieldsSchema.extend({
  id: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdCampaign = z.infer<typeof AdCampaignSchema>;

export const AdCampaignListQuerySchema = z.object({
  status: AdCampaignStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdCampaignListQuery = z.infer<typeof AdCampaignListQuerySchema>;

export const PaginatedAdCampaignsSchema = z.object({
  data: z.array(AdCampaignSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export type PaginatedAdCampaigns = z.infer<typeof PaginatedAdCampaignsSchema>;

export const ActiveAdQuerySchema = z.object({ variant: AdVariantSchema });
export type ActiveAdQuery = z.infer<typeof ActiveAdQuerySchema>;

/** What readers get: the creative and its link — never the advertiser's contact. */
export const PublicAdCampaignSchema = AdCampaignSchema.pick({
  id: true,
  advertiserName: true,
  imageUrl: true,
  clickUrl: true,
  variant: true,
});
export type PublicAdCampaign = z.infer<typeof PublicAdCampaignSchema>;

/** `campaign` is null when no direct campaign is live for the slot (AdSense fills it). */
export const ActiveAdResponseSchema = z.object({ campaign: PublicAdCampaignSchema.nullable() });
export type ActiveAdResponse = z.infer<typeof ActiveAdResponseSchema>;
