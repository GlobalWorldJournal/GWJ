import { useLang } from '../../lib/i18n';
import { CORRECTIONS_COPY, CORRECTIONS_EMAIL } from './Corrections.copy';

export function Corrections() {
  const { lang } = useLang();
  const copy = CORRECTIONS_COPY[lang];
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
        <h2 className="headline text-2xl text-ink mt-4">{copy.policy.heading}</h2>
        <p>{copy.policy.body}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.report.heading}</h2>
        <p>
          {copy.report.before}{' '}
          <a className="text-accent hover:underline" href={`mailto:${CORRECTIONS_EMAIL}`}>
            {CORRECTIONS_EMAIL}
          </a>{' '}
          {copy.report.after}
        </p>
      </div>
    </div>
  );
}
