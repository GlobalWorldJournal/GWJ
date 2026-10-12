import type { AdVariant } from '@gwj/shared-types';

/** Width of the drawn slot as a share of its box, and its width:height. */
const SHAPES: Record<AdVariant, { widthPercent: number; ratio: number }> = {
  leaderboard: { widthPercent: 100, ratio: 728 / 90 },
  mrec: { widthPercent: 42, ratio: 300 / 250 },
  inline: { widthPercent: 100, ratio: 5 },
};

/**
 * A slot drawn to scale. Empty it is a hatched outline; with an image it shows
 * that image exactly as the slot will crop it.
 */
export function SlotShape({
  variant,
  imageUrl,
  alt = '',
}: {
  variant: AdVariant;
  imageUrl?: string;
  alt?: string;
}) {
  const shape = SHAPES[variant];
  return (
    <div
      className="overflow-hidden border border-ink bg-paper"
      style={{ width: `${shape.widthPercent}%`, aspectRatio: String(shape.ratio) }}
      data-testid={`slot-shape-${variant}`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={alt} className="size-full object-cover" />
      ) : (
        <div className="size-full bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--color-rule)_6px,var(--color-rule)_7px)]" />
      )}
    </div>
  );
}
