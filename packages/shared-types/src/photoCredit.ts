/**
 * Photo credits copied from another outlet's caption ("… © Ludovic MARIN / AFP",
 * "(AP Photo/Hadi Mizban)", "Brendan McDermid | Reuters", "Foto: EFE"). GWJ
 * prints no credit lines, so they are removed wherever a caption or a body is
 * written, and by restore for history recorded before the rule.
 */

/** The label a credit starts with when it has one: "Foto:", "Photograph:", "(Crédit photo :", "Source:"… */
const CREDIT_LABEL = String.raw`(?:photo(?:graph)?(?:\s+credit)?|foto(?:graf[ií]a)?|cr[ée]dits?(?:\s+photo)?|cr[ée]dito(?:\s+de\s+la\s+foto)?|source|fuente)`;
const LABELLED_TAIL = new RegExp(
  String.raw`\s*\|?\s*[(\[]?\s*${CREDIT_LABEL}\s*:[^()\[\]\n]*[)\]]?\s*\.?\s*$`,
  'i',
);
const LABELLED_LINE = new RegExp(String.raw`^[ \t]*[_*]*${CREDIT_LABEL}[ \t]*:[^\n]*$\n?`, 'gim');
/** "FILE PHOTO: A trader works…" */
const LEADING_LABEL = /^\s*(?:file\s+photo|photo\s+d['’]archive|foto\s+de\s+archivo)\s*:\s*/i;
const COPYRIGHT_TAIL = /\s*©[^©\n]*$/;
const BRACKETED_TAIL = /\s*[([]([^()[\]\n]*)[)\]]\s*\.?\s*$/;
/** Where a credit can begin after the caption proper: a sentence end or a "|" separator. */
const SEGMENT_START = /[.!?…»"”]\s+|\s*\|\s*/g;

/** A word every credit carries: an agency or picture desk, or "photo" itself. */
const CREDIT_MARK =
  /\b(?:AP|AFP|EFE|EPA|DPA|Reuters|Getty|Europa Press|Bloomberg|Xinhua|Corbis|Adobe Stock|Shutterstock|SOPA Images|LightRocket|IMAGN|Pool|Anadolu|Sipa|Abaca|photo(?:graph(?:y|ie)?)?|foto(?:graf[ií]a|gr[aá]fico)?|cr[ée]dits?|cr[ée]dito)\b/i;
/** The only lowercase words a credit holds besides names: "Photo by X via Y", "Foto de archivo de X". */
const CREDIT_GLUE = new Set([
  'by',
  'par',
  'de',
  'del',
  'la',
  'le',
  'les',
  'des',
  'du',
  'da',
  'di',
  'van',
  'von',
  'der',
  'den',
  'ven',
  'y',
  'et',
  'and',
  'via',
  'vía',
  'for',
  'pour',
  'para',
  'por',
  'a',
  'través',
  'file',
  'archivo',
  'archive',
  "d'archive",
  'd’archive',
  'fichier',
  'staff',
  'photo',
  'foto',
  'fotográfico',
  'photographie',
  'images',
  'stock',
  'news',
]);
const CREDIT_SEPARATORS = /[\s/|,—–·&+()[\]:-]+/;
/** A sentence break inside the text ("Paris. Photo…"), as opposed to an initial ("Robert F. Bukaty"). */
const SENTENCE_BREAK = /\p{L}{2}\.\s/u;
const MAX_CREDIT_LENGTH = 160;

/** Whether `text` is nothing but a credit: names, agencies and the glue words between them. */
function isCredit(text: string): boolean {
  const t = text.trim().replace(/\.$/, '');
  if (!t || t.length > MAX_CREDIT_LENGTH || !CREDIT_MARK.test(t) || SENTENCE_BREAK.test(t)) {
    return false;
  }
  return t
    .split(CREDIT_SEPARATORS)
    .map((w) => w.replace(/^["'“‘]+|["'”’.]+$/g, ''))
    .every((w) => w === '' || /^\p{Lu}[\p{L}.'’]*$/u.test(w) || CREDIT_GLUE.has(w.toLowerCase()));
}

/** The caption with a trailing credit removed, or the caption unchanged. */
function stripOneCredit(caption: string): string {
  const labelled = caption.replace(LABELLED_TAIL, '');
  if (labelled !== caption) return labelled;
  const copyright = caption.replace(COPYRIGHT_TAIL, '');
  if (copyright !== caption) return copyright;
  const bracketed = BRACKETED_TAIL.exec(caption);
  if (bracketed && isCredit(bracketed[1] ?? '')) return caption.slice(0, bracketed.index);
  // The earliest point from which the rest is only a credit: "… 2026. Photo by Robert F. Bukaty/AP."
  const starts = [0, ...Array.from(caption.matchAll(SEGMENT_START), (m) => m.index + m[0].length)];
  for (const start of starts) {
    if (isCredit(caption.slice(start))) {
      return caption.slice(0, start).replace(/\s*\|\s*$/, '');
    }
  }
  return caption;
}

/** A caption without the photo credit an outlet appended to it (or prefixed: "FILE PHOTO: …"). */
export function stripPhotoCredit(caption: string): string {
  let current = caption.replace(LEADING_LABEL, '');
  for (let next = stripOneCredit(current); next !== current; next = stripOneCredit(current)) {
    current = next.trim();
  }
  return current.trim();
}

/** A body without its credit-only lines ("Source: Reuters", "_(AP Photo/Hadi Mizban)_"). */
export function stripCreditLines(body: string): string {
  return body
    .replace(LABELLED_LINE, '')
    .split('\n')
    .filter((line) => {
      const core = line.trim().replace(/^[_*]+|[_*]+$/g, '');
      if (/^[#>|-]/.test(core)) return true;
      const unbracketed = core.replace(/^[([](.*)[)\]]\.?$/, '$1').replace(/^©\s*/, '');
      return !(core.startsWith('©') || isCredit(unbracketed));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
