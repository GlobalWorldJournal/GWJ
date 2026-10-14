import { telegramChannelFor } from '@gwj/shared-types';
import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import { NEWSLETTERS_COPY } from './Newsletters.copy';
import { NewsletterSignup } from '../../components/NewsletterSignup';

export function Newsletters() {
  const { lang } = useLang();
  const telegram = telegramChannelFor(lang);
  const copy = NEWSLETTERS_COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>
        <NewsletterSignup className="border border-rule p-5" />

        <h2 className="headline text-2xl text-ink">{copy.channelTitle}</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          {copy.items.map((item) => (
            <li key={item.name}>
              <strong>{item.name}</strong> — {item.description}
            </li>
          ))}
        </ul>

        <h2 className="headline text-2xl text-ink">{copy.followTitle}</h2>
        <p>
          {copy.followBefore}{' '}
          <a
            href={telegram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {telegram.handle}
          </a>{' '}
          {copy.followAfter}
        </p>
        <p>
          <a
            href={telegram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="label inline-block border border-ink bg-ink px-5 py-2 text-[0.6875rem] tracking-[0.12em] text-paper transition-colors hover:border-accent hover:bg-accent"
          >
            {copy.followButton}
          </a>
        </p>
        <p>
          {copy.whatsappBefore}{' '}
          <LocaleLink to="/subscribe" className="text-accent hover:underline">
            {copy.followUsLink}
          </LocaleLink>
          .
        </p>
      </div>
    </div>
  );
}
