/**
 * Minimal server-side logger.
 *
 * The compiler actions previously traced every save with `console.log`, including full
 * assessment payloads dumped through `JSON.stringify`. On shared hosting that put
 * identifiable student performance data into a plaintext log file. Those payload dumps are
 * gone; the remaining trace lines route through `debug` here, which is silent unless
 * someone asks for it.
 *
 * Rules for anything added later:
 *  - `debug` is for tracing. Never pass student names, scores, or full records.
 *  - `error` and `warn` always emit, so keep them to messages and identifiers.
 *  - Arguments are evaluated before the call even when `debug` is silent, so do not build
 *    an expensive string just to pass it in.
 */

const debugEnabled =
  process.env.SCHOOLPRO_DEBUG === "1" || process.env.NODE_ENV === "development"

type LogArgs = readonly unknown[]

export const log = {
  /** Tracing. Silent in production unless SCHOOLPRO_DEBUG=1. */
  debug(...args: LogArgs) {
    if (debugEnabled) console.log(...args)
  },
  info(...args: LogArgs) {
    console.info(...args)
  },
  warn(...args: LogArgs) {
    console.warn(...args)
  },
  error(...args: LogArgs) {
    console.error(...args)
  },
}
