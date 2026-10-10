export function Advertise() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Advertise</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          The Global World Journal connects advertisers and partners with an engaged international
          audience of decision makers, professionals, and curious readers who come to us for serious
          coverage of business, markets, technology, and world affairs.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Our audience</h2>
        <p>
          Our readers are global, informed, and influential. They include executives, investors,
          policymakers, founders, and the kind of people who shape the conversations our journalism
          covers. They read us across the web on desktop and mobile, and they return because they
          trust what they find here.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Working with us</h2>
        <p>
          We offer display advertising, sponsorships, branded partnerships, and bespoke campaigns
          designed to reach the right readers in a trusted editorial environment. Our advertising is
          kept clearly separate from our newsroom, and editorial independence is never for sale.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Get in touch</h2>
        <p>
          To discuss advertising and partnership opportunities, contact our commercial team at{' '}
          <a
            className="text-accent hover:underline"
            href="mailto:advertising@globalworldjournal.com"
          >
            advertising@globalworldjournal.com
          </a>
          . Tell us about your goals and we will put together a proposal that fits.
        </p>
      </div>
    </div>
  );
}
