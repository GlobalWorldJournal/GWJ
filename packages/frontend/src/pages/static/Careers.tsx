export function Careers() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Careers</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          We are building a newsroom and a company for the next era of international journalism, and we
          are hiring. If you want your work to reach readers around the world and to be measured by a
          high editorial standard, we would like to hear from you.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Where we are hiring</h2>
        <p>
          We have openings across three areas. On the editorial side we are looking for reporters,
          editors, and visual journalists who can report with precision and write with clarity. On the
          engineering side we want product and platform engineers who can build the tools a modern
          newsroom runs on. On the commercial side we are growing our advertising, partnerships, and
          subscriptions teams.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">How to apply</h2>
        <p>
          Send your resume, a short note about the role you are interested in, and relevant work or a
          portfolio to{' '}
          <a className="text-accent hover:underline" href="mailto:careers@globalworldjournal.com">
            careers@globalworldjournal.com
          </a>
          . We read every application and reply to candidates we would like to take further.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Equal opportunity</h2>
        <p>
          The Global World Journal is an equal opportunity employer. We consider all qualified
          applicants without regard to race, color, religion, sex, sexual orientation, gender identity,
          national origin, age, disability, or any other characteristic protected by applicable law. A
          newsroom that reports on the whole world is stronger when its own people reflect it.
        </p>
      </div>
    </div>
  )
}
