import { useLang } from '../../lib/i18n';
import { COOKIE_NOTICE } from './content/cookieNotice';
import { LEGAL_LAST_UPDATED } from './content/legal';
import { StaticPage } from './StaticPage';

export function CookieNotice() {
  const { lang } = useLang();
  return (
    <StaticPage content={COOKIE_NOTICE[lang]} variant="prose" lastUpdated={LEGAL_LAST_UPDATED} />
  );
}
