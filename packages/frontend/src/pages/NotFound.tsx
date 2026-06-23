import { LocaleLink } from '../lib/locale'

export function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="kicker">Error 404</p>
      <h1 className="headline mt-2 text-4xl text-ink">Page not found</h1>
      <p className="mt-3 text-muted">The story you&rsquo;re looking for may have moved or been removed.</p>
      <LocaleLink
        to="/"
        className="label mt-6 inline-block border-b-2 border-accent pb-1 text-[0.75rem] text-accent"
      >
        Return to the front page
      </LocaleLink>
    </div>
  )
}
