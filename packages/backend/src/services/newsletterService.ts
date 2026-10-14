import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Language, NewsletterSubscribeInput } from '@gwj/shared-types';
import { getDb } from '../db/client';
import { newRecordId } from '../db/ids';
import {
  newsletterSubscribers,
  type NewsletterSubscriberRow,
} from '../db/schema/newsletterSubscribers';
import { BadRequestError } from '../errors';
import type { EmailSender } from './emailSender';
import { newsletterPageUrl, renderConfirmationEmail } from './newsletterEmail';
import { signNewsletterToken, verifyNewsletterToken } from './newsletterToken';

/** A reader who asks again within this window is not mailed a second confirmation. */
const CONFIRMATION_COOLDOWN_MS = 10 * 60 * 1000;
const INVALID_LINK = 'This link is not valid.';

export interface NewsletterServiceConfig {
  sender: EmailSender;
  /** Signs the confirmation and unsubscribe links. */
  secret: string;
  /** The reader site's domain, for the links in emails. */
  domain: string;
}

/** The subscriber side of the newsletter: sign-up, confirmation, unsubscribing, batching. */
export interface NewsletterService {
  /** Start (or restart) a subscription; mails a confirmation link unless one just went out. */
  subscribe(input: NewsletterSubscribeInput, now?: Date): Promise<void>;
  confirm(token: string, now?: Date): Promise<{ language: Language }>;
  unsubscribe(token: string, now?: Date): Promise<{ language: Language }>;
  /**
   * Claim up to `limit` confirmed readers of `language` who have not had the issue
   * dated `issueDate` yet, marking them as having had it. Safe across backend
   * tasks (SKIP LOCKED); at most once per reader per day.
   */
  claimRecipients(
    language: Language,
    issueDate: string,
    limit: number,
  ): Promise<NewsletterSubscriberRow[]>;
  unsubscribeToken(id: string): string;
  config: NewsletterServiceConfig;
}

function languageOf(row: NewsletterSubscriberRow): Language {
  return row.language as Language;
}

export function createNewsletterService(config: NewsletterServiceConfig): NewsletterService {
  const { sender, secret, domain } = config;

  async function mailConfirmation(row: NewsletterSubscriberRow, now: Date): Promise<void> {
    if (!sender.enabled) return;
    const language = languageOf(row);
    const token = signNewsletterToken(secret, 'confirm', row.id);
    const url = `${newsletterPageUrl(domain, language, 'confirm')}?token=${encodeURIComponent(token)}`;
    await sender.send(renderConfirmationEmail(language, url, row.email));
    await getDb()
      .update(newsletterSubscribers)
      .set({ confirmationSentAt: now })
      .where(eq(newsletterSubscribers.id, row.id));
  }

  return {
    config,

    async subscribe(input, now = new Date()) {
      const db = getDb();
      const email = input.email.toLowerCase();
      const [created] = await db
        .insert(newsletterSubscribers)
        .values({
          id: newRecordId(now),
          email,
          language: input.language,
          status: 'pending',
          consentAt: now,
          createdAt: now,
        })
        .onConflictDoNothing({ target: newsletterSubscribers.email })
        .returning();
      if (created) {
        await mailConfirmation(created, now);
        return;
      }
      const [existing] = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.email, email));
      // Already confirmed: nothing to do, and nothing to reveal.
      if (!existing || existing.status === 'confirmed') return;
      const [restarted] = await db
        .update(newsletterSubscribers)
        .set({ status: 'pending', language: input.language, consentAt: now })
        .where(eq(newsletterSubscribers.id, existing.id))
        .returning();
      const last = existing.confirmationSentAt;
      const recentlyMailed =
        existing.status === 'pending' &&
        last !== null &&
        now.getTime() - last.getTime() < CONFIRMATION_COOLDOWN_MS;
      if (restarted && !recentlyMailed) await mailConfirmation(restarted, now);
    },

    async confirm(token, now = new Date()) {
      const id = verifyNewsletterToken(secret, 'confirm', token);
      if (!id) throw new BadRequestError(INVALID_LINK);
      const db = getDb();
      const [row] = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.id, id));
      // An unsubscribed reader is never re-subscribed by an old confirmation link.
      if (!row || row.status === 'unsubscribed') throw new BadRequestError(INVALID_LINK);
      if (row.status === 'pending') {
        await db
          .update(newsletterSubscribers)
          .set({ status: 'confirmed', confirmedAt: now })
          .where(
            and(eq(newsletterSubscribers.id, id), eq(newsletterSubscribers.status, 'pending')),
          );
      }
      return { language: languageOf(row) };
    },

    async unsubscribe(token, now = new Date()) {
      const id = verifyNewsletterToken(secret, 'unsubscribe', token);
      if (!id) throw new BadRequestError(INVALID_LINK);
      const [row] = await getDb()
        .update(newsletterSubscribers)
        .set({ status: 'unsubscribed', unsubscribedAt: now })
        .where(eq(newsletterSubscribers.id, id))
        .returning();
      if (!row) throw new BadRequestError(INVALID_LINK);
      return { language: languageOf(row) };
    },

    async claimRecipients(language, issueDate, limit) {
      const db = getDb();
      const due = db
        .select({ id: newsletterSubscribers.id })
        .from(newsletterSubscribers)
        .where(
          and(
            eq(newsletterSubscribers.status, 'confirmed'),
            eq(newsletterSubscribers.language, language),
            sql`(${newsletterSubscribers.lastIssueOn} is null or ${newsletterSubscribers.lastIssueOn} < ${issueDate})`,
          ),
        )
        .orderBy(newsletterSubscribers.id)
        .limit(limit)
        .for('update', { skipLocked: true });
      return db
        .update(newsletterSubscribers)
        .set({ lastIssueOn: issueDate })
        .where(inArray(newsletterSubscribers.id, due))
        .returning();
    },

    unsubscribeToken(id) {
      return signNewsletterToken(secret, 'unsubscribe', id);
    },
  };
}
