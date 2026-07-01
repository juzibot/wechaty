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

interface CallConstructorOptions {
  readonly id        : string
  readonly direction : CallDirection
  /** If omitted the status is derived: outgoing → calling, incoming → ringing */
  readonly status?   : CallStatus
}

const CallMixinBase = wechatifyMixin(CallEventEmitter)

/**
 * Call – a live, stateful call-control session abstraction.
 *
 * A Call is a first-class citizen alongside Message and Contact.
 * It models the signaling lifecycle of a call (not the media connection itself;
 * media runs through a direct gateway link addressed by callId).
 *
 * Outgoing: obtain via `bot.call([contact, ...])` or `contact.call()`.
 * Incoming: received as the argument of the `bot.on('call', …)` event.
 *
 * State (media, roster, lifecycle timestamps) is hydrated from the puppet via
 * `ready()` / `sync()`. The dirty stream (`Dirty.Call`) drives cache invalidation.
 */
class CallMixin extends CallMixinBase {

  readonly id : string

  private __direction    : CallDirection
  private __status       : CallStatus
  private __payload?     : PUPPET.payloads.Call
  private __endedEmitted = false

  constructor (options: CallConstructorOptions) {
    super()

    this.id          = options.id
    this.__direction = options.direction
    this.__status    = options.status ?? (options.direction === 'outgoing' ? 'calling' : 'ringing')

    this.log.verbose('Call', 'constructor(%s, dir=%s, status=%s)', this.id, this.__direction, this.__status)
  }

  direction (): CallDirection { return this.__direction }
  status    (): CallStatus    { return this.__status }

  /**
   * The media type of the call (audio | video).
   * Requires the payload to be hydrated; throws otherwise.
   */
  media (): PUPPET.types.CallMediaType {
    if (!this.__payload) {
      throw new Error(`Call ${this.id} not ready: call ready() first`)
    }
    return this.__payload.media
  }

  /**
   * When the call was initiated (protocol-side clock).
   * Requires the payload to be hydrated; throws otherwise.
   */
  startTime (): Date {
    if (!this.__payload) {
      throw new Error(`Call ${this.id} not ready: call ready() first`)
    }
    return new Date(this.__payload.startTime)
  }

  /**
   * When the call terminated. Becomes defined once a dirty refresh observes
   * the protocol-side endTime; returns undefined while the call is live.
   */
  endTime (): Date | undefined {
    if (!this.__payload?.endTime) {
      return undefined
    }
    return new Date(this.__payload.endTime)
  }

  /**
   * The participant who started the call. Returns undefined when the protocol
   * payload does not identify a starter (rare; defensive).
   */
  async starter (): Promise<ContactInterface | undefined> {
    if (!this.__payload) {
      await this.ready()
    }
    const starterId = this.__payload!.starter
    if (!starterId) {
      return undefined
    }
    return (this.wechaty.Contact as typeof ContactImpl).find({ id: starterId })
  }

  /**
   * Current participant roster. The list is maintained server-side and refreshed
   * via the dirty mechanism; consumers should expect this to change between calls.
   */
  async participants (): Promise<ContactInterface[]> {
    if (!this.__payload) {
      await this.ready()
    }
    const found = await Promise.all(
      this.__payload!.participants.map(id => (this.wechaty.Contact as typeof ContactImpl).find({ id })),
    )
    return found.filter((c): c is ContactInterface => !!c)
  }

  /**
   * Hydrate the call payload from the puppet. A no-op if already hydrated
   * unless `forceSync` is true.
   */
  async ready (forceSync = false): Promise<void> {
    if (!forceSync && this.__payload) {
      return
    }
    this.__payload = await this.wechaty.puppet.callPayload(this.id)
  }

  /**
   * Force-invalidate the cached payload and re-pull it. Used after a dirty
   * signal or when the local view is suspected to be stale.
   */
  async sync (): Promise<void> {
    await this.wechaty.puppet.callPayloadDirty(this.id)
    await this.ready(true)
  }

  // ---------------------------------------------------------------------------
  // Control methods
  // ---------------------------------------------------------------------------

  /**
   * Accept an incoming call. Only valid when direction=incoming, status=ringing.
   */
  async accept (): Promise<void> {
    if (this.__direction !== 'incoming' || this.__status !== 'ringing') {
      throw new Error(
        `Call.accept() invalid: direction=${this.__direction}, status=${this.__status}. `
        + 'Only valid for incoming calls in ringing state.',
      )
    }
    await this.wechaty.puppet.callAccept(this.id)
    this.__transitionTo('connected')
  }

  /**
   * Reject an incoming call. Only valid when direction=incoming, status=ringing.
   * Local state transitions to 'ended' regardless of whether the protocol
   * acknowledgement reaches the peer.
   */
  async reject (reason?: string): Promise<void> {
    if (this.__direction !== 'incoming' || this.__status !== 'ringing') {
      throw new Error(
        `Call.reject() invalid: direction=${this.__direction}, status=${this.__status}. `
        + 'Only valid for incoming calls in ringing state.',
      )
    }
    try {
      await this.wechaty.puppet.callReject(this.id, reason)
    } finally {
      this.__finalize()
    }
  }

  /**
   * Cancel an outgoing call before it is connected.
   * Only valid when direction=outgoing and status is calling or ringing.
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
      await this.wechaty.puppet.callCancel(this.id)
    } finally {
      this.__finalize()
    }
  }

  /**
   * Hang up a connected call. Only valid when status=connected.
   */
  async hangup (reason?: string): Promise<void> {
    if (this.__status !== 'connected') {
      throw new Error(
        `Call.hangup() invalid: status=${this.__status}. `
        + 'Only valid for connected calls.',
      )
    }
    try {
      await this.wechaty.puppet.callHangup(this.id, reason)
    } finally {
      this.__finalize()
    }
  }

