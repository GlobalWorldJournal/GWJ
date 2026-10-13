import { Fragment } from 'react';
import { useLang } from '../../lib/i18n';
import { ABOUT_US_COPY } from './AboutUs.copy';

export function AboutUs() {
  const { lang } = useLang();
  const copy = ABOUT_US_COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        {copy.intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {copy.sections.map((section) => (
          <Fragment key={section.heading}>
            <h2 className="headline text-2xl text-ink mt-4">{section.heading}</h2>
            <p>{section.body}</p>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
