export function Accessibility() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Accessibility</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          The Global World Journal is committed to making our journalism available to everyone,
          including readers who use assistive technologies. We want the experience of reading our
          coverage to be straightforward regardless of how you access the web.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Our standard</h2>
        <p>
          We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. That means we
          work toward sufficient color contrast, clear and consistent navigation, descriptive text for
          images, support for keyboard use, and content that works well with screen readers.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Ongoing work</h2>
        <p>
          Accessibility is not a one time project. As we add features and publish new kinds of content,
          we test against our standard and fix issues we find. We treat accessibility as part of the
          quality of our work, not an afterthought.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Reporting an issue</h2>
        <p>
          If you encounter a barrier on our site, please let us know so we can address it. Email{' '}
          <a className="text-accent hover:underline" href="mailto:accessibility@globalworldjournal.com">
            accessibility@globalworldjournal.com
          </a>{' '}
          with the page, the problem you experienced, and the device or assistive technology you were
          using. Your reports help us make the site better for everyone.
        </p>
      </div>
    </div>
  )
}
