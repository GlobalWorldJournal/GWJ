import {
  authorSlug,
  fediUsername,
  writerAvatarPath,
  DEFAULT_EDITION_USERNAMES,
  SUPPORTED_LANGUAGES,
  WRITERS,
  type Language,
  type Writer,
} from '@gwj/shared-types'
import type { Env } from '../env'

/**
 * GWJ federates as MANY actors under one `/users/<username>` namespace:
 *  - one EDITION actor per language (type `Service`): en→news, es→noticias,
 *    fr→actualites — its outbox/delivery covers articles in that language.
 *  - one WRITER actor per roster writer (type `Person`): username = `fediUsername`
 *    — its outbox/delivery covers articles whose `author` is that writer.
 *
 * Every ActivityPub `id`/URL is anchored to the APEX origin
 * (`https://<FEDIVERSE_DOMAIN>`), NOT the request host. Cloudflare proxies the AP
 * paths from the apex to this backend; generating ids from `req.host` would mint
 * `https://api.globalworldjournal.com/...` ids that don't match the handles'
 * domain and break federation, so we never do that.
 */

/** Which kind of actor this identity represents. */
export type ActorKind = 'edition' | 'writer'

export interface ActorIdentity {
  readonly kind: ActorKind
  /** AS2 actor type. Editions are `Service`, writers are `Person`. */
  readonly type: 'Service' | 'Person'
  /** Bare apex domain, e.g. `globalworldjournal.com`. */
  readonly domain: string
  /** Local username, e.g. `news` or `eleanorvance`. */
  readonly username: string
  /** Full fediverse handle, e.g. `news@globalworldjournal.com` (no leading `@`). */
  readonly handle: string
  /** Public site origin, e.g. `https://globalworldjournal.com`. */
  readonly origin: string
  /** Actor id/URL, e.g. `https://globalworldjournal.com/users/news`. */
  readonly actorId: string
  readonly inbox: string
  readonly outbox: string
  readonly followers: string
  readonly following: string
  /** Server-wide shared inbox (same host for every actor). */
  readonly sharedInbox: string
  /** The `publicKey.id` fragment used as the HTTP Signature `keyId`. */
  readonly publicKeyId: string
  /** Display name shown in the actor (`name`). */
  readonly name: string
  /** One-line bio (`summary`). */
  readonly summary: string
  /** Public profile URL (`url`): the site home for editions, author page for writers. */
  readonly url: string
  /** Avatar (`icon`) URL on the CDN, or the site logo for editions. */
  readonly iconUrl: string
  /** Banner (`image`) URL. */
  readonly imageUrl: string
  readonly iconMediaType: string
  readonly imageMediaType: string
  /** For an edition actor: the language whose articles it federates. */
  readonly language?: Language
  /** For a writer actor: the exact `author` name whose articles it federates. */
  readonly authorName?: string
}

/** Brand display name reused across editions. */
const BRAND_NAME = 'The Global World Journal'

/** Localized edition summaries (the brand line + an "edition of" note). */
const EDITION_SUMMARY: Record<Language, string> = {
  en: 'The Global World Journal — world, business, markets, technology, politics, opinion, and arts. Follow for new stories.',
  es: 'Edición en español de The Global World Journal — mundo, negocios, mercados, tecnología, política, opinión y artes. Síguenos para nuevas historias.',
  fr: 'Édition française de The Global World Journal — monde, affaires, marchés, technologie, politique, opinion et arts. Suivez-nous pour de nouveaux articles.',
}

/** Resolve the edition-username map: env override (`FEDIVERSE_EDITION_USERNAMES`) → defaults. */
export function resolveEditionUsernames(env: Env): Record<Language, string> {
  const overrides = env.FEDIVERSE_EDITION_USERNAMES
  if (!overrides) return { ...DEFAULT_EDITION_USERNAMES }
  return { ...DEFAULT_EDITION_USERNAMES, ...overrides }
}

interface IdentityBaseInput {
  kind: ActorKind
  type: 'Service' | 'Person'
  domain: string
  username: string
  name: string
  summary: string
  url: string
  iconUrl: string
  imageUrl: string
  iconMediaType: string
  imageMediaType: string
  language?: Language
  authorName?: string
}

/** Assemble the derived id/URL fields shared by every actor. */
function buildIdentity(input: IdentityBaseInput): ActorIdentity {
  const origin = `https://${input.domain}`
  const actorId = `${origin}/users/${input.username}`
  return {
    kind: input.kind,
    type: input.type,
    domain: input.domain,
    username: input.username,
    handle: `${input.username}@${input.domain}`,
    origin,
    actorId,
    inbox: `${actorId}/inbox`,
    outbox: `${actorId}/outbox`,
    followers: `${actorId}/followers`,
    following: `${actorId}/following`,
    sharedInbox: `${origin}/inbox`,
    publicKeyId: `${actorId}#main-key`,
    name: input.name,
    summary: input.summary,
    url: input.url,
    iconUrl: input.iconUrl,
    imageUrl: input.imageUrl,
    iconMediaType: input.iconMediaType,
    imageMediaType: input.imageMediaType,
    language: input.language,
    authorName: input.authorName,
  }
}

