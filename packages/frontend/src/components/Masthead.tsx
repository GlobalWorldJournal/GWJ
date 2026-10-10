import { CATEGORIES } from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { categoryLabel } from '../lib/dictionary';

function todayDateline(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Centered serif masthead with dateline and a double rule beneath it. */
export function Masthead() {
  const { lang } = useLang();
  const sections = CATEGORIES.map((category) => categoryLabel(category, lang)).join(' · ');

  return (
    <header className="border-b border-ink bg-paper">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-2 text-center">
        <p className="label text-[0.625rem] text-muted">{todayDateline()}</p>
        <LocaleLink to="/" className="mt-1 inline-block">
          <h1 className="headline text-4xl font-black tracking-tight text-ink sm:text-5xl md:text-6xl">
            The Global World Journal
          </h1>
        </LocaleLink>
        <p className="label mt-1 text-[0.625rem] tracking-[0.18em] text-muted">{sections}</p>
      </div>
      <div className="rule-double mx-auto max-w-6xl" />
    </header>
  );
}
