import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { CATEGORIES, categorySlug, type Category } from '@gwj/shared-types'

const NAV_LINK_BASE = 'label text-[0.75rem] tracking-[0.06em] transition-colors hover:text-accent'

function activeClass(isActive: boolean): string {
  return isActive ? 'text-accent' : 'text-ink'
}

// Sub-topics shown in each section's hover mega-menu (link to a search query).
const SUBTOPICS: Record<Category, string[]> = {
  World: ['Americas', 'Europe', 'Asia', 'Middle East', 'Africa', 'China'],
  Business: ['Technology', 'Media', 'Energy', 'Autos', 'Retail', 'Management'],
  Markets: ['Stocks', 'Bonds', 'Commodities', 'Currencies', 'Funds', 'Rates'],
  Tech: ['Artificial Intelligence', 'Cybersecurity', 'Personal Tech', 'Startups', 'Big Tech'],
  Politics: ['Elections', 'Policy', 'National Security', 'Courts', 'Economy'],
  Opinion: ['Editorials', 'Commentary', 'Columnists', 'Letters'],
  Arts: ['Books', 'Film', 'Music', 'Television', 'Theater', 'Design'],
}

/** Section navigation: 7 categories + Search. Desktop hover mega-menu; mobile drawer. */
export function SectionNav() {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<Category | null>(null)

  return (
    <nav
      className="sticky top-0 z-20 border-b border-ink bg-paper"
      onMouseLeave={() => setHovered(null)}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="label text-[0.75rem] text-ink md:hidden"
            aria-expanded={open}
            aria-controls="section-drawer"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Close' : 'Sections'}
          </button>

          {/* Compact GWJ logo / monogram — the wordmark is "The Global World Journal". */}
          <Link
            to="/"
            aria-label="The Global World Journal — home"
            className="headline text-lg font-black tracking-tight text-ink"
          >
            GWJ
          </Link>

          <ul className="hidden items-center gap-5 md:flex">
            {CATEGORIES.map((category) => (
              <li key={category} onMouseEnter={() => setHovered(category)}>
                <NavLink
                  to={`/${categorySlug(category)}`}
                  className={({ isActive }) =>
                    `${NAV_LINK_BASE} ${activeClass(isActive || hovered === category)}`
                  }
                >
                  {category}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <NavLink
          to="/search"
          className={({ isActive }) => `${NAV_LINK_BASE} ${activeClass(isActive)}`}
          onMouseEnter={() => setHovered(null)}
        >
          Search
        </NavLink>
      </div>

      {/* Desktop hover mega-menu */}
      {hovered ? (
        <div className="absolute inset-x-0 top-full hidden border-b border-ink bg-paper shadow-[0_12px_24px_rgba(0,0,0,0.08)] md:block">
          <div className="mx-auto max-w-6xl px-4 py-6">
            <div className="mb-3 flex items-baseline justify-between border-b border-rule pb-2">
              <Link
                to={`/${categorySlug(hovered)}`}
                className="headline text-2xl text-ink transition-colors hover:text-accent"
              >
                {hovered}
              </Link>
              <Link
                to={`/${categorySlug(hovered)}`}
                className="label text-[0.6875rem] text-accent transition-colors hover:text-ink"
              >
                All {hovered}
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {SUBTOPICS[hovered].map((topic) => (
                <li key={topic}>
                  <Link
                    to={`/search?q=${encodeURIComponent(topic)}`}
                    className="font-body text-[0.95rem] text-ink transition-colors hover:text-accent"
                  >
                    {topic}
                  </Link>
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
                <Link
                  to={`/${categorySlug(category)}`}
                  className={`${NAV_LINK_BASE} block py-3 text-ink`}
                  onClick={() => setOpen(false)}
                >
                  {category}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  )
}
