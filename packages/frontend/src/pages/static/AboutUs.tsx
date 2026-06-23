export function AboutUs() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">About Us</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          The Global World Journal is an independent international newspaper covering the events,
          decisions, and ideas that shape the world. We were founded on a straightforward belief:
          that readers everywhere deserve clear, rigorous reporting that holds power to account and
          explains why it matters.
        </p>
        <p>
          Our mission is independent global journalism. We are not aligned with any government,
          party, or commercial interest, and our editorial decisions are made by our newsroom alone.
          We report from a global vantage point, treating audiences in every region as readers of
          equal importance rather than as an afterthought to a single national story.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">What we cover</h2>
        <p>
          Our coverage spans World, Business, Markets, Technology, Politics, Opinion, and Arts. Across
          these sections we pursue accountability reporting, market analysis, and cultural criticism
          with the same standard of care, because the forces moving capital, policy, and culture rarely
          stay inside neat boundaries.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">How we work</h2>
        <p>
          Our newsroom is AI-assisted and human-led. We use modern tools to help us gather, organize,
          and draft at the speed the news demands, but every story is shaped, verified, and approved by
          editors who answer for its accuracy. Our human editorial standards are not optional features
          layered on top of automation. They are the foundation, and they govern everything we publish.
        </p>
      </div>
    </div>
  )
}
