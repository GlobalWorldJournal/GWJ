import { Link } from 'react-router-dom'
import { CATEGORIES, categorySlug } from '@gwj/shared-types'

interface FooterLink {
  label: string
  to: string
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Sections',
    links: CATEGORIES.map((c) => ({ label: c, to: `/${categorySlug(c)}` })),
  },
  {
    title: 'Customer Service',
    links: [
      { label: 'Customer Center', to: '#' },
      { label: 'Contact Us', to: '#' },
      { label: 'Subscribe', to: '#' },
      { label: 'Newsletters', to: '#' },
    ],
  },
  {
    title: 'Tools & Features',
    links: [
      { label: 'Search', to: '/search' },
      { label: 'RSS Feeds', to: '#' },
      { label: 'Podcasts', to: '#' },
      { label: 'Video', to: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', to: '#' },
      { label: 'Careers', to: '#' },
      { label: 'Advertise', to: '#' },
      { label: 'Corrections', to: '#' },
    ],
  },
  {
    title: 'More',
    links: [
      { label: 'Privacy Notice', to: '#' },
      { label: 'Cookie Notice', to: '#' },
      { label: 'Terms of Use', to: '#' },
      { label: 'Accessibility', to: '#' },
    ],
  },
]

/** WSJ-style multi-column footer: link groups + wordmark + copyright. */
export function Footer() {
  return (
    <footer className="mt-16 border-t-3 border-ink bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="label mb-3 text-[0.6875rem] font-bold text-ink">{column.title}</h3>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="font-body text-[0.85rem] text-ink-soft transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-rule pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="headline text-2xl text-ink transition-colors hover:text-accent">
            The Global World Journal
          </Link>
          <p className="label text-[0.625rem] text-muted">
            &copy; {new Date().getFullYear()} The Global World Journal. All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
