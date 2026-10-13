import { AD_DAILY_RATE_CENTS, AD_VARIANTS } from '@gwj/shared-types';
import { formatMoney } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import { useAdvertiserToken } from '../../lib/advertiserSession';
import { ADVERTISE_COPY } from '../advertise/copy';
import { ADVERTISE_PAGE_COPY } from './Advertise.copy';
import { SlotShape } from '../advertise/SlotShape';
import { BUTTON_CLASS, BUTTON_QUIET_CLASS } from '../advertise/ui';

function SelfServe() {
  const { lang } = useLang();
  const copy = ADVERTISE_COPY[lang];
  const signedIn = useAdvertiserToken() !== null;
  return (
    <section className="mb-10" aria-labelledby="self-serve-pricing">
      <h2 id="self-serve-pricing" className="headline text-2xl text-ink">
        {copy.pricingTitle}
      </h2>
      <p className="mt-2 font-body text-[1.05rem] leading-relaxed text-ink">{copy.pricingIntro}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <LocaleLink to="/advertise/start" className={BUTTON_CLASS}>
          {copy.cta}
        </LocaleLink>
        {signedIn ? (
          <LocaleLink to="/advertise/dashboard" className={BUTTON_QUIET_CLASS}>
            {copy.ctaDashboard}
          </LocaleLink>
        ) : null}
      </div>
      <table className="mt-6 w-full border-collapse border-y border-rule text-left">
        <thead>
          <tr className="border-b border-ink">
            <th className="label py-2 pr-3 text-[0.625rem] text-ink-soft">{copy.slotColumn}</th>
            <th className="label hidden w-48 py-2 pr-3 text-[0.625rem] text-ink-soft sm:table-cell" />
            <th className="label py-2 text-right text-[0.625rem] text-ink-soft">
              {copy.priceColumn}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {AD_VARIANTS.map((variant) => (
            <tr key={variant}>
              <td className="py-4 pr-3 align-top">
                <p className="headline text-lg text-ink">{copy.slots[variant].name}</p>
                <p className="label text-[0.625rem] text-muted">{copy.slots[variant].size}</p>
                <p className="mt-1 font-body text-[0.9rem] text-ink-soft">
                  {copy.slots[variant].description}
                </p>
              </td>
              <td className="hidden py-4 pr-3 align-middle sm:table-cell">
                <SlotShape variant={variant} />
              </td>
              <td className="whitespace-nowrap py-4 text-right align-top">
                <span className="headline text-2xl text-ink">
                  {formatMoney(AD_DAILY_RATE_CENTS[variant], lang)}
                </span>
                <span className="label block text-[0.625rem] text-muted">{copy.perDay}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 font-label text-[0.8rem] text-muted">
        {copy.pricingNote}{' '}
        <LocaleLink to="/advertising-terms" className="text-accent hover:underline">
          {copy.termsLink}
        </LocaleLink>
        .
      </p>
    </section>
  );
}

const ADVERTISING_EMAIL = 'advertising@globalworldjournal.com';

export function Advertise() {
  const { lang } = useLang();
  const copy = ADVERTISE_PAGE_COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <SelfServe />
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.audienceTitle}</h2>
        <p>{copy.audienceBody}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.workingTitle}</h2>
        <p>{copy.workingBody}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.contactTitle}</h2>
        <p>
          {copy.contactBefore}{' '}
          <a className="text-accent hover:underline" href={`mailto:${ADVERTISING_EMAIL}`}>
            {ADVERTISING_EMAIL}
          </a>
          . {copy.contactAfter}
        </p>
      </div>
    </div>
  );
}
