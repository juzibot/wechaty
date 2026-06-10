#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/**
 * Tests for the Call first-class object and its lifecycle state machine.
 */

import {
  test,
  sinon,
}             from 'tstest'

import * as PUPPET    from '@juzi/wechaty-puppet'
import { PuppetMock } from '@juzi/wechaty-puppet-mock'
import { WechatyBuilder } from '../wechaty-builder.js'
import type { CallInterface } from './call.js'
import type { ContactImpl } from './contact.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWechaty () {
  const puppet  = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })
  return { puppet, wechaty }
}

async function startAndLogin (puppet: any, wechaty: any, userId = 'bot-self') {
  sandbox.stub(puppet, 'contactPayload').callsFake(async (id: string) => {
    await new Promise(setImmediate)
    return { id, name: id } as PUPPET.payloads.Contact
  })
  sandbox.stub(puppet, 'contactSearch').callsFake(async (...args: any[]) => {
    await new Promise(setImmediate)
    return [ args[0]?.id ?? userId ]
  })
  await wechaty.start()
  await puppet.login(userId)
}

const sandbox = sinon.createSandbox()

// ---------------------------------------------------------------------------
// 1. contact.call() → returns Call with correct initial state
// ---------------------------------------------------------------------------

test('contact.call() returns an outgoing Call with status=calling and media=audio', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const callControlStub = sandbox.stub().resolves(undefined)

  ;(puppet as any).callControl = callControlStub

  const PEER_ID = 'peer-contact-id'
  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)

  const call: CallInterface = await contact.call()

  t.equal(call.direction(), 'outgoing', 'should be outgoing')
  t.equal(call.status(), 'calling', 'initial status should be calling')
  t.equal(call.media(), PUPPET.types.CallMediaType.Audio, 'default media should be audio')
  t.ok(call.id, 'callId should be non-empty')

  t.ok(callControlStub.calledOnce, 'puppet.callControl should have been called once')
  const [ controlPayload ] = callControlStub.firstCall.args
  t.equal(controlPayload.signal, PUPPET.types.CallSignal.Invite, 'should send Invite signal')
  t.equal(controlPayload.peerId, PEER_ID, 'peerId should match contact id')
  t.equal(controlPayload.media, PUPPET.types.CallMediaType.Audio, 'media should match')

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 2. incoming call via puppet 'call' event with signal=Invite
// ---------------------------------------------------------------------------

test('incoming call: puppet emit call/Invite → bot emits call event, direction=incoming, status=ringing', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID     = 'call-id-incoming'
  const CALLER_ID   = 'caller-contact-id'

  let receivedCall: CallInterface | undefined

  wechaty.on('call', (call: CallInterface) => {
    receivedCall = call
  })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    media     : PUPPET.types.CallMediaType.Video,
  } as PUPPET.payloads.EventCall)

  await new Promise(resolve => setImmediate(resolve))

  t.ok(receivedCall, 'bot should emit call event')
  t.equal(receivedCall!.id, CALL_ID, 'call.id should match')
  t.equal(receivedCall!.direction(), 'incoming', 'should be incoming')
  t.equal(receivedCall!.status(), 'ringing', 'initial status should be ringing')
  t.equal(receivedCall!.contact().id, CALLER_ID, 'contact().id should match caller')

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 3. outgoing call: ringing and accept signals cause status transitions + events
// ---------------------------------------------------------------------------

test('outgoing call: ringing signal → status=ringing + emit ringing; accept signal → status=connected + emit accept', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  ;(puppet as any).callControl = sandbox.stub().resolves(undefined)

  const PEER_ID = 'peer-id-outgoing'
  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)
  const call: CallInterface = await contact.call()

  const ringingEmitted = await new Promise<boolean>(resolve => {
    call.on('ringing', () => resolve(true))
    ;(puppet as any).emit('call', {
      callId    : call.id,
      signal    : PUPPET.types.CallSignal.Ringing,
      contactId : PEER_ID,
    } as PUPPET.payloads.EventCall)
    setTimeout(() => resolve(false), 100)
  })

  t.ok(ringingEmitted, 'call should emit ringing')
  t.equal(call.status(), 'ringing', 'status should be ringing after Ringing signal')

  const acceptEmitted = await new Promise<boolean>(resolve => {
    call.on('accept', () => resolve(true))
    ;(puppet as any).emit('call', {
      callId    : call.id,
      signal    : PUPPET.types.CallSignal.Accept,
      contactId : PEER_ID,
    } as PUPPET.payloads.EventCall)
    setTimeout(() => resolve(false), 100)
  })

  t.ok(acceptEmitted, 'call should emit accept')
  t.equal(call.status(), 'connected', 'status should be connected after Accept signal')

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 4. incoming call.accept() → callControl receives Accept + status=connected
//    illegal call.accept() on outgoing → rejects
// ---------------------------------------------------------------------------

