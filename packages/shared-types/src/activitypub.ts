import { z } from 'zod';

/**
 * ActivityPub / ActivityStreams 2.0 contracts for the Global World Journal
 * publication actor. These describe the JSON-LD documents the backend SERVES to
 * the fediverse (Mastodon et al.), so the shapes stay the single source of truth
 * shared across packages. We model only the subset GWJ emits — federation peers
 * tolerate extra/missing fields, but our own output is validated against these.
 *
 * Note: AS2 uses the JSON-LD key `@context`, which is not a valid TS identifier
 * for object literals consumed elsewhere, so DTOs carry it as a string key.
 */

/** The AS2 + security/v1 JSON-LD context array our actor advertises. */
export const AS2_CONTEXT = [
  'https://www.w3.org/ns/activitystreams',
  'https://w3id.org/security/v1',
] as const;

/** Public addressing collection used in `to`/`cc`. */
export const AS2_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

/** Content types a client may use to request ActivityPub JSON. */
export const ACTIVITY_JSON_TYPE = 'application/activity+json';
export const LD_JSON_TYPE = 'application/ld+json';

/** RSA public key embedded in an actor (HTTP Signatures key discovery). */
export const PublicKeySchema = z.object({
  id: z.string(),
  owner: z.string(),
  publicKeyPem: z.string(),
});
export type PublicKey = z.infer<typeof PublicKeySchema>;

/** An image object (`icon`/`image`) or a Note `attachment` Document. */
export const ActivityImageSchema = z.object({
  type: z.enum(['Image', 'Document']),
  mediaType: z.string().optional(),
  url: z.string().url(),
  name: z.string().optional(),
});
export type ActivityImage = z.infer<typeof ActivityImageSchema>;

/** Endpoints block; we expose only the shared inbox. */
export const ActorEndpointsSchema = z.object({
  sharedInbox: z.string().url(),
});
export type ActorEndpoints = z.infer<typeof ActorEndpointsSchema>;

/** The AS2 Actor document (an Organization/Service running the newspaper). */
export const ActorSchema = z.object({
  '@context': z.array(z.string()),
  id: z.string().url(),
  type: z.enum(['Service', 'Organization', 'Application', 'Person']),
  preferredUsername: z.string(),
  name: z.string(),
  summary: z.string(),
  url: z.string().url(),
  inbox: z.string().url(),
  outbox: z.string().url(),
  followers: z.string().url(),
  following: z.string().url(),
  manuallyApprovesFollowers: z.boolean(),
  published: z.string().optional(),
  endpoints: ActorEndpointsSchema,
  icon: ActivityImageSchema.optional(),
  image: ActivityImageSchema.optional(),
  publicKey: PublicKeySchema,
});
export type Actor = z.infer<typeof ActorSchema>;

/** A published article rendered as an AS2 Note. */
export const NoteSchema = z.object({
  id: z.string().url(),
  type: z.literal('Note'),
  attributedTo: z.string().url(),
  content: z.string(),
  url: z.string().url(),
  published: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  attachment: z.array(ActivityImageSchema).optional(),
});
export type Note = z.infer<typeof NoteSchema>;

/** A Create activity wrapping a Note (outbox item / delivered activity). */
export const CreateActivitySchema = z.object({
  '@context': z.array(z.string()).optional(),
  id: z.string().url(),
  type: z.literal('Create'),
  actor: z.string().url(),
  published: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  object: NoteSchema,
});
export type CreateActivity = z.infer<typeof CreateActivitySchema>;

/**
 * An Announce activity (a "boost"). An edition actor announces a Note already
 * authored by a writer actor — `object` is the Note's id (a string reference, not
 * a fresh copy) so followers see a boost rather than a duplicate Note.
 */
export const AnnounceActivitySchema = z.object({
  '@context': z.array(z.string()).optional(),
  id: z.string().url(),
  type: z.literal('Announce'),
  actor: z.string().url(),
  published: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  object: z.string().url(),
});
export type AnnounceActivity = z.infer<typeof AnnounceActivitySchema>;

/** An OrderedCollection (the head document, links to its first page). */
export const OrderedCollectionSchema = z.object({
  '@context': z.union([z.string(), z.array(z.string())]),
  id: z.string().url(),
  type: z.literal('OrderedCollection'),
  totalItems: z.number().int().min(0),
  first: z.string().url().optional(),
  last: z.string().url().optional(),
});
export type OrderedCollection = z.infer<typeof OrderedCollectionSchema>;

/** A page of an OrderedCollection. `orderedItems` may be activities or ids. */
export const OrderedCollectionPageSchema = z.object({
  '@context': z.union([z.string(), z.array(z.string())]),
  id: z.string().url(),
  type: z.literal('OrderedCollectionPage'),
  partOf: z.string().url(),
  totalItems: z.number().int().min(0).optional(),
  next: z.string().url().optional(),
  prev: z.string().url().optional(),
  orderedItems: z.array(z.union([CreateActivitySchema, z.string()])),
});
export type OrderedCollectionPage = z.infer<typeof OrderedCollectionPageSchema>;

/** A generic inbound activity envelope we parse before dispatching by `type`. */
export const InboundActivitySchema = z.object({
  '@context': z.union([z.string(), z.array(z.unknown())]).optional(),
  id: z.string().optional(),
  type: z.string(),
  actor: z.string().optional(),
  object: z.unknown().optional(),
});
export type InboundActivity = z.infer<typeof InboundActivitySchema>;

/** A WebFinger JRD link. */
export const WebFingerLinkSchema = z.object({
  rel: z.string(),
  type: z.string().optional(),
  href: z.string().optional(),
  template: z.string().optional(),
});
export type WebFingerLink = z.infer<typeof WebFingerLinkSchema>;

/** A WebFinger JRD response (RFC 7033). */
export const WebFingerSchema = z.object({
  subject: z.string(),
  aliases: z.array(z.string()).optional(),
  links: z.array(WebFingerLinkSchema),
});
export type WebFinger = z.infer<typeof WebFingerSchema>;

/**
 * A persisted fediverse follower of one local actor. `actorUsername` is the LOCAL
 * actor being followed (an edition like `news`/`noticias`/`actualites`, or a
 * writer like `eleanorvance`); followers are scoped per local actor. `actorId` is
 * the REMOTE follower's actor id.
 */
export const FollowerSchema = z.object({
  actorUsername: z.string().min(1),
  actorId: z.string().url(),
  inbox: z.string().url(),
  sharedInbox: z.string().url().optional(),
  followedAt: z.string().datetime(),
});
export type Follower = z.infer<typeof FollowerSchema>;
