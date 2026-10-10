export function Corrections() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Corrections</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          Accuracy is the foundation of our work. We report carefully, but no newsroom is immune to
          error, and when we get something wrong we want to put it right quickly and openly.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Our policy</h2>
        <p>
          When we learn that an article contains a factual mistake, we correct it as soon as we have
          confirmed the facts. We append a clear correction notice to the affected article
          describing what was changed and when, so the record is transparent rather than quietly
          rewritten. For minor matters such as spelling or formatting we may update the article
          without a formal notice, but anything that affects the substance or meaning of a story is
          always disclosed.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Reporting an error</h2>
        <p>
          If you believe one of our articles contains an error, please tell us. Email{' '}
          <a
            className="text-accent hover:underline"
            href="mailto:corrections@globalworldjournal.com"
          >
            corrections@globalworldjournal.com
          </a>{' '}
          with the headline or link, the specific point you think is wrong, and any source or detail
          that supports your account. We review every report and respond to those that identify a
          genuine issue.
        </p>
      </div>
    </div>
  );
}
