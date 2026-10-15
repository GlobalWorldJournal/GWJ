import { useQuery } from '@tanstack/react-query';
import { getNewsletterStatus } from './api';

/** Whether sign-ups are open rarely changes; look again at most this often. */
const STATUS_STALE_MS = 10 * 60 * 1000;

/**
 * Whether the backend can actually mail readers. Every newsletter entry point waits
 * for this, so nothing invites a sign-up that would fail. One shared query: the
 * footer, the article card and the nav link cost a single request.
 */
export function useNewsletterAccepting(): boolean {
  const status = useQuery({
    queryKey: ['newsletter', 'status'],
    queryFn: ({ signal }) => getNewsletterStatus(signal),
    staleTime: STATUS_STALE_MS,
  });
  return status.data?.accepting === true;
}
