import type {
  Actor,
  ActivityImage,
  AnnounceActivity,
  Article,
  CreateActivity,
  DeleteActivity,
  Note,
  OrderedCollection,
  OrderedCollectionPage,
  UpdateActivity,
  WebFinger,
} from '@gwj/shared-types';
import { ACTIVITY_JSON_TYPE, AS2_CONTEXT, AS2_PUBLIC } from '@gwj/shared-types';
import { articleUrl, createActivityId, noteId, type ActorIdentity } from './identity';

/** Length budget for the auto-generated story summary in a Note. */
const SUMMARY_MAX_CHARS = 280;

/** Escape a string for safe interpolation into HTML payloads (AS2 Note content, Telegram captions). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Derive a short plain-text summary from an article. Prefers the editorial deck,
 * then the SEO meta description, then a truncation of the Markdown body with its
 * formatting stripped. Always returns a single trimmed line.
 */
function deriveSummary(article: Article): string {
  if (article.deck && article.deck.trim().length > 0) return article.deck.trim();
  if (article.seo.metaDescription && article.seo.metaDescription.trim().length > 0) {
    return article.seo.metaDescription.trim();
  }
  const plain = article.body
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[#>*_`~-]/g, ' ') // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= SUMMARY_MAX_CHARS) return plain;
  return `${plain.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}…`;
}

/** Build the hero image as an AS2 attachment Document, if the article has one. */
function heroAttachment(article: Article): ActivityImage | null {
  if (!article.heroImage) return null;
  // The type we recorded when storing it; an Oxy file URL has no extension.
  const ext = article.heroImage.url.split('?')[0]?.split('.').pop()?.toLowerCase();
  const mediaType = article.heroImage.mime
    ? article.heroImage.mime
    : ext === 'png'
      ? 'image/png'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'avif'
          ? 'image/avif'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
  return {
    type: 'Document',
    mediaType,
    url: article.heroImage.url,
    name:
      article.heroImage.alt && article.heroImage.alt.length > 0
        ? article.heroImage.alt
        : article.title,
  };
}

/** Build the AS2 Actor document for any actor (edition `Service` or writer `Person`). */
export function buildActor(identity: ActorIdentity, publicKeyPem: string): Actor {
  return {
    '@context': [...AS2_CONTEXT],
    id: identity.actorId,
    type: identity.type,
    preferredUsername: identity.username,
    name: identity.name,
    summary: identity.summary,
    url: identity.url,
    inbox: identity.inbox,
    outbox: identity.outbox,
    followers: identity.followers,
    following: identity.following,
    manuallyApprovesFollowers: false,
    endpoints: { sharedInbox: identity.sharedInbox },
    icon: {
      type: 'Image',
      mediaType: identity.iconMediaType,
      url: identity.iconUrl,
    },
    image: {
      type: 'Image',
      mediaType: identity.imageMediaType,
      url: identity.imageUrl,
    },
    publicKey: {
      id: identity.publicKeyId,
      owner: identity.actorId,
      publicKeyPem,
    },
  };
}

/**
 * Render a published article as an AS2 Note authored by `author` (a writer actor,
 * or an edition actor for a non-roster byline). Addressed to the public and CC'd
 * to the author's followers. `id` defaults to the article's canonical Note id
 * (the outbox's); a delivered publication passes its own (`publicationNoteId`).
 * `updated` marks an edited Note.
 */
export function buildNote(
  author: ActorIdentity,
  article: Article,
  options: { id?: string; updated?: string } = {},
): Note {
  const url = articleUrl(author.origin, article.slug);
  const summary = deriveSummary(article);
  const headline = escapeHtml(article.title);
  const summaryHtml = summary.length > 0 ? `<p>${escapeHtml(summary)}</p>` : '';
  const content = `<p><strong>${headline}</strong></p>${summaryHtml}<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;
  const attachment = heroAttachment(article);
  return {
    id: options.id ?? noteId(author, article.id),
    type: 'Note',
    attributedTo: author.actorId,
    content,
    url,
    published: article.publishedAt ?? article.createdAt,
    ...(options.updated ? { updated: options.updated } : {}),
    to: [AS2_PUBLIC],
    cc: [author.followers],
    ...(attachment ? { attachment: [attachment] } : {}),
  };
}

/**
 * Wrap a Note in a Create activity by its author. `withContext` adds top-level
 * `@context`; `noteId` names a delivered publication's Note (default: the
 * canonical one, as the outbox lists it).
 */
export function buildCreateActivity(
  author: ActorIdentity,
  article: Article,
  options: { withContext?: boolean; noteId?: string } = {},
): CreateActivity {
  const note = buildNote(author, article, { id: options.noteId });
  return {
    ...(options.withContext ? { '@context': [...AS2_CONTEXT] } : {}),
    id: options.noteId ? `${options.noteId}#create` : createActivityId(author, article.id),
    type: 'Create',
    actor: author.actorId,
    published: note.published,
    to: note.to,
    cc: note.cc,
    object: note,
  };
}

/**
 * Build an edition's Announce (boost) of a delivered Note (`noteId`, authored by
 * a writer actor), so an edition follower sees a boost rather than a duplicate
 * Note.
 */
export function buildAnnounceActivity(
  announcer: ActorIdentity,
  noteId: string,
  article: Article,
  options: { withContext?: boolean } = {},
): AnnounceActivity {
  return {
    ...(options.withContext ? { '@context': [...AS2_CONTEXT] } : {}),
    id: `${noteId}#announce`,
    type: 'Announce',
    actor: announcer.actorId,
    published: article.publishedAt ?? article.createdAt,
    to: [AS2_PUBLIC],
    cc: [announcer.followers],
    object: noteId,
  };
}

