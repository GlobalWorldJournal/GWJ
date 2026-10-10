/**
 * Minimal structured logger: JSON lines to stdout/stderr for CloudWatch, in the
 * same shape as the backend's.
 */
type LogFields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', message: string, fields?: LogFields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

/** Message, class and (for real Errors) stack of a caught error. */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) return { error: err.message, errorName: err.name, stack: err.stack };
  return { error: String(err) };
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};
