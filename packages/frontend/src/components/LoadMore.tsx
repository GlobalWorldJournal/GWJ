import { useLang } from '../lib/i18n';

interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/** "Load more" under a reader list; absent once every page is shown. */
export function LoadMore({ hasMore, loading, onLoadMore }: LoadMoreProps) {
  const { t } = useLang();
  if (!hasMore) return null;
  return (
    <div className="mt-8 flex justify-center border-t border-rule pt-6">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className="label border border-ink px-6 py-2 text-[0.75rem] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {loading ? t('loadingMore') : t('loadMore')}
      </button>
    </div>
  );
}