/**
 * An Update of a delivered Note to the article as it is now (a correction, a new
 * headline…). The activity id is unique per edit, keyed by the article's
 * `updatedAt`, which the Note also carries as `updated`.
 */
export function buildUpdateActivity(
  author: ActorIdentity,
  noteId: string,
  article: Article,
  options: { withContext?: boolean } = {},
): UpdateActivity {
  const note = buildNote(author, article, { id: noteId, updated: article.updatedAt });
  return {
    ...(options.withContext ? { '@context': [...AS2_CONTEXT] } : {}),
    id: `${noteId}#updates/${Date.parse(article.updatedAt)}`,
    type: 'Update',
    actor: author.actorId,
    published: article.updatedAt,
    to: note.to,
    cc: note.cc,
    object: note,
  };
}

/** A Delete of a delivered Note: servers replace it (and its boosts) with a tombstone. */
export function buildDeleteActivity(
  author: ActorIdentity,
  noteId: string,
  options: { withContext?: boolean } = {},
): DeleteActivity {
  return {
    ...(options.withContext ? { '@context': [...AS2_CONTEXT] } : {}),
    id: `${noteId}#delete`,
    type: 'Delete',
    actor: author.actorId,
    to: [AS2_PUBLIC],
    object: { id: noteId, type: 'Tombstone' },
  };
}

/** Build an Accept activity acknowledging a Follow of `identity`. */
export function buildAcceptActivity(
  identity: ActorIdentity,
  followActivity: { id?: string; actor?: string; type: string; object?: unknown },
): Record<string, unknown> {
  return {
    '@context': AS2_CONTEXT[0],
    id: `${identity.actorId}#accepts/${encodeURIComponent(followActivity.id ?? Date.now().toString())}`,
    type: 'Accept',
    actor: identity.actorId,
    object: {
      id: followActivity.id,
      type: followActivity.type,
      actor: followActivity.actor,
      object: identity.actorId,
    },
  };
}

/** Items-per-page for the outbox collection. */
export const OUTBOX_PAGE_SIZE = 20;

/** The head OrderedCollection for an actor's outbox, pointing at its first page. */
export function buildOutboxCollection(
  identity: ActorIdentity,
  totalItems: number,
): OrderedCollection {
  return {
    '@context': AS2_CONTEXT[0],
    id: identity.outbox,
    type: 'OrderedCollection',
    totalItems,
    first: `${identity.outbox}?page=1`,
    last: `${identity.outbox}?page=${Math.max(1, Math.ceil(totalItems / OUTBOX_PAGE_SIZE))}`,
  };
}

/** A page of an actor's outbox: Create activities (it authors them), newest first. */
export function buildOutboxPage(
  identity: ActorIdentity,
  articles: Article[],
  page: number,
  totalItems: number,
): OrderedCollectionPage {
  const totalPages = Math.max(1, Math.ceil(totalItems / OUTBOX_PAGE_SIZE));
  return {
    '@context': AS2_CONTEXT[0],
    id: `${identity.outbox}?page=${page}`,
    type: 'OrderedCollectionPage',
    partOf: identity.outbox,
    totalItems,
    ...(page < totalPages ? { next: `${identity.outbox}?page=${page + 1}` } : {}),
    ...(page > 1 ? { prev: `${identity.outbox}?page=${page - 1}` } : {}),
    orderedItems: articles.map((a) => buildCreateActivity(identity, a)),
  };
}

/** Items-per-page for the followers collection. */
export const FOLLOWERS_PAGE_SIZE = 20;

/** The head OrderedCollection for an actor's followers. */
export function buildFollowersCollection(
  identity: ActorIdentity,
  totalItems: number,
): OrderedCollection {
  return {
    '@context': AS2_CONTEXT[0],
    id: identity.followers,
    type: 'OrderedCollection',
    totalItems,
    first: `${identity.followers}?page=1`,
  };
}

/** A page of an actor's followers: actor ids. */
export function buildFollowersPage(
  identity: ActorIdentity,
  actorIds: string[],
  page: number,
  totalItems: number,
): OrderedCollectionPage {
  const totalPages = Math.max(1, Math.ceil(totalItems / FOLLOWERS_PAGE_SIZE));
  return {
    '@context': AS2_CONTEXT[0],
    id: `${identity.followers}?page=${page}`,
    type: 'OrderedCollectionPage',
    partOf: identity.followers,
    totalItems,
    ...(page < totalPages ? { next: `${identity.followers}?page=${page + 1}` } : {}),
    ...(page > 1 ? { prev: `${identity.followers}?page=${page - 1}` } : {}),
    orderedItems: actorIds,
  };
}

/** The empty `following` OrderedCollection (actors follow nobody). */
export function buildFollowingCollection(identity: ActorIdentity): OrderedCollection {
  return {
    '@context': AS2_CONTEXT[0],
    id: identity.following,
    type: 'OrderedCollection',
    totalItems: 0,
  };
}

/** Build the WebFinger JRD for a resolved actor handle. */
export function buildWebFinger(identity: ActorIdentity): WebFinger {
  return {
    subject: `acct:${identity.handle}`,
    aliases: [identity.actorId, identity.url],
    links: [
      {
        rel: 'self',
        type: ACTIVITY_JSON_TYPE,
        href: identity.actorId,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: identity.url,
      },
    ],
  };
}
