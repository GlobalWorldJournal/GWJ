/**
 * Minimal structured logger. JSON lines to stdout/stderr so log aggregators
 * (CloudWatch, etc.) can parse them. Use this instead of ad-hoc console output.
 */
type LogFields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', message: string, fields?: LogFields): void {
  const entry = { level, time: new Date().toISOString(), message, ...fields };
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
};
