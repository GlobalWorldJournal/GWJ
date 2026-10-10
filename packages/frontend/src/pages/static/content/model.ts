import type { Language } from '@gwj/shared-types';

/**
 * Typed content model for the reader's static pages (About, legal notices,
 * help pages, …). Each page module exports a {@link Localized} record holding
 * one {@link StaticPageContent} per edition, and `StaticPage` renders whichever
 * the active edition selects. Because `Localized` is keyed by every `Language`,
 * leaving out an edition is a compile error rather than a silent fallback.
 */

/** A run of inline content inside a paragraph or list item. */
export type Inline =
  | string
  | { readonly kind: 'strong'; readonly text: string }
  /** A `mailto:` link that shows the address itself. */
  | { readonly kind: 'email'; readonly address: string }
  /** An in-app route, kept inside the reader's edition (`/contact` → `/es/contact`). */
  | { readonly kind: 'route'; readonly to: string; readonly text: string }
  /** A same-site resource served outside the SPA (e.g. a feed), as a plain anchor. */
  | { readonly kind: 'resource'; readonly href: string; readonly text: string }
  /** An off-site link, opened in a new tab. */
  | { readonly kind: 'external'; readonly href: string; readonly text: string };

export type RichText = readonly Inline[];

export type Block =
  | { readonly kind: 'paragraph'; readonly text: RichText }
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly RichText[] }
  /** The "Follow on Telegram" call-to-action button (label from the dictionary). */
  | { readonly kind: 'telegramCta' };

export interface StaticPageContent {
  readonly title: string;
  readonly blocks: readonly Block[];
}

/** One value per edition; a missing edition is a type error. */
export type Localized<T> = { readonly [L in Language]: T };

export function p(...text: Inline[]): Block {
  return { kind: 'paragraph', text };
}

export function h2(text: string): Block {
  return { kind: 'heading', text };
}

/** A bulleted list; each item is a single string or a sequence of inline runs. */
export function ul(...items: (string | RichText)[]): Block {
  return {
    kind: 'list',
    items: items.map((item) => (typeof item === 'string' ? [item] : item)),
  };
}

export const telegramCta: Block = { kind: 'telegramCta' };

export function strong(text: string): Inline {
  return { kind: 'strong', text };
}

export function email(address: string): Inline {
  return { kind: 'email', address };
}

export function route(to: string, text: string): Inline {
  return { kind: 'route', to, text };
}

export function resource(href: string, text: string): Inline {
  return { kind: 'resource', href, text };
}

export function external(href: string, text: string): Inline {
  return { kind: 'external', href, text };
}
