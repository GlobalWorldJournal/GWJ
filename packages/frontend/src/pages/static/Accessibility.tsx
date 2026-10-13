import { useLang } from '../../lib/i18n';
import { ACCESSIBILITY_COPY, ACCESSIBILITY_EMAIL } from './Accessibility.copy';

export function Accessibility() {
  const { lang } = useLang();
  const copy = ACCESSIBILITY_COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.standard.heading}</h2>
        <p>{copy.standard.body}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.ongoing.heading}</h2>
        <p>{copy.ongoing.body}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.report.heading}</h2>
        <p>
          {copy.report.before}{' '}
          <a className="text-accent hover:underline" href={`mailto:${ACCESSIBILITY_EMAIL}`}>
            {ACCESSIBILITY_EMAIL}
          </a>{' '}
          {copy.report.after}
        </p>
      </div>
    </div>
  );
}
