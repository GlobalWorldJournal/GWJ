export function Video() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Video</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          Some stories are best told on screen. We are developing a video desk to bring you reporting from the field,
          interviews with the people in the news, and explainers that make complex subjects clear in a few minutes.
        </p>

        <h2 className="headline text-2xl text-ink">What to expect</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Field reports</strong> — our correspondents on the ground where events are unfolding.
          </li>
          <li>
            <strong>Explainers</strong> — short, visual breakdowns of the issues driving the headlines.
          </li>
          <li>
            <strong>Conversations</strong> — interviews with the newsmakers, analysts, and thinkers we cover.
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">Coming soon</h2>
        <p>
          Our video coverage is in production and will live here alongside the rest of the Journal. Subscribe to be
          notified when the first films and explainers go live.
        </p>
      </div>
    </div>
  )
}
