import { describe, expect, it } from 'vitest';
import { balanceColumns } from '../BalancedColumns';

function spread(cols: number[][], heights: number[]): number {
  const sums = cols.map((col) => col.reduce((total, i) => total + (heights[i] ?? 0) + 16, 0));
  return Math.max(...sums) - Math.min(...sums);
}

describe('balanceColumns', () => {
  it('puts the first two items at the head of the first two columns', () => {
    const cols = balanceColumns([300, 200, 100, 100, 100]);
    expect(cols[0]?.[0]).toBe(0);
    expect(cols[1]?.[0]).toBe(1);
  });

  it('sends later items to the shortest column', () => {
    const heights = [400, 100, 100, 100, 100, 100];
    const cols = balanceColumns(heights, 3, 0);
    expect(cols[0]).toEqual([0]);
    expect(cols.flat().sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(spread(cols, heights)).toBeLessThan(250);
  });

  it('drops a trailing item when leaving it out levels the columns better', () => {
    const heights = [200, 200, 200, 400];
    const withAll = balanceColumns(heights, 3, 0);
    const levelled = balanceColumns(heights, 3, 1);
    expect(spread(levelled, heights)).toBeLessThan(spread(withAll, heights));
    expect(levelled.flat()).not.toContain(3);
  });

  it('keeps every item when they already end level', () => {
    const cols = balanceColumns([200, 200, 200], 3, 3);
    expect(cols.flat().sort()).toEqual([0, 1, 2]);
  });
});
