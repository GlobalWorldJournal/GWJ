import { useQuery } from '@tanstack/react-query';
import type { AdvertiserCampaign } from '@gwj/shared-types';
import { getAdvertiserCampaigns } from '../../lib/api';
import { clearAdvertiserToken, useAdvertiserToken } from '../../lib/advertiserSession';
import { formatDateTime, formatDay, formatMoney } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import { StatusMessage } from '../../components/StatusMessage';
import { ADVERTISE_COPY } from './copy';
import { SlotShape } from './SlotShape';
import { BUTTON_CLASS, BUTTON_QUIET_CLASS } from './ui';

const STATUS_TONE: Record<AdvertiserCampaign['status'], string> = {
  awaiting_payment: 'border-accent text-accent',
  scheduled: 'border-ink text-ink',
  live: 'border-ink bg-ink text-white',
  ended: 'border-rule text-muted',
  removed: 'border-rule text-muted line-through',
  expired: 'border-rule text-muted',
};

/** The advertiser's bookings, newest first. */
export function useAdvertiserCampaigns(
  refetchInterval?: (
    campaigns: AdvertiserCampaign[] | undefined,
    updates: number,
  ) => number | false,
) {
  const token = useAdvertiserToken();
  return useQuery({
    queryKey: ['advertiser', 'campaigns', token],
    queryFn: async ({ signal }) => {
      if (!token) throw new Error('Not signed in');
      return (await getAdvertiserCampaigns(token, signal)).data;
    },
    enabled: Boolean(token),
    refetchInterval: refetchInterval
      ? (query) => refetchInterval(query.state.data, query.state.dataUpdateCount)
      : false,
  });
}

export function Dashboard() {
  const { lang } = useLang();
  const copy = ADVERTISE_COPY[lang];
  const token = useAdvertiserToken();
  const { data, isPending, isError } = useAdvertiserCampaigns();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b-3 border-ink pb-4">
        <div>
          <h1 className="headline text-4xl text-ink">{copy.dashboardTitle}</h1>
          <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
            {copy.dashboardIntro}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LocaleLink to="/advertise/start" className={BUTTON_CLASS}>
            {copy.newAd}
          </LocaleLink>
          {token ? (
            <button type="button" onClick={clearAdvertiserToken} className={BUTTON_QUIET_CLASS}>
              {copy.signOut}
            </button>
          ) : null}
        </div>
      </header>

      {!token ? (
        <div className="flex flex-col items-start gap-4 py-8">
          <p className="font-body text-ink">{copy.signInToSee}</p>
          <LocaleLink to="/advertise/start" className={BUTTON_CLASS}>
            {copy.signIn}
          </LocaleLink>
        </div>
      ) : isPending ? (
        <StatusMessage title={copy.working} />
      ) : isError ? (
        <StatusMessage title={copy.loadFailed} />
      ) : data.length === 0 ? (
        <StatusMessage title={copy.noCampaigns} />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {data.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: AdvertiserCampaign }) {
  const { lang } = useLang();
  const copy = ADVERTISE_COPY[lang];
  return (
    <li className="flex flex-col gap-4 py-5 sm:flex-row">
      <div className="w-full shrink-0 sm:w-48">
        <SlotShape variant={campaign.variant} imageUrl={campaign.imageUrl} alt={campaign.adName} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="campaign-status"
            className={`label border px-2 py-0.5 text-[0.625rem] font-bold ${STATUS_TONE[campaign.status]}`}
          >
            {copy.statuses[campaign.status]}
          </span>
          <span className="label text-[0.625rem] text-muted">
            {copy.slots[campaign.variant].name}
          </span>
        </div>
        <p className="headline text-xl text-ink">{campaign.adName}</p>
        <p className="font-label text-sm text-ink-soft">
          {formatDay(campaign.startDate, lang)} – {formatDay(campaign.endDate, lang)}
          {campaign.amountCents === null
            ? ''
            : ` · ${copy.amount}: ${formatMoney(campaign.amountCents, lang, campaign.currency)}`}
        </p>
        <p className="font-label text-[0.8rem] text-muted">{copy.statusHelp[campaign.status]}</p>
        {campaign.status === 'awaiting_payment' ? (
          <div className="flex flex-wrap items-center gap-3">
            {campaign.checkoutUrl ? (
              <a href={campaign.checkoutUrl} className={BUTTON_CLASS}>
                {copy.payNow}
              </a>
            ) : null}
            {campaign.holdExpiresAt ? (
              <span className="font-label text-[0.8rem] text-muted">
                {copy.heldUntil} {formatDateTime(campaign.holdExpiresAt, lang)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
