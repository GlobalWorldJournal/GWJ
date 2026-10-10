import { Schema, model, type HydratedDocument, type Model } from 'mongoose'

/**
 * A fediverse account that follows ONE local actor. Followers are scoped per local
 * actor: `actorUsername` is the LOCAL actor being followed (an edition like
 * `news`/`noticias`/`actualites`, or a writer like `eleanorvance`); `actorId` is
 * the REMOTE follower's actor id. The same remote account may follow several local
 * actors, so the unique key is the (actorUsername, actorId) pair.
 *
 * A repeat Follow is an idempotent upsert; an Undo(Follow)/Delete removes the row.
 * `sharedInbox`, when present, lets us dedupe delivery: many followers on one
 * server share an inbox, so we POST once per shared inbox instead of per actor.
 */
export interface FollowerAttrs {
  actorUsername: string
  actorId: string
  inbox: string
  sharedInbox?: string
  followedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type FollowerDoc = HydratedDocument<FollowerAttrs>
export type FollowerModelType = Model<FollowerAttrs>

const followerSchema = new Schema<FollowerAttrs, FollowerModelType>(
  {
    actorUsername: { type: String, required: true },
    actorId: { type: String, required: true },
    inbox: { type: String, required: true },
    sharedInbox: { type: String },
    followedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
)

// One follow per (local actor, remote actor). Replaces the prior single-actor
// unique index on `actorId` alone.
followerSchema.index({ actorUsername: 1, actorId: 1 }, { unique: true })
// Efficient per-actor listing newest-first and delivery-target scans.
followerSchema.index({ actorUsername: 1, followedAt: -1 })

export const FollowerModel = model<FollowerAttrs, FollowerModelType>('Follower', followerSchema)
