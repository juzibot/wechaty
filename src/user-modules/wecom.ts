import { log, types } from '@juzi/wechaty-puppet'
import type { Constructor } from 'clone-class'

import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixinBase,
}                       from '../user-mixins/wechatify.js'
import type { RoomAntiSpamStrategy } from '@juzi/wechaty-puppet/types'

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

  static async getRoomAntiSpamStrategyList (): Promise<RoomAntiSpamStrategy[]> {
    return this.wechaty.puppet.getRoomAntiSpamStrategyList()
  }

  static async getRoomAntiSpamStrategyEffectRoomList (
    strategyId: string,
  ): Promise<string[]> {
    return this.wechaty.puppet.getRoomAntiSpamStrategyEffectRoomList(strategyId)
  }

  static async applyRoomAntiSpamStrategy (
    strategyId: string,
    roomIds: string[],
    active: boolean,
  ): Promise<void> {
    const rawRoomIdSet = new Set(roomIds)
    const rooms = (await this.wechaty.Room.batchLoadRooms(Array.from(rawRoomIdSet))).filter(room => room.owner()?.self())

    const actualRoomIdSet = new Set(rooms.map(room => room.id))
    const filteredRoomIds = Array.from(rawRoomIdSet).filter(id => !actualRoomIdSet.has(id))

    if (filteredRoomIds.length) {
      log.warn(`these rooms cannot be applied with anti-spam strategy: ${filteredRoomIds}`)
    }

    return this.wechaty.puppet.applyRoomAntiSpamStrategy(strategyId, Array.from(actualRoomIdSet), active)
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
