import * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'
import type { ContactImpl, ContactInterface } from './contact.js'

class CallRecordMixin extends wechatifyMixinBase() {

  static async create (): Promise<CallRecordInterface> {
    log.verbose('CallRecord', 'create()')

    const payload: PUPPET.payloads.CallRecord = {
      starter: 'todo',
      participants: [ 'todo' ],
      length: 0,
      type: 0,
      status: 0,
    }

    return new this(payload)
  }

  /*
   * @hideconstructor
   */
  constructor (
      public readonly payload: PUPPET.payloads.CallRecord,
  ) {
    super()
    log.verbose('CallRecord', 'constructor()')
  }

  async starter (): Promise<undefined | ContactInterface> {
    const starterId = this.payload.starter
    if (!starterId) {
      return undefined
    }
    const starter = (this.wechaty.Contact as typeof ContactImpl).find({ id: starterId })
    return starter
  }

  async participants (): Promise<ContactInterface[]> {
    const participantIds = this.payload.participants

    const contactPromises = participantIds.map((this.wechaty.Contact as typeof ContactImpl).find.bind(this.wechaty.Contact))
    const contacts = await Promise.all(contactPromises)

    return contacts.filter(item => !!item) as ContactInterface[]
  }

  length (): number {
    return this.payload.length
  }

  type (): PUPPET.types.Call {
    return this.payload.type || PUPPET.types.Call.UNKNOWN
  }

  status (): PUPPET.types.CallStatus {
    return this.payload.status || PUPPET.types.CallStatus.UNKNOWN
  }

}

class CallRecordImpl extends validationMixin(CallRecordMixin)<CallRecordInterface>() { }
interface CallRecordInterface extends CallRecordImpl { }

type CallRecordConstructor = Constructor<
  CallRecordInterface,
  typeof CallRecordImpl
>

export type {
  CallRecordConstructor,
  CallRecordInterface,
}
export {
  CallRecordImpl,
}
