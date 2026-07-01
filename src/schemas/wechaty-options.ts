import type * as PUPPET from '@juzi/wechaty-puppet'
import type {
  MemoryCard,
}                       from 'memory-card'

import type {
  OfficialPuppetNpmName,
}                             from '../puppet-config.js'
import type {
  LoggerLike,
}                             from './logger.js'

interface OptionsPuppetInstance {
  puppet?: PUPPET.impls.PuppetInterface,
}

interface OptionsPuppetName {
  puppet?        : OfficialPuppetNpmName
  puppetOptions? : PUPPET.PuppetOptions
}

interface WechatyOptionsBase {
  memory?        : MemoryCard,
  name?          : string,
  ioToken?       : string,
  /**
   * Pluggable logger. When provided:
   *   - the value is forwarded to the puppet via {@link PUPPET.PuppetOptions.logger}
   *     during Wechaty initialization (see puppet-mixin);
   *   - Wechaty exposes it (falling back to the built-in brolog) via
   *     `wechaty.log` and, transitively, on every wechatified user module
   *     via `Contact.log`, `Message.log`, ...
   *
   * Supply your own logger to route Wechaty and puppet output into your
   * host process's logging pipeline (structured logs, sinks, sampling, ...).
   *
   * Scope note: this covers wechaty's own instance-level log calls and the
   * puppet layer (once it is constructed). Third-party libraries embedded
   * inside wechaty (e.g. `state-switch`, `memory-card`, `gerror`) still
   * emit through the process-wide brolog and are not rerouted by this
   * option.
   */
  logger?        : LoggerLike,
}

type WechatyOptionsPuppetInstance =
  & WechatyOptionsBase
  & OptionsPuppetInstance

type WechatyOptionsPuppetName =
  & WechatyOptionsBase
  & OptionsPuppetName

type WechatyOptions =
  | WechatyOptionsPuppetInstance
  | WechatyOptionsPuppetName

export {
  type WechatyOptions,
  type WechatyOptionsPuppetName,
}
