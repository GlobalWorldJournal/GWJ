import { useLang } from '../../lib/i18n';
import { CONTACT_EMAILS, CONTACT_US_COPY, type ContactSection } from './ContactUs.copy';

function Section({ section, emailLabel }: { section: ContactSection; emailLabel: string }) {
  return (
    <>
      <h2 className="headline text-2xl text-ink">{section.heading}</h2>
      <p>{section.body}</p>
      <ul className="list-disc pl-5 flex flex-col gap-1">
        <li>
          {emailLabel}:{' '}
          <a href={`mailto:${section.email}`} className="text-accent hover:underline">
            {section.email}
          </a>
        </li>
      </ul>
    </>
  );
}

export function ContactUs() {
  const { lang } = useLang();
  const copy = CONTACT_US_COPY[lang];
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
        <Section section={copy.newsroom} emailLabel={copy.emailLabel} />
        <Section section={copy.support} emailLabel={copy.emailLabel} />
        <Section section={copy.advertising} emailLabel={copy.emailLabel} />
        <h2 className="headline text-2xl text-ink">{copy.confidential.heading}</h2>
        <p>
          {copy.confidential.before}{' '}
          <a href={`mailto:${CONTACT_EMAILS.news}`} className="text-accent hover:underline">
            {CONTACT_EMAILS.news}
          </a>{' '}
          {copy.confidential.after}
        </p>
      </div>
    </div>
  );
}
