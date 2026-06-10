import { randomUUID } from 'node:crypto'

import * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixin,
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'
import { CallEventEmitter } from '../schemas/call-events.js'
import type { ContactImpl, ContactInterface } from './contact.js'

/**
 * Lifecycle status of a call session as seen from this side.
 *
 * Intentionally defined here (not in wechaty-puppet) because the puppet's
 * `CallStatus` enum is already occupied by the call-record domain.
 */
export type CallStatus    = 'calling' | 'ringing' | 'connected' | 'ended'
export type CallDirection = 'outgoing' | 'incoming'

/**
 * How long a call may stay in a non-terminal, pre-connected state before
 * being force-ended. Applies to 'calling' and 'ringing' only; connected
 * calls may legitimately last hours and are not subject to this TTL.
 */
const CALL_RINGING_TTL_MS = 60 * 1000

interface CallConstructorOptions {
  readonly id        : string
  readonly peerId    : string
  readonly media     : PUPPET.types.CallMediaType
  readonly direction : CallDirection
  /** If omitted the status is derived: outgoing→calling, incoming→ringing */
  readonly status?   : CallStatus
  /** Called when the call transitions to ended so the registry can clean up */
  readonly onEnded   : (callId: string) => void
}

const CallMixinBase = wechatifyMixin(CallEventEmitter)

/**
 * Call – a live, stateful call-control session abstraction.
 *
 * A Call is a first-class citizen alongside Message and Contact.
 * It models the signaling lifecycle of a call (not the media connection itself;
 * media runs peer-to-peer and is associated only by `callId`).
 *
 * Outgoing: obtain via `contact.call()`.
 * Incoming: received as the argument of the `bot.on('call', …)` event.
 */
class CallMixin extends CallMixinBase {

  readonly id : string

  private __peerId    : string
  private __media     : PUPPET.types.CallMediaType
  private __status    : CallStatus
  private __direction : CallDirection
  private __onEnded   : (callId: string) => void
  private __ttlTimer  : ReturnType<typeof setTimeout> | undefined

  constructor (options: CallConstructorOptions) {
    super()

    this.id          = options.id
    this.__peerId    = options.peerId
    this.__media     = options.media
    this.__direction = options.direction
    this.__onEnded   = options.onEnded

    // Derive initial status from direction when not explicitly provided.
    if (options.status !== undefined) {
      this.__status = options.status
    } else {
      this.__status = options.direction === 'outgoing' ? 'calling' : 'ringing'
    }

    log.verbose('Call', 'constructor(%s, dir=%s, media=%s)', this.id, this.__direction, this.__media)

    // Guard pre-connected states against abandoned or unanswered calls.
    // 'connected' is intentionally excluded: calls can legitimately last hours.
    this.__ttlTimer = setTimeout(() => {
      if (this.__status !== 'connected' && this.__status !== 'ended') {
        log.warn('Call', '%s ttl expired in status=%s, force ending', this.id, this.__status)
        // Node throws synchronously on 'error' emit without listeners, which would
        // crash the process from this timer callback. Reaping must never depend on
        // user code having subscribed to 'error'.
        if (this.listenerCount('error') > 0) {
          this.emit('error', new Error(`Call ${this.id} timed out in ${this.__status} state`))
        }
        this.__transitionTo('ended')
      }
    }, CALL_RINGING_TTL_MS)
    this.__ttlTimer.unref()
  }

  /** The remote party: callee when outgoing, caller when incoming. */
  contact (): ContactInterface {
    return (this.wechaty.Contact as typeof ContactImpl).load(this.__peerId)
  }

  media (): PUPPET.types.CallMediaType {
    return this.__media
  }

  status (): CallStatus {
    return this.__status
  }

  direction (): CallDirection {
    return this.__direction
  }

  // ---------------------------------------------------------------------------
  // Control methods
  // ---------------------------------------------------------------------------

  /**
   * Accept an incoming call.
   * Only valid when direction=incoming and status=ringing.
   */
  async accept (): Promise<void> {
    if (this.__direction !== 'incoming' || this.__status !== 'ringing') {
      throw new Error(
        `Call.accept() invalid: direction=${this.__direction}, status=${this.__status}. `
        + 'Only valid for incoming calls in ringing state.',
      )
    }

    await this.wechaty.puppet.callControl({
      callId : this.id,
      signal : PUPPET.types.CallSignal.Accept,
      peerId : this.__peerId,
      media  : this.__media,
    })

    this.__transitionTo('connected')
  }

  /**
   * Reject an incoming call.
   * Only valid when direction=incoming and status=ringing.
   */
  async reject (reason?: string): Promise<void> {
    if (this.__direction !== 'incoming' || this.__status !== 'ringing') {
      throw new Error(
        `Call.reject() invalid: direction=${this.__direction}, status=${this.__status}. `
        + 'Only valid for incoming calls in ringing state.',
      )
    }

    try {
      await this.wechaty.puppet.callControl({
        callId : this.id,
        signal : PUPPET.types.CallSignal.Reject,
        peerId : this.__peerId,
        media  : this.__media,
        reason,
      })
    } finally {
      // local side has decided to abandon; terminate locally even if the signal failed to send
      this.__transitionTo('ended')
    }
  }

