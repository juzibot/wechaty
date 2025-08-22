import type * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'

import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'

class ConsultCardMixin extends wechatifyMixinBase() {

  constructor (
    public readonly payload: PUPPET.payloads.ConsultCard,
  ) {
    super()
    log.verbose('ConsultCard', 'constructor()')
  }

  static async findAll (query: {
    cardType: number,
    status?: number,
    ids?: number[],
    page?: number,
    pageSize?: number
  }): Promise<ConsultCardInterface[]> {
    log.verbose('ConsultCard', 'findAll(%s)', JSON.stringify(query))

    const params = {
      cardType: query.cardType,
      status: query.status,
      ids: query.ids,
      page: query.page || 1,
      pageSize: query.pageSize || 50,
    }

    const result = await (this.wechaty.puppet as any).listConsultCards(params)

    if (!result || !result.cards) {
      return []
    }

    const consultCardList: ConsultCardInterface[] = result.cards.map((payload: any) => {
      return new this(payload)
    })

    return consultCardList
  }

  static async find (query: {
    cardType: number,
    id: number
  }): Promise<ConsultCardInterface | undefined> {
    log.verbose('ConsultCard', 'find(%s)', JSON.stringify(query))

    const consultCardList = await this.findAll({
      cardType: query.cardType,
      ids: [ query.id ],
      page: 1,
      pageSize: 1,
    })

    return consultCardList.length > 0 ? consultCardList[0] : undefined
  }

  id (): number | undefined {
    return this.payload.id
  }

  cardType (): number | undefined {
    return this.payload.cardType
  }

  name (): string | undefined {
    return this.payload.name
  }

  content (): string | undefined {
    return this.payload.content
  }

  status (): number | undefined {
    return this.payload.status
  }

  statusMsg (): number | undefined {
    return this.payload.statusMsg
  }

  actions (): Array<any> | undefined {
    return this.payload.actions
  }

}

class ConsultCardImpl extends validationMixin(ConsultCardMixin)<ConsultCardInterface>() { }
interface ConsultCardInterface extends ConsultCardImpl { }

type ConsultCardConstructor = Constructor<
  ConsultCardInterface,
  typeof ConsultCardImpl
>

export type {
  ConsultCardConstructor,
  ConsultCardInterface,
}
export {
  ConsultCardImpl,
}
