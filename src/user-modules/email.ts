/**
 *   Wechaty Chatbot SDK - https://github.com/wechaty/wechaty
 *
 *   @copyright 2016 Huan LI (李卓桓) <https://github.com/huan>, and
 *                   Wechaty Contributors <https://github.com/wechaty>.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */
import type * as PUPPET     from '@juzi/wechaty-puppet'
import type { Constructor } from 'clone-class'

import { validationMixin }    from '../user-mixins/validation.js'
import { wechatifyMixinBase } from '../user-mixins/wechatify.js'

class EmailMixin extends wechatifyMixinBase() {

  /**
   *
   * Create from payload
   *
   */
  static create (
    payload: PUPPET.payloads.Email,
  ): EmailInterface {
    this.log.verbose('Email', 'create()')
    return new this(payload)
  }

  /*
   * @hideconstructor
   */
  constructor (
    public readonly payload: PUPPET.payloads.Email,
  ) {
    super()
    this.log.verbose('Email', 'constructor()')
  }

  override toString (): string {
    return `Email<${this.payload.subject}>`
  }

  subject (): string {
    return this.payload.subject
  }

  from (): PUPPET.payloads.EmailAddress {
    return this.payload.from
  }

  to (): PUPPET.payloads.EmailAddress[] {
    return this.payload.to
  }

  cc (): undefined | PUPPET.payloads.EmailAddress[] {
    return this.payload.cc
  }

  bcc (): undefined | PUPPET.payloads.EmailAddress[] {
    return this.payload.bcc
  }

  date (): undefined | number {
    return this.payload.date
  }

  mimeMessageId (): undefined | string {
    return this.payload.mimeMessageId
  }

  inReplyTo (): undefined | string {
    return this.payload.inReplyTo
  }

  references (): undefined | string[] {
    return this.payload.references
  }

  replyTo (): undefined | PUPPET.payloads.EmailAddress[] {
    return this.payload.replyTo
  }

  sender (): undefined | PUPPET.payloads.EmailAddress {
    return this.payload.sender
  }

  headers (): undefined | { [name: string]: string } {
    return this.payload.headers
  }

  text (): undefined | string {
    return this.payload.text
  }

  html (): undefined | string {
    return this.payload.html
  }

  attachments (): undefined | PUPPET.payloads.EmailAttachment[] {
    return this.payload.attachments
  }

}

class EmailImpl extends validationMixin(EmailMixin)<EmailInterface>() {}
interface EmailInterface extends EmailImpl {}

type EmailConstructor = Constructor<
  EmailInterface,
  typeof EmailImpl
>

export type {
  EmailConstructor,
  EmailInterface,
}
export {
  EmailImpl,
}
