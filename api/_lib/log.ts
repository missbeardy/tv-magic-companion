/**
 * Structured logger for api/ — one JSON object per line instead of whatever shape a
 * given console.log call happened to pass (a bare string, a pre-stringified JSON
 * blob, a mix of both). Makes Vercel/log-aggregator filtering on `level` or a meta
 * field actually work, and stops the double-stringify some call sites did
 * (`console.log(tag, JSON.stringify(result))`).
 *
 * meta takes any plain object (a `{ meta? }`-shaped generic, not an index-signature
 * type) so a concrete result interface can be passed straight through without a cast.
 *
 * error/warn stay as console.error/console.warn calls elsewhere in api/ — this is
 * specifically the console.log replacement (see eslint.config.js's api/** no-console
 * override, which allows info/warn/error and flags bare console.log).
 */
function emit<T extends object>(level: 'info' | 'warn' | 'error', message: string, meta?: T): void {
  const line = JSON.stringify(meta ? { level, message, ...meta } : { level, message })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const log = {
  info: <T extends object>(message: string, meta?: T) => emit('info', message, meta),
  warn: <T extends object>(message: string, meta?: T) => emit('warn', message, meta),
  error: <T extends object>(message: string, meta?: T) => emit('error', message, meta),
}
