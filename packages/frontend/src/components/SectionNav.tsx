import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { CATEGORIES, categorySlug } from '@gwj/shared-types'

const NAV_LINK_BASE = 'label text-[0.75rem] tracking-[0.06em] transition-colors hover:text-accent'

function activeClass(isActive: boolean): string {
  return isActive ? 'text-accent' : 'text-ink'
}

/** Section navigation: the 7 categories + a Search link. Collapses to a drawer under md. */
export function SectionNav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-20 border-b border-ink bg-paper">
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
              <li key={category}>
                <NavLink
                  to={`/${categorySlug(category)}`}
                  className={({ isActive }) => `${NAV_LINK_BASE} ${activeClass(isActive)}`}
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
        >
          Search
        </NavLink>
      </div>

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
