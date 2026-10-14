import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { confirmNewsletter, unsubscribeFromNewsletter } from '../lib/api';
import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { staticMeta } from '../lib/pageMeta';
import { usePageMeta } from '../lib/usePageMeta';
import { StatusMessage } from '../components/StatusMessage';

function BackHome() {
  const { t } = useLang();
  return (
    <p className="pb-16 text-center">
      <LocaleLink
        to="/"
        className="label inline-block border-b-2 border-accent pb-1 text-[0.75rem] text-accent"
      >
        {t('backToFrontPage')}
      </LocaleLink>
    </p>
  );
}

/** Landing page of the emailed confirmation link: confirms the subscription. */
export function NewsletterConfirm() {
  const { lang, t } = useLang();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  usePageMeta(staticMeta('/newsletter/confirm', lang));
  const confirmation = useQuery({
    queryKey: ['newsletter', 'confirm', token],
    queryFn: () => confirmNewsletter(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (token.length === 0 || confirmation.isError) {
    return (
      <>
        <StatusMessage title={t('newsletterInvalidTitle')} detail={t('newsletterInvalidDetail')} />
        <BackHome />
      </>
    );
  }
  if (!confirmation.isSuccess) return <StatusMessage title={t('newsletterConfirming')} />;
  return (
    <>
      <StatusMessage
        title={t('newsletterConfirmedTitle')}
        detail={t('newsletterConfirmedDetail')}
      />
      <BackHome />
    </>
  );
}

/**
 * Landing page of an issue's unsubscribe link. Unsubscribing is an explicit click,
 * so a mail scanner that merely opens the link never removes the reader.
 */
export function NewsletterUnsubscribe() {
  const { lang, t } = useLang();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  usePageMeta(staticMeta('/newsletter/unsubscribe', lang));
  const unsubscribe = useMutation({ mutationFn: () => unsubscribeFromNewsletter(token) });

  if (token.length === 0 || unsubscribe.isError) {
    return (
      <>
        <StatusMessage title={t('newsletterInvalidTitle')} detail={t('newsletterInvalidDetail')} />
        <BackHome />
      </>
    );
  }
  if (unsubscribe.isSuccess) {
    return (
      <>
        <StatusMessage
          title={t('newsletterUnsubscribedTitle')}
          detail={t('newsletterUnsubscribedDetail')}
        />
        <BackHome />
      </>
    );
  }
  return (
    <div className="py-20 text-center">
      <h1 className="headline text-2xl text-ink">{t('newsletterUnsubscribeTitle')}</h1>
      <p className="mt-2 text-muted">{t('newsletterUnsubscribeDetail')}</p>
      <button
        type="button"
        disabled={unsubscribe.isPending}
        onClick={() => unsubscribe.mutate()}
        className="label mt-6 border border-ink bg-ink px-5 py-2 text-[0.6875rem] tracking-[0.12em] text-paper transition-colors hover:border-accent hover:bg-accent disabled:opacity-60"
      >
        {t('newsletterUnsubscribeButton')}
      </button>
    </div>
  );
}
