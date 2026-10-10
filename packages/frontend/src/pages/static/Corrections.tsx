import { useLang } from '../../lib/i18n';
import { CORRECTIONS } from './content/corrections';
import { StaticPage } from './StaticPage';

export function Corrections() {
  const { lang } = useLang();
  return <StaticPage content={CORRECTIONS[lang]} variant="prose" />;
}
