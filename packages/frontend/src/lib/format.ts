import { LANGUAGE_LOCALES, type Language } from '@gwj/shared-types';

/** Average adult silent-reading speed, for "N min read". */
const WORDS_PER_MINUTE = 230;
/** An edit this soon after publication is part of publishing, not an update. */
const UPDATE_THRESHOLD_MS = 10 * 60 * 1000;

/** The BCP 47 tag for an edition (`es_ES` → `es-ES`), for Intl formatters. */
function bcp47(lang: Language): string {
  return LANGUAGE_LOCALES[lang].replace('_', '-');
}

/** "October 10, 2026" / "10 de octubre de 2026" / "10 octobre 2026". */
export function formatDate(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(bcp47(lang), { dateStyle: 'long' }).format(date);
}

/** Date and time, for "Updated …". */
export function formatDateTime(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(bcp47(lang), { dateStyle: 'long', timeStyle: 'short' }).format(
    date,
  );
}

/** Whole minutes to read a Markdown body (never less than one). */
export function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Whether a story was materially updated after it went live. */
export function wasUpdated(publishedAt: string | null | undefined, updatedAt: string): boolean {
  if (!publishedAt) return false;
  return Date.parse(updatedAt) - Date.parse(publishedAt) > UPDATE_THRESHOLD_MS;
}

/** The public URL of a roster writer's portrait on the media CDN, if configured. */
export function writerPortraitUrl(avatarPath: string): string | null {
  const base = import.meta.env.VITE_CDN_BASE_URL;
  return base ? `${base.replace(/\/$/, '')}/${avatarPath}` : null;
}
