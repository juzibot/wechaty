import { EventEmitter }  from 'events'
import type TypedEventEmitter from 'typed-emitter'

type CallEventListenerRinging = () => void | Promise<void>
type CallEventListenerAccept  = () => void | Promise<void>
type CallEventListenerReject  = (reason?: string) => void | Promise<void>
type CallEventListenerHangup  = (reason?: string) => void | Promise<void>
type CallEventListenerError   = (error: Error) => void | Promise<void>

interface CallEventListeners {
  ringing : CallEventListenerRinging
  accept  : CallEventListenerAccept
  reject  : CallEventListenerReject
  hangup  : CallEventListenerHangup
  error   : CallEventListenerError
}

const CallEventEmitter = EventEmitter as any as new () => TypedEventEmitter<
  CallEventListeners
>

export type {
  CallEventListeners,
  CallEventListenerRinging,
  CallEventListenerAccept,
  CallEventListenerReject,
  CallEventListenerHangup,
  CallEventListenerError,
}
export {
  CallEventEmitter,
}