test('incoming call.accept() sends Accept signal and transitions to connected', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const callControlStub = sandbox.stub().resolves(undefined)

  ;(puppet as any).callControl = callControlStub

  const CALL_ID   = 'call-id-accept-test'
  const CALLER_ID = 'caller-id'

  let incomingCall: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { incomingCall = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))

  t.ok(incomingCall, 'should have received an incoming call')
  await incomingCall!.accept()

  t.equal(incomingCall!.status(), 'connected', 'status should be connected after accept()')
  const acceptCall = callControlStub.getCalls().find(c => c.args[0]?.signal === PUPPET.types.CallSignal.Accept)
  t.ok(acceptCall, 'callControl should have been called with Accept')

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 4b. duplicate Invite for same callId is silently dropped (M1 guard)
// ---------------------------------------------------------------------------

test('duplicate Invite for same callId is ignored: call event fires once, original call survives', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-dup-invite'
  const CALLER_ID = 'caller-dup'

  let callEventCount = 0
  let firstCall: CallInterface | undefined

  wechaty.on('call', (c: CallInterface) => {
    callEventCount++
    if (!firstCall) {
      firstCall = c
    }
  })

  // First Invite — should create a call and emit 'call'
  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    media     : PUPPET.types.CallMediaType.Audio,
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))

  t.equal(callEventCount, 1, "'call' event should fire exactly once after first Invite")
  t.ok(firstCall, 'first Call instance should be captured')
  t.equal(firstCall!.status(), 'ringing', 'first call should be in ringing state')

  // Second Invite with the same callId — guard should drop it silently
  let errorEmitted = false
  wechaty.on('error', () => { errorEmitted = true })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    media     : PUPPET.types.CallMediaType.Audio,
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))

  t.equal(callEventCount, 1, "'call' event must not fire again for duplicate Invite")
  t.notOk(errorEmitted, 'no error event should be emitted for a duplicate Invite')

  // The original call instance must still be alive and responsive to subsequent signals
  const hangupEmitted = await new Promise<boolean>(resolve => {
    firstCall!.on('hangup', () => resolve(true))
    ;(puppet as any).emit('call', {
      callId    : CALL_ID,
      signal    : PUPPET.types.CallSignal.Cancel,
      contactId : CALLER_ID,
    } as PUPPET.payloads.EventCall)
    setTimeout(() => resolve(false), 100)
  })

  t.ok(hangupEmitted, 'original Call instance should still handle subsequent signals after duplicate was dropped')
  t.equal(firstCall!.status(), 'ended', 'original call should reach ended state after Cancel signal')

  await wechaty.stop()
})

test('outgoing call.accept() throws an error (invalid direction)', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  ;(puppet as any).callControl = sandbox.stub().resolves(undefined)

  const contact = (wechaty.Contact as typeof ContactImpl).load('some-peer')
  const call    = await contact.call()

  await t.rejects(
    call.accept(),
    /invalid/i,
    'accept() on outgoing call should throw',
  )

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 5. peer Cancel → callee call emits 'hangup' + status=ended + pool cleanup
// ---------------------------------------------------------------------------

test('outgoing Cancel signal received by callee → call emits hangup, status=ended, pool cleanup', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-cancel-test'
  const CALLER_ID = 'caller-cancel'

  let incomingCall: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { incomingCall = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))

  t.ok(incomingCall, 'should have received incoming call')

  const hangupEmitted = await new Promise<boolean>(resolve => {
    incomingCall!.on('hangup', () => resolve(true))
    ;(puppet as any).emit('call', {
      callId    : CALL_ID,
      signal    : PUPPET.types.CallSignal.Cancel,
      contactId : CALLER_ID,
    } as PUPPET.payloads.EventCall)
    setTimeout(() => resolve(false), 100)
  })

  t.ok(hangupEmitted, "Cancel from peer should emit 'hangup' on callee's call")
  t.equal(incomingCall!.status(), 'ended', 'status should be ended')

  // After ended, a subsequent signal for the same callId should emit an error
  let errorEmitted = false
  wechaty.on('error', () => { errorEmitted = true })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Hangup,
    contactId : CALLER_ID,
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))

  t.ok(errorEmitted, 'bot should emit error for unknown callId after pool cleanup')

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 6. call.hangup() on connected call
// ---------------------------------------------------------------------------

