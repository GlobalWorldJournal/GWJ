import type { Article, Language } from '@gwj/shared-types';

/** The distribution platforms the paper fans articles out to. */
export type ChannelPlatform = 'mastodon' | 'telegram' | 'whatsapp';

/** Context for one delivery, from the distribution job that runs it. */
export interface DeliveryContext {
  /** Unique per publication, stable across retries of it (the job's id). */
  deliveryId: number;
}

/**
 * A distribution channel: one external destination (a Mastodon/fediverse
 * presence, a specific Telegram channel, …) that the paper's articles are posted
 * to, kept in line with edits, and taken down from.
 *
 * Channels are language-scoped so the same platform can run several editions (e.g. a
 * Telegram channel per language) without per-app branching — the registry routes by
 * {@link PublishChannel.servesLanguage}.
 *
 * Every call comes from a job of the distribution outbox (outbox.ts), one job per
 * channel, so a failing channel never affects the others. Each method SHOULD
 * resolve when there is nothing to do (no followers, a post already gone) and
 * MUST reject on a failure worth retrying — the outbox retries the job with
 * backoff, so a method must also be safe to run again for the same job.
 *
 *  - `name` is a short, stable identifier (job rows and log lines carry it).
 *  - `platform` is the destination kind (for grouping/observability).
 *  - `servesLanguage(lang)` decides whether this channel handles an edition.
 *  - `isEnabled()` decides whether this channel runs in this process (typically
 *    gated on its credentials). A disabled channel is never given a job.
 */
export interface PublishChannel {
  /** Short, stable identifier for this channel. */
  readonly name: string;
  /** The destination platform this channel delivers to. */
  readonly platform: ChannelPlatform;
  /** Whether this channel handles articles in the given edition/language. */
  servesLanguage(language: Language): boolean;
  /** Whether this channel is active in the current process (config/credentials present). */
  isEnabled(): boolean;
  /**
   * Post one published article. Returning a `ref` (whatever the channel needs to
   * find the post again) records the delivery, so it can later be updated and
   * retracted; returning nothing records nothing.
   */
  publish(article: Article, context: DeliveryContext): Promise<Record<string, unknown> | void>;
  /**
   * Bring a delivered post in line with the article after a visible change
   * (headline, image, correction…), given the `ref` `publish` returned.
   * Optional — a channel without it keeps the original post.
   */
  update?(article: Article, ref: Record<string, unknown>): Promise<void>;
  /**
   * Take a delivered post down, given the `ref` `publish` returned. Optional — a
   * channel without it never retracts.
   */
  retract?(ref: Record<string, unknown>): Promise<void>;
}
