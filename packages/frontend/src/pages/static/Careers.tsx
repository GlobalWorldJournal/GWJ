import { useLang } from '../../lib/i18n';
import { CAREERS } from './content/careers';
import { StaticPage } from './StaticPage';

export function Careers() {
  const { lang } = useLang();
  return <StaticPage content={CAREERS[lang]} variant="prose" />;
}
