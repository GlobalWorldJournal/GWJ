import { useRef, useState } from 'react';
import { CATEGORIES, categorySlug, type Category } from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { LocaleLink, LocaleNavLink } from '../lib/locale';
import { categoryLabel, subtopics } from '../lib/dictionary';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SearchIcon } from './SearchIcon';
import { useNewsletterAccepting } from '../lib/useNewsletterAccepting';

const NAV_LINK_BASE = 'label text-[0.75rem] tracking-[0.06em] transition-colors hover:text-accent';

function activeClass(isActive: boolean): string {
  return isActive ? 'text-accent' : 'text-ink';
}

/** Section navigation: 7 categories + a search icon. Desktop hover mega-menu; mobile drawer. */
export function SectionNav() {
  const { lang, t } = useLang();
  const newsletterOpen = useNewsletterAccepting();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<Category | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <nav
      className="sticky top-0 z-20 border-b border-ink bg-paper"
      onMouseLeave={() => setHovered(null)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setHovered(null);
        if (open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          <button
            ref={toggleRef}
            type="button"
            className="label text-[0.75rem] text-ink md:hidden"
            aria-expanded={open}
            aria-controls="section-drawer"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? t('close') : t('sections')}
          </button>

          {/* Compact GWJ logo / monogram — the wordmark is "The Global World Journal".
              Centered on mobile (absolute centering), static next to the section
              links on desktop. */}
          <LocaleLink
            to="/"
            aria-label={t('homeLink')}
            className="headline absolute left-1/2 -translate-x-1/2 text-lg font-black tracking-tight text-ink md:static md:translate-x-0"
          >
            GWJ
          </LocaleLink>

          <ul className="hidden items-center gap-5 md:flex">
            {CATEGORIES.map((category) => (
              <li key={category} onMouseEnter={() => setHovered(category)}>
                <LocaleNavLink
                  to={`/${categorySlug(category)}`}
                  className={({ isActive }) =>
                    `${NAV_LINK_BASE} ${activeClass(isActive || hovered === category)}`
                  }
                >
                  {categoryLabel(category, lang)}
                </LocaleNavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-4" onMouseEnter={() => setHovered(null)}>
          {newsletterOpen ? (
            <LocaleLink
              to="/newsletters"
              className="label hidden text-[0.75rem] tracking-[0.06em] text-accent transition-colors hover:text-ink md:inline"
            >
              {t('newsletterNavLink')}
            </LocaleLink>
          ) : null}
          <LanguageSwitcher />
          <LocaleNavLink
            to="/search"
            aria-label={t('search')}
            title={t('search')}
            className={({ isActive }) =>
              `inline-flex items-center p-1 transition-colors hover:text-accent ${activeClass(isActive)}`
            }
          >
            <SearchIcon className="h-[1.125rem] w-[1.125rem]" />
          </LocaleNavLink>
        </div>
      </div>

      {/* Desktop hover mega-menu */}
      {hovered ? (
        <div className="absolute inset-x-0 top-full hidden border-b border-ink bg-paper shadow-[0_12px_24px_rgba(0,0,0,0.08)] md:block">
          <div className="mx-auto max-w-6xl px-4 py-6">
            <div className="mb-3 flex items-baseline justify-between border-b border-rule pb-2">
              <LocaleLink
                to={`/${categorySlug(hovered)}`}
                className="headline text-2xl text-ink transition-colors hover:text-accent"
              >
                {categoryLabel(hovered, lang)}
              </LocaleLink>
              <LocaleLink
                to={`/${categorySlug(hovered)}`}
                className="label text-[0.6875rem] text-accent transition-colors hover:text-ink"
              >
                {t('allOf', { x: categoryLabel(hovered, lang) })}
              </LocaleLink>
            </div>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {subtopics(hovered, lang).map((topic) => (
                <li key={topic}>
                  <LocaleLink
                    to={`/search?q=${encodeURIComponent(topic)}`}
                    className="font-body text-[0.95rem] text-ink transition-colors hover:text-accent"
                  >
                    {topic}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {open ? (
        <div id="section-drawer" className="border-t border-rule md:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {CATEGORIES.map((category) => (
              <li key={category} className="border-b border-rule-soft last:border-b-0">
                <LocaleLink
                  to={`/${categorySlug(category)}`}
                  className={`${NAV_LINK_BASE} block py-3 text-ink`}
                  onClick={() => setOpen(false)}
                >
                  {categoryLabel(category, lang)}
                </LocaleLink>
              </li>
            ))}
            {newsletterOpen ? (
              <li className="border-b border-rule-soft last:border-b-0">
                <LocaleLink
                  to="/newsletters"
                  className={`${NAV_LINK_BASE} block py-3 text-accent`}
                  onClick={() => setOpen(false)}
                >
                  {t('newsletterNavLink')}
                </LocaleLink>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
