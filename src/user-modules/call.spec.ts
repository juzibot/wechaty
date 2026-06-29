#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/**
 * Tests for the Call first-class object and its lifecycle state machine
 * against the @juzi/wechaty-puppet@^1.0.138 contract.
 */

import {
  test,
  sinon,
}             from 'tstest'

import * as PUPPET    from '@juzi/wechaty-puppet'
import { PuppetMock } from '@juzi/wechaty-puppet-mock'
import { WechatyBuilder } from '../wechaty-builder.js'
import type { CallInterface } from './call.js'
import type { ContactImpl, ContactInterface } from './contact.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sandbox = sinon.createSandbox()

function buildWechaty () {
  const puppet  = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })
  return { puppet, wechaty }
}

function stubCallPayload (puppet: any, factory: (callId: string) => PUPPET.payloads.Call) {
  const stub = sandbox.stub().callsFake(async (callId: string) => {
    await new Promise(setImmediate)
    return factory(callId)
  })
  puppet.callPayload = stub
  // Used by Call.sync()
  puppet.callPayloadDirty = sandbox.stub().resolves(undefined)
  return stub
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

function flush (ticks = 8): Promise<void> {
  let p = Promise.resolve()
  for (let i = 0; i < ticks; i++) {
    p = p.then(() => new Promise(resolve => setImmediate(resolve)))
  }
  return p
}

// ---------------------------------------------------------------------------
// 1. bot.call() — outgoing, mints callId via puppet.callInvite, hydrates payload
// ---------------------------------------------------------------------------

test('bot.call() returns an outgoing Call with status=calling, hydrated payload', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-minted-by-protocol'
  const PEER_A_ID = 'peer-a'
  const PEER_B_ID = 'peer-b'
  const START_TS  = 1_700_000_000_000

  const callInviteStub = sandbox.stub().resolves(CALL_ID)
  puppet.callInvite = callInviteStub

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ PEER_A_ID, PEER_B_ID ],
    media        : PUPPET.types.CallMediaType.Video,
    startTime    : START_TS,
  }))

  const contactA = (wechaty.Contact as typeof ContactImpl).load(PEER_A_ID)
  const contactB = (wechaty.Contact as typeof ContactImpl).load(PEER_B_ID)

  const call: CallInterface = await (wechaty as any).call(
    [ contactA, contactB ],
    { media: PUPPET.types.CallMediaType.Video },
  )

  t.equal(call.id, CALL_ID, 'call.id should match callInvite return')
  t.equal(call.direction(), 'outgoing', 'direction should be outgoing')
  t.equal(call.status(), 'calling', 'status should be calling')
  t.equal(call.media(), PUPPET.types.CallMediaType.Video, 'media should reflect payload')
  t.same(call.startTime(), new Date(START_TS), 'startTime should match payload')
  t.equal(call.endTime(), undefined, 'endTime should be undefined for a live call')

  const participants = await call.participants()
  t.same(participants.map(c => c.id).sort(), [ PEER_A_ID, PEER_B_ID ].sort(), 'participants should match payload')

  t.ok(callInviteStub.calledOnce, 'puppet.callInvite should be called once')
  t.same(
    callInviteStub.firstCall.args,
    [ [ PEER_A_ID, PEER_B_ID ], PUPPET.types.CallMediaType.Video ],
    'callInvite args should be (contactIds, media)',
  )

  await wechaty.stop()
  sandbox.restore()
})

test('bot.call() rejects when contacts list is empty', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  await t.rejects(
    (wechaty as any).call([]),
    /at least one contact/,
    'empty contacts should reject',
  )

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 2. contact.call() — 1v1 syntactic sugar over bot.call()
// ---------------------------------------------------------------------------

test('contact.call() delegates to bot.call([this])', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-sugar'
  const PEER_ID = 'peer-sugar'

  const callInviteStub = sandbox.stub().resolves(CALL_ID)
  puppet.callInvite = callInviteStub

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ PEER_ID ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))

  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)
  const call    = await contact.call()

  t.equal(call.id, CALL_ID, 'call.id should match callInvite return')
  t.equal(call.media(), PUPPET.types.CallMediaType.Audio, 'default media should be audio')
  t.same(
    callInviteStub.firstCall.args,
    [ [ PEER_ID ], PUPPET.types.CallMediaType.Audio ],
    'callInvite args should be ([peerId], audio)',
  )

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 3. Incoming Invite — bot emits 'call' with a hydrated Call
// ---------------------------------------------------------------------------

