import type * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'
class PremiumOnlineAppointmentCardMixin extends wechatifyMixinBase() {

  constructor (
    public readonly payload: PUPPET.payloads.PremiumOnlineAppointmentCard,
  ) {
    super()
    log.verbose('PremiumOnlineAppointmentCard', 'constructor()')
  }

  static async findAll (query: {
    type?: string,
    page?: number,
    pageSize?: number
  }): Promise<PremiumOnlineAppointmentCardInterface[]> {
    log.verbose('PremiumOnlineAppointmentCard', 'findAll(%s)', JSON.stringify(query))

    const params = {
      type: query.type || 'card',
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

  componentId (): string {
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
