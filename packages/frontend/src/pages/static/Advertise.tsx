import { useLang } from '../../lib/i18n';
import { ADVERTISE } from './content/advertise';
import { StaticPage } from './StaticPage';

export function Advertise() {
  const { lang } = useLang();
  return <StaticPage content={ADVERTISE[lang]} variant="prose" />;
}
