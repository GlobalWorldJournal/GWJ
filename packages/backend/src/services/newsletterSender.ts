import {
  NEWSLETTER_SEND_HOUR,
  NEWSLETTER_TIME_ZONES,
  SUPPORTED_LANGUAGES,
  type Article,
  type Language,
} from '@gwj/shared-types';
import { errorFields, logger } from '../logger';
import type { ArticleService } from './articleService';
import type { EmailSender } from './emailSender';
import { DIGEST_MAX_STORIES, newsletterPageUrl, renderDigestEmail } from './newsletterEmail';
import type { NewsletterService } from './newsletterService';

/** How often the sender looks for an issue that is due. */
export const NEWSLETTER_INTERVAL_MS = 60_000;
/** An issue goes out from the send hour for this many hours, then that day is skipped. */
export const NEWSLETTER_WINDOW_HOURS = 5;
/** Only stories this fresh make an issue: it is a morning briefing, not an archive. */
const FRESH_HOURS = 36;
/** Fewer fresh stories than this and the day's issue is not worth sending. */
const MIN_STORIES = 3;
const BATCH_SIZE = 50;
const SEND_CONCURRENCY = 10;
const HOUR_MS = 60 * 60 * 1000;

export interface NewsletterSenderDeps {
  service: NewsletterService;
  sender: EmailSender;
  articles: Pick<ArticleService, 'list'>;
  /** The API's public origin, for the one-click unsubscribe endpoint. */
  apiBaseUrl: string;
}

/** The edition-local calendar date (`YYYY-MM-DD`) and hour (0–23) of `now`. */
export function localTime(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

async function freshStories(
  articles: Pick<ArticleService, 'list'>,
  language: Language,
  now: Date,
): Promise<Article[]> {
  const { data } = await articles.list({
    language,
    sort: 'latest',
    page: 1,
    limit: DIGEST_MAX_STORIES,
  });
  const since = now.getTime() - FRESH_HOURS * HOUR_MS;
  return data.filter((a) => a.publishedAt !== null && Date.parse(a.publishedAt) >= since);
}

/**
 * Send today's issue of every edition that is due: it is the edition's send hour
 * (in its own time zone), within the window, and there are fresh stories. Returns
 * how many readers each edition mailed. A reader is claimed before the send, so a
 * crash or a refused address loses that reader's issue rather than repeating it.
 */
export async function sendDueIssues(
  deps: NewsletterSenderDeps,
  now: Date = new Date(),
): Promise<Array<{ language: Language; sent: number; failed: number }>> {
  const results: Array<{ language: Language; sent: number; failed: number }> = [];
  if (!deps.sender.enabled) return results;
  const { domain } = deps.service.config;
  for (const language of SUPPORTED_LANGUAGES) {
    const { date, hour } = localTime(now, NEWSLETTER_TIME_ZONES[language]);
    if (hour < NEWSLETTER_SEND_HOUR || hour >= NEWSLETTER_SEND_HOUR + NEWSLETTER_WINDOW_HOURS) {
      continue;
    }
    const stories = await freshStories(deps.articles, language, now);
    if (stories.length < MIN_STORIES) continue;
    let sent = 0;
    let failed = 0;
    for (;;) {
      const batch = await deps.service.claimRecipients(language, date, BATCH_SIZE);
      if (batch.length === 0) break;
      for (let i = 0; i < batch.length; i += SEND_CONCURRENCY) {
        const outcomes = await Promise.allSettled(
          batch.slice(i, i + SEND_CONCURRENCY).map(async (reader) => {
            const token = encodeURIComponent(deps.service.unsubscribeToken(reader.id));
            await deps.sender.send(
              renderDigestEmail({
                language,
                articles: stories,
                domain,
                to: reader.email,
                unsubscribePageUrl: `${newsletterPageUrl(domain, language, 'unsubscribe')}?token=${token}`,
                unsubscribeApiUrl: `${deps.apiBaseUrl}/api/newsletter/unsubscribe?token=${token}`,
              }),
            );
          }),
        );
        for (const outcome of outcomes) {
          if (outcome.status === 'fulfilled') sent += 1;
          else {
            failed += 1;
            logger.error('newsletter send failed', errorFields(outcome.reason));
          }
        }
      }
    }
    if (sent + failed > 0) results.push({ language, sent, failed });
  }
  return results;
}

/** Run {@link sendDueIssues} every `intervalMs`; a tick never overlaps the previous one. */
export function startNewsletterSender(
  deps: NewsletterSenderDeps,
  intervalMs: number = NEWSLETTER_INTERVAL_MS,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sendDueIssues(deps)
      .then((issues) => {
        for (const issue of issues) logger.info('newsletter issue sent', issue);
      })
      .catch((err: unknown) => logger.error('newsletter tick failed', errorFields(err)))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
