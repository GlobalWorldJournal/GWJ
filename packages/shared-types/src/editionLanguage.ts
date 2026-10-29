import type { Language } from './language';

/**
 * Common function words of each edition's language. A text in that language
 * is full of them; a text in another one has next to none. Adding an edition
 * to SUPPORTED_LANGUAGES requires its list here.
 */
const FUNCTION_WORDS: Record<Language, string> = {
  en:
    'the and of to in is are was were for with that this from by on as at after its his her their ' +
    'has have had will would be been not but over into than more says said who which an new amid ' +
    'against about',
  es:
    'el la los las de del que y en un una por para con se su sus al es son fue ha han más tras ' +
    'como pero sobre entre desde este esta lo sin muertos según también ya hasta contra durante',
  fr:
    'le la les de des du et en un une pour avec sur dans par au aux est sont été qui que ne pas ' +
    'plus ce cette ses son sa leur après selon entre contre lors morts blessés mais ont être où ' +
    'chez',
};
const LANGUAGES = Object.keys(FUNCTION_WORDS) as Language[];
const WORDS = Object.fromEntries(LANGUAGES.map((l) => [l, FUNCTION_WORDS[l].split(' ')])) as Record<
  Language,
  string[]
>;
// A word two languages share ("de", "la", "en") is evidence for neither.
const MARKERS = Object.fromEntries(
  LANGUAGES.map((l) => [
    l,
    new Set(WORDS[l].filter((w) => !LANGUAGES.some((o) => o !== l && WORDS[o].includes(w)))),
  ]),
) as Record<Language, Set<string>>;
/** The fewest marker words of another language that count as evidence at all. */
const MIN_EVIDENCE = 3;

/**
 * The language `text` is clearly written in when that is not `expected`, or
 * null when it agrees or is too short to tell. Deliberately conservative: it
 * takes several of another language's function words, and at least twice
 * (plus one) as many as the expected language's, so names, quoted phrases
 * and a foreign title or two never trip it.
 */
export function otherLanguageOf(text: string, expected: Language): Language | null {
  const counts = Object.fromEntries(LANGUAGES.map((l) => [l, 0])) as Record<Language, number>;
  for (const word of text
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .split(/[^\p{L}]+/u)) {
    for (const l of LANGUAGES) if (MARKERS[l].has(word)) counts[l] += 1;
  }
  let best = expected;
  for (const l of LANGUAGES) if (counts[l] > counts[best]) best = l;
  if (best === expected) return null;
  return counts[best] >= MIN_EVIDENCE && counts[best] >= 2 * counts[expected] + 1 ? best : null;
}

/** The reader-visible text of an article, by the field name an error should name. */
export type EditionText = Partial<
  Record<
    'title' | 'deck' | 'body' | 'heroImage.caption' | 'heroImage.alt' | 'seo.metaDescription',
    string | null
  >
>;

/** Each field of `text` written in another language than the edition's, with that language. */
export function wrongLanguageFields(
  text: EditionText,
  edition: Language,
): Array<{ field: keyof EditionText; language: Language }> {
  const wrong: Array<{ field: keyof EditionText; language: Language }> = [];
  for (const [field, value] of Object.entries(text) as Array<[keyof EditionText, string | null]>) {
    const language = value ? otherLanguageOf(value, edition) : null;
    if (language) wrong.push({ field, language });
  }
  return wrong;
}
