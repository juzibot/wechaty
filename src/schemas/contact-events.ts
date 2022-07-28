import { EventEmitter }   from 'events'
import type TypedEventEmitter  from 'typed-emitter'

import type {
  ContactInterface,
  FriendshipInterface,
  MessageInterface,
}                   from '../user-modules/mod.js'
import type { InfoUpdateInterface } from './update.js'

type ContactEventListenerMessage    = (this: ContactInterface, message: MessageInterface, date?: Date)  => void | Promise<void>
type ContactEventListenerFriendship = (friendship: FriendshipInterface)                                 => void | Promise<void>
type ContactEventListenerUpdate = (info: InfoUpdateInterface) => void | Promise<void>

interface ContactEventListeners {
  friendship : ContactEventListenerFriendship,
  message    : ContactEventListenerMessage,
  update     : ContactEventListenerUpdate,
}

const ContactEventEmitter = EventEmitter as any as new () => TypedEventEmitter<
  ContactEventListeners
>

export type {
  ContactEventListeners,
  ContactEventListenerMessage,
  ContactEventListenerFriendship,
  ContactEventListenerUpdate,
}
export {
  ContactEventEmitter,
}
