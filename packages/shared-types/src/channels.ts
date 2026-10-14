/**
 * Public distribution channels for The Global World Journal. The paper fans each
 * published article out to these (in addition to on-site): Mastodon/fediverse is
 * live; Telegram is the audience-follow channel (no email). WhatsApp is planned.
 * Single source of truth for the public handles/URLs used by the frontend CTAs
 * and the backend channel publishers.
 */
export const TELEGRAM_CHANNEL_HANDLE = '@GWJOfficial';
export const TELEGRAM_CHANNEL_URL = 'https://t.me/GWJOfficial';
/** Spanish edition's own Telegram channel — same bot as the English one, different chat. */
export const TELEGRAM_CHANNEL_HANDLE_ES = '@gwj_ES';
export const TELEGRAM_CHANNEL_URL_ES = 'https://t.me/gwj_ES';
/** The Telegram channel an edition's readers should follow: Spanish has its own, the rest share the main one. */
export function telegramChannelFor(language: string): { handle: string; url: string } {
  return language === 'es'
    ? { handle: TELEGRAM_CHANNEL_HANDLE_ES, url: TELEGRAM_CHANNEL_URL_ES }
    : { handle: TELEGRAM_CHANNEL_HANDLE, url: TELEGRAM_CHANNEL_URL };
}
/** The paper's profile on Mention. */
export const MENTION_HANDLE = '@gwj';
export const MENTION_PROFILE_URL = 'https://mention.earth/@gwj';

/**
 * The paper's IndexNow key. Public by protocol design: search engines fetch it
 * from `https://<domain>/<key>.txt` (a file of that name in the frontend's
 * `public/`) to confirm the site owner is the one submitting URLs.
 */
export const INDEXNOW_KEY = '533cb13785854db187b7fabbbf7f7117';

/** The IndexNow endpoint; Bing, Yandex, Naver, Seznam and Yep share submissions. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
