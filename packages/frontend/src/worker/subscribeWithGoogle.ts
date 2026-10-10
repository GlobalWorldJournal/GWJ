import type { Language } from '@gwj/shared-types';

/** Google Reader Revenue Manager: the paper's open-access publication product. */
const SWG_PRODUCT_ID = 'CAowx-jgCw:openaccess';
const SWG_SCRIPT_URL = 'https://news.google.com/swg/js/v1/swg-basic.js';

/**
 * The Subscribe with Google (basic) tags for an article page, in the article's
 * edition language. Only article pages carry them: SwG activates on the
 * page's NewsArticle structured data, which no other page has, so loading it
 * site-wide only cost every other page a third-party script.
 */
export function subscribeWithGoogleTags(lang: Language): string {
  const init = JSON.stringify({
    type: 'NewsArticle',
    isPartOfType: ['Product'],
    isPartOfProductId: SWG_PRODUCT_ID,
    clientOptions: { theme: 'light', lang },
  });
  return [
    `<script async type="application/javascript" src="${SWG_SCRIPT_URL}"></script>`,
    `<script>(self.SWG_BASIC = self.SWG_BASIC || []).push((basic) => { basic.init(${init}); });</script>`,
  ].join('\n    ');
}