test('call.hangup() on connected call sends Hangup and transitions to ended', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const callControlStub = sandbox.stub().resolves(undefined)

  ;(puppet as any).callControl = callControlStub

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer-hangup-test')
  const call    = await contact.call()

  // Simulate peer accepting the call
  ;(puppet as any).emit('call', {
    callId    : call.id,
    signal    : PUPPET.types.CallSignal.Accept,
    contactId : 'peer-hangup-test',
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))

  t.equal(call.status(), 'connected', 'status should be connected')

  await call.hangup()

  t.equal(call.status(), 'ended', 'status should be ended after hangup()')
  const hangupCall = callControlStub.getCalls().find(c => c.args[0]?.signal === PUPPET.types.CallSignal.Hangup)
  t.ok(hangupCall, 'callControl should have been called with Hangup signal')

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 7. termination methods fail → local status is still ended (H1)
// ---------------------------------------------------------------------------

test('call.hangup() rejects when callControl fails but status transitions to ended', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const callControlStub = sandbox.stub()

  ;(puppet as any).callControl = callControlStub

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer-hangup-fail')
  // First call is the Invite – let it succeed.
  callControlStub.onFirstCall().resolves(undefined)
  const call = await contact.call()

  // Simulate acceptance so hangup() is valid.
  ;(puppet as any).emit('call', {
    callId    : call.id,
    signal    : PUPPET.types.CallSignal.Accept,
    contactId : 'peer-hangup-fail',
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))
  t.equal(call.status(), 'connected', 'prerequisite: status should be connected')

  // Second call is the Hangup signal – make it fail.
  callControlStub.onSecondCall().rejects(new Error('network error'))

  await t.rejects(
    call.hangup(),
    /network error/,
    'hangup() should re-throw the callControl error',
  )

  // Despite the network failure the local state must be ended.
  t.equal(call.status(), 'ended', 'status should be ended even after callControl failure')

  // A subsequent signal for the same callId should emit a bot-level error
  // (pool has been cleaned up by the onEnded callback).
  let errorEmitted = false
  wechaty.on('error', () => { errorEmitted = true })

  ;(puppet as any).emit('call', {
    callId    : call.id,
    signal    : PUPPET.types.CallSignal.Hangup,
    contactId : 'peer-hangup-fail',
  } as PUPPET.payloads.EventCall)
  await new Promise(resolve => setImmediate(resolve))

  t.ok(errorEmitted, 'bot should emit error for unknown callId after pool cleanup')

  await wechaty.stop()
})

// ---------------------------------------------------------------------------
// 8. stop() drains the call pool (C1.1)
// ---------------------------------------------------------------------------

test('wechaty.stop() clears the call pool', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  ;(puppet as any).callControl = sandbox.stub().resolves(undefined)

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer-stop-test')
  // Place an outgoing call that is never answered.
  await contact.call()

  // Pool must be non-empty before stop.
  t.ok((wechaty as any).__callPool.size > 0, 'pool should be non-empty before stop()')

  await wechaty.stop()

  t.equal((wechaty as any).__callPool.size, 0, 'pool should be empty after stop()')
})

// ---------------------------------------------------------------------------
// 9. TTL reclaims unanswered calls (C1.2)
// ---------------------------------------------------------------------------

test('Call TTL force-ends an unanswered outgoing call and emits error', async t => {
  // Use fake timers scoped only to setTimeout to avoid disrupting wechaty's
  // internal scheduling (setInterval, process timers, etc.).
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout' ] })

  try {
    const { puppet, wechaty } = buildWechaty()
    await startAndLogin(puppet, wechaty, 'bot-ttl-test')

    ;(puppet as any).callControl = sandbox.stub().resolves(undefined)

    const contact = (wechaty.Contact as typeof ContactImpl).load('peer-ttl-test')
    const call    = await contact.call()

    t.equal(call.status(), 'calling', 'prerequisite: status should be calling')

    let errorEmitted = false
    call.on('error', () => { errorEmitted = true })

    // Advance past the 60-second ringing TTL.
    clock.tick(60_001)
    // Allow any microtask / setImmediate callbacks to flush.
    await new Promise(resolve => setImmediate(resolve))

    t.ok(errorEmitted, 'call should emit error when TTL expires')
    t.equal(call.status(), 'ended', 'status should be ended after TTL expiry')

    await wechaty.stop()
  } finally {
    clock.restore()
  }
})

// ---------------------------------------------------------------------------
// 8. TTL expiry must not crash the process when nobody listens for 'error'
//    (Node throws synchronously on unhandled 'error' emit inside the timer
//    callback, which would take down the whole bot process).
// ---------------------------------------------------------------------------

test('Call TTL reaps an ignored call without error listeners and without throwing', async t => {
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout' ] })

  try {
    const { puppet, wechaty } = buildWechaty()
    await startAndLogin(puppet, wechaty, 'bot-ttl-no-listener')

    ;(puppet as any).callControl = sandbox.stub().resolves(undefined)

    const contact = (wechaty.Contact as typeof ContactImpl).load('peer-ttl-no-listener')
    const call    = await contact.call()
    // Deliberately NO call.on('error') here: this is the default user path.

    t.doesNotThrow(
      () => clock.tick(60_001),
      'TTL expiry must not throw when no error listener is attached',
    )
    await new Promise(resolve => setImmediate(resolve))

    t.equal(call.status(), 'ended', 'status should still be ended after TTL expiry')

    await wechaty.stop()
  } finally {
    clock.restore()
  }
})
