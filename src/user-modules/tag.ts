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
import type { TagIdentifier } from '@juzi/wechaty-puppet/filters'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'
import {
  wechatifyMixinBase,
}                     from '../user-mixins/wechatify.js'
import type { ContactInterface } from './contact.js'
import type { TagGroupInterface } from './tag-group.js'

class TagMixin extends wechatifyMixinBase() {

  /**
   *
   * Create
   *
   */
  static create (payload: PUPPET.payloads.Tag): TagInterface {
    log.verbose('Tag', 'create()')

    return new this(payload)
  }

  /**
   * @hideconstructor
   */
  constructor (
    public readonly payload: PUPPET.payloads.Tag,
  ) {
    super()
    log.silly('Tag', 'constructor()')
  }

  id (): string {
    return this.payload.id
  }

  type (): PUPPET.types.Tag {
    return this.payload.type
  }

  groupId (): string {
    return this.payload.groupId || ''
  }

  name (): string {
    return this.payload.name
  }

  group (): TagGroupInterface | undefined {
    return this.wechaty.TagGroup.load(this.groupId())
  }

  private static pool: TagInterface[] = []

  static async list (forceSync = false): Promise<TagInterface[]> {
    log.verbose('Tag', 'list(%s)', forceSync)

    if (this.pool.length > 0 && !forceSync) {
      return this.pool
    }

    try {
      const payloads = await this.wechaty.puppet.tagTagList()
      this.pool = payloads.map(payload => new this(payload))
      return this.pool
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Tag', 'list() exception: %s', (e as Error).message)
      return []
    }
  }

  static async sync (): Promise<void> {
    log.verbose('Tag', 'sync()')

    await this.list(true)
  }

  static load (tag: TagIdentifier): TagInterface | undefined {
    log.verbose('TagGroup', 'load(%s)', tag)

    for (const item of this.pool) {
      if (item.id() === tag.id && (item.groupId() === tag.groupId || (!item.groupId() && !tag.groupId))) {
        return item
      }
    }
    return undefined
  }

  async contactList (): Promise<ContactInterface[]> {
    log.verbose('Tag', 'contactList() for tag : %s', this)

    const tag = { id: this.id(), groupId: this.groupId() } as TagIdentifier
    const contactIds = await this.wechaty.puppet.tagTagContactList(tag)
    const contactPromises = contactIds.map(id => this.wechaty.Contact.find({ id })) as Promise<ContactInterface>[]
    return Promise.all(contactPromises)
  }

  async tag (contacts: ContactInterface | ContactInterface[]): Promise<void> {
    log.verbose('Tag', 'tag(%s) for tag : %s', contacts, this)

    const tag = { id: this.id(), groupId: this.groupId() } as TagIdentifier
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
      const payload = await this.wechaty.puppet.tagTagAdd(name, tagGroup?.name())
      if (payload) {
        const newTag = new this(payload)
        this.pool.push(newTag)
        return newTag
      }
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Contact', 'createTag() exception: %s', (e as Error).message)
    }
  }

  static async deleteTag (tagInstance: TagInterface): Promise<void> {
    log.verbose('Tag', 'deleteTag(%s, %s)', tagInstance)

    const tag = { id: tagInstance.id(), groupId: tagInstance.groupId() } as TagIdentifier

    try {
      await this.wechaty.puppet.tagTagDelete(tag)
      this.pool.splice(this.pool.indexOf(tagInstance), 1)
    } catch (e) {
      this.wechaty.emitError(e)
      log.error('Tag', 'deleteTag() exception: %s', (e as Error).message)
    }
  }

  override toString () {
    return `<Tag#${this.name() || this.id()}>`
  }

}

class TagImpl extends validationMixin(TagMixin)<TagInterface>() {}
interface TagInterface extends TagImpl {}

type TagConstructor = Constructor<
  TagInterface,
  typeof TagImpl
>

export type {
  TagConstructor,
  TagInterface,
}
export {
  TagImpl,
}
