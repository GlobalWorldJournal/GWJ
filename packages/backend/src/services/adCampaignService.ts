import { and, count, desc, eq, gt, lte } from 'drizzle-orm';
import type {
  AdCampaign,
  AdCampaignInput,
  AdCampaignListQuery,
  AdCampaignUpdate,
  AdVariant,
  PaginatedAdCampaigns,
  PublicAdCampaign,
} from '@gwj/shared-types';
import { getDb } from '../db/client';
import { enqueueReferenceSync } from '../media/referenceJobs';
import { isRecordId, newRecordId } from '../db/ids';
import { adCampaigns, type AdCampaignRow } from '../db/schema/adCampaigns';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';

export function adCampaignToDTO(row: AdCampaignRow): AdCampaign {
  return {
    id: row.id,
    advertiserName: row.advertiserName,
    advertiserEmail: row.advertiserEmail,
    imageUrl: row.imageUrl,
    clickUrl: row.clickUrl,
    variant: row.variant,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The reader-facing projection: no advertiser contact, no schedule internals. */
export function toPublicAdCampaign(row: AdCampaignRow): PublicAdCampaign {
  return {
    id: row.id,
    advertiserName: row.advertiserName,
    imageUrl: row.imageUrl,
    clickUrl: row.clickUrl,
    variant: row.variant,
  };
}

async function findRowById(id: string): Promise<AdCampaignRow> {
  const [row] = isRecordId(id)
    ? await getDb().select().from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1)
    : [];
  if (!row) throw new NotFoundError('Ad campaign not found');
  return row;
}

export interface AdCampaignService {
  create(input: AdCampaignInput): Promise<AdCampaign>;
  list(query: AdCampaignListQuery): Promise<PaginatedAdCampaigns>;
  getById(id: string): Promise<AdCampaign>;
  update(id: string, patch: AdCampaignUpdate): Promise<AdCampaign>;
  remove(id: string): Promise<void>;
  /** The campaign that owns `variant`'s slot at `now`, or null (AdSense fills it). */
  findActive(variant: AdVariant, now?: Date): Promise<PublicAdCampaign | null>;
}

export const adCampaignService: AdCampaignService = {
  async create(input) {
    const now = new Date();
    const row = await getDb().transaction(async (tx) => {
      const [inserted] = await tx
        .insert(adCampaigns)
        .values({
          id: newRecordId(now),
          advertiserName: input.advertiserName,
          advertiserEmail: input.advertiserEmail,
          imageUrl: input.imageUrl,
          clickUrl: input.clickUrl,
          variant: input.variant,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          status: input.status,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!inserted) throw new Error('insert into ad_campaigns returned no row');
      await enqueueReferenceSync(tx, 'ad_campaign', [inserted.id]);
      return inserted;
    });
    return adCampaignToDTO(row);
  },

  async list(query) {
    const db = getDb();
    const where = query.status ? eq(adCampaigns.status, query.status) : undefined;
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(adCampaigns)
        .where(where)
        .orderBy(desc(adCampaigns.createdAt), desc(adCampaigns.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db.select({ total: count() }).from(adCampaigns).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      data: rows.map(adCampaignToDTO),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },

  async getById(id) {
    return adCampaignToDTO(await findRowById(id));
  },

  async update(id, patch) {
    const current = await findRowById(id);
    if (
      current.status === 'cancelled' &&
      patch.status !== undefined &&
      patch.status !== 'cancelled'
    )
      throw new ConflictError('A cancelled campaign cannot be reactivated; book a new one');
    const startsAt = patch.startsAt === undefined ? current.startsAt : new Date(patch.startsAt);
    const endsAt = patch.endsAt === undefined ? current.endsAt : new Date(patch.endsAt);
    // The schema checks the pair only when both are in the patch; one side alone
    // is checked here against the stored other side.
    if (endsAt <= startsAt) throw new BadRequestError('endsAt must be after startsAt');
    const row = await getDb().transaction(async (tx) => {
      const [updated] = await tx
        .update(adCampaigns)
        .set({
          advertiserName: patch.advertiserName,
          advertiserEmail: patch.advertiserEmail,
          imageUrl: patch.imageUrl,
          clickUrl: patch.clickUrl,
          variant: patch.variant,
          startsAt,
          endsAt,
          status: patch.status,
          updatedAt: new Date(),
        })
        .where(eq(adCampaigns.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Ad campaign not found');
      if (patch.imageUrl !== undefined) await enqueueReferenceSync(tx, 'ad_campaign', [id]);
      return updated;
    });
    return adCampaignToDTO(row);
  },

  async remove(id) {
    if (!isRecordId(id)) throw new NotFoundError('Ad campaign not found');
    await getDb().transaction(async (tx) => {
      const deleted = await tx
        .delete(adCampaigns)
        .where(eq(adCampaigns.id, id))
        .returning({ id: adCampaigns.id });
      if (deleted.length === 0) throw new NotFoundError('Ad campaign not found');
      // Its creative is released (Oxy collects a GWJ file nothing uses).
      await enqueueReferenceSync(tx, 'ad_campaign', [id]);
    });
  },

  async findActive(variant, now = new Date()) {
    // Overlapping bookings for one slot: the most recently created wins. It is
    // deterministic and read-only, so the public answer stays cacheable (a
    // rotation would need a write per impression), and the newest booking is the
    // one an admin just scheduled on purpose. Pausing it hands the slot back.
    const [row] = await getDb()
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.variant, variant),
          eq(adCampaigns.status, 'active'),
          lte(adCampaigns.startsAt, now),
          gt(adCampaigns.endsAt, now),
        ),
      )
      .orderBy(desc(adCampaigns.createdAt), desc(adCampaigns.id))
      .limit(1);
    return row ? toPublicAdCampaign(row) : null;
  },
};
