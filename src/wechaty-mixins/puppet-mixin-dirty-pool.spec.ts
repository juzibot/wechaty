#!/usr/bin/env -S node --no-warnings --loader ts-node/esm

import { test }        from 'tstest'
import * as PUPPET     from '@juzi/wechaty-puppet'
import { PuppetMock }  from '@juzi/wechaty-puppet-mock'

import { WechatyBuilder } from '../wechaty-builder.js'

/**
 * Regression: the `dirty` event handler for pooled user-modules
 * (Contact / Room / WxxdProduct / WxxdOrder) used to call
 * `this.Xxx.find({ id }).ready(true)`. `find({ id })` on a pool miss
 * constructs a fresh instance and calls `ready()` — a puppet-side gRPC
 * round-trip — turning a passive "invalidate if cached" signal into an
 * active fetch for ids no business code has touched.
 *
 * The fix looks the id up in the pool directly and only calls
 * `.ready(true)` when the instance is already pooled.
 */

async function delay (ms: number): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, ms))
}

test('dirty handler does not fetch payload for un-pooled ids, but still refreshes pooled ones', async t => {
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const botContact = puppet.mocker.createContact({ name: 'test-bot' })

  await wechaty.start()
  await puppet.mocker.login(botContact)

  // --- Case 1: un-pooled Contact id must not trigger contactRawPayload ---

  let contactRawPayloadCalls = 0
  const originalContactRawPayload = puppet.contactRawPayload.bind(puppet)
  puppet.contactRawPayload = async (id: string) => {
    contactRawPayloadCalls++
    return originalContactRawPayload(id)
  }

  puppet.emit('dirty', {
    payloadType: PUPPET.types.Payload.Contact,
    payloadId:   'never-loaded-contact-id',
  })
  await delay(50)

  t.equal(
    contactRawPayloadCalls,
    0,
    `dirty(Contact) for un-pooled id must not trigger contactRawPayload; got ${contactRawPayloadCalls} call(s)`,
  )

  // --- Case 2: un-pooled Room id must not trigger roomRawPayload ---

  let roomRawPayloadCalls = 0
  const originalRoomRawPayload = puppet.roomRawPayload.bind(puppet)
  puppet.roomRawPayload = async (id: string) => {
    roomRawPayloadCalls++
    return originalRoomRawPayload(id)
  }

  puppet.emit('dirty', {
    payloadType: PUPPET.types.Payload.Room,
    payloadId:   'never-loaded-room-id',
  })
  await delay(50)

  t.equal(
    roomRawPayloadCalls,
    0,
    `dirty(Room) for un-pooled id must not trigger roomRawPayload; got ${roomRawPayloadCalls} call(s)`,
  )

  // --- Case 3: Message dirty must not trigger messageRawPayload (Message has no user-layer pool) ---

  let messageRawPayloadCalls = 0
  const originalMessageRawPayload = puppet.messageRawPayload.bind(puppet)
  puppet.messageRawPayload = async (id: string) => {
    messageRawPayloadCalls++
    return originalMessageRawPayload(id)
  }

  puppet.emit('dirty', {
    payloadType: PUPPET.types.Payload.Message,
    payloadId:   'some-message-id',
  })
  await delay(50)

  t.equal(
    messageRawPayloadCalls,
    0,
    `dirty(Message) must not trigger messageRawPayload at the user layer; got ${messageRawPayloadCalls} call(s)`,
  )

  // --- Case 4: un-pooled Contact still emits the user-facing dirty event ---

  let wechatyDirtyEmits = 0
  wechaty.on('dirty', () => {
    wechatyDirtyEmits++
  })

  puppet.emit('dirty', {
    payloadType: PUPPET.types.Payload.Contact,
    payloadId:   'yet-another-un-pooled-id',
  })
  await delay(50)

  t.equal(
    wechatyDirtyEmits,
    1,
    `wechaty.emit('dirty', ...) must fire once even when the id is not pooled; got ${wechatyDirtyEmits}`,
  )

  // --- Case 5: pooled Contact MUST re-fetch on dirty ---

  const pooledContact = puppet.mocker.createContact({ name: 'pooled-contact' })

  // Force the contact into the wechatified pool via find(). Payload gets
  // loaded once as part of find()'s ready() call — subsequent counts we
  // measure from AFTER this seed.
  await wechaty.Contact.find({ id: pooledContact.id })

  let contactPayloadCalls = 0
  const originalContactPayload = puppet.contactPayload.bind(puppet)
  puppet.contactPayload = async (id: string) => {
    contactPayloadCalls++
    return originalContactPayload(id)
  }

  puppet.emit('dirty', {
    payloadType: PUPPET.types.Payload.Contact,
    payloadId:   pooledContact.id,
  })
  await delay(50)

  t.ok(
    contactPayloadCalls >= 1,
    `dirty(Contact) for pooled id must trigger contactPayload via ready(true); got ${contactPayloadCalls} call(s)`,
  )

  await wechaty.stop()
})
