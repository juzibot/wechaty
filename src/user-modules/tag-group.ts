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
import type { TagGroupQueryFilter } from '@juzi/wechaty-puppet/dist/esm/src/schemas/tag.js'

import type { Constructor } from 'clone-class'
import { concurrencyExecuter } from 'rx-queue'
import { log } from '../config.js'
import { poolifyMixin } from '../user-mixins/poolify.js'

import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixin,
} from '../user-mixins/wechatify.js'
import type { TagInterface } from './tag.js'

const MixinBase = wechatifyMixin(
  poolifyMixin(
    Object,
  )<TagGroupImplInterface>(),
)

class TagGroupMixin extends MixinBase {

  /**
   *
   * Instance properties
   * @ignore
   *
   */
  payload?: PUPPET.payloads.TagGroup

  /**
   * @hideconstructor
   */
  constructor (
    public readonly id: string,
  ) {
    super()
    log.silly('TagGroup', 'constructor()')
  }

  name (): string {
    return (this.payload && this.payload.name) || ''
  }

  static async list (): Promise<TagGroupInterface[]> {
    log.verbose('TagGroup', 'list()')

    try {
      const tagGroupIds = await this.wechaty.puppet.tagGroupList()

      const idToTagGroup = async (id: string) => this.find({ id }).catch(e => this.wechaty.emitError(e))

      const CONCURRENCY = 17
      const tagGroupIterator = concurrencyExecuter(CONCURRENCY)(idToTagGroup)(tagGroupIds)

      const tagGroupList: TagGroupInterface[] = []
      for await (const tagGroup of tagGroupIterator) {
        if (tagGroup) {
          tagGroupList.push(tagGroup)
        }
      }

      return tagGroupList

    } catch (e) {
      this.wechaty.emitError(e)
      log.error('TagGroup', 'list() exception: %s', (e as Error).message)
      return []
    }
  }

  static async createTagGroup (name: string): Promise<TagGroupInterface | void> {
    log.verbose('TagGroup', 'createTagGroup(%s, %s)', name)

    try {
      const groupId = await this.wechaty.puppet.tagGroupAdd(name)
      if (groupId) {
        const newTagGroup = await this.find({ id: groupId })
        return newTagGroup
      }
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Contact', 'createTag() exception: %s', (e as Error).message)
    }
  }

  static async deleteTagGroup (tagGroup: TagGroupInterface): Promise<TagGroupInterface | void> {
    log.verbose('TagGroup', 'deleteTagGroup(%s)', tagGroup)

    try {
      await this.wechaty.puppet.tagGroupDelete(tagGroup.id)
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('TagGroup', 'deleteTagGroup() exception: %s', (e as Error).message)
    }
  }

  async tags (): Promise<TagInterface[]> {
    log.verbose('TagGroup', 'tags(%s)', this)
    try {
      const tagIdList = await this.wechaty.puppet.tagGroupTagList(this.id)

      const idToTag = async (tagId: string) => this.wechaty.Tag.find({ id: tagId }).catch(e => this.wechaty.emitError(e))

      const CONCURRENCY = 17
      const tagIterator = concurrencyExecuter(CONCURRENCY)(idToTag)(tagIdList)

      const tagList: TagInterface[] = []
      for await (const tag of tagIterator) {
        if (tag) {
          tagList.push(tag)
        }
      }
      return tagList

    } catch (e) {
      this.wechaty.emitError(e)
      log.error('TagGroup', 'list() exception: %s', (e as Error).message)
      return []
    }

  }

  static async find (filter: TagGroupQueryFilter): Promise<TagGroupInterface | undefined> {
    log.silly('TagGroup', 'find(%s)', JSON.stringify(filter))

    if (filter.id) {
      const tagGroup = (this.wechaty.TagGroup as any as typeof TagGroupImpl).load(filter.id)

      try {
        await tagGroup.ready()
      } catch (e) {
        this.wechaty.emitError(e)
        return undefined
      }
      return tagGroup
    }

    if (filter.name) {
      const tagGroups = (await this.wechaty.TagGroup.list()).filter(tagGroup => tagGroup.name() === filter.name)
      if (tagGroups.length > 0) {
        return tagGroups[0]
      }
    }

    return undefined
    // TODO: use a puppet method to find tag, like how contact and room do it
  }

  /**
   * Force reload data for TagGroup, Sync data from low-level API again.
   *
   * @returns {Promise<this>}
   * @example
   * await tagGroup.sync()
   */
  async sync (): Promise<void> {
    await this.wechaty.puppet.tagGroupPayloadDirty(this.id)
    await this.ready(true)
  }

  /**
   * @ignore
   */
  isReady (): boolean {
    return !!(this.payload)
  }

  /**
   * `ready()` is For FrameWork ONLY!
   *
   * Please not to use `ready()` at the user land.
   * If you want to sync data, use `sync()` instead.
   *
   * @ignore
   */
  async ready (
    forceSync = false,
  ): Promise<void> {
    log.silly('TagGroup', 'ready() @ %s with TagGroup="%s"', this.wechaty.puppet, this.id)

    if (!forceSync && this.isReady()) { // already ready
      log.silly('TagGroup', 'ready() isReady() true')
      return
    }

    try {
      this.payload = await this.wechaty.puppet.tagGroupPayload(this.id)
    } catch (e) {
      this.wechaty.emitError(e)
      log.verbose('TagGroup', 'ready() this.wechaty.puppet.tagGroupPayload(%s) exception: %s',
        this.id,
        (e as Error).message,
      )
      throw e
    }
  }

  override toString () {
    return `<TagGroup#${this.name() || this.id}>`
  }

}

class TagGroupImplBase extends validationMixin(TagGroupMixin)<TagGroupImplInterface>() { }
interface TagGroupImplInterface extends TagGroupImplBase { }

type TagGroupProtectedProperty =
  | 'ready'

type TagGroupInterface = Omit<TagGroupImplInterface, TagGroupProtectedProperty>
class TagGroupImpl extends validationMixin(TagGroupImplBase)<TagGroupInterface>() { }

type TagGroupConstructor = Constructor<
  TagGroupImplInterface,
  Omit<typeof TagGroupImpl, 'load'>
>

export type {
  TagGroupConstructor,
  TagGroupProtectedProperty,
  TagGroupInterface,
}
export {
  TagGroupImpl,
}
