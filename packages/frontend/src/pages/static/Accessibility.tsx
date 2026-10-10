import { useLang } from '../../lib/i18n';
import { ACCESSIBILITY } from './content/accessibility';
import { StaticPage } from './StaticPage';

export function Accessibility() {
  const { lang } = useLang();
  return <StaticPage content={ACCESSIBILITY[lang]} variant="prose" />;
}
