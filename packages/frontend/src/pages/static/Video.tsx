import { useLang } from '../../lib/i18n';
import { VIDEO } from './content/video';
import { StaticPage } from './StaticPage';

export function Video() {
  const { lang } = useLang();
  return <StaticPage content={VIDEO[lang]} variant="plain" />;
}