/** Trim and join a CDN base URL with a relative path. */
function cdnUrl(base: string, relativePath: string): string {
  return `${base.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`
}

/** Build one edition actor's identity. */
function buildEditionIdentity(domain: string, language: Language, username: string): ActorIdentity {
  const origin = `https://${domain}`
  return buildIdentity({
    kind: 'edition',
    type: 'Service',
    domain,
    username,
    name: BRAND_NAME,
    summary: EDITION_SUMMARY[language],
    url: origin,
    iconUrl: `${origin}/favicon.png`,
    imageUrl: `${origin}/logo-icon.svg`,
    iconMediaType: 'image/png',
    imageMediaType: 'image/svg+xml',
    language,
  })
}

/** Build one writer actor's identity. The avatar lives on the CDN. */
function buildWriterIdentity(domain: string, cdnBaseUrl: string, writer: Writer): ActorIdentity {
  const origin = `https://${domain}`
  const beats = writer.beats.join(', ')
  return buildIdentity({
    kind: 'writer',
    type: 'Person',
    domain,
    username: fediUsername(writer.name),
    name: writer.name,
    summary: `${writer.title} · ${beats}`,
    // Keep the existing HYPHENATED web slug for the public author page URL.
    url: `${origin}/author/${authorSlug(writer.name)}`,
    iconUrl: cdnUrl(cdnBaseUrl, writerAvatarPath(writer.name)),
    imageUrl: `${origin}/logo-icon.svg`,
    iconMediaType: 'image/png',
    imageMediaType: 'image/svg+xml',
    authorName: writer.name,
  })
}

/**
 * The registry of every federating actor, keyed by local username. Built once at
 * startup from configuration (domain, edition map, CDN base) and the writer roster.
 */
export interface ActorRegistry {
  readonly domain: string
  readonly origin: string
  /** username → identity (editions + writers). */
  readonly byUsername: ReadonlyMap<string, ActorIdentity>
  /** Every actor identity. */
  readonly all: readonly ActorIdentity[]
  /** Edition identity for a language. */
  editionFor(language: Language): ActorIdentity
  /** Writer identity for an exact author name, if that author is a roster writer. */
  writerForAuthor(authorName: string): ActorIdentity | undefined
  /** Lookup by username (edition or writer). */
  get(username: string): ActorIdentity | undefined
}

/** Build the full actor registry from validated environment configuration. */
export function buildActorRegistry(env: Env): ActorRegistry {
  const domain = env.FEDIVERSE_DOMAIN
  const origin = `https://${domain}`
  const editionUsernames = resolveEditionUsernames(env)

  const editions = new Map<Language, ActorIdentity>()
  for (const language of SUPPORTED_LANGUAGES) {
    editions.set(language, buildEditionIdentity(domain, language, editionUsernames[language]))
  }

  const byUsername = new Map<string, ActorIdentity>()
  const all: ActorIdentity[] = []
  for (const identity of editions.values()) {
    byUsername.set(identity.username, identity)
    all.push(identity)
  }
  const writerByAuthor = new Map<string, ActorIdentity>()
  for (const writer of WRITERS) {
    const identity = buildWriterIdentity(domain, env.CDN_BASE_URL, writer)
    // A writer username collision with an edition username would shadow the edition;
    // editions are inserted first, so guard against accidental overlap loudly.
    if (byUsername.has(identity.username)) {
      throw new Error(
        `ActivityPub actor username collision on "${identity.username}" — adjust the roster or edition usernames`,
      )
    }
    byUsername.set(identity.username, identity)
    writerByAuthor.set(writer.name, identity)
    all.push(identity)
  }

  return {
    domain,
    origin,
    byUsername,
    all,
    editionFor(language) {
      const edition = editions.get(language)
      if (!edition) throw new Error(`No edition actor for language "${language}"`)
      return edition
    },
    writerForAuthor(authorName) {
      return writerByAuthor.get(authorName)
    },
    get(username) {
      return byUsername.get(username)
    },
  }
}

/** Canonical public article URL on the apex (matches the frontend reader route). */
export function articleUrl(origin: string, slug: string): string {
  return `${origin}/article/${slug}`
}

/**
 * AS2 `id` for the Note representing a published article. The Note is owned by the
 * AUTHORING actor (a writer, or an edition for non-roster bylines), so the id is
 * scoped to that actor to stay globally unique and stable.
 */
export function noteId(identity: ActorIdentity, articleId: string): string {
  return `${identity.actorId}/articles/${articleId}/note`
}

/** AS2 `id` for the Create activity wrapping an article's Note. */
export function createActivityId(identity: ActorIdentity, articleId: string): string {
  return `${identity.actorId}/articles/${articleId}/create`
}

/** AS2 `id` for an edition's Announce (boost) of an article's Note. */
export function announceActivityId(identity: ActorIdentity, articleId: string): string {
  return `${identity.actorId}/articles/${articleId}/announce`
}
