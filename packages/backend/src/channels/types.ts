import type { Article, Language } from '@gwj/shared-types'

/** The distribution platforms the paper fans articles out to. */
export type ChannelPlatform = 'mastodon' | 'telegram' | 'whatsapp'

/**
 * A distribution channel that fans a freshly published article out to one external
 * destination (a Mastodon/fediverse presence, a specific Telegram channel, …).
 * Channels are the generalized replacement for the article→federation wiring: each
 * published article is routed to every channel whose language set matches the
 * article's edition, and each enabled channel publishes it on its own.
 *
 * Channels are language-scoped so the same platform can run several editions (e.g. a
 * Telegram channel per language) without per-app branching — the registry routes by
 * {@link PublishChannel.servesLanguage}.
 *
 * Contract:
 *  - `name` is a short, stable identifier used in per-channel log lines.
 *  - `platform` is the destination kind (for grouping/observability).
 *  - `servesLanguage(lang)` decides whether this channel handles an article's
 *    edition. A single-language channel returns true only for its language; an
 *    all-editions channel (e.g. Mastodon, whose per-edition actors handle each
 *    language) returns true for every language.
 *  - `isEnabled()` decides whether this channel runs for the current process
 *    (typically gated on the presence of its credentials/config). A disabled
 *    channel's `publish` is never called.
 *  - `publish(article)` performs the delivery. It SHOULD resolve even when the
 *    destination has nothing to do (e.g. no followers); it MAY reject on a real
 *    failure — the registry isolates each channel under `Promise.allSettled`, so a
 *    rejection from one channel never affects the others or the publish response.
 */
export interface PublishChannel {
  /** Short, stable identifier for this channel (used in logs). */
  readonly name: string
  /** The destination platform this channel delivers to. */
  readonly platform: ChannelPlatform
  /** Whether this channel handles articles in the given edition/language. */
  servesLanguage(language: Language): boolean
  /** Whether this channel is active in the current process (config/credentials present). */
  isEnabled(): boolean
  /** Distribute one published article to this channel's destination. */
  publish(article: Article): Promise<void>
}
