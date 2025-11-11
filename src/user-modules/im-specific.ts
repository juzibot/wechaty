import { log } from '@juzi/wechaty-puppet'
import type { Constructor } from 'clone-class'

import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixinBase,
}                       from '../user-mixins/wechatify.js'
import type { PaginationRequest } from '@juzi/wechaty-puppet/filters'

class ImSpecificMixin extends wechatifyMixinBase() {

  // xiaohongshu
  static async listIntentComment (
    query: PaginationRequest,
  ) {
    return this.wechaty.puppet.listIntentComments(query)
  }

  static async getIntentComment (
    id: string,
  ) {
    return this.wechaty.puppet.intentCommentPayload(id)
  }

  /*
   * @hideconstructor
   */
  constructor () {
    super()
    log.verbose('ImSpecific', 'constructor()')
  }

}

class ImSpecificImpl extends validationMixin(ImSpecificMixin)<ImSpecificInterface>() {}
interface ImSpecificInterface extends ImSpecificImpl {}
type ImSpecificConstructor = Constructor<
  ImSpecificInterface,
  typeof ImSpecificImpl
>

export type {
  ImSpecificConstructor,
  ImSpecificInterface,
}
export {
  ImSpecificImpl,
}
