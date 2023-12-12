import { EventEmitter }   from 'events'
import type TypedEventEmitter  from 'typed-emitter'

import type {
  ContactInterface,
  FriendshipInterface,
  MessageInterface,
  TagInterface,
}                   from '../user-modules/mod.js'

type ContactEventListenerMessage    = (this: ContactInterface, message: MessageInterface, date?: Date)  => void | Promise<void>
type ContactEventListenerFriendship = (friendship: FriendshipInterface)                                 => void | Promise<void>
type ContactEventListenerTagAdd = (tagList: TagInterface[]) => void | Promise<void>
type ContactEventListenerTagRemove = (tagList: TagInterface[]) => void | Promise<void>
type ContactEventListenerName = (newName: string, oldName: string) => void | Promise<void>
type ContactEventListenerDescription = (newDescription: string, oldDescription: string) => void | Promise<void>
type ContactEventListenerCorporation = (newCorporation: string, oldCorporation: string) => void | Promise<void>
type ContactEventListenerPhone = (newPhoneList: string[], oldPhoneList: string[]) => void | Promise<void>
type ContactEventListenerAlias = (newAlias: string, oldAlias: string) => void | Promise<void>

interface ContactEventListeners {
  friendship  : ContactEventListenerFriendship,
  message     : ContactEventListenerMessage,
  'tag-add'   : ContactEventListenerTagAdd,
  'tag-remove': ContactEventListenerTagRemove,
  name        : ContactEventListenerName,
  description : ContactEventListenerDescription,
  corporation : ContactEventListenerCorporation,
  phone       : ContactEventListenerPhone,
  alias       : ContactEventListenerAlias,
}

const ContactEventEmitter = EventEmitter as any as new () => TypedEventEmitter<
  ContactEventListeners
>

export type {
  ContactEventListeners,
  ContactEventListenerMessage,
  ContactEventListenerFriendship,
  ContactEventListenerTagAdd,
  ContactEventListenerTagRemove,
  ContactEventListenerName,
  ContactEventListenerDescription,
  ContactEventListenerCorporation,
  ContactEventListenerPhone,
  ContactEventListenerAlias,
}
export {
  ContactEventEmitter,
}
