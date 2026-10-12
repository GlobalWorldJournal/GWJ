import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

type ValidationSource = 'body' | 'query' | 'params';

/**
 * Validate a request segment against a Zod schema. On success the parsed (and
 * coerced/defaulted) value replaces the raw segment so handlers consume typed
 * data. On failure it forwards a structured 400 (`{ error, details }`).
 *
 * Express 5 makes `req.query` a getter-only property, so the parsed query is
 * stashed on `req.validatedQuery` rather than reassigned.
 */
export function validate(schema: ZodTypeAny, source: ValidationSource = 'body'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const input = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
    const result = schema.safeParse(input);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
      return;
    }
    if (source === 'body') req.body = result.data;
    else if (source === 'params') req.params = result.data;
    else req.validatedQuery = result.data;
    next();
  };
}
