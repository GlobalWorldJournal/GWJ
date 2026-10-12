import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  AD_CAMPAIGN_STATUSES,
  AD_VARIANTS,
  type AdCampaignStatus,
  type AdVariant,
} from '@gwj/shared-types';
import { RECORD_ID_SQL_PATTERN } from '../ids';
import { sqlInList } from '../sqlLiterals';
import { advertisers } from './advertisers';

/**
 * Directly sold ad bookings (admin-managed; payment is settled out of band). A
 * live campaign takes its slot from AdSense for its start/end window.
 *
 * A campaign targets exactly ONE slot variant: the creative is a single image
 * sized for that slot's shape (728×90, 300×250, full-width in-feed), so one
 * image cannot fill all three. Selling several slots is several campaigns.
 */
export const adCampaigns = pgTable(
  'ad_campaigns',
  {
    id: text().primaryKey(),
    advertiserName: text().notNull(),
    advertiserEmail: text().notNull(),
    imageUrl: text().notNull(),
    clickUrl: text().notNull(),
    variant: text().$type<AdVariant>().notNull(),
    startsAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    status: text().$type<AdCampaignStatus>().notNull().default('active'),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    // Self-serve bookings only; admin-created campaigns leave these null.
    advertiserId: text().references(() => advertisers.id, { onDelete: 'set null' }),
    /** The creative's alt text. */
    adName: text(),
    amountCents: integer(),
    stripeSessionId: text(),
    checkoutUrl: text(),
    /** While `pending`: when the held slot is released if still unpaid. */
    holdExpiresAt: timestamp({ withTimezone: true, mode: 'date' }),
    paidAt: timestamp({ withTimezone: true, mode: 'date' }),
    termsVersion: text(),
  },
  (t) => [
    check('ad_campaigns_id_format', sql`${t.id} ~ ${sql.raw(`'${RECORD_ID_SQL_PATTERN}'`)}`),
    check('ad_campaigns_variant_check', sql`${t.variant} IN ${sqlInList(AD_VARIANTS)}`),
    check('ad_campaigns_status_check', sql`${t.status} IN ${sqlInList(AD_CAMPAIGN_STATUSES)}`),
    check('ad_campaigns_window_check', sql`${t.endsAt} > ${t.startsAt}`),
    uniqueIndex('ad_campaigns_stripe_session_id_unique').on(t.stripeSessionId),
    index('ad_campaigns_advertiser_idx').on(t.advertiserId, t.createdAt.desc()),
    // The public lookup: live campaigns for one slot, newest booking first.
    index('ad_campaigns_live_idx')
      .on(t.variant, t.createdAt.desc())
      .where(sql`${t.status} = 'active'`),
    // The admin list: by status, newest first.
    index('ad_campaigns_status_created_at_idx').on(t.status, t.createdAt.desc()),
  ],
);

export type AdCampaignRow = typeof adCampaigns.$inferSelect;
