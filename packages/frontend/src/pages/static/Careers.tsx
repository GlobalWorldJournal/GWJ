import { useLang } from '../../lib/i18n';
import { CAREERS_COPY, CAREERS_EMAIL } from './Careers.copy';

export function Careers() {
  const { lang } = useLang();
  const copy = CAREERS_COPY[lang];
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
        <h2 className="headline text-2xl text-ink mt-4">{copy.hiring.heading}</h2>
        <p>{copy.hiring.body}</p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.apply.heading}</h2>
        <p>
          {copy.apply.before}{' '}
          <a className="text-accent hover:underline" href={`mailto:${CAREERS_EMAIL}`}>
            {CAREERS_EMAIL}
          </a>
          . {copy.apply.after}
        </p>
        <h2 className="headline text-2xl text-ink mt-4">{copy.equal.heading}</h2>
        <p>{copy.equal.body}</p>
      </div>
    </div>
  );
}
