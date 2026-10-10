import { useLang } from '../../lib/i18n';
import { NEWSLETTERS } from './content/newsletters';
import { StaticPage } from './StaticPage';

export function Newsletters() {
  const { lang } = useLang();
  return <StaticPage content={NEWSLETTERS[lang]} variant="plain" />;
}
