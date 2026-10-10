import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Follower } from '@gwj/shared-types';
import { getDb } from '../db/client';
import { followers } from '../db/schema/followers';

/**
 * Persistence of fediverse followers, scoped per LOCAL actor (`actorUsername`).
 * Idempotent on the (actorUsername, actorId) pair so a repeat Follow (which
 * happens on retries) updates the inbox rather than erroring on the unique key.
 * Delivery dedupes by shared inbox at fan-out time.
 */
export interface FollowerService {
  upsert(input: Omit<Follower, 'followedAt'> & { followedAt?: string }): Promise<void>;
  remove(actorUsername: string, actorId: string): Promise<boolean>;
  /** Remove a remote actor from EVERY local actor's followers (actor Delete). */
  removeEverywhere(actorId: string): Promise<number>;
  count(actorUsername: string): Promise<number>;
  /** Follower actor ids for one local actor, newest first. */
  listActorIds(actorUsername: string, skip: number, limit: number): Promise<string[]>;
  /** Distinct delivery targets for one local actor: shared inbox else actor inbox. */
  listDeliveryTargets(actorUsername: string): Promise<string[]>;
}

export const followerService: FollowerService = {
  async upsert(input) {
    const now = new Date();
    await getDb()
      .insert(followers)
      .values({
        actorUsername: input.actorUsername,
        actorId: input.actorId,
        inbox: input.inbox,
        sharedInbox: input.sharedInbox ?? null,
        followedAt: input.followedAt ? new Date(input.followedAt) : now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [followers.actorUsername, followers.actorId],
        set: {
          inbox: sql`excluded.inbox`,
          // Mongo's `$set: { sharedInbox: undefined }` was a NO-OP, so a re-Follow
          // that omits the shared inbox kept the one already stored. Writing
          // `excluded.shared_inbox` (NULL) would silently erase it.
          sharedInbox: sql`coalesce(excluded.shared_inbox, ${followers.sharedInbox})`,
          updatedAt: now,
        },
      });
  },

  async remove(actorUsername, actorId) {
    const rows = await getDb()
      .delete(followers)
      .where(and(eq(followers.actorUsername, actorUsername), eq(followers.actorId, actorId)))
      .returning({ id: followers.id });
    return rows.length > 0;
  },

  async removeEverywhere(actorId) {
    const rows = await getDb()
      .delete(followers)
      .where(eq(followers.actorId, actorId))
      .returning({ id: followers.id });
    return rows.length;
  },

  async count(actorUsername) {
    const [row] = await getDb()
      .select({ total: count() })
      .from(followers)
      .where(eq(followers.actorUsername, actorUsername));
    return row?.total ?? 0;
  },

  async listActorIds(actorUsername, skip, limit) {
    const rows = await getDb()
      .select({ actorId: followers.actorId })
      .from(followers)
      .where(eq(followers.actorUsername, actorUsername))
      .orderBy(desc(followers.followedAt), desc(followers.id))
      .offset(skip)
      .limit(limit);
    return rows.map((r) => r.actorId);
  },

  async listDeliveryTargets(actorUsername) {
    const rows = await getDb()
      .select({ inbox: followers.inbox, sharedInbox: followers.sharedInbox })
      .from(followers)
      .where(eq(followers.actorUsername, actorUsername));
    const targets = new Set<string>();
    for (const row of rows) {
      targets.add(row.sharedInbox ?? row.inbox);
    }
    return [...targets];
  },
};
