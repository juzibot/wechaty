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
import { log } from '@juzi/wechaty-puppet'
import type { Constructor } from 'clone-class'

import type { ContactInterface } from './contact.js'
import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixinBase,
}                       from '../user-mixins/wechatify.js'
import type { FileBoxInterface } from 'file-box'
import type { PostInterface } from './post.js'
import { concurrencyExecuter } from 'rx-queue'

class MomentMixin extends wechatifyMixinBase() {

  static async post (post: PostInterface) {
    // post new moment
    return this.wechaty.publish(post)
  }

  static timeline (contact: ContactInterface): PostInterface[] {
    // list all moment
    void contact
    return []
  }

  static async signature (signature?: string): Promise<void | string> {
    log.verbose('Moment', 'signature(%s)', signature)

    return this.wechaty.puppet.momentSignature(signature)
  }

  static async coverage (coverage?: FileBoxInterface): Promise<void | FileBoxInterface> {
    log.verbose('Moment', 'coverage(%s)', JSON.stringify(coverage))

    return this.wechaty.puppet.momentCoverage(coverage)
  }

  static async visibleList (): Promise<ContactInterface[]> {
    log.verbose('Moment', 'visibleList()')

    try {
      const contactIdList: string[] = await this.wechaty.puppet.momentVisibleList()

      const idToContact = async (id: string) => this.wechaty.Contact.find({ id }).catch(e => this.wechaty.emitError(e))

      /**
       * we need to use concurrencyExecuter to reduce the parallel number of the requests
       */
      const CONCURRENCY = 17
      const contactIterator = concurrencyExecuter(CONCURRENCY)(idToContact)(contactIdList)

      const contactList: ContactInterface[] = []

      for await (const contact of contactIterator) {
        if (contact) {
          contactList.push(contact)
        }
      }

      return contactList

    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Moment', 'this.wechaty.puppet.momentVisibleList() rejected: %s', (e as Error).message)
      return []
    }
  }

  /*
   * @hideconstructor
   */
  constructor () {
    super()
    log.verbose('Moment', 'constructor()')
  }

}

class MomentImpl extends validationMixin(MomentMixin)<MomentInterface>() {}
interface MomentInterface extends MomentImpl {}
type MomentConstructor = Constructor<
  MomentInterface,
  typeof MomentImpl
>

export type {
  MomentConstructor,
  MomentInterface,
}
export {
  MomentImpl,
}
