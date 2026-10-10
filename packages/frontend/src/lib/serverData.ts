import { PublicArticleSchema, type PublicArticle } from '@gwj/shared-types';

/**
 * The article the SEO worker already fetched to render a page travels to the
 * SPA inside that page, as JSON in a script element with this id, so the app
 * shows it at once instead of fetching it a second time.
 */
export const ARTICLE_DATA_ELEMENT_ID = 'gwj-article';

/** The `<script>` the worker injects (`<` escaped so the JSON cannot close it). */
export function articleDataScript(article: PublicArticle): string {
  const json = JSON.stringify(article).replace(/</g, '\\u003c');
  return `<script type="application/json" id="${ARTICLE_DATA_ELEMENT_ID}">${json}</script>`;
}

/** The article embedded in the page by the worker, if any (validated). */
export function readServerArticle(doc: Document): PublicArticle | null {
  const text = doc.getElementById(ARTICLE_DATA_ELEMENT_ID)?.textContent;
  if (!text) return null;
  try {
    const parsed = PublicArticleSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    // Malformed embedded data just means the app fetches the article itself.
    return null;
  }
}
