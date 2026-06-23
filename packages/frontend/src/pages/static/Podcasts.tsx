export function Podcasts() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Podcasts</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          We are building a slate of audio shows that carry the reporting and analysis of the Journal into your day,
          hosted by the journalists who know the stories best. Here is what is coming.
        </p>

        <h2 className="headline text-2xl text-ink">Shows on the way</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>The Daily World</strong> — a short morning podcast on the one story that matters most today.
          </li>
          <li>
            <strong>The Markets Show</strong> — a closing look at the numbers and the forces behind them.
          </li>
          <li>
            <strong>Off the Page</strong> — a culture show on the books, film, and ideas our Arts desk is following.
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">Coming soon</h2>
        <p>
          Our podcasts are in production and will be available on the major listening apps and as feeds you can follow
          here. Subscribe to the Journal to be the first to hear when the first episodes are released.
        </p>
      </div>
    </div>
  )
}
