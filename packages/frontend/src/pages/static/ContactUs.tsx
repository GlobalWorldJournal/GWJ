import { useLang } from '../../lib/i18n';
import { CONTACT_US } from './content/contactUs';
import { StaticPage } from './StaticPage';

export function ContactUs() {
  const { lang } = useLang();
  return <StaticPage content={CONTACT_US[lang]} variant="plain" />;
}
