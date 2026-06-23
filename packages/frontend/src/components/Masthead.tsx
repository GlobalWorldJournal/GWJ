import { Link } from 'react-router-dom'

function todayDateline(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Centered serif masthead with dateline and a double rule beneath it. */
export function Masthead() {
  return (
    <header className="border-b border-ink bg-paper">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-2 text-center">
        <p className="label text-[0.625rem] text-muted">{todayDateline()}</p>
        <Link to="/" className="mt-1 inline-block">
          <h1 className="headline text-4xl font-black tracking-tight text-ink sm:text-5xl md:text-6xl">
            Global World Journal
          </h1>
        </Link>
        <p className="label mt-1 text-[0.625rem] tracking-[0.18em] text-muted">
          World &middot; Business &middot; Markets &middot; Tech &middot; Politics &middot; Opinion &middot; Arts
        </p>
      </div>
      <div className="rule-double mx-auto max-w-6xl" />
    </header>
  )
}
