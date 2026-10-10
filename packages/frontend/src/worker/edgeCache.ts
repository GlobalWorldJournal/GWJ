/**
 * The worker's reads from the API, cached in Cloudflare's per-datacenter cache
 * for as long as the API itself allows (`max-age=60`), so crawler bursts and
 * busy pages do not each cost an API round trip.
 *
 * Only API DATA is cached, never the rendered HTML: pages are always built on
 * the current SPA shell, so a frontend deploy can never leave cached pages
 * pointing at bundles that no longer exist.
 */

/** Seconds a cached API response is served (matches the API's own max-age). */
export const API_CACHE_TTL_SECONDS = 60;

/** Cloudflare's default cache; absent outside the Workers runtime (e.g. tests). */
function edgeCache(): Cache | null {
  const storage = globalThis.caches as (CacheStorage & { default?: Cache }) | undefined;
  return storage?.default ?? null;
}

/** GET a JSON document; null on any network/HTTP failure (the page still renders). */
export async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const cache = edgeCache();
  try {
    const hit = await cache?.match(url);
    if (hit) return await hit.json();

    const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    if (cache) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set('cache-control', `public, max-age=${API_CACHE_TTL_SECONDS}`);
      await cache.put(url, stored);
    }
    return await response.json();
  } catch {
    // An unreachable API degrades to the generic shell, never to an error page.
    return null;
  }
}
