import { useLang } from '../../lib/i18n';
import { COPY } from './CookieNotice.copy';

export function CookieNotice() {
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
        <h2 className="headline text-2xl text-ink mt-4">{copy.usedHeading}</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>{copy.essential}</li>
          <li>{copy.analytics}</li>
        </ul>
        <h2 className="headline text-2xl text-ink mt-4">{copy.controlHeading}</h2>
        <p>{copy.control}</p>
        <p>{copy.privacyPointer}</p>
        <p className="label text-[0.6875rem] tracking-[0.12em] text-muted mt-4">{copy.updated}</p>
      </div>
    </div>
  );
}
