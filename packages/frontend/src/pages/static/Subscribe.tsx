export function Subscribe() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Subscribe</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          The Global World Journal brings you independent reporting from every corner of the world, with the depth and
          clarity you need to make sense of business, markets, technology, politics, and the ideas shaping our time. A
          subscription supports that journalism and unlocks everything we publish.
        </p>

        <h2 className="headline text-2xl text-ink">What you get</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Unlimited access to every article across all sections</li>
          <li>World, Business, Markets, Tech, Politics, Opinion, and Arts coverage</li>
          <li>Our full slate of newsletters delivered to your inbox</li>
          <li>The complete archive and ad-light reading on every device</li>
        </ul>

        <h2 className="headline text-2xl text-ink">Choose your plan</h2>
        <p>
          <strong>Digital</strong> includes unlimited articles across every section and all of our newsletters. It is
          the simplest way to read the Journal without limits.
        </p>
        <p>
          <strong>Digital+</strong> adds the full searchable archive, early access to special reports and series, and
          priority subscriber support. It is built for readers who rely on the Journal every day.
        </p>

        <h2 className="headline text-2xl text-ink">Start your subscription</h2>
        <p>
          Online checkout is coming soon. In the meantime, we will set up your subscription by hand and walk you through
          the plans. Email{' '}
          <a href="mailto:subscribe@globalworldjournal.com" className="text-accent hover:underline">
            subscribe@globalworldjournal.com
          </a>{' '}
          to get started, and we will reply with the next steps and current pricing.
        </p>
      </div>
    </div>
  )
}
