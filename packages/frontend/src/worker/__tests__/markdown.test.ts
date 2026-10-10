import { describe, expect, it } from 'vitest';
import { firstParagraphText, markdownToHtml } from '../markdown';

describe('markdownToHtml (server-rendered article text)', () => {
  it('renders subheads down to ####, numbered and bulleted lists, quotes and images', () => {
    const html = markdownToHtml(
      [
        '## Context',
        '#### Detail',
        '1. First step',
        '2. Second step',
        '- A point',
        '> A quote',
        '![A rig](https://cdn.example.test/rig.webp)',
      ].join('\n'),
    );
    expect(html).toBe(
      [
        '<h2>Context</h2>',
        '<h4>Detail</h4>',
        '<ol><li>First step</li><li>Second step</li></ol>',
        '<ul><li>A point</li></ul>',
        '<blockquote><p>A quote</p></blockquote>',
        '<figure><img src="https://cdn.example.test/rig.webp" alt="A rig" /></figure>',
      ].join('\n'),
    );
  });

  it('escapes raw HTML instead of passing it through', () => {
    expect(markdownToHtml('<script>alert(1)</script> **bold**')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>bold</strong></p>',
    );
  });
});

describe('firstParagraphText (meta description fallback)', () => {
  it('takes the first prose paragraph of a Markdown body, markup stripped', () => {
    const body =
      '## A subhead\n\nThe **central bank** held [rates](https://x.test)\nsteady.\n\nMore.';
    expect(firstParagraphText(body)).toBe('The central bank held rates steady.');
  });
});
