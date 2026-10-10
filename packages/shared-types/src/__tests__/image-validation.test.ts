import { describe, expect, it } from 'vitest';
import {
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
  validateImageBuffer,
  type ImageValidationResult,
} from '../image-validation';
import {
  makeHtmlBlob,
  makeTruncatedJpeg,
  makeTruncatedPng,
  makeValidJpeg,
  makeValidPng,
} from './imageFixtures';

/** Narrow a result to the failure branch for ergonomic assertions. */
function expectRejected(
  result: ImageValidationResult,
): Extract<ImageValidationResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a rejection');
  return result;
}

describe('validateImageBuffer', () => {
  it('accepts a complete, large-enough PNG', () => {
    const png = makeValidPng(800, 700);
    const result = validateImageBuffer(png, { declaredMime: 'image/png' });
    expect(result).toMatchObject({ ok: true, format: 'png', width: 800, height: 700 });
  });

  it('accepts a complete, large-enough JPEG', () => {
    const jpeg = makeValidJpeg(900, 650);
    const result = validateImageBuffer(jpeg, { declaredMime: 'image/jpeg' });
    expect(result).toMatchObject({ ok: true, format: 'jpeg', width: 900, height: 650 });
  });

  it('normalizes a declared image/jpg MIME to image/jpeg', () => {
    const jpeg = makeValidJpeg(800, 800);
    const result = validateImageBuffer(jpeg, { declaredMime: 'image/jpg' });
    expect(result.ok).toBe(true);
  });

  it('rejects a truncated PNG (IDAT length past EOF / no IEND)', () => {
    const png = makeTruncatedPng(800, 700);
    const rejected = expectRejected(validateImageBuffer(png, { declaredMime: 'image/png' }));
    expect(rejected.reason).toBe('truncated');
  });

  it('rejects a truncated JPEG (missing EOI)', () => {
    const jpeg = makeTruncatedJpeg(800, 700);
    const rejected = expectRejected(validateImageBuffer(jpeg, { declaredMime: 'image/jpeg' }));
    expect(rejected.reason).toBe('truncated');
  });

  it('rejects an HTML/text blob', () => {
    const rejected = expectRejected(
      validateImageBuffer(makeHtmlBlob(), { declaredMime: 'image/png' }),
    );
    expect(rejected.reason).toBe('unknown-format');
  });

  it('rejects empty bytes', () => {
    const rejected = expectRejected(validateImageBuffer(new Uint8Array(0)));
    expect(rejected.reason).toBe('empty');
  });

  it('rejects an image below the minimum width', () => {
    const png = makeValidPng(MIN_IMAGE_WIDTH - 1, MIN_IMAGE_HEIGHT + 100);
    const rejected = expectRejected(validateImageBuffer(png, { declaredMime: 'image/png' }));
    expect(rejected.reason).toBe('too-small');
  });

  it('rejects an image below the minimum height', () => {
    const png = makeValidPng(MIN_IMAGE_WIDTH + 100, MIN_IMAGE_HEIGHT - 1);
    const rejected = expectRejected(validateImageBuffer(png, { declaredMime: 'image/png' }));
    expect(rejected.reason).toBe('too-small');
  });

  it('accepts a standard 16:9 landscape hero (800x450)', () => {
    // Width >= 600 and height >= 400, so a normal wire-photo crop is allowed even
    // though its height is below the width floor.
    const png = makeValidPng(800, 450);
    expect(validateImageBuffer(png, { declaredMime: 'image/png' }).ok).toBe(true);
  });

  it('rejects a real image whose declared MIME does not match the bytes', () => {
    const png = makeValidPng(800, 700);
    const rejected = expectRejected(validateImageBuffer(png, { declaredMime: 'image/jpeg' }));
    expect(rejected.reason).toBe('mime-mismatch');
  });

  it('rejects an image exceeding the byte cap', () => {
    const png = makeValidPng(700, 700);
    const rejected = expectRejected(
      validateImageBuffer(png, { declaredMime: 'image/png', maxBytes: png.byteLength - 1 }),
    );
    expect(rejected.reason).toBe('too-large');
  });

  it('honors custom minimum width/height overrides', () => {
    const png = makeValidPng(620, 620);
    expect(validateImageBuffer(png, { minWidth: 600, minHeight: 600 }).ok).toBe(true);
    expect(validateImageBuffer(png, { minWidth: 700 }).ok).toBe(false);
    expect(validateImageBuffer(png, { minHeight: 700 }).ok).toBe(false);
  });

  it('passes structural validation without a declared MIME', () => {
    const png = makeValidPng(800, 800);
    const result = validateImageBuffer(png);
    expect(result).toMatchObject({ ok: true, format: 'png' });
  });
});
