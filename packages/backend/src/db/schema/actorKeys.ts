import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * One RSA keypair per local ActivityPub actor (edition or writer), keyed by its
 * local username. The private key is GWJ-owned secret material: never serialized
 * to clients, never logged. Copied VERBATIM from Mongo at cutover — a new key
 * would break every remote server's cached public key for that actor.
 */
export const actorKeys = pgTable('actor_keys', {
  username: text().primaryKey(),
  privateKeyPem: text().notNull(),
  publicKeyPem: text().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type ActorKeyRow = typeof actorKeys.$inferSelect;
