type AdVariant = 'leaderboard' | 'mrec' | 'inline'

interface AdSlotProps {
  variant?: AdVariant
  className?: string
}

// Placeholder dimensions per standard ad unit. Swap the inner box for a real ad
// network tag (e.g. GAM/AdSense) later — the slot + "Advertisement" label stay.
const SIZE: Record<AdVariant, string> = {
  leaderboard: 'h-[90px] w-full max-w-[728px]',
  mrec: 'h-[250px] w-full max-w-[300px]',
  inline: 'h-[160px] w-full',
}

/**
 * A labelled advertising slot. Renders a neutral placeholder now; fills the
 * white space a news grid leaves and marks where real ad units will go.
 */
export function AdSlot({ variant = 'mrec', className }: AdSlotProps) {
  return (
    <aside className={`flex flex-col items-center ${className ?? ''}`}>
      <span className="label mb-1 text-[0.5625rem] tracking-[0.18em] text-muted">Advertisement</span>
      <div
        className={`flex items-center justify-center border border-rule bg-ink/[0.03] ${SIZE[variant]}`}
        aria-hidden
      >
        <span className="headline text-sm text-muted/70">GWJ</span>
      </div>
    </aside>
  )
}
