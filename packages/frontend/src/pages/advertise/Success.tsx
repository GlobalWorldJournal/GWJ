import { useSearchParams } from 'react-router-dom';
import type { AdvertiserCampaign } from '@gwj/shared-types';
import { useAdvertiserToken } from '../../lib/advertiserSession';
import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import { ADVERTISE_COPY } from './copy';
import { useAdvertiserCampaigns } from './Dashboard';
import { BUTTON_CLASS } from './ui';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 12;
const CONFIRMED: ReadonlySet<AdvertiserCampaign['status']> = new Set(['scheduled', 'live']);

/** The booking this page is about: the one named in the URL, else the newest. */
function watched(
  campaigns: AdvertiserCampaign[] | undefined,
  id: string | null,
): AdvertiserCampaign | undefined {
  if (!campaigns) return undefined;
  if (id) return campaigns.find((campaign) => campaign.id === id);
  return [...campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Where Stripe sends the advertiser back: thanks, then wait (briefly) for the webhook to confirm. */
export function Success() {
  const { lang } = useLang();
  const copy = ADVERTISE_COPY[lang];
  const token = useAdvertiserToken();
  const [params] = useSearchParams();
  const campaignId = params.get('campaign');

  const { data } = useAdvertiserCampaigns((campaigns, updates) => {
    const current = watched(campaigns, campaignId);
    if (current && CONFIRMED.has(current.status)) return false;
    return updates >= MAX_POLLS ? false : POLL_INTERVAL_MS;
  });
  const current = watched(data, campaignId);
  const confirmed = current !== undefined && CONFIRMED.has(current.status);

  let message = copy.successWaiting;
  if (confirmed) message = current.status === 'live' ? copy.successLive : copy.successScheduled;
  else if (!token) message = copy.signInToSee;
  else if (data !== undefined && current === undefined) message = copy.successSlow;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.successTitle}</h1>
        {confirmed ? (
          <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
            {copy.successDone}
          </p>
        ) : null}
      </header>
      <p role="status" className="font-body text-[1.05rem] text-ink">
        {message}
      </p>
      {current && !confirmed ? (
        <p className="mt-3 font-body text-[0.95rem] text-muted">{copy.successSlow}</p>
      ) : null}
      <div className="mt-8">
        <LocaleLink to="/advertise/dashboard" className={BUTTON_CLASS}>
          {copy.viewDashboard}
        </LocaleLink>
      </div>
    </div>
  );
}
