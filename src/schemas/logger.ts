/**
 * A structural logger contract shared with wechaty-puppet.
 *
 * TODO(pluggable-logger): once `@juzi/wechaty-puppet` publishes `LoggerLike`,
 *   switch this to `export type { LoggerLike } from '@juzi/wechaty-puppet'`.
 *   The parallel puppet PR adds the same shape (a subset of the concrete
 *   `Brolog` class), so this local alias is a temporary stub to unblock
 *   local type-check.
 *
 * The signature deliberately matches the `Brolog` class rather than brolog's
 * exported `Loggable` interface: the class allows single-arg calls
 * (`log.warn('message only')`) which the rest of the wechaty codebase has
 * historically relied on.
 */
export interface LoggerLike {
  error(prefix: string, ...args: unknown[]): void
  warn(prefix: string, ...args: unknown[]): void
  info(prefix: string, ...args: unknown[]): void
  verbose(prefix: string, ...args: unknown[]): void
  silly(prefix: string, ...args: unknown[]): void
}
