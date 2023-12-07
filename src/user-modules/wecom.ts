import { log, types } from '@juzi/wechaty-puppet'
import type { Constructor } from 'clone-class'

import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixinBase,
}                       from '../user-mixins/wechatify.js'

class WecomMixin extends wechatifyMixinBase() {

  static async getExternalUserId (
    contactIds: string[],
    serviceProviderId?: string,
  ): Promise<types.ContactIdExternalUserIdPair[]> {
    return this.wechaty.puppet.getContactExternalUserId(
      contactIds,
      serviceProviderId,
    )
  }

  /*
   * @hideconstructor
   */
  constructor () {
    super()
    log.verbose('Wecom', 'constructor()')
  }

}

class WecomImpl extends validationMixin(WecomMixin)<WecomInterface>() {}
interface WecomInterface extends WecomImpl {}
type WecomConstructor = Constructor<
  WecomInterface,
  typeof WecomImpl
>

export type {
  WecomConstructor,
  WecomInterface,
}
export {
  WecomImpl,
}
