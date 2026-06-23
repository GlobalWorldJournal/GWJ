import { Link } from 'react-router-dom'
import { CATEGORIES, categorySlug } from '@gwj/shared-types'

/** Site footer with section links and copyright. */
export function Footer() {
  return (
    <footer className="mt-16 border-t-3 border-ink bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="headline text-2xl text-ink">Global World Journal</p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                to={`/${categorySlug(category)}`}
                className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
              >
                {category}
              </Link>
            </li>
          ))}
        </ul>
        <p className="label mt-8 text-[0.625rem] text-muted">
          &copy; {new Date().getFullYear()} Global World Journal. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
