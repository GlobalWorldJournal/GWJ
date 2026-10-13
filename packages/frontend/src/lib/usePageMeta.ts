import { useEffect } from 'react';
import type { PageMeta } from './pageMeta';

const DESCRIPTION_SELECTOR = 'meta[name="description"]';

/**
 * Keep the tab title and the meta description in step with the page on screen.
 * The SEO worker writes both into the first response (what crawlers read); after
 * client-side navigation the app is the only thing that can, in the edition's
 * language. A legitimate DOM side effect, like `<html lang>`. Pass `null` while
 * a page has nothing to say yet (the previous page's values stay).
 */
export function usePageMeta(meta: PageMeta | null): void {
  const title = meta?.title;
  const description = meta?.description;
  useEffect(() => {
    if (title === undefined || description === undefined) return;
    document.title = title;
    let tag = document.head.querySelector<HTMLMetaElement>(DESCRIPTION_SELECTOR);
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = description;
  }, [title, description]);
}
