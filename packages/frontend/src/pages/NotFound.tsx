import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { notFoundMeta } from '../lib/pageMeta';
import { usePageMeta } from '../lib/usePageMeta';

export function NotFound() {
  const { lang, t } = useLang();
  usePageMeta(notFoundMeta(lang));
  return (
    <div className="py-24 text-center">
      <p className="kicker">{t('error404')}</p>
      <h1 className="headline mt-2 text-4xl text-ink">{t('notFoundTitle')}</h1>
      <p className="mt-3 text-muted">{t('notFoundDetail')}</p>
      <LocaleLink
        to="/"
        className="label mt-6 inline-block border-b-2 border-accent pb-1 text-[0.75rem] text-accent"
      >
        {t('backToFrontPage')}
      </LocaleLink>
    </div>
  );
}
