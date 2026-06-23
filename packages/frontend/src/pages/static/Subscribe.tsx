import { TELEGRAM_CHANNEL_HANDLE, TELEGRAM_CHANNEL_URL } from '@gwj/shared-types'

export function Subscribe() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Follow Us</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          The Global World Journal brings you independent reporting from every corner of the world, with the depth and
          clarity you need to make sense of business, markets, technology, politics, and the ideas shaping our time. The
          fastest way to stay with us is to follow along on Telegram.
        </p>

        <h2 className="headline text-2xl text-ink">Follow on Telegram</h2>
        <p>
          We publish the day’s essential reading to our Telegram channel{' '}
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {TELEGRAM_CHANNEL_HANDLE}
          </a>{' '}
          — headlines, analysis, and breaking news as it lands. It is the simplest way to read the Journal without
          missing a story.
        </p>
        <p>
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="label inline-block border border-ink bg-ink px-5 py-2 text-[0.6875rem] tracking-[0.12em] text-paper transition-colors hover:border-accent hover:bg-accent"
          >
            Follow on Telegram
          </a>
        </p>

        <h2 className="headline text-2xl text-ink">More ways to follow</h2>
        <p>WhatsApp is coming soon. When it launches, you will be able to follow the Journal there too.</p>
      </div>
    </div>
  )
}
