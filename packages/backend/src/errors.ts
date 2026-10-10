/** An error carrying an HTTP status code, surfaced by the central error handler. */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, message, details);
    this.name = 'BadRequestError';
  }
}

/**
 * 422 Unprocessable Entity — the request was well-formed but its content failed
 * a semantic check (e.g. an uploaded file that is not a complete, decodable
 * image). Distinct from 400 so callers can tell a malformed request apart from
 * one carrying invalid media.
 */
export class UnprocessableEntityError extends HttpError {
  constructor(message = 'Unprocessable entity', details?: unknown) {
    super(422, message, details);
    this.name = 'UnprocessableEntityError';
  }
}

/** 409 Conflict — the request collides with existing state (e.g. a slug in use). */
export class ConflictError extends HttpError {
  constructor(message = 'Conflict', details?: unknown) {
    super(409, message, details);
    this.name = 'ConflictError';
  }
}

/** 403 Forbidden — authenticated, but not allowed to do this. */
export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}
