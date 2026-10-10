import { CATEGORIES, DEFAULT_LANGUAGE, LANGUAGE_NAMES } from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { categoryLabel } from '../lib/dictionary';
import { formatDateline } from '../lib/format';

/** Centered serif masthead with dateline and a double rule beneath it. */
export function Masthead({ isFrontPage }: { isFrontPage: boolean }) {
  const { lang } = useLang();
  const Wordmark = isFrontPage ? 'h1' : 'p';
  const sections = CATEGORIES.map((category) => categoryLabel(category, lang)).join(' · ');
  // English is the default/primary edition and needs no label of its own, the
  // way a paper's home edition goes unmarked while its other editions (WSJ
  // Europe, WSJ Asia, ...) carry one — es/fr do, by their own native name.
  const edition = lang === DEFAULT_LANGUAGE ? null : LANGUAGE_NAMES[lang];

  return (
    <header className="border-b border-ink bg-paper">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-2 text-center">
        <p className="label text-[0.625rem] text-muted">{formatDateline(new Date(), lang)}</p>
        <LocaleLink to="/" className="mt-1 inline-block">
          <Wordmark className="headline text-4xl font-black tracking-tight text-ink sm:text-5xl md:text-6xl">
            The Global World Journal
            {edition ? (
              <span className="label ml-2 align-super text-[0.625rem] font-normal tracking-[0.1em] text-accent sm:text-[0.6875rem]">
                {edition.toUpperCase()}
              </span>
            ) : null}
          </Wordmark>
        </LocaleLink>
        <p className="label mt-1 text-[0.625rem] tracking-[0.18em] text-muted">{sections}</p>
      </div>
      <div className="rule-double mx-auto max-w-6xl" />
    </header>
  );
}
