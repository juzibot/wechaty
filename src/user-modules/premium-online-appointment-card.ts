import type * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'

const PREMIUM_ONLINE_APPOINTMENT_CARD_LINK_TYPE = 45

class PremiumOnlineAppointmentCardMixin extends wechatifyMixinBase() {

  constructor (
    public readonly payload: PUPPET.payloads.PremiumOnlineAppointmentCard,
  ) {
    super()
    log.verbose('PremiumOnlineAppointmentCard', 'constructor()')
  }

  static async findAll (query: {
    linkTypes?: number[],
    page?: number,
    pageSize?: number
  }): Promise<PremiumOnlineAppointmentCardInterface[]> {
    log.verbose('PremiumOnlineAppointmentCard', 'findAll(%s)', JSON.stringify(query))

    const params = {
      linkTypes: query.linkTypes || [ PREMIUM_ONLINE_APPOINTMENT_CARD_LINK_TYPE ],
      page: query.page || 1,
      pageSize: query.pageSize || 50,
    }

    const result = await (this.wechaty.puppet as any).listPremiumOnlineAppointmentCards(params)

    if (!result || !result.tools) {
      return []
    }

    const cardList: PremiumOnlineAppointmentCardInterface[] = result.tools.map((payload: any) => {
      return new this(payload)
    })

    return cardList
  }

  static async find (query: {
    componentId: number
  }): Promise<PremiumOnlineAppointmentCardInterface | undefined> {
    log.verbose('PremiumOnlineAppointmentCard', 'find(%s)', JSON.stringify(query))

    const linkTypes = [ PREMIUM_ONLINE_APPOINTMENT_CARD_LINK_TYPE ]
    const cardList = await this.findAll({
      linkTypes,
      page: 1,
      pageSize: 50,
    })

    return cardList.find(card => card.componentId() === query.componentId)
  }

  componentId (): number {
    return this.payload.componentId
  }

  titleImage (): string | undefined {
    return this.payload.titleImage
  }

  createTime (): number | undefined {
    return this.payload.createTime
  }

  title (): string | undefined {
    return this.payload.title
  }

  subTitle (): string | undefined {
    return this.payload.subTitle
  }

}

class PremiumOnlineAppointmentCardImpl extends validationMixin(PremiumOnlineAppointmentCardMixin)<PremiumOnlineAppointmentCardInterface>() { }
interface PremiumOnlineAppointmentCardInterface extends PremiumOnlineAppointmentCardImpl { }

type PremiumOnlineAppointmentCardConstructor = Constructor<
  PremiumOnlineAppointmentCardInterface,
  typeof PremiumOnlineAppointmentCardImpl
>

export type {
  PremiumOnlineAppointmentCardConstructor,
  PremiumOnlineAppointmentCardInterface,
}
export {
  PremiumOnlineAppointmentCardImpl,
}
