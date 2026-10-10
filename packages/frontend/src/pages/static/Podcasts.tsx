import { useLang } from '../../lib/i18n';
import { PODCASTS } from './content/podcasts';
import { StaticPage } from './StaticPage';

export function Podcasts() {
  const { lang } = useLang();
  return <StaticPage content={PODCASTS[lang]} variant="plain" />;
}
