/**
 * The kinds of GWJ record that use a file, as GWJ registers them with Oxy Files
 * (`file_references.entity_type`, ADR 0041 D4). The entity id is always GWJ's
 * own id for the record. Growing this set is a migration: the reference tables
 * carry a CHECK rendered from it.
 *
 * - `article`: every file an article shows (hero image and its renditions, the
 *   images in its Markdown body, its `seo.ogImage`) OR that any of its revisions
 *   showed — a restorable revision keeps its images alive. Id: the article id.
 * - `ad_campaign`: the campaign's creative. Id: the campaign id.
 * - `social_card`: the branded card posted to one Instagram account for one
 *   article, kept while that post is recorded. Id: `<articleId>:<channel>`.
 * - `writer_portrait`: a roster writer's portrait. Id: the writer's fediverse
 *   username.
 */
export const MEDIA_ENTITY_TYPES = [
  'article',
  'ad_campaign',
  'social_card',
  'writer_portrait',
] as const;
export type MediaEntityType = (typeof MEDIA_ENTITY_TYPES)[number];

/** The `social_card` entity id of one article's post on one channel. */
export function socialCardEntityId(articleId: string, channel: string): string {
  return `${articleId}:${channel}`;
}

/** The article id and channel of a `social_card` entity id, or null when malformed. */
export function parseSocialCardEntityId(
  entityId: string,
): { articleId: string; channel: string } | null {
  const separator = entityId.indexOf(':');
  if (separator <= 0 || separator === entityId.length - 1) return null;
  return { articleId: entityId.slice(0, separator), channel: entityId.slice(separator + 1) };
}
