import type * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'

class ConsultCardMixin extends wechatifyMixinBase() {

  /**
   *
   * Create
   *
   */
  static async create (msgType: number, componentType: number, componentId: number): Promise<ConsultCardInterface> {
    log.verbose('ConsultCard', 'create()')

    const payload: PUPPET.payloads.ConsultCard = {
      msgType,
      componentType,
      componentId,
    }

    return new this(payload)
  }

  /*
   * @hideconstructor
   */
  constructor (
    public readonly payload: PUPPET.payloads.ConsultCard,
  ) {
    super()
    log.verbose('ConsultCard', 'constructor()')
  }

  msgType (): number {
    return this.payload.msgType
  }

  componentType (): number {
    return this.payload.componentType
  }

  componentId (): number {
    return this.payload.componentId
  }

  // 接收/查询时的详细字段
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
