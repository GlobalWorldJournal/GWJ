import type { PrefixedLocale } from '../../../lib/locale';

/**
 * Closing sentence of every translated legal page (Privacy, Cookies, Terms):
 * the English text is the authoritative version. English pages carry no such
 * line, so the record covers the translated editions only.
 */
export const ENGLISH_PREVAILS: Readonly<Record<PrefixedLocale, string>> = {
  es: 'Este texto es una traducción; en caso de discrepancia, prevalecerá la versión original en inglés.',
  fr: 'Ce texte est une traduction\u00a0; en cas de divergence, la version originale en anglais prévaut.',
};

/** Date of the current revision of the legal pages (ISO `YYYY-MM-DD`). */
export const LEGAL_LAST_UPDATED = '2026-06-01';
