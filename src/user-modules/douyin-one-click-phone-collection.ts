import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
}                       from '../user-mixins/wechatify.js'

class DouyinOneClickPhoneCollectionMixin extends wechatifyMixinBase() {

  /**
   *
   * Create
   *
   */
  static async create (): Promise<DouyinOneClickPhoneCollectionInterface> {
    log.verbose('DouyinOneClickPhoneCollection', 'create()')

    return new this({})
  }

  /*
   * @hideconstructor
   */
  constructor (
    public readonly payload: {},
  ) {
    super()
    log.verbose('DouyinOneClickPhoneCollection', 'constructor()')
    // Huan(202110): it is ok to create a raw one without wechaty instance
    // guardWechatifyClass.call(this, DouyinOneClickPhoneCollection)
  }

}

class DouyinOneClickPhoneCollectionImpl extends validationMixin(DouyinOneClickPhoneCollectionMixin)<DouyinOneClickPhoneCollectionInterface>() {}
interface DouyinOneClickPhoneCollectionInterface extends DouyinOneClickPhoneCollectionImpl {}

type DouyinOneClickPhoneCollectionConstructor = Constructor<
  DouyinOneClickPhoneCollectionInterface,
  typeof DouyinOneClickPhoneCollectionImpl
>

export type {
  DouyinOneClickPhoneCollectionConstructor,
  DouyinOneClickPhoneCollectionInterface,
}
export {
  DouyinOneClickPhoneCollectionImpl,
}
