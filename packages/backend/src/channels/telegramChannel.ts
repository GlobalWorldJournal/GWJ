import {
  DEFAULT_LANGUAGE,
  articlePublicUrl,
  isLanguage,
  type Article,
  type Language,
} from '@gwj/shared-types';
import type { Env } from '../env';
import { escapeHtml } from '../activitypub/documents';
import { logger } from '../logger';
import type { PublishChannel } from './types';

/** Telegram Bot API base. The bot token is appended as a path segment per their API. */
const TELEGRAM_API_BASE = 'https://api.telegram.org';

/** Abort an in-flight Telegram request after this long so a hung call never lingers. */
const TELEGRAM_TIMEOUT_MS = 10_000;

/**
 * One Telegram channel binding: a single edition (`language`) delivered to one
 * `chatId`, authorized by the bot token read from `env` via `resolveToken`.
 *
 * This is DATA, not code: adding a language is a new entry here (plus its chat id
 * env var on the schema). English (`@GWJOfficial`) and Spanish (`@gwj_ES`) are both
 * configured today, sharing the one bot (`TELEGRAM_BOT_TOKEN`) added as admin to
 * both channels — a French channel would be the same one-line pattern.
 */
interface TelegramChannelConfig {
  /** The single edition this Telegram channel serves. */
  readonly language: Language;
  /** Resolve the target chat id (`@handle` or numeric) from validated env. */
  resolveChatId(env: Env): string;
  /** Resolve the bot token from validated env; undefined → this channel is disabled. */
  resolveToken(env: Env): string | undefined;
}

/**
 * The configured Telegram channels, one per edition. The English channel posts to
 * the canonical public handle and is authorized by `TELEGRAM_BOT_TOKEN`. Extend this
 * list (and the env schema) to add another language's channel.
 */
const TELEGRAM_CHANNELS: readonly TelegramChannelConfig[] = [
  {
    language: 'en',
    resolveChatId: (env) => env.TELEGRAM_CHANNEL,
    resolveToken: (env) => env.TELEGRAM_BOT_TOKEN,
  },
  {
    // Same bot as the English channel (TELEGRAM_BOT_TOKEN) — one bot, added as
    // admin to both channels, rather than a second BotFather bot to manage.
    language: 'es',
    resolveChatId: (env) => env.TELEGRAM_CHANNEL_ES,
    resolveToken: (env) => env.TELEGRAM_BOT_TOKEN,
  },
];

/**
 * Build the HTML caption for a Telegram post: a bold title, the deck (when present),
 * then a "Read: <url>" line pointing at the canonical apex article URL. Title and
 * deck are HTML-escaped; the URL is already a controlled value.
 */
function buildCaption(article: Article, url: string): string {
  const lines = [`<b>${escapeHtml(article.title)}</b>`];
  const deck = article.deck?.trim();
  if (deck && deck.length > 0) lines.push(escapeHtml(deck));
  lines.push(`Read: ${url}`);
  return lines.join('\n\n');
}

/** How a post was sent, which decides how it can be edited. */
type TelegramPostKind = 'photo' | 'text';

/** What a delivered post is recorded as: enough to edit or delete it later. */
interface TelegramMessageRef {
  chatId: number;
  messageId: number;
  kind?: TelegramPostKind;
}

type TelegramMethod =
  | 'sendPhoto'
  | 'sendMessage'
  | 'editMessageMedia'
  | 'editMessageText'
  | 'deleteMessage';

/**
 * Telegram refusals that mean the work is already done — the post is gone, or
 * already reads what an edit would make it read. Matched on the API's
 * `description`, the only place Telegram says which 400 it is.
 */
const SETTLED_ERRORS: readonly RegExp[] = [
  /message to delete not found/i,
  /message to edit not found/i,
  /message is not modified/i,
];

/** A failed Telegram call (non-OK reply, timeout, network). The outbox retries it. */
export class TelegramError extends Error {
  constructor(
    readonly method: TelegramMethod,
    message: string,
  ) {
    super(`telegram ${method}: ${message}`);
    this.name = 'TelegramError';
  }
}

/**
 * POST a JSON body to a Telegram Bot API method and resolve its `result` — or
 * `undefined` when Telegram answers with a {@link SETTLED_ERRORS} refusal.
 * Rejects with a {@link TelegramError} on any other failure (non-OK reply,
 * timeout, network) so the distribution job is retried.
 */
async function callTelegram(
  token: string,
  method: TelegramMethod,
  payload: Record<string, unknown>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch (err) {
    throw new TelegramError(method, err instanceof Error ? err.message : String(err));
  }
  const body = (await res.json().catch(() => undefined)) as
    | { ok?: boolean; result?: unknown; description?: unknown }
    | undefined;
  if (res.ok && body?.ok !== false) return body?.result;
  const description = typeof body?.description === 'string' ? body.description : '';
  if (SETTLED_ERRORS.some((pattern) => pattern.test(description))) {
    logger.info('telegram: nothing left to do', { method, description });
    return undefined;
  }
  throw new TelegramError(method, `HTTP ${res.status} ${description}`.trim());
}