test('incoming call: Invite hydrates payload then emits bot.on("call")', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-incoming'
  const CALLER_ID = 'caller-incoming'
  const START_TS  = 1_700_000_000_999

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : CALLER_ID,
    participants : [ CALLER_ID, 'bot-self' ],
    media        : PUPPET.types.CallMediaType.Video,
    startTime    : START_TS,
  }))

  let received: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { received = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    timestamp : START_TS,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.ok(received, 'bot should emit call event for Invite')
  t.equal(received!.id, CALL_ID, 'call.id should match')
  t.equal(received!.direction(), 'incoming', 'direction should be incoming')
  t.equal(received!.status(), 'ringing', 'status should be ringing')
  t.equal(received!.media(), PUPPET.types.CallMediaType.Video, 'media should reflect payload')

  const starter = await received!.starter()
  t.ok(starter, 'starter should be resolvable')
  t.equal(starter!.id, CALLER_ID, 'starter should be the caller')

  await wechaty.stop()
  sandbox.restore()
})

test('duplicate Invite for the same callId is ignored', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-dup'
  const CALLER_ID = 'caller-dup'

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : CALLER_ID,
    participants : [ CALLER_ID, 'bot-self' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))

  let count = 0
  wechaty.on('call', () => { count++ })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    timestamp : 1,
  } as PUPPET.payloads.EventCall)
  await flush()
  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    timestamp : 2,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.equal(count, 1, "'call' should fire once even on duplicate Invite")

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 4. Ringing / Accept double-emit on outgoing
// ---------------------------------------------------------------------------

test('outgoing Ringing → object + bot emit; Accept → object + bot emit, status=connected', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-outgoing-ringing-accept'
  const PEER_ID = 'peer-ringing-accept'

  puppet.callInvite = sandbox.stub().resolves(CALL_ID)
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', PEER_ID ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))

  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)
  const call    = await contact.call()

  let objectRinging = false
  let botRinging    = false
  call.on('ringing', () => { objectRinging = true })
  wechaty.on('call-ringing', (c: CallInterface) => { if (c.id === CALL_ID) botRinging = true })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Ringing,
    contactId : PEER_ID,
    timestamp : 2,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.ok(objectRinging, "object should emit 'ringing'")
  t.ok(botRinging,    "bot should emit 'call-ringing'")
  t.equal(call.status(), 'ringing', 'status should be ringing')

  let objectActor: ContactInterface | undefined
  let botActor:    ContactInterface | undefined
  call.on('accept', actor => { objectActor = actor })
  wechaty.on('call-accept', (c: CallInterface, actor: ContactInterface) => {
    if (c.id === CALL_ID) {
      botActor = actor
    }
  })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Accept,
    contactId : PEER_ID,
    timestamp : 3,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.ok(objectActor, 'object accept actor should be set')
  t.equal(objectActor!.id, PEER_ID, 'object accept actor should be the peer')
  t.ok(botActor, 'bot accept actor should be set')
  t.equal(botActor!.id, PEER_ID, 'bot accept actor should be the peer')
  t.equal(call.status(), 'connected', 'status should be connected after Accept')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 5. accept() control on incoming
// ---------------------------------------------------------------------------

