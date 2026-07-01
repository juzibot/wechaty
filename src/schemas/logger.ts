import type { Loggable } from 'brolog'

/**
 * A structural logger contract shared with wechaty-puppet.
 *
 * TODO(pluggable-logger): once `@juzi/wechaty-puppet` publishes `LoggerLike`,
 *   switch this to `export type { LoggerLike } from '@juzi/wechaty-puppet'`.
 *   The parallel puppet PR adds the same shape (a subset of brolog's `Loggable`),
 *   so this local alias is a temporary stub to unblock local type-check.
 */
export type LoggerLike = Loggable
