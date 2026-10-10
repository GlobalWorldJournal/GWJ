import { useLang } from '../../lib/i18n';
import { RSS_FEEDS } from './content/rssFeeds';
import { StaticPage } from './StaticPage';

export function RssFeeds() {
  const { lang } = useLang();
  return <StaticPage content={RSS_FEEDS[lang]} variant="plain" />;
}
