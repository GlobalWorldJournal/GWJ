import { type Request } from 'express'
import { BadRequestError } from '../errors'

/**
 * Read a required string route param. Express route patterns guarantee presence,
 * but `noUncheckedIndexedAccess` types `req.params[x]` as possibly undefined and
 * Express 5 widens it to `string | string[]`; this narrows it safely.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestError(`Missing route parameter "${name}"`)
  }
  return value
}
