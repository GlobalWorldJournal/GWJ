import { useLang } from '../../lib/i18n';
import { SUBSCRIBE } from './content/subscribe';
import { StaticPage } from './StaticPage';

export function Subscribe() {
  const { lang } = useLang();
  return <StaticPage content={SUBSCRIBE[lang]} variant="plain" />;
}
