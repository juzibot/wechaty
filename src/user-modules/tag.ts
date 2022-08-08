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
import * as PUPPET from '@juzi/wechaty-puppet'
import type { TagQueryFilter } from '@juzi/wechaty-puppet/dist/esm/src/schemas/tag.js'

import type { Constructor } from 'clone-class'
import { concurrencyExecuter } from 'rx-queue'
import { FOUR_PER_EM_SPACE, log } from '../config.js'
import { poolifyMixin } from '../user-mixins/poolify.js'

import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixin,
}                     from '../user-mixins/wechatify.js'
import type { ContactInterface } from './contact.js'
import type { TagGroupInterface } from './tag-group.js'

const MixinBase = wechatifyMixin(
  poolifyMixin(
    Object,
  )<TagImplInterface>(),
)

class TagMixin extends MixinBase {

  /**
   *
   * Instance properties
   * @ignore
   *
   */
  payload?: PUPPET.payloads.Tag

  /**
   * @hideconstructor
   */
  constructor (
    public readonly id: string,
  ) {
    super()
    log.silly('Tag', 'constructor()')
  }

  type (): PUPPET.types.Tag {
    return (this.payload && this.payload.type) || PUPPET.types.Tag.Unspecific
  }

  name (): string {
    return (this.payload && this.payload.name) || ''
  }

  groupId (): string {
    return (this.payload && this.payload.groupId) || ''
  }

  async group (): Promise<TagGroupInterface | undefined> {
    return this.payload?.groupId ? this.wechaty.TagGroup.find({ id: this.payload.groupId }) : undefined
  }

  static async list (): Promise<TagInterface[]> {
    log.verbose('Tag', 'list()')

    try {
      const tagIdList = await this.wechaty.puppet.tagTagList()

      const idToTag = async (id: string) => this.find({ id }).catch(e => this.wechaty.emitError(e))

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
      log.error('Tag', 'list() exception: %s', (e as Error).message)
      return []
    }
  }

  static async find (filter: TagQueryFilter): Promise<TagInterface | undefined> {
    log.silly('Tag', 'find(%s)', JSON.stringify(filter))

    if (filter.id) {
      const tag = (this.wechaty.Tag as any as typeof TagImpl).load(filter.id)

      try {
        await tag.ready()
      } catch (e) {
        this.wechaty.emitError(e)
        return undefined
      }
      return tag
    }

    if (filter.name) {
      const tags = (await this.wechaty.Tag.list()).filter(t => t.name() === filter.name)
      if (tags.length > 0) {
        return tags[0]
      }
    }

    return undefined
    // TODO: use a puppet method to find tag, like how contact and room do it
  }

  /**
   * Force reload data for Tag, Sync data from low-level API again.
   *
   * @returns {Promise<this>}
   * @example
   * await tag.sync()
   */
  async sync (): Promise<void> {
    await this.wechaty.puppet.tagPayloadDirty(this.id)
    await this.ready(true)
  }

  /**
   * @ignore
   */
  isReady (): boolean {
    return !!(this.payload && this.payload.name)
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
    log.silly('Tag', 'ready() @ %s with Tag key="%s"', this.wechaty.puppet, this.id)

    if (!forceSync && this.isReady()) { // already ready
      log.silly('Tag', 'ready() isReady() true')
      return
    }

    try {
      this.payload = await this.wechaty.puppet.tagPayload(this.id)

    } catch (e) {
      this.wechaty.emitError(e)
      log.verbose('Tag', 'ready() this.wechaty.puppet.tagPayload(%s) exception: %s',
        this.id,
        (e as Error).message,
      )
      throw e
    }
  }

  async contactList (): Promise<ContactInterface[]> {
    log.verbose('Tag', 'contactList() for tag : %s', this)

    const contactIds = await this.wechaty.puppet.tagTagContactList(this.id)
    const contactPromises = contactIds.map(id => this.wechaty.Contact.find({ id })) as Promise<ContactInterface>[]
    return Promise.all(contactPromises)
  }

  async tag (contacts: ContactInterface | ContactInterface[]): Promise<void> {
    log.verbose('Tag', 'tag(%s) for tag : %s', contacts, this)

    let contactIds: string[]
    if (Array.isArray(contacts)) {
      contactIds = contacts.map(c => c.id)
    } else {
      contactIds = [contacts.id]
    }
    await this.wechaty.puppet.tagContactTagAdd([this.id], contactIds)
  }

  static async createTag (name: string, tagGroup?: TagGroupInterface): Promise<TagInterface | void> {
    log.verbose('Tag', 'createTag(%s, %s)', tagGroup, name)

    try {
      const tagId = await this.wechaty.puppet.tagTagAdd(name, tagGroup?.name())
      if (tagId) {
        const newTag = await this.find({ id: tagId })
        return newTag
      }
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Tag', 'createTag() exception: %s', (e as Error).message)
    }
  }

  static async deleteTag (tagInstance: TagInterface): Promise<void> {
    log.verbose('Tag', 'deleteTag(%s, %s)', tagInstance)

    try {
      await this.wechaty.puppet.tagTagDelete(tagInstance.id)
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Tag', 'deleteTag() exception: %s', (e as Error).message)
    }
  }

  override toString () {
    return `<Tag#${this.name() || this.id}>`
  }

}

class TagImplBase extends validationMixin(TagMixin)<TagImplInterface>() {}
interface TagImplInterface extends TagImplBase {}

type TagProtectedProperty =
  | 'ready'

type TagInterface = Omit<TagImplInterface, TagProtectedProperty>
class TagImpl extends validationMixin(TagImplBase)<TagInterface>() {}

type TagConstructor = Constructor<
  TagImplInterface,
  Omit<typeof TagImpl, 'load'>
>

export type {
  TagConstructor,
  TagProtectedProperty,
  TagInterface,
}
export {
  TagImpl,
}
