import type * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'

class ChannelCardMixin extends wechatifyMixinBase() {

  /**
   *
   * Create
   *
   */
  static async create (): Promise<ChannelCardInterface> {
    log.verbose('ChannelCard', 'create()')

    // TODO: get appid and username from wechat
    const payload: PUPPET.payloads.ChannelCard = {
      avatar: 'todo',
      extras: 'todo',
      nickname: 'todo',
      url: 'todo',
      authIconUrl: 'todo',
      authJob: 'todo',
    }

    return new this(payload)
  }

  /*
   * @hideconstructor
   */
  constructor (
    public readonly payload: PUPPET.payloads.ChannelCard,
  ) {
    super()
    log.verbose('ChannelCard', 'constructor()')
  }

  avatar (): undefined | string {
    return this.payload.avatar
  }

  extras (): undefined | string {
    return this.payload.extras
  }

  nickname (): undefined | string {
    return this.payload.nickname
  }

  url (): undefined | string {
    return this.payload.url
  }

  authIconUrl (): undefined | string {
    return this.payload.authIconUrl
  }

  authJob (): undefined | string {
    return this.payload.authJob
  }

}

class ChannelCardImpl extends validationMixin(ChannelCardMixin)<ChannelCardInterface>() { }
interface ChannelCardInterface extends ChannelCardImpl { }

type ChannelCardConstructor = Constructor<
  ChannelCardInterface,
  typeof ChannelCardImpl
>

export type {
  ChannelCardConstructor,
  ChannelCardInterface,
}
export {
  ChannelCardImpl,
}
