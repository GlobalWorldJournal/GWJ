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

export function isLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}
