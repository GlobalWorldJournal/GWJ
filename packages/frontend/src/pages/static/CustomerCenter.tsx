import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import { CUSTOMER_CENTER_COPY } from './CustomerCenter.copy';

const SUPPORT_EMAIL = 'support@globalworldjournal.com';

export function CustomerCenter() {
  const { lang } = useLang();
  const copy = CUSTOMER_CENTER_COPY[lang];
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

        <h2 className="headline text-2xl text-ink">{copy.manageTitle}</h2>
        <p>{copy.manageBody}</p>

        <h2 className="headline text-2xl text-ink">{copy.billingTitle}</h2>
        <p>{copy.billingBody}</p>

        <h2 className="headline text-2xl text-ink">{copy.accountTitle}</h2>
        <p>{copy.accountBody}</p>

        <h2 className="headline text-2xl text-ink">{copy.faqTitle}</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          {copy.faq.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2 className="headline text-2xl text-ink">{copy.helpTitle}</h2>
        <p>
          {copy.helpBefore}{' '}
          <LocaleLink to="/contact" className="text-accent hover:underline">
            {copy.contactLink}
          </LocaleLink>{' '}
          {copy.helpMiddle}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">
            {SUPPORT_EMAIL}
          </a>
          . {copy.helpAfter}
        </p>
      </div>
    </div>
  );
}
