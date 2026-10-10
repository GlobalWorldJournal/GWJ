import { bigint, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

/**
 * A fediverse account (`actorId`, REMOTE) following ONE local actor
 * (`actorUsername`, an edition or a writer). One row per pair.
 *
 * `id` is an identity column, not a copied ObjectId: nothing outside the database
 * ever saw a follower's id. It exists as the deterministic tie-break for the
 * newest-first follower listing, the role `_id` played in Mongo.
 */
export const followers = pgTable(
  'followers',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorUsername: text().notNull(),
    actorId: text().notNull(),
    inbox: text().notNull(),
    sharedInbox: text(),
    followedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('followers_actor_username_actor_id_unique').on(t.actorUsername, t.actorId),
    index('followers_actor_username_followed_at_idx').on(
      t.actorUsername,
      t.followedAt.desc(),
      t.id.desc(),
    ),
  ],
)

export type FollowerRow = typeof followers.$inferSelect
