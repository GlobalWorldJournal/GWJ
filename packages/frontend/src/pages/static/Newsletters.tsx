import { TELEGRAM_CHANNEL_HANDLE, TELEGRAM_CHANNEL_URL } from '@gwj/shared-types';
import { LocaleLink } from '../../lib/locale';

export function Newsletters() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Telegram</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          The Journal goes out on Telegram, not email. Our channel brings the newsroom to your
          phone, edited by the journalists who cover each beat, so you can read on your own schedule
          and never miss the stories that matter.
        </p>

        <h2 className="headline text-2xl text-ink">On our channel</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Morning Briefing</strong> — the stories and context you need before the day
            begins.
          </li>
          <li>
            <strong>Markets Close</strong> — what moved stocks, bonds, and currencies, explained
            after the bell.
          </li>
          <li>
            <strong>World This Week</strong> — a weekend read on the events shaping the global
            agenda.
          </li>
          <li>
            <strong>Tech Weekly</strong> — the companies, products, and policy decisions driving
            technology.
          </li>
          <li>
            <strong>Opinion Digest</strong> — the week in argument, from our columnists and
            contributors.
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">How to follow</h2>
        <p>
          Join us on Telegram at{' '}
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {TELEGRAM_CHANNEL_HANDLE}
          </a>{' '}
          and you will get every edition as it publishes. You can leave the channel at any time,
          right from Telegram.
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
        <p>
          WhatsApp is planned next. For all the ways to follow the Journal, see{' '}
          <LocaleLink to="/subscribe" className="text-accent hover:underline">
            Follow Us
          </LocaleLink>
          .
        </p>
      </div>
    </div>
  );
}
