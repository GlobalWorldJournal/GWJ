import { z } from 'zod'

/**
 * Editions/languages the paper publishes in. English is the default edition.
 * Extend this tuple to add an edition; everything else (filtering, the switcher,
 * SEO locale) derives from it.
 */
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr'] as const

export const LanguageSchema = z.enum(SUPPORTED_LANGUAGES)
export type Language = z.infer<typeof LanguageSchema>

export const DEFAULT_LANGUAGE: Language = 'en'

/** Native display name per edition (for the switcher). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
}

/** BCP-47 / Open Graph locale per edition (e.g. for <html lang> and og:locale). */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  en: 'en_US',
  es: 'es_ES',
  fr: 'fr_FR',
}

/**
 * Default fediverse username for each edition's ActivityPub actor. The handle is
 * `@<username>@<domain>`, so usernames are plain lowercase letters only (no
 * hyphens/dots/symbols). The backend may override this map via env, but these are
 * the canonical defaults: en→`news`, es→`noticias`, fr→`actualites`.
 */
export const DEFAULT_EDITION_USERNAMES: Record<Language, string> = {
  en: 'news',
  es: 'noticias',
  fr: 'actualites',
}

export function isLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/**
 * The URL path prefix for an edition: `''` for the default (English) root edition,
 * `'/es'` / `'/fr'` otherwise. Single source of truth for the reader's locale
 * routing — consumed by the frontend router and by the backend when it builds
 * reader-facing article URLs, so the editions never drift apart.
 */
export function localePrefix(language: Language): string {
  return language === DEFAULT_LANGUAGE ? '' : `/${language}`
}

/**
 * Canonical public reader URL for an article on a site domain, language-prefixed
 * to match the reader route: `https://<domain><localePrefix>/article/<slug>`.
 */
export function articlePublicUrl(domain: string, language: Language, slug: string): string {
  return `https://${domain}${localePrefix(language)}/article/${slug}`
}
