import { useLang } from '../../lib/i18n';
import { COPY, PRIVACY_CONTACT_EMAIL } from './PrivacyNotice.copy';

export function PrivacyNotice() {
  const { lang } = useLang();
  const copy = COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">{copy.kicker}</p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.collectHeading}</h2>
        <p>{copy.collect}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.cookiesHeading}</h2>
        <p>{copy.cookies}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.thirdPartiesHeading}</h2>
        <p>{copy.thirdParties}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.rightsHeading}</h2>
        <p>
          {copy.rightsBefore}{' '}
          <a className="text-accent hover:underline" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
            {PRIVACY_CONTACT_EMAIL}
          </a>
          {copy.rightsAfter}
        </p>
        <p className="label text-[0.6875rem] tracking-[0.12em] text-muted mt-4">{copy.updated}</p>
      </div>
    </div>
  );
}
