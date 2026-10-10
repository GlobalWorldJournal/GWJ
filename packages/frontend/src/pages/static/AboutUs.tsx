import { useLang } from '../../lib/i18n';
import { ABOUT_US } from './content/aboutUs';
import { StaticPage } from './StaticPage';

export function AboutUs() {
  const { lang } = useLang();
  return <StaticPage content={ABOUT_US[lang]} variant="prose" />;
}
