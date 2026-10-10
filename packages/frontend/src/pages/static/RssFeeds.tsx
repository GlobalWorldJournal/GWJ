export function RssFeeds() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">RSS Feeds</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          RSS is an open standard that lets you follow the Journal in the reader of your choice.
          Instead of checking the site, you subscribe to a feed and new articles appear
          automatically as we publish them, with no account required.
        </p>

        <h2 className="headline text-2xl text-ink">How to use it</h2>
        <p>
          Copy the feed address below and paste it into any feed reader. The reader will pull in our
          latest headlines, summaries, and links back to the full articles on
          globalworldjournal.com.
        </p>

        <h2 className="headline text-2xl text-ink">Main feed</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            All articles:{' '}
            <a href="/feed.xml" className="text-accent hover:underline">
              /feed.xml
            </a>
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">Per-section feeds</h2>
        <p>
          Dedicated feeds for World, Business, Markets, Tech, Politics, Opinion, and Arts are
          planned, so you will be able to follow only the sections you care about. Until then, the
          main feed covers everything we publish.
        </p>
      </div>
    </div>
  );
}
