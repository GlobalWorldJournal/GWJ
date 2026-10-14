import { z } from 'zod';
import { LanguageSchema, type Language } from './language';

/** Longest valid email address (RFC 5321). */
const EMAIL_MAX_LENGTH = 254;

/** Subscribe a reader to an edition's daily newsletter. */
export const NewsletterSubscribeInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
  language: LanguageSchema,
  /** Honeypot: a real reader never sees this field, so a filled value means a bot. */
  website: z.string().max(0).optional(),
});
export type NewsletterSubscribeInput = z.infer<typeof NewsletterSubscribeInputSchema>;

/** Always the same answer, whether or not the address was already known. */
export const NewsletterSubscribeResponseSchema = z.object({
  status: z.literal('pending_confirmation'),
});
export type NewsletterSubscribeResponse = z.infer<typeof NewsletterSubscribeResponseSchema>;

/** The signed token carried by confirmation and unsubscribe links. */
export const NewsletterTokenInputSchema = z.object({
  token: z.string().trim().min(1).max(200),
});
export type NewsletterTokenInput = z.infer<typeof NewsletterTokenInputSchema>;

export const NewsletterConfirmResponseSchema = z.object({
  status: z.enum(['confirmed', 'unsubscribed']),
  language: LanguageSchema,
});
export type NewsletterConfirmResponse = z.infer<typeof NewsletterConfirmResponseSchema>;

/** Whether the API is taking sign-ups now (email delivery is configured). */
export const NewsletterStatusResponseSchema = z.object({ accepting: z.boolean() });
export type NewsletterStatusResponse = z.infer<typeof NewsletterStatusResponseSchema>;

/** The local hour each edition's daily newsletter goes out. */
export const NEWSLETTER_SEND_HOUR = 7;

/** Each edition's newsletter goes out at {@link NEWSLETTER_SEND_HOUR} in this time zone. */
export const NEWSLETTER_TIME_ZONES: Record<Language, string> = {
  en: 'America/New_York',
  es: 'Europe/Madrid',
  fr: 'Europe/Paris',
};
