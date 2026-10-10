import { useLang } from '../../lib/i18n';
import { PRIVACY_NOTICE } from './content/privacyNotice';
import { LEGAL_LAST_UPDATED } from './content/legal';
import { StaticPage } from './StaticPage';

export function PrivacyNotice() {
  const { lang } = useLang();
  return (
    <StaticPage content={PRIVACY_NOTICE[lang]} variant="prose" lastUpdated={LEGAL_LAST_UPDATED} />
  );
}
