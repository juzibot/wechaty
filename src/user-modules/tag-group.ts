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
 *   Unless required by applicable law or agGroupreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific languagGroupe governing permissions and
 *   limitations under the License.
 *
 */
import type * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'

class TagGroupMixin extends wechatifyMixinBase() {

  /**
   *
   * Create
   *
   */
  static create (payload: PUPPET.payloads.TagGroup): TagGroupInterface {
    log.verbose('TagGroup', 'create()')

    return new this(payload)
  }

  /**
   * @hideconstructor
   */
  constructor (
    public readonly payload: PUPPET.payloads.TagGroup,
  ) {
    super()
    log.silly('TagGroup', 'constructor()')
  }

  id (): string {
    return this.payload.id
  }

  name (): string {
    return this.payload.name
  }

  static async createTagGroup (name: string): Promise<TagGroupInterface | void> {
    log.verbose('TagGroup', 'createTagGroup(%s, %s)', name)

    try {
      const payload = await this.wechaty.puppet.tagGroupAdd(name)
      if (payload) {
        return new this(payload)
      }
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Contact', 'createTag() exception: %s', (e as Error).message)
    }
  }

  static async deleteTagGroup (tagGroup: TagGroupInterface): Promise<TagGroupInterface | void> {
    log.verbose('TagGroup', 'deleteTagGroup(%s)', tagGroup)

    try {
      await this.wechaty.puppet.tagGroupDelete(tagGroup.id())
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Contact', 'createTag() exception: %s', (e as Error).message)
    }
  }

  static async list (): Promise<TagGroupInterface[]> {
    log.verbose('TagGroup', 'list()')

    try {
      const payloads = await this.wechaty.puppet.tagGroupList()
      return payloads.map(payload => new this(payload))
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('TagGroup', 'list() exception: %s', (e as Error).message)
      return []
    }
  }

}

class TagGroupImpl extends validationMixin(TagGroupMixin)<TagGroupInterface>() { }
interface TagGroupInterface extends TagGroupImpl { }

type TagGroupConstructor = Constructor<
  TagGroupInterface,
  typeof TagGroupImpl
>

export type {
  TagGroupConstructor,
  TagGroupInterface,
}
export {
  TagGroupImpl,
}