  /**
   * Hang up a connected call.
   * Only valid when status=connected.
   */
  async hangup (reason?: string): Promise<void> {
    if (this.__status !== 'connected') {
      throw new Error(
        `Call.hangup() invalid: status=${this.__status}. `
        + 'Only valid for connected calls.',
      )
    }

    try {
      await this.wechaty.puppet.callControl({
        callId : this.id,
        signal : PUPPET.types.CallSignal.Hangup,
        peerId : this.__peerId,
        media  : this.__media,
        reason,
      })
    } finally {
      // local side has decided to abandon; terminate locally even if the signal failed to send
      this.__transitionTo('ended')
    }
  }

  /**
   * Cancel an outgoing call before it is connected.
   * Only valid when direction=outgoing and status=calling or ringing.
   */
  async cancel (): Promise<void> {
    if (this.__direction !== 'outgoing') {
      throw new Error(
        `Call.cancel() invalid: direction=${this.__direction}. `
        + 'Only valid for outgoing calls.',
      )
    }
    if (this.__status !== 'calling' && this.__status !== 'ringing') {
      throw new Error(
        `Call.cancel() invalid: status=${this.__status}. `
        + 'Only valid when status is calling or ringing.',
      )
    }

    try {
      await this.wechaty.puppet.callControl({
        callId : this.id,
        signal : PUPPET.types.CallSignal.Cancel,
        peerId : this.__peerId,
        media  : this.__media,
      })
    } finally {
      // local side has decided to abandon; terminate locally even if the signal failed to send
      this.__transitionTo('ended')
    }
  }

  // ---------------------------------------------------------------------------
  // Internal signal handler – called from puppet-mixin
  // ---------------------------------------------------------------------------

  /**
   * Process an inbound call signal from the puppet layer.
   * This method is framework-internal and must not be called from user code.
   */
  __handleSignal (payload: PUPPET.payloads.EventCall): void {
    if (this.__status === 'ended') {
      log.warn('Call', '__handleSignal(%s) ignoring signal in ended state', payload.signal)
      return
    }

    switch (payload.signal) {
      case PUPPET.types.CallSignal.Ringing:
        if (this.__direction === 'outgoing' && this.__status === 'calling') {
          this.__transitionTo('ringing')
          this.emit('ringing')
        }
        break

      case PUPPET.types.CallSignal.Accept:
        if (this.__direction === 'outgoing' && (this.__status === 'calling' || this.__status === 'ringing')) {
          this.__transitionTo('connected')
          this.emit('accept')
        }
        break

      case PUPPET.types.CallSignal.Reject:
        this.__transitionTo('ended')
        this.emit('reject', payload.reason)
        break

      case PUPPET.types.CallSignal.Cancel:
        // The caller cancelled. From the callee's perspective this means the
        // call ended. Surface as 'hangup' since there is no 'cancel' user event.
        this.__transitionTo('ended')
        this.emit('hangup', payload.reason)
        break

      case PUPPET.types.CallSignal.Hangup:
        this.__transitionTo('ended')
        this.emit('hangup', payload.reason)
        break

      default:
        log.warn('Call', '__handleSignal() unhandled signal: %s', payload.signal)
        break
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private __transitionTo (nextStatus: CallStatus): void {
    log.verbose('Call', '__transitionTo(%s) from %s', nextStatus, this.__status)
    this.__status = nextStatus
    if (nextStatus === 'connected' || nextStatus === 'ended') {
      if (this.__ttlTimer) {
        clearTimeout(this.__ttlTimer)
        this.__ttlTimer = undefined
      }
    }
    if (nextStatus === 'ended') {
      this.__onEnded(this.id)
    }
  }

}

class CallImpl extends validationMixin(CallMixin)<CallInterface>() {}
interface CallInterface extends CallImpl {}

type CallConstructor = Constructor<
  CallInterface,
  typeof CallImpl
>

export type {
  CallConstructor,
  CallInterface,
}
export {
  CallImpl,
  randomUUID as generateCallId,
}

class CallRecordMixin extends wechatifyMixinBase() {

  static async create (): Promise<CallRecordInterface> {
    log.verbose('CallRecord', 'create()')

    const payload: PUPPET.payloads.CallRecord = {
      starter: 'todo',
      participants: [ 'todo' ],
      length: 0,
      type: 0,
      status: 0,
    }

    return new this(payload)
  }

  /*
   * @hideconstructor
   */
  constructor (
      public readonly payload: PUPPET.payloads.CallRecord,
  ) {
    super()
    log.verbose('CallRecord', 'constructor()')
  }

  async starter (): Promise<undefined | ContactInterface> {
    const starterId = this.payload.starter
    if (!starterId) {
      return undefined
    }
    const starter = (this.wechaty.Contact as typeof ContactImpl).find({ id: starterId })
    return starter
  }

  async participants (): Promise<ContactInterface[]> {
    const participantIds = this.payload.participants

    const contactPromises = participantIds.map((this.wechaty.Contact as typeof ContactImpl).find.bind(this.wechaty.Contact))
    const contacts = await Promise.all(contactPromises)

    return contacts.filter(item => !!item) as ContactInterface[]
  }

  length (): number {
    return this.payload.length
  }

  type (): PUPPET.types.Call {
    return this.payload.type || PUPPET.types.Call.UNKNOWN
  }

  status (): PUPPET.types.CallStatus {
    return this.payload.status || PUPPET.types.CallStatus.UNKNOWN
  }

}

class CallRecordImpl extends validationMixin(CallRecordMixin)<CallRecordInterface>() { }
interface CallRecordInterface extends CallRecordImpl { }

type CallRecordConstructor = Constructor<
  CallRecordInterface,
  typeof CallRecordImpl
>

export type {
  CallRecordConstructor,
  CallRecordInterface,
}
export {
  CallRecordImpl,
}
