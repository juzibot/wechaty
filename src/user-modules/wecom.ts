import type { payloads, types } from '@juzi/wechaty-puppet'
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
      this.log.warn(`these rooms cannot be applied with anti-spam strategy: ${filteredRoomIds}`)
    }

    if (actualRoomIdSet.size) {
      return this.wechaty.puppet.applyRoomAntiSpamStrategy(strategyId, Array.from(actualRoomIdSet), active)
    }
  }

  static async getCorpMessageInterceptionStrategies (): Promise<types.CorpMessageInterceptionStrategy[]> {
    return this.wechaty.puppet.getCorpMessageInterceptionStrategies()
  }

  static async orgBroadcastPayload (
    orgBroadcastId: string,
  ): Promise<payloads.OrgBroadcast> {
    return this.wechaty.puppet.orgBroadcastPayload(orgBroadcastId)
  }

  /**
   * Execute (confirm sending) an org broadcast plan.
   * targetIds: omitted means all targets of the plan; otherwise a subset of the plan targets.
   * An empty array is rejected, since puppets read an empty selection as all targets.
   */
  static async orgBroadcastExecute (
    orgBroadcastId: string,
    targetIds?: string[],
  ): Promise<void> {
    if (targetIds && targetIds.length === 0) {
      throw new Error('targetIds is empty, omit it to send to all targets of the org broadcast')
    }
    return this.wechaty.puppet.orgBroadcastExecute(orgBroadcastId, targetIds)
  }

  /*
   * @hideconstructor
   */
  constructor () {
    super()
    this.log.verbose('Wecom', 'constructor()')
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