test('incoming call.accept() invokes puppet.callAccept(callId) and connects', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-accept'
  const CALLER_ID = 'caller-accept'

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : CALLER_ID,
    participants : [ CALLER_ID, 'bot-self' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  const acceptStub = sandbox.stub().resolves(undefined)
  puppet.callAccept = acceptStub

  let incoming: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { incoming = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    timestamp : 1,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.ok(incoming, 'should receive incoming call')
  await incoming!.accept()

  t.equal(incoming!.status(), 'connected', 'status should be connected after accept()')
  t.ok(acceptStub.calledOnce, 'puppet.callAccept should be called once')
  t.same(acceptStub.firstCall.args, [ CALL_ID ], 'callAccept args should be [callId]')

  await wechaty.stop()
  sandbox.restore()
})

test('outgoing call.accept() throws (invalid direction)', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  puppet.callInvite = sandbox.stub().resolves('call-id-outgoing-accept-bad')
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'peer' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer')
  const call    = await contact.call()

  await t.rejects(call.accept(), /invalid/i, 'accept() on outgoing should throw')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 6. reject() control on incoming + Reject signal terminal handling (outgoing 1v1)
// ---------------------------------------------------------------------------

test('incoming call.reject() invokes puppet.callReject(callId, reason) and ends', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-reject'

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'caller-x',
    participants : [ 'caller-x', 'bot-self' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  const rejectStub = sandbox.stub().resolves(undefined)
  puppet.callReject = rejectStub

  let incoming: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { incoming = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : 'caller-x',
    timestamp : 1,
  } as PUPPET.payloads.EventCall)
  await flush()

  await incoming!.reject('busy')
  t.equal(incoming!.status(), 'ended', 'status should be ended after reject()')
  t.same(rejectStub.firstCall.args, [ CALL_ID, 'busy' ], 'callReject args should be [callId, reason]')

  await wechaty.stop()
  sandbox.restore()
})

test('outgoing 1v1 Reject from peer → bot emits call-reject + call-ended, pool cleaned', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-outgoing-rejected'
  const PEER_ID = 'peer-rejecter'

  puppet.callInvite = sandbox.stub().resolves(CALL_ID)

  // Initial payload: live; on second pull (sync after Reject) the call has endTime set.
  let pulls = 0
  puppet.callPayload = sandbox.stub().callsFake(async (id: string) => {
    pulls++
    await new Promise(setImmediate)
    return {
      id,
      starter      : 'bot-self',
      participants : [ 'bot-self', PEER_ID ],
      media        : PUPPET.types.CallMediaType.Audio,
      startTime    : 1,
      endTime      : pulls === 1 ? undefined : 100,
    } as PUPPET.payloads.Call
  })
  puppet.callPayloadDirty = sandbox.stub().resolves(undefined)

  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)
  const call    = await contact.call()

  let rejectActor: ContactInterface | undefined
  let rejectReason: string | undefined
  let endedEmitCount = 0
  wechaty.on('call-reject', (c: CallInterface, actor: ContactInterface, reason?: string) => {
    if (c.id === CALL_ID) {
      rejectActor  = actor
      rejectReason = reason
    }
  })
  wechaty.on('call-ended', (c: CallInterface) => { if (c.id === CALL_ID) endedEmitCount++ })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Reject,
    contactId : PEER_ID,
    reason    : 'busy',
    timestamp : 50,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.ok(rejectActor, 'call-reject actor should be set')
  t.equal(rejectActor!.id, PEER_ID, 'call-reject actor should be the peer')
  t.equal(rejectReason, 'busy', 'call-reject reason should be passed through')
  t.equal(endedEmitCount, 1, 'call-ended should fire exactly once after Reject terminates the 1v1 call')
  t.equal(call.status(), 'ended', 'status should be ended after terminal Reject')
  t.notOk((wechaty as any).__callPool.has(CALL_ID), 'call should be evicted from pool')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 7. Cancel signal received by callee → cancel + ended emitted
// ---------------------------------------------------------------------------

test('Cancel signal terminates incoming call; emits cancel + ended; pool cleaned; status flips before cancel handler runs', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-cancel'
  const CALLER_ID = 'caller-cancel'

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : CALLER_ID,
    participants : [ CALLER_ID, 'bot-self' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))

  let incoming: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { incoming = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    timestamp : 1,
  } as PUPPET.payloads.EventCall)
  await flush()

  let objectCancelReason: string | undefined
  let botCancelReason: string | undefined
  let statusInCancelHandler: string | undefined
  let endedFiredCount = 0
  incoming!.on('cancel', reason => {
    objectCancelReason = reason
    statusInCancelHandler = incoming!.status()
  })
  wechaty.on('call-cancel', (c: CallInterface, reason?: string) => {
    if (c.id === CALL_ID) {
      botCancelReason = reason
    }
  })
  wechaty.on('call-ended', (c: CallInterface) => { if (c.id === CALL_ID) endedFiredCount++ })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Cancel,
    contactId : CALLER_ID,
    reason    : 'caller-aborted',
    timestamp : 2,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.equal(objectCancelReason, 'caller-aborted', "object 'cancel' reason should match")
  t.equal(botCancelReason, 'caller-aborted', "bot 'call-cancel' reason should match")
  t.equal(endedFiredCount, 1, "'call-ended' should fire exactly once after Cancel (idempotent via __endedEmitted)")
  t.equal(statusInCancelHandler, 'ended', "status should be 'ended' inside the cancel handler (no race window)")
  t.equal(incoming!.status(), 'ended', 'status should be ended')
  t.notOk((wechaty as any).__callPool.has(CALL_ID), 'call should be evicted from pool')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 8. hangup() control on connected
