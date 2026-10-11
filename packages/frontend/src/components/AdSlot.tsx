import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdVariant, PublicAdCampaign } from '@gwj/shared-types';
import { getActiveAdCampaign } from '../lib/api';
import { useLang } from '../lib/i18n';

interface AdSlotProps {
  variant?: AdVariant;
  /**
   * Stick to the top (below the nav) as the surrounding column scrolls past.
   * On by default; where the containing block is no taller than the ad there
   * is simply no room to stick and it renders in place.
   */
  sticky?: boolean;
  className?: string;
}

const ADSENSE_CLIENT = 'ca-pub-5040341565838705';

/**
 * One real AdSense unit per variant (manual Display/In-feed units, created by
 * hand in the AdSense dashboard — Auto ads is deliberately never used, it
 * places ads anywhere on the page outside this layout's control). The shape
 * (horizontal/rectangle) is forced rather than left "auto": these sizes
 * already match the grid's own fixed slots, so there's no reason to let
 * AdSense guess. The in-feed unit is styled from AdSense's own template
 * editor to read as another GWJ story card (Playfair headline, no border).
 */
const AD_UNITS: Record<AdVariant, { slot: string; format: string; layoutKey?: string }> = {
  leaderboard: { slot: '6885993962', format: 'horizontal' },
  mrec: { slot: '9970398867', format: 'rectangle' },
  inline: { slot: '4865326127', format: 'fluid', layoutKey: '-6c+e2+2m-6n+7y' },
};

const SIZE: Record<AdVariant, string> = {
  leaderboard: 'h-[90px] w-full max-w-[728px]',
  mrec: 'h-[250px] w-full max-w-[300px]',
  inline: 'min-h-[160px] w-full',
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * A real AdSense unit. AdSense's script renders one `<ins>` per `push({})`
 * call — in an SPA, that has to happen again on every mount (a single
 * page-load script tag only ever renders the first one it finds), so each
 * unit pushes its own request once it's in the DOM.
 */
function AdSenseUnit({ variant }: { variant: AdVariant }) {
  const unit = AD_UNITS[variant];

  useEffect(() => {
    window.adsbygoogle = window.adsbygoogle || [];
    try {
      window.adsbygoogle.push({});
    } catch (error) {
      // Once adsbygoogle.js has loaded, its `push` throws synchronously when it
      // cannot fill a unit (no unfilled <ins> left, zero available width). An
      // unfilled ad must never unmount the page around it: report the error
      // and leave this slot empty.
      window.reportError(error);
    }
  }, []);

  return (
    <ins
      className={`adsbygoogle block ${SIZE[variant]}`}
      style={{ display: 'block' }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={unit.slot}
      data-ad-format={unit.format}
      data-ad-layout-key={unit.layoutKey}
      data-full-width-responsive={unit.layoutKey ? undefined : 'true'}
    />
  );
}

/** A directly sold creative. `sponsored`: a paid link must not pass search ranking. */
function DirectAd({ campaign, variant }: { campaign: PublicAdCampaign; variant: AdVariant }) {
  return (
    <a
      href={campaign.clickUrl}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={`flex items-center justify-center overflow-hidden ${SIZE[variant]}`}
    >
      <img
        src={campaign.imageUrl}
        alt={campaign.advertiserName}
        loading="lazy"
        className="max-h-full max-w-full object-contain"
      />
    </a>
  );
}

/**
 * A labelled ad slot. A directly sold campaign scheduled for this variant
 * takes the slot; otherwise (none booked, or the lookup failed) AdSense fills
 * it. AdSense is only mounted once that answer is in, so it never requests an
 * ad for a slot a direct campaign then takes over.
 */
export function AdSlot({ variant = 'mrec', sticky = true, className }: AdSlotProps) {
  const { t } = useLang();
  const { data, isPending } = useQuery({
    queryKey: ['ad-campaign', 'active', variant],
    queryFn: ({ signal }) => getActiveAdCampaign(variant, signal),
    // A failed lookup falls straight back to AdSense rather than holding the slot empty.
    retry: false,
  });
  const campaign = data?.campaign ?? null;

  return (
    <aside
      className={`flex flex-col items-center ${sticky ? 'lg:sticky lg:top-20' : ''} ${className ?? ''}`}
    >
      <span className="label mb-1 text-[0.5625rem] tracking-[0.18em] text-muted">
        {t('advertisement')}
      </span>
      {isPending ? (
        <div className={`block ${SIZE[variant]}`} aria-hidden="true" />
      ) : campaign ? (
        <DirectAd campaign={campaign} variant={variant} />
      ) : (
        <AdSenseUnit variant={variant} />
      )}
    </aside>
  );
}
