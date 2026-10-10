import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Language, PublicArticle } from '@gwj/shared-types';
import { getPopularArticles, reportArticleView } from './api';

/** The edition's most read stories (React Query: cached, refetched in the background). */
export function usePopularArticles(lang: Language, limit: number) {
  return useQuery({
    queryKey: ['articles', 'popular', lang, limit],
    queryFn: ({ signal }) => getPopularArticles(lang, limit, signal),
    staleTime: 60_000,
  });
}

/**
 * The Most Popular rail: the most read stories, topped up with the newest ones
 * (never repeating a story or including `exclude`) so the module is full even
 * while few stories have been read — e.g. right after a quiet night.
 */
export function mostPopularRail(
  ranked: readonly PublicArticle[],
  latest: readonly PublicArticle[],
  size: number,
  exclude?: string,
): PublicArticle[] {
  const seen = new Set<string>(exclude ? [exclude] : []);
  const rail: PublicArticle[] = [];
  for (const article of [...ranked, ...latest]) {
    if (rail.length === size) break;
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    rail.push(article);
  }
  return rail;
}

/** Articles already reported in this page session (one view per story per visit). */
const reported = new Set<string>();

/** Count one view of the article on screen (a side effect of showing it, not data). */
export function useReportView(articleId: string | undefined): void {
  useEffect(() => {
    if (!articleId || reported.has(articleId)) return;
    reported.add(articleId);
    reportArticleView(articleId);
  }, [articleId]);
}
