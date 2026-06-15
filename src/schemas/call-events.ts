import { EventEmitter }       from 'events'
import type TypedEventEmitter from 'typed-emitter'

import type { ContactInterface } from '../user-modules/contact.js'

type CallEventListenerRinging = () => void | Promise<void>
type CallEventListenerAccept  = (actor: ContactInterface) => void | Promise<void>
type CallEventListenerReject  = (actor: ContactInterface, reason?: string) => void | Promise<void>
type CallEventListenerCancel  = (reason?: string) => void | Promise<void>
type CallEventListenerHangup  = (actor: ContactInterface, reason?: string) => void | Promise<void>
type CallEventListenerEnded   = () => void | Promise<void>

interface CallEventListeners {
  ringing : CallEventListenerRinging
  accept  : CallEventListenerAccept
  reject  : CallEventListenerReject
  cancel  : CallEventListenerCancel
  hangup  : CallEventListenerHangup
  ended   : CallEventListenerEnded
}

const CallEventEmitter = EventEmitter as any as new () => TypedEventEmitter<CallEventListeners>

export type {
  CallEventListeners,
  CallEventListenerRinging,
  CallEventListenerAccept,
  CallEventListenerReject,
  CallEventListenerCancel,
  CallEventListenerHangup,
  CallEventListenerEnded,
}
export {
  CallEventEmitter,
}
