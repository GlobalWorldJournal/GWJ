import { forwardRef } from 'react'
import { Link, NavLink, useLocation, type LinkProps, type NavLinkProps } from 'react-router-dom'
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, isLanguage, type Language } from '@gwj/shared-types'

/**
 * Path-based locale editions. English is the canonical root edition and carries
 * NO path prefix (`/`, `/article/:slug`, …); every other edition lives under its
 * own prefix (`/es/…`, `/fr/…`). The URL path is the single source of truth for
 * the active edition — there is no `?lang=` param and no localStorage redirect.
 *
 * Derived from the shared `SUPPORTED_LANGUAGES`: every supported edition except
 * the default one owns a prefix, so adding an edition to shared-types is enough.
 */
export type PrefixedLocale = Exclude<Language, 'en'>

export const PREFIXED_LOCALES: readonly PrefixedLocale[] = SUPPORTED_LANGUAGES.filter(
  (code): code is PrefixedLocale => code !== DEFAULT_LANGUAGE,
)

/** True when `value` is a non-default edition that owns a `/<locale>` path prefix. */
export function isPrefixedLocale(value: string): value is PrefixedLocale {
  return isLanguage(value) && value !== DEFAULT_LANGUAGE
}

/** The path prefix for an edition: `''` for English, `'/es'` / `'/fr'` otherwise. */
export function localePrefix(lang: Language): string {
  return lang === DEFAULT_LANGUAGE ? '' : `/${lang}`
}

/**
 * The edition that owns a given pathname, read from its first path segment.
 * `/es/article/x` → `es`; everything else (including `/world`) → English.
 */
export function localeFromPath(pathname: string): Language {
  const segment = pathname.split('/')[1] ?? ''
  return isPrefixedLocale(segment) ? segment : DEFAULT_LANGUAGE
}

/**
 * Strip a leading edition prefix from a pathname, returning the edition-relative
 * path that is identical across editions. `/es/article/x` → `/article/x`,
 * `/es` → `/`, `/world` → `/world`.
 */
export function stripLocale(pathname: string): string {
  const lang = localeFromPath(pathname)
  if (lang === DEFAULT_LANGUAGE) {
    return pathname
  }
  const rest = pathname.slice(`/${lang}`.length)
  return rest === '' ? '/' : rest
}

/**
 * Prefix an in-app absolute path (e.g. `/article/x`, `/world`, `/search?q=a`)
 * with the active edition's prefix, preserving any query/hash. English returns
 * the path unchanged; `/es` + `/article/x` → `/es/article/x`. The root path `/`
 * maps to the edition root (`/es`, not `/es/`). Non-site paths (`mailto:`,
 * `http(s):`, fragment-only) are returned untouched.
 */
export function localizePath(lang: Language, path: string): string {
  const prefix = localePrefix(lang)
  if (!prefix || !path.startsWith('/')) {
    return path
  }
  if (path === '/') {
    return prefix
  }
  return `${prefix}${path}`
}

/**
 * The active edition derived from the current URL path. English at the root,
 * `es`/`fr` under their prefixes.
 */
export function useActiveLocale(): Language {
  return localeFromPath(useLocation().pathname)
}

/**
 * Resolve an in-app path under the active edition's prefix. Use for any
 * `to`/`navigate` target so browsing inside `/es` stays in `/es`. English
 * returns the path unchanged.
 */
export function useLocalizedTo(to: string): string {
  return localizePath(useActiveLocale(), to)
}

/**
 * A `<Link>` that automatically prefixes a string `to` with the active edition.
 * Use everywhere an internal link points at a site path so the reader never
 * drops out of their edition. Non-string `to` values pass through unchanged.
 */
export const LocaleLink = forwardRef<HTMLAnchorElement, LinkProps>(function LocaleLink(
  { to, ...rest },
  ref,
) {
  const locale = useActiveLocale()
  const resolved = typeof to === 'string' ? localizePath(locale, to) : to
  return <Link ref={ref} to={resolved} {...rest} />
})

/** A `<NavLink>` variant of {@link LocaleLink} (preserves active styling callbacks). */
export const LocaleNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function LocaleNavLink(
  { to, ...rest },
  ref,
) {
  const locale = useActiveLocale()
  const resolved = typeof to === 'string' ? localizePath(locale, to) : to
  return <NavLink ref={ref} to={resolved} {...rest} />
})