/** Read `{ chatId, messageId }` out of a `send*` reply's `result` object. */
function parseMessageRef(result: unknown): Omit<TelegramMessageRef, 'kind'> | undefined {
  const messageId = (result as { message_id?: unknown } | undefined)?.message_id;
  const chatId = (result as { chat?: { id?: unknown } } | undefined)?.chat?.id;
  if (typeof messageId !== 'number' || typeof chatId !== 'number') return undefined;
  return { chatId, messageId };
}

function isTelegramRef(
  ref: Record<string, unknown>,
): ref is Record<string, unknown> & TelegramMessageRef {
  return (
    typeof ref.chatId === 'number' &&
    typeof ref.messageId === 'number' &&
    (ref.kind === undefined || ref.kind === 'photo' || ref.kind === 'text')
  );
}

/**
 * Build one Telegram distribution channel from a {@link TelegramChannelConfig} entry.
 *
 * The channel serves exactly one edition (`servesLanguage` true only for its
 * language) and is gated on its token (`isEnabled()` = token present), so an
 * unconfigured edition is a no-op. With a hero image the post is a `sendPhoto`
 * (Telegram fetches the CDN URL); without one it is a `sendMessage`. An update
 * edits the post in place (photo and caption, or text) — or replaces it with a
 * text post when the image is gone; a retraction deletes it.
 */
function buildTelegramChannel(env: Env, config: TelegramChannelConfig): PublishChannel {
  const token = config.resolveToken(env);
  const chatId = config.resolveChatId(env);
  const { language } = config;

  const captionFor = (article: Article): string =>
    buildCaption(article, articlePublicUrl(env.FEDIVERSE_DOMAIN, language, article.slug));

  /** Post an article: a photo with a caption when it has a hero image, else text. */
  const send = async (botToken: string, article: Article): Promise<Record<string, unknown>> => {
    const caption = captionFor(article);
    const kind: TelegramPostKind = article.heroImage?.url ? 'photo' : 'text';
    const method = kind === 'photo' ? 'sendPhoto' : 'sendMessage';
    const result = await callTelegram(
      botToken,
      method,
      kind === 'photo'
        ? { chat_id: chatId, photo: article.heroImage?.url, caption, parse_mode: 'HTML' }
        : { chat_id: chatId, text: caption, parse_mode: 'HTML' },
    );
    const ref = parseMessageRef(result);
    if (!ref) throw new TelegramError(method, 'no message in the reply');
    return { ...ref, kind };
  };

  return {
    name: `telegram:${language}`,
    platform: 'telegram',
    servesLanguage: (lang) => lang === language,
    isEnabled: () => Boolean(token),
    async publish(article: Article) {
      // Guarded by the registry (isEnabled + servesLanguage), but keep the guards so
      // a direct caller can't post without a token or to the wrong edition.
      if (!token) return;
      const articleLanguage = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE;
      if (articleLanguage !== language) return;
      return send(token, article);
    },
    async update(article: Article, ref: Record<string, unknown>) {
      if (!token || !isTelegramRef(ref)) return;
      const target = { chat_id: ref.chatId, message_id: ref.messageId };
      const caption = captionFor(article);
      const heroUrl = article.heroImage?.url;
      if (!heroUrl && ref.kind !== 'text') {
        // The image left the article (a takedown, an edit), but Telegram cannot
        // take a photo off a message: replace the post with a text one. The old
        // one goes first, so a retry never leaves two posts up.
        await callTelegram(token, 'deleteMessage', target);
        return send(token, article);
      }
      if (ref.kind === 'text') {
        await callTelegram(token, 'editMessageText', {
          ...target,
          text: caption,
          parse_mode: 'HTML',
        });
      } else if (ref.kind === 'photo') {
        await callTelegram(token, 'editMessageMedia', {
          ...target,
          media: { type: 'photo', media: heroUrl, caption, parse_mode: 'HTML' },
        });
      } else {
        // Recorded before posts carried their kind: which edit applies is unknown.
        logger.info('telegram: post predates edits; left as posted', { messageId: ref.messageId });
      }
    },
    async retract(ref: Record<string, unknown>) {
      if (!token || !isTelegramRef(ref)) return;
      await callTelegram(token, 'deleteMessage', {
        chat_id: ref.chatId,
        message_id: ref.messageId,
      });
    },
  };
}

/**
 * Build every configured Telegram channel (one per edition in
 * {@link TELEGRAM_CHANNELS}). Each self-disables when its token env var is absent,
 * so today only the English channel is active until `TELEGRAM_BOT_TOKEN` is set.
 */
export function telegramChannels(env: Env): PublishChannel[] {
  return TELEGRAM_CHANNELS.map((config) => buildTelegramChannel(env, config));
}