// ---------------------------------------------------------------------------

test('call.hangup() on connected call invokes puppet.callHangup and ends', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-hangup'
  const PEER_ID = 'peer-hangup'

  puppet.callInvite = sandbox.stub().resolves(CALL_ID)
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', PEER_ID ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  const hangupStub = sandbox.stub().resolves(undefined)
  puppet.callHangup = hangupStub

  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)
  const call    = await contact.call()

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Accept,
    contactId : PEER_ID,
    timestamp : 2,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.equal(call.status(), 'connected', 'prerequisite: call should be connected')

  await call.hangup('done')
  t.equal(call.status(), 'ended', 'status should be ended after hangup()')
  t.same(hangupStub.firstCall.args, [ CALL_ID, 'done' ], 'callHangup args should be [callId, reason]')

  await wechaty.stop()
  sandbox.restore()
})

test('call.hangup() rejects when puppet.callHangup fails but local status still ends', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  puppet.callInvite = sandbox.stub().resolves('call-id-hangup-fail')
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', 'peer' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  const hangupStub = sandbox.stub().rejects(new Error('network error'))
  puppet.callHangup = hangupStub

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer')
  const call    = await contact.call()

  ;(puppet as any).emit('call', {
    callId    : call.id,
    signal    : PUPPET.types.CallSignal.Accept,
    contactId : 'peer',
    timestamp : 2,
  } as PUPPET.payloads.EventCall)
  await flush()
  t.equal(call.status(), 'connected', 'prerequisite: call should be connected')

  await t.rejects(call.hangup(), /network error/, 'hangup() should re-throw')
  t.equal(call.status(), 'ended', 'status should still be ended despite failure')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 9. add() invokes puppet.callAdd(callId, contactIds)
// ---------------------------------------------------------------------------

test('call.add() invokes puppet.callAdd with the contact ids', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-add'

  puppet.callInvite = sandbox.stub().resolves(CALL_ID)
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', 'peer' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  const addStub = sandbox.stub().resolves(undefined)
  puppet.callAdd = addStub

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer')
  const call    = await contact.call()

  const newContactA = (wechaty.Contact as typeof ContactImpl).load('newA')
  const newContactB = (wechaty.Contact as typeof ContactImpl).load('newB')

  await call.add([ newContactA, newContactB ])
  t.same(addStub.firstCall.args, [ CALL_ID, [ 'newA', 'newB' ] ], 'callAdd args should be [callId, contactIds]')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 10. mediaEndpoint() pass-through
// ---------------------------------------------------------------------------

test('call.mediaEndpoint() forwards to puppet.callMediaEndpoint', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-media'

  puppet.callInvite = sandbox.stub().resolves(CALL_ID)
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', 'peer' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  const endpoint: PUPPET.payloads.CallMediaEndpoint = {
    url   : 'wss://media.example/sfu',
    token : 'token-xyz',
  }
  const endpointStub = sandbox.stub().resolves(endpoint)
  puppet.callMediaEndpoint = endpointStub

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer')
  const call    = await contact.call()

  const got = await call.mediaEndpoint()
  t.same(got, endpoint, 'mediaEndpoint should pass through')
  t.same(endpointStub.firstCall.args, [ CALL_ID ], 'callMediaEndpoint args should be [callId]')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 11. wechaty.stop() drains the call pool
// ---------------------------------------------------------------------------

test('wechaty.stop() clears the call pool', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  puppet.callInvite = sandbox.stub().resolves('call-id-stop')
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', 'peer' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))

  const contact = (wechaty.Contact as typeof ContactImpl).load('peer')
  await contact.call()

  t.ok((wechaty as any).__callPool.size > 0, 'pool should be non-empty before stop()')

  await wechaty.stop()
  t.equal((wechaty as any).__callPool.size, 0, 'pool should be empty after stop()')

  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 12. Unknown callId signal is silently dropped (no error event)
// ---------------------------------------------------------------------------

test('signal for unknown callId is dropped, not surfaced as error', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  let errorEmitted = false
  wechaty.on('error', () => { errorEmitted = true })

  ;(puppet as any).emit('call', {
    callId    : 'never-seen',
    signal    : PUPPET.types.CallSignal.Hangup,
    contactId : 'someone',
    timestamp : 1,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.notOk(errorEmitted, 'unknown callId should not emit error')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 13. Local control methods evict from pool + emit object 'ended'
// ---------------------------------------------------------------------------

test("local reject() evicts from pool and emits object 'ended' + bot 'call-ended'", async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-local-reject'
  const CALLER_ID = 'caller-local-reject'

  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : CALLER_ID,
    participants : [ CALLER_ID, 'bot-self' ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  puppet.callReject = sandbox.stub().resolves(undefined)

  let incoming: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { incoming = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    timestamp : 1,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.ok(incoming, 'should receive incoming call')
  t.ok((wechaty as any).__callPool.has(CALL_ID), 'pool should contain call before reject')

  let endedEmitted = false
  let botEndedCount = 0
  incoming!.on('ended', () => { endedEmitted = true })
  wechaty.on('call-ended', (c: CallInterface) => { if (c.id === CALL_ID) botEndedCount++ })

  await incoming!.reject('busy')

  t.ok(endedEmitted, "object 'ended' should fire after local reject()")
  t.equal(botEndedCount, 1, "bot 'call-ended' should fire exactly once after local reject()")
  t.notOk((wechaty as any).__callPool.has(CALL_ID), 'call should be evicted from pool after reject()')

  await wechaty.stop()
  sandbox.restore()
})

test("local cancel() evicts from pool and emits object 'ended' + bot 'call-ended'", async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-local-cancel'
  const PEER_ID = 'peer-local-cancel'

  puppet.callInvite = sandbox.stub().resolves(CALL_ID)
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', PEER_ID ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  puppet.callCancel = sandbox.stub().resolves(undefined)

  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)
  const call    = await contact.call()

  t.ok((wechaty as any).__callPool.has(CALL_ID), 'pool should contain call before cancel')

  let endedEmitted = false
  let botEndedCount = 0
  call.on('ended', () => { endedEmitted = true })
  wechaty.on('call-ended', (c: CallInterface) => { if (c.id === CALL_ID) botEndedCount++ })

  await call.cancel()

  t.ok(endedEmitted, "object 'ended' should fire after local cancel()")
  t.equal(botEndedCount, 1, "bot 'call-ended' should fire exactly once after local cancel()")
  t.notOk((wechaty as any).__callPool.has(CALL_ID), 'call should be evicted from pool after cancel()')

  await wechaty.stop()
  sandbox.restore()
})

test("local hangup() evicts from pool and emits object 'ended' + bot 'call-ended'", async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID = 'call-id-local-hangup'
  const PEER_ID = 'peer-local-hangup'

  puppet.callInvite = sandbox.stub().resolves(CALL_ID)
  stubCallPayload(puppet, (id: string) => ({
    id,
    starter      : 'bot-self',
    participants : [ 'bot-self', PEER_ID ],
    media        : PUPPET.types.CallMediaType.Audio,
    startTime    : 1,
  }))
  puppet.callHangup = sandbox.stub().resolves(undefined)

  const contact = (wechaty.Contact as typeof ContactImpl).load(PEER_ID)
  const call    = await contact.call()

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Accept,
    contactId : PEER_ID,
    timestamp : 2,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.equal(call.status(), 'connected', 'prerequisite: call should be connected')
  t.ok((wechaty as any).__callPool.has(CALL_ID), 'pool should contain call before hangup')

  let endedEmitted = false
  let botEndedCount = 0
  call.on('ended', () => { endedEmitted = true })
  wechaty.on('call-ended', (c: CallInterface) => { if (c.id === CALL_ID) botEndedCount++ })

  await call.hangup('done')

  t.ok(endedEmitted, "object 'ended' should fire after local hangup()")
  t.equal(botEndedCount, 1, "bot 'call-ended' should fire exactly once after local hangup()")
  t.notOk((wechaty as any).__callPool.has(CALL_ID), 'call should be evicted from pool after hangup()')

  await wechaty.stop()
  sandbox.restore()
})

// ---------------------------------------------------------------------------
// 14. dirty(Call) refreshes user-layer __payload
// ---------------------------------------------------------------------------

test('dirty(Call) refreshes user-layer payload so getters see new value', async t => {
  const { puppet, wechaty } = buildWechaty()
  await startAndLogin(puppet, wechaty)

  const CALL_ID   = 'call-id-dirty'
  const CALLER_ID = 'caller-dirty'

  // First pull returns Audio; subsequent pulls return Video, simulating a
  // server-side media switch (e.g. add() upgraded the call).
  let pulls = 0
  puppet.callPayload = sandbox.stub().callsFake(async (id: string) => {
    pulls++
    await new Promise(setImmediate)
    return {
      id,
      starter      : CALLER_ID,
      participants : [ CALLER_ID, 'bot-self' ],
      media        : pulls === 1 ? PUPPET.types.CallMediaType.Audio : PUPPET.types.CallMediaType.Video,
      startTime    : 1,
    } as PUPPET.payloads.Call
  })
  puppet.callPayloadDirty = sandbox.stub().resolves(undefined)

  let incoming: CallInterface | undefined
  wechaty.on('call', (c: CallInterface) => { incoming = c })

  ;(puppet as any).emit('call', {
    callId    : CALL_ID,
    signal    : PUPPET.types.CallSignal.Invite,
    contactId : CALLER_ID,
    timestamp : 1,
  } as PUPPET.payloads.EventCall)
  await flush()

  t.ok(incoming, 'should receive incoming call')
  t.equal(incoming!.media(), PUPPET.types.CallMediaType.Audio, 'initial media should be Audio')

  ;(puppet as any).emit('dirty', {
    payloadType : PUPPET.types.Payload.Call,
    payloadId   : CALL_ID,
  } as PUPPET.payloads.EventDirty)
  await flush()

  t.equal(incoming!.media(), PUPPET.types.CallMediaType.Video, 'media should reflect refreshed payload after dirty')
  // Note: the handler intentionally does NOT call puppet.callPayloadDirty;
  // doing so would form a gRPC loop under puppet-service (server bounces the
  // dirty back through the event stream). Cache invalidation is handled by
  // the cache-mixin onDirty listener; the user-visible contract is that
  // .media() above reflects the fresh server value.

  await wechaty.stop()
  sandbox.restore()
})
