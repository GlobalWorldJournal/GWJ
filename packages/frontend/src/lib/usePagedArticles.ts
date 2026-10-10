import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { PaginatedPublicArticles } from '@gwj/shared-types';

/** Stories per "page" of a reader list. */
export const LIST_PAGE_SIZE = 20;

/**
 * A reader list that grows a page at a time ("Load more"): every page the API
 * has, not just the first. `articles` is the flattened list so far.
 */
export function usePagedArticles(
  queryKey: QueryKey,
  fetchPage: (page: number, signal: AbortSignal) => Promise<PaginatedPublicArticles>,
  enabled = true,
) {
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    enabled,
  });
  return { ...query, articles: query.data?.pages.flatMap((page) => page.data) ?? [] };
}
