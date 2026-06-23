import { DEFAULT_LANGUAGE, isLanguage, type Article, type Language } from '@gwj/shared-types'
import type { Env } from '../env'
import { logger } from '../logger'
import type { PublishChannel } from './types'

/** Telegram Bot API base. The bot token is appended as a path segment per their API. */
const TELEGRAM_API_BASE = 'https://api.telegram.org'

/** Abort an in-flight Telegram request after this long so a hung call never lingers. */
const TELEGRAM_TIMEOUT_MS = 10_000

/**
 * One Telegram channel binding: a single edition (`language`) delivered to one
 * `chatId`, authorized by the bot token read from `env` via `resolveToken`.
 *
 * This is DATA, not code: adding a language is a new entry here (plus its token env
 * var on the schema), never a new channel implementation. Today only the English
 * channel (`@GWJOfficial`, `TELEGRAM_BOT_TOKEN`) is configured; a Spanish channel is
 * a one-line addition, e.g.
 *   { language: 'es', resolveChatId: (env) => env.TELEGRAM_CHANNEL_ES, resolveToken: (env) => env.TELEGRAM_BOT_TOKEN_ES }
 */
interface TelegramChannelConfig {
  /** The single edition this Telegram channel serves. */
  readonly language: Language
  /** Resolve the target chat id (`@handle` or numeric) from validated env. */
  resolveChatId(env: Env): string
  /** Resolve the bot token from validated env; undefined → this channel is disabled. */
  resolveToken(env: Env): string | undefined
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
]

/**
 * Path prefix for an edition's public URLs: `''` for the default (English) edition,
 * `'/es'` / `'/fr'` otherwise. Mirrors the frontend reader's locale routing (the
 * canonical article URL on the apex is `/<lang>/article/<slug>`, English at the
 * root). Kept local to avoid importing the frontend (React) routing module.
 */
function localePrefix(language: Language): string {
  return language === DEFAULT_LANGUAGE ? '' : `/${language}`
}

/** Escape a string for safe interpolation into Telegram HTML (parse_mode: 'HTML'). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Build the canonical public article URL on the apex domain, language-prefixed to
 * match the reader route: `https://<domain><localePrefix>/article/<slug>`. The apex
 * comes from the SAME `FEDIVERSE_DOMAIN` config the ActivityPub identity uses, never
 * a hardcoded host.
 */
function articlePublicUrl(domain: string, language: Language, slug: string): string {
  return `https://${domain}${localePrefix(language)}/article/${slug}`
}

/**
 * Build the HTML caption for a Telegram post: a bold title, the deck (when present),
 * then a "Read: <url>" line pointing at the canonical apex article URL. Title and
 * deck are HTML-escaped; the URL is already a controlled value.
 */
function buildCaption(article: Article, url: string): string {
  const lines = [`<b>${escapeHtml(article.title)}</b>`]
  const deck = article.deck?.trim()
  if (deck && deck.length > 0) lines.push(escapeHtml(deck))
  lines.push(`Read: ${url}`)
  return lines.join('\n\n')
}

/** POST a JSON body to a Telegram Bot API method, logging a warning on a non-OK reply. */
async function callTelegram(
  token: string,
  method: 'sendPhoto' | 'sendMessage',
  payload: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS)
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      logger.warn('telegram publish non-ok response', { method, status: res.status, detail })
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Build one Telegram distribution channel from a {@link TelegramChannelConfig} entry.
 *
 * The channel serves exactly one edition (`servesLanguage` true only for its
 * language) and is gated on its token (`isEnabled()` = token present), so an
 * unconfigured edition is a no-op. With a hero image the post is a `sendPhoto`
 * (Telegram fetches the CDN URL); without one it is a `sendMessage`. Errors are
 * logged, not thrown — the registry isolates channels, and a delivery hiccup must
 * never affect the publish response.
 */
function buildTelegramChannel(env: Env, config: TelegramChannelConfig): PublishChannel {
  const token = config.resolveToken(env)
  const chatId = config.resolveChatId(env)
  const { language } = config

  return {
    name: `telegram:${language}`,
    platform: 'telegram',
    servesLanguage: (lang) => lang === language,
    isEnabled: () => Boolean(token),
    async publish(article: Article) {
      // Guarded by the registry (isEnabled + servesLanguage), but keep the guards so
      // a direct caller can't post without a token or to the wrong edition.
      if (!token) return
      const articleLanguage = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE
      if (articleLanguage !== language) return

      const url = articlePublicUrl(env.FEDIVERSE_DOMAIN, articleLanguage, article.slug)
      const caption = buildCaption(article, url)

      if (article.heroImage?.url) {
        await callTelegram(token, 'sendPhoto', {
          chat_id: chatId,
          photo: article.heroImage.url,
          caption,
          parse_mode: 'HTML',
        })
        return
      }

      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: caption,
        parse_mode: 'HTML',
      })
    },
  }
}

/**
 * Build every configured Telegram channel (one per edition in
 * {@link TELEGRAM_CHANNELS}). Each self-disables when its token env var is absent,
 * so today only the English channel is active until `TELEGRAM_BOT_TOKEN` is set.
 */
export function telegramChannels(env: Env): PublishChannel[] {
  return TELEGRAM_CHANNELS.map((config) => buildTelegramChannel(env, config))
}
