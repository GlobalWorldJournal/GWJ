import { AD_TERMS_VERSION } from '@gwj/shared-types';
import { formatDay } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import { fill } from './copy';
import { TERMS_COPY, TERMS_CONTACT_EMAIL } from './termsCopy';

export function AdvertisingTerms() {
  const { lang } = useLang();
  const copy = TERMS_COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          {copy.kicker} · {fill(copy.effective, { date: formatDay(AD_TERMS_VERSION, lang) })}
        </p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>
        {copy.sections.map((section, index) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="headline mt-4 text-2xl text-ink">
              {index + 1}. {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items ? (
              <ul className="list-disc pl-6">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        <p className="mt-4 border-t border-rule pt-4 font-label text-[0.9rem]">
          {copy.contactLead}:{' '}
          <a className="text-accent hover:underline" href={`mailto:${TERMS_CONTACT_EMAIL}`}>
            {TERMS_CONTACT_EMAIL}
          </a>
        </p>
        <p>
          <LocaleLink to="/advertise" className="text-accent hover:underline">
            {copy.backToAdvertise}
          </LocaleLink>
        </p>
      </div>
    </div>
  );
}