  /**
   * Invite additional contacts to a live call (group-call growth).
   */
  async add (contacts: ContactInterface[]): Promise<void> {
    if (this.__status === 'ended') {
      throw new Error('Call.add() invalid: status=ended. Cannot add to a finished call.')
    }
    if (contacts.length === 0) {
      throw new Error('Call.add() requires at least one contact.')
    }
    await this.wechaty.puppet.callAdd(this.id, contacts.map(c => c.id))
  }

  /**
   * Pull a fresh admission ticket to the direct-to-gateway media path.
   * Not cached: the credential is short-lived and may pre-allocate a session.
   */
  async mediaEndpoint (): Promise<PUPPET.payloads.CallMediaEndpoint> {
    return this.wechaty.puppet.callMediaEndpoint(this.id)
  }

  // ---------------------------------------------------------------------------
  // Framework-internal — must not be called from user code.
  // ---------------------------------------------------------------------------

  /**
   * Process an inbound call signal from the puppet layer.
   * Drives state transitions and emits the corresponding object-level event.
   * Terminal lifecycle (ended) is owned by the puppet-mixin which calls
   * `__markEnded()` after observing the protocol-side endTime.
   */
  __handleSignal (
    signal: PUPPET.types.CallSignal,
    actor: ContactInterface,
    reason?: string,
  ): void {
    if (this.__status === 'ended') {
      this.log.warn('Call', '__handleSignal(%s) ignored in ended state for callId=%s', signal, this.id)
      return
    }

    switch (signal) {
      case PUPPET.types.CallSignal.Ringing:
        if (this.__direction === 'outgoing' && this.__status === 'calling') {
          this.__transitionTo('ringing')
          this.emit('ringing')
        }
        break

      case PUPPET.types.CallSignal.Accept:
        if (this.__status === 'calling' || this.__status === 'ringing') {
          this.__transitionTo('connected')
        }
        this.emit('accept', actor)
        break

      // Reject/Hangup emit BEFORE puppet-mixin's post-handler finalize, so
      // consumers' handlers observe pre-terminal status. This is safe here
      // because the callable terminal actions throw under their own guards at
      // this moment (accept needs ringing, cancel needs calling/ringing,
      // hangup needs connected). The Cancel case below is the asymmetric
      // outlier: it MUST finalize first to close a media-acquisition race
      // window on the receiving side.
      case PUPPET.types.CallSignal.Reject:
        this.emit('reject', actor, reason)
        break

      case PUPPET.types.CallSignal.Hangup:
        this.emit('hangup', actor, reason)
        break

      case PUPPET.types.CallSignal.Cancel:
        // Intentionally finalizes before emitting 'cancel' so consumers'
        // cancel handler observes status === 'ended' synchronously. Cancel
        // signals are always terminal on the receiving side (the caller has
        // withdrawn), so the status flip should be visible to listeners
        // before the descriptor event fires. The reverse order would let a
        // cancel handler observe status === 'ringing' and, worse, call
        // .accept() through the ringing guard before the puppet-mixin's
        // post-emit finalize runs.
        this.__finalize()
        this.emit('cancel', reason)
        break

      default:
        this.log.warn('Call', '__handleSignal() unhandled signal: %s', signal)
        break
    }
  }

  /**
   * Force the call into the ended terminal state and emit 'ended'.
   * Called by puppet-mixin after the protocol-side endTime is observed.
   * Kept as a named entry point distinct from {@link __finalize} so the
   * puppet-mixin surface reads as intent ("the protocol says this is over").
   * Idempotent via __finalize.
   */
  __markEnded (): void {
    this.__finalize()
  }

  /**
   * Single chokepoint for ending a call: flip the status to ended, emit
   * the object-level 'ended' event, emit the bot-level 'call-ended' lifecycle
   * event, and evict the call from the wechaty pool. Guarded by
   * `__endedEmitted` so that overlapping local-control and puppet-echo paths
   * cannot double-emit or double-evict.
   *
   * Why both event tiers fire here: 'call-ended' is a terminal lifecycle event
   * (not an action event like 'call-reject'/'call-hangup'), and is independent
   * of who initiated the termination. Local control paths (reject/cancel/
   * hangup) and remote-driven paths (puppet signal echo via __finalizeIfEnded)
   * must both surface it.
   */
  private __finalize (): void {
    if (this.__endedEmitted) {
      return
    }
    this.__endedEmitted = true
    this.__transitionTo('ended')
    this.emit('ended')
    ;(this.wechaty as any).emit('call-ended', this as unknown as CallInterface)
    ;(this.wechaty as any).__callPool?.delete(this.id)
  }

  private __transitionTo (nextStatus: CallStatus): void {
    this.log.verbose('Call', '__transitionTo(%s) from %s', nextStatus, this.__status)
    this.__status = nextStatus
  }

}

class CallImplBase extends validationMixin(CallMixin)<CallImplInterface>() {}
interface CallImplInterface extends CallImplBase {}

type CallProtectedProperty =
  | '__handleSignal'
  | '__markEnded'
  | '__finalize'
  | '__endedEmitted'

type CallInterface = Omit<CallImplInterface, CallProtectedProperty>
class CallImpl extends validationMixin(CallImplBase)<CallInterface>() {}

type CallConstructor = Constructor<
  CallInterface,
  typeof CallImpl
>

export type {
  CallConstructor,
  CallInterface,
  CallProtectedProperty,
}
export {
  CallImpl,
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
    this.log.verbose('CallRecord', 'constructor()')
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
