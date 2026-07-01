import { log }              from '@juzi/wechaty-puppet'
import type { Constructor } from 'clone-class'

import type { LoggerLike }      from '../schemas/logger.js'
import type { WechatyInterface } from '../wechaty/mod.js'

const WECHATIFIED_PREFIX = 'Wechatified'

interface WechatyMinxin {
  wechaty: WechatyInterface,
  new (...args: any[]): {
    get wechaty (): WechatyInterface
  }
}

const wechatifyUserModule = <T extends WechatyMinxin> (UserClass: T) => {
  log.verbose('WechatifyMixin', 'wechatifyUserModule(%s)', UserClass.name)

  return (wechaty: WechatyInterface): T => {
    log.verbose('WechatifyMixin', 'wechatifyUserModule(%s)(%s)', UserClass.name, wechaty)

    class WechatifiedUserClass extends UserClass {

      static override get wechaty () { return wechaty }
      override get wechaty        () { return wechaty }

    }

    Reflect.defineProperty(WechatifiedUserClass, 'name', {
      value: WECHATIFIED_PREFIX + UserClass.name,
    })

    return WechatifiedUserClass
  }
}

const throwWechatifyError = (WechatyUserClass: Function) => {
  throw new Error([
    `${WechatyUserClass.name}: Wechaty User Class (WUC) can not be instantiated directly!`,
    'See: https://github.com/wechaty/wechaty/issues/1217',
  ].join('\n'))
}

const isWechatified = (klass: Function) => klass.name.startsWith(WECHATIFIED_PREFIX)

const wechatifyMixin = <TBase extends Constructor> (Base: TBase) => {
  log.verbose('WechatifyMixin', 'wechatifyMixin(%s)', Base.name || '')

  abstract class AbstractWechatifyMixin extends Base {

    static get wechaty  (): WechatyInterface { return throwWechatifyError(this) }
    get wechaty         (): WechatyInterface { return throwWechatifyError(this.constructor) }

    /**
     * Route a user module's log calls through the wechaty instance's effective
     * logger (populated in puppet-mixin from `puppet.log`, brolog fallback).
     *
     * The try/catch guards two windows: (a) direct access on the un-wechatified
     * base class (which throws) and (b) puppet-not-yet-ready inside init. In
     * both cases we fall back to the module-imported brolog `log`, matching
     * the historical behavior.
     */
    static get log (): LoggerLike {
      try {
        return this.wechaty.log
      } catch (_) {
        return log
      }
    }

    get log (): LoggerLike {
      try {
        return this.wechaty.log
      } catch (_) {
        return log
      }
    }

    constructor (...args: any[]) {
      super(...args)
      if (!isWechatified(this.constructor)) {
        throwWechatifyError(this.constructor)
      }
    }

  }

  return AbstractWechatifyMixin
}

const wechatifyMixinBase = () => wechatifyMixin(class EmptyBase {})

export {
  isWechatified,
  wechatifyMixin,
  wechatifyMixinBase,
  wechatifyUserModule,
}
