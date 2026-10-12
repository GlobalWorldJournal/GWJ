import {
  AD_CREATIVE_ASPECT_RATIOS,
  AD_CREATIVE_MIN_HEIGHT,
  AD_CREATIVE_MIN_WIDTH,
} from '@gwj/shared-types';
import type { AdVariant } from '@gwj/shared-types';

/** Mirrors the server's creative limits (`image-validation` is Node-only, so it cannot be imported here). */
export const CREATIVE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const CREATIVE_MAX_BYTES = 10 * 1024 * 1024;
/** How far the shape may stray from the slot's, as a fraction: the server's own tolerance. */
const ASPECT_TOLERANCE = 0.15;

export type CreativeProblem = 'type' | 'size' | 'dimensions' | 'shape';

export interface CreativeFacts {
  type: string;
  bytes: number;
  width: number;
  height: number;
}

/** The first reason the image cannot run in `variant`, or null when it can. */
export function creativeProblem(facts: CreativeFacts, variant: AdVariant): CreativeProblem | null {
  if (!CREATIVE_MIME_TYPES.some((mime) => mime === facts.type)) return 'type';
  if (facts.bytes > CREATIVE_MAX_BYTES) return 'size';
  if (facts.width < AD_CREATIVE_MIN_WIDTH || facts.height < AD_CREATIVE_MIN_HEIGHT) {
    return 'dimensions';
  }
  const target = AD_CREATIVE_ASPECT_RATIOS[variant];
  if (target) {
    const wanted = target.width / target.height;
    const actual = facts.width / facts.height;
    if (Math.abs(actual - wanted) / wanted > ASPECT_TOLERANCE) return 'shape';
  }
  return null;
}

/** Decode the image in the browser to read its pixel size. */
export function measureImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be read.'));
    };
    image.src = url;
  });
}
