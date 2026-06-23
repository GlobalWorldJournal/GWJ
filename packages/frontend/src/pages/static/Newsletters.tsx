import { Link } from 'react-router-dom'

export function Newsletters() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Newsletters</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          Our newsletters bring the Journal to your inbox, edited by the journalists who cover each beat. Pick the ones
          that fit your day and read them on your own schedule.
        </p>

        <h2 className="headline text-2xl text-ink">Our newsletters</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Morning Briefing</strong> — the stories and context you need before the day begins.
          </li>
          <li>
            <strong>Markets Close</strong> — what moved stocks, bonds, and currencies, explained after the bell.
          </li>
          <li>
            <strong>World This Week</strong> — a weekend read on the events shaping the global agenda.
          </li>
          <li>
            <strong>Tech Weekly</strong> — the companies, products, and policy decisions driving technology.
          </li>
          <li>
            <strong>Opinion Digest</strong> — the week in argument, from our columnists and contributors.
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">How to subscribe</h2>
        <p>
          Newsletter sign-up is part of your account. To add a newsletter, email{' '}
          <a href="mailto:newsletters@globalworldjournal.com" className="text-accent hover:underline">
            newsletters@globalworldjournal.com
          </a>{' '}
          with the titles you would like, and we will turn them on for you. Every newsletter includes a one-click way to
          unsubscribe at the bottom of each issue.
        </p>
        <p>
          Newsletters are included with every plan. If you are not a subscriber yet, you can{' '}
          <Link to="/subscribe" className="text-accent hover:underline">
            subscribe here
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
