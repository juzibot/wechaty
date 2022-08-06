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
import type * as PUPPET from '@juzi/wechaty-puppet'
import { TagType } from '@juzi/wechaty-puppet/dist/esm/src/schemas/tag.js'
import type { TagIdentifier } from '@juzi/wechaty-puppet/filters'
import { getTagKey } from '@juzi/wechaty-puppet/helpers'

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
  public readonly id: string
  public readonly groupId?: string

  /**
   * @hideconstructor
   */
  constructor (
    public readonly key: string,
  ) {
    super()
    this.groupId = this.key.split(FOUR_PER_EM_SPACE)[0]
    this.id = this.key.split(FOUR_PER_EM_SPACE)[1]!
    log.silly('Tag', 'constructor()')
  }

  type (): PUPPET.types.Tag {
    return (this.payload && this.payload.type) || TagType.Personal
  }

  name (): string {
    return (this.payload && this.payload.name) || ''
  }

  async group (): Promise<TagGroupInterface | undefined> {
    return this.groupId ? this.wechaty.TagGroup.find(this.groupId) : undefined
  }

  static async list (forceSync = false): Promise<TagInterface[]> {
    log.verbose('Tag', 'list(%s)', forceSync)

    try {
      const tagIdentifierList = await this.wechaty.puppet.tagTagList()

      const identifierToTag = async (identifier: TagIdentifier) => this.find(identifier).catch(e => this.wechaty.emitError(e))

      const CONCURRENCY = 17
      const tagIterator = concurrencyExecuter(CONCURRENCY)(identifierToTag)(tagIdentifierList)

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

  static async find (identifier: TagIdentifier): Promise<TagInterface | undefined> {
    log.silly('Tag', 'find(%s)', JSON.stringify(identifier))

    const tag = (this.wechaty.Tag as any as typeof TagImpl).load(getTagKey(identifier))

    try {
      await tag.ready()
    } catch (e) {
      this.wechaty.emitError(e)
      return undefined
    }
    return tag
  }

  /**
   * Force reload data for Tag, Sync data from low-level API again.
   *
   * @returns {Promise<this>}
   * @example
   * await tag.sync()
   */
  async sync (): Promise<void> {
    await this.wechaty.puppet.tagPayloadDirty(getTagKey({
      id: this.id,
      groupId: this.groupId,
    }))
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
    log.silly('Tag', 'ready() @ %s with Tag key="%s"', this.wechaty.puppet, this.key)

    if (!forceSync && this.isReady()) { // already ready
      log.silly('Tag', 'ready() isReady() true')
      return
    }

    try {
      this.payload = await this.wechaty.puppet.tagPayload({
        id: this.id,
        groupId: this.groupId,
      })

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

    const tag = { id: this.id, groupId: this.groupId } as TagIdentifier
    const contactIds = await this.wechaty.puppet.tagTagContactList(tag)
    const contactPromises = contactIds.map(id => this.wechaty.Contact.find({ id })) as Promise<ContactInterface>[]
    return Promise.all(contactPromises)
  }

  async tag (contacts: ContactInterface | ContactInterface[]): Promise<void> {
    log.verbose('Tag', 'tag(%s) for tag : %s', contacts, this)

    const tag = { id: this.id, groupId: this.groupId } as TagIdentifier
    let contactIds: string[]
    if (Array.isArray(contacts)) {
      contactIds = contacts.map(c => c.id)
    } else {
      contactIds = [contacts.id]
    }
    await this.wechaty.puppet.tagContactTagAdd([tag], contactIds)
  }

  static async createTag (name: string, tagGroup?: TagGroupInterface): Promise<TagInterface | void> {
    log.verbose('Tag', 'createTag(%s, %s)', tagGroup, name)

    try {
      const tagIdentifier = await this.wechaty.puppet.tagTagAdd(name, tagGroup?.name())
      if (tagIdentifier) {
        const newTag = await this.find(tagIdentifier)
        return newTag
      }
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Tag', 'createTag() exception: %s', (e as Error).message)
    }
  }

  static async deleteTag (tagInstance: TagInterface): Promise<void> {
    log.verbose('Tag', 'deleteTag(%s, %s)', tagInstance)

    const tagIdentifier = { id: tagInstance.id, groupId: tagInstance.groupId } as TagIdentifier

    try {
      await this.wechaty.puppet.tagTagDelete(tagIdentifier)
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
