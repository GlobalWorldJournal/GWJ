import type { Follower } from '@gwj/shared-types'
import { FollowerModel } from '../models/Follower'

/**
 * Persistence of fediverse followers, scoped per LOCAL actor (`actorUsername`).
 * Idempotent on the (actorUsername, actorId) pair so a repeat Follow (which
 * happens on retries) updates the inbox rather than erroring on the unique index.
 * Delivery dedupes by shared inbox at fan-out time.
 */
export interface FollowerService {
  upsert(input: Omit<Follower, 'followedAt'> & { followedAt?: string }): Promise<void>
  remove(actorUsername: string, actorId: string): Promise<boolean>
  /** Remove a remote actor from EVERY local actor's followers (actor Delete). */
  removeEverywhere(actorId: string): Promise<number>
  count(actorUsername: string): Promise<number>
  /** Follower actor ids for one local actor, newest first. */
  listActorIds(actorUsername: string, skip: number, limit: number): Promise<string[]>
  /** Distinct delivery targets for one local actor: shared inbox else actor inbox. */
  listDeliveryTargets(actorUsername: string): Promise<string[]>
}

export const followerService: FollowerService = {
  async upsert(input) {
    await FollowerModel.updateOne(
      { actorUsername: input.actorUsername, actorId: input.actorId },
      {
        $set: {
          inbox: input.inbox,
          sharedInbox: input.sharedInbox,
        },
        $setOnInsert: {
          actorUsername: input.actorUsername,
          actorId: input.actorId,
          followedAt: input.followedAt ? new Date(input.followedAt) : new Date(),
        },
      },
      { upsert: true },
    )
  },

  async remove(actorUsername, actorId) {
    const result = await FollowerModel.deleteOne({ actorUsername, actorId })
    return result.deletedCount > 0
  },

  async removeEverywhere(actorId) {
    const result = await FollowerModel.deleteMany({ actorId })
    return result.deletedCount
  },

  async count(actorUsername) {
    return FollowerModel.countDocuments({ actorUsername })
  },

  async listActorIds(actorUsername, skip, limit) {
    const docs = await FollowerModel.find({ actorUsername })
      .sort({ followedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .select('actorId')
      .lean()
    return docs.map((d) => d.actorId)
  },

  async listDeliveryTargets(actorUsername) {
    const docs = await FollowerModel.find({ actorUsername }).select('inbox sharedInbox').lean()
    const targets = new Set<string>()
    for (const doc of docs) {
      targets.add(doc.sharedInbox ?? doc.inbox)
    }
    return [...targets]
  },
}
