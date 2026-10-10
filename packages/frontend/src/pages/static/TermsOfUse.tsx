import { useLang } from '../../lib/i18n';
import { TERMS_OF_USE } from './content/termsOfUse';
import { LEGAL_LAST_UPDATED } from './content/legal';
import { StaticPage } from './StaticPage';

export function TermsOfUse() {
  const { lang } = useLang();
  return (
    <StaticPage content={TERMS_OF_USE[lang]} variant="prose" lastUpdated={LEGAL_LAST_UPDATED} />
  );
}
