import { useLang } from '../../lib/i18n';
import { CUSTOMER_CENTER } from './content/customerCenter';
import { StaticPage } from './StaticPage';

export function CustomerCenter() {
  const { lang } = useLang();
  return <StaticPage content={CUSTOMER_CENTER[lang]} variant="plain" />;
}
