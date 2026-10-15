import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';

const COLUMN_COUNT = 3;
/** Space between stacked items, in px (the items' own bottom margin). */
const ITEM_GAP_PX = 16;
/** How many of the trailing items may be left out to level the columns. */
const MAX_DROPPED = 3;
const WIDE_QUERY = '(min-width: 40rem)';

/**
 * Splits items (by measured height) across columns so the columns end level.
 * The first two items head the first two columns; the rest go to whichever
 * column is shortest. Trailing items may be dropped when leaving them out
 * levels the columns better; among equally level results the one that keeps
 * more items wins. Returns the item indexes of each column, in reading order.
 */
export function balanceColumns(
  heights: readonly number[],
  columns: number = COLUMN_COUNT,
  maxDropped: number = MAX_DROPPED,
): number[][] {
  let best: { cols: number[][]; spread: number } | null = null;
  const smallest = Math.max(Math.min(columns, heights.length), heights.length - maxDropped);
  for (let count = heights.length; count >= smallest; count -= 1) {
    const cols: number[][] = Array.from({ length: columns }, () => []);
    const filled: number[] = Array.from({ length: columns }, () => 0);
    for (let i = 0; i < count; i += 1) {
      let target = i < columns ? i : 0;
      if (i >= columns) {
        for (let c = 1; c < columns; c += 1) {
          if ((filled[c] ?? 0) < (filled[target] ?? 0)) target = c;
        }
      }
      cols[target]?.push(i);
      filled[target] = (filled[target] ?? 0) + (heights[i] ?? 0) + ITEM_GAP_PX;
    }
    const spread = Math.max(...filled) - Math.min(...filled);
    if (best === null || spread < best.spread) best = { cols, spread };
  }
  return best?.cols ?? [];
}

export interface BalancedItem {
  key: string;
  node: ReactNode;
}

const ITEM_CLASS = 'border-b border-rule pb-4';
/** Measured items keep their natural height inside the zero-height measuring layer. */
const MEASURED_ITEM_CLASS = `${ITEM_CLASS} shrink-0`;
/** Visible items also share any height left over, so every column ends on the same line. */
const ITEM_GROW_CLASS = `${ITEM_CLASS} grow`;

/**
 * Three newspaper columns that always end level. Narrow screens get a plain
 * stack. Wide ones render every item once, off-screen, to measure it at column
 * width, then lay the visible columns out from those heights. The measuring layer
 * holds all items in one narrow column, taller than the page's columns; it is
 * zero-height and clipped so that overflow never stretches the page below the footer.
 */
export function BalancedColumns({ items }: { items: readonly BalancedItem[] }) {
  const wide = useMediaQuery(WIDE_QUERY);
  const measureRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<number[][] | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the measured nodes are replaced whenever `items` changes
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!wide || !root) return;
    const nodes = Array.from(root.children);
    const compute = () => {
      const next = balanceColumns(nodes.map((node) => node.getBoundingClientRect().height));
      setColumns((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    compute();
    const observer = new ResizeObserver(compute);
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [wide, items]);

  if (!wide) {
    return (
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.key} className={ITEM_CLASS}>
            {item.node}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={measureRef}
        aria-hidden="true"
        inert
        className="pointer-events-none invisible absolute left-0 top-0 flex h-0 w-[calc(33.333%-2.25rem)] flex-col gap-4 overflow-hidden"
      >
        {items.map((item) => (
          <div key={item.key} className={MEASURED_ITEM_CLASS}>
            {item.node}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3">
        {(columns ?? [items.map((_, index) => index), [], []]).map((column, c) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the three columns are fixed positions
            key={c}
            className={`flex min-w-0 flex-col gap-4 ${c === 0 ? 'pr-6' : 'border-l border-rule'} ${c === 1 ? 'px-6' : ''} ${c === 2 ? 'pl-6' : ''}`}
          >
            {column.map((index) => {
              const item = items[index];
              return item ? (
                <div key={item.key} className={ITEM_GROW_CLASS}>
                  {item.node}
                </div>
              ) : null;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
