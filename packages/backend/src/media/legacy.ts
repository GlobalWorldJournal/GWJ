/**
 * The legacy media bucket (`gwj-media` behind `CDN_BASE_URL`), read-only since
 * the move to Oxy Files. Content written before the migration names objects
 * by their CDN URL; these helpers recognize such a URL and its bucket key.
 */
export interface LegacyMedia {
  readonly cdnBase: string;
  /** The bucket key a legacy CDN URL names, or null for any other URL. */
  keyOf(url: string): string | null;
  /** The URL of a bucket key. */
  urlOf(key: string): string;
  /** Every legacy CDN URL in `text` (Markdown, JSON), in order, repeats included. */
  urlsIn(text: string): string[];
  /** `text` with each legacy CDN URL replaced by `replace(key)` (kept when it answers null). */
  replaceIn(text: string, replace: (key: string) => string | null): string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createLegacyMedia(cdnBaseUrl: string): LegacyMedia {
  const cdnBase = cdnBaseUrl.replace(/\/+$/, '');
  const prefix = `${cdnBase}/`;
  // A URL in Markdown or JSON ends at whitespace, a quote, a bracket or a paren.
  const inText = new RegExp(`${escapeRegExp(prefix)}[^\\s"'<>()\\[\\]]+`, 'g');
  function keyOf(url: string): string | null {
    if (!url.startsWith(prefix)) return null;
    const path = url.slice(prefix.length).split(/[?#]/)[0] ?? '';
    if (path.length === 0) return null;
    try {
      return decodeURIComponent(path);
    } catch {
      return null;
    }
  }
  return {
    cdnBase,
    keyOf,
    urlOf(key) {
      return `${prefix}${key.split('/').map(encodeURIComponent).join('/')}`;
    },
    urlsIn(text) {
      return [...text.matchAll(inText)].map((match) => match[0]);
    },
    replaceIn(text, replace) {
      return text.replace(inText, (url) => {
        const key = keyOf(url);
        return (key ? replace(key) : null) ?? url;
      });
    },
  };
}
