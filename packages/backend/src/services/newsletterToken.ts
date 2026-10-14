import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRecordId } from '../db/ids';

/** What a signed link lets its holder do. */
export type NewsletterTokenPurpose = 'confirm' | 'unsubscribe';

const SEPARATOR = '.';

function mac(secret: string, purpose: NewsletterTokenPurpose, id: string): string {
  return createHmac('sha256', secret).update(`newsletter:${purpose}:${id}`).digest('hex');
}

/**
 * A link token for subscriber `id`: `<id>.<hmac>`. Stateless and bound to one
 * purpose, so a confirmation link can never unsubscribe and vice versa. It does
 * not expire: an unsubscribe link in an old email must keep working.
 */
export function signNewsletterToken(
  secret: string,
  purpose: NewsletterTokenPurpose,
  id: string,
): string {
  return `${id}${SEPARATOR}${mac(secret, purpose, id)}`;
}

/** The subscriber id a token names, or null when it is malformed or not signed by us. */
export function verifyNewsletterToken(
  secret: string,
  purpose: NewsletterTokenPurpose,
  token: string,
): string | null {
  const [id, given, ...rest] = token.split(SEPARATOR);
  if (!id || !given || rest.length > 0 || !isRecordId(id)) return null;
  const expected = Buffer.from(mac(secret, purpose, id));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}
