import { EventEmitter }   from 'events'
import type TypedEventEmitter  from 'typed-emitter'

import type {
  ContactInterface,
  FriendshipInterface,
  MessageInterface,
  TagInterface,
}                   from '../user-modules/mod.js'
import type { InfoUpdateInterface } from './update.js'

type ContactEventListenerMessage    = (this: ContactInterface, message: MessageInterface, date?: Date)  => void | Promise<void>
type ContactEventListenerFriendship = (friendship: FriendshipInterface)                                 => void | Promise<void>
type ContactEventListenerUpdate = (info: InfoUpdateInterface) => void | Promise<void>
type ContactEventListenerTagAdd = (tagList: TagInterface[]) => void | Promise<void>
type ContactEventListenerTagRemove = (tagList: TagInterface[]) => void | Promise<void>
type ContactEventListenerName = (newName: string, oldName: string) => void | Promise<void>
type ContactEventListenerDescription = (newDescription: string, oldDescription: string) => void | Promise<void>
type ContactEventListenerPhone = (newPhoneList: string[], oldPhoneList: string[]) => void | Promise<void>
type ContactEventListenerAlias = (newAlias: string, oldAlias: string) => void | Promise<void>

interface ContactEventListeners {
  friendship  : ContactEventListenerFriendship,
  message     : ContactEventListenerMessage,
  update      : ContactEventListenerUpdate,
  'tag-add'   : ContactEventListenerTagAdd,
  'tag-remove': ContactEventListenerTagRemove,
  name        : ContactEventListenerName,
  description : ContactEventListenerDescription,
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
  ContactEventListenerUpdate,
  ContactEventListenerTagAdd,
  ContactEventListenerTagRemove,
  ContactEventListenerName,
  ContactEventListenerDescription,
  ContactEventListenerPhone,
  ContactEventListenerAlias,
}
export {
  ContactEventEmitter,
}
