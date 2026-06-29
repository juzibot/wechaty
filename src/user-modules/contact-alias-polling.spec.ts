#!/usr/bin/env -S node --no-warnings --loader ts-node/esm

import { test }       from 'tstest'
import { PuppetMock } from '@juzi/wechaty-puppet-mock'

import { WechatyBuilder } from '../wechaty-builder.js'

/**
 * Regression: `Contact.alias(newAlias)` invokes
 *   1. puppet.contactAlias(id, newAlias)    // gRPC write
 *   2. puppet.contactPayloadDirty(id)       // ONCE, outside the loop  ← BUG
 *   3. loop 10× { sleep 300ms; puppet.contactPayload(id); check }
 *
 * Under puppet-service the first contactPayload() call after a dirty
 * clears both the LRU and the FlashStore, then refills both with the
 * fresh fetch. LRU TTL is 15 minutes, so iterations 2..10 hit the LRU
 * and return iteration-1's payload forever. If the underlying protocol
 * (puppet-phoenix etc.) was still propagating the alias change at the
 * moment of iteration 1, the 9 follow-up retries become no-ops and
 * `alias()` throws "still got old alias after 10 tries".
 *
 * The fix moves contactPayloadDirty INTO the loop so every retry
 * forces a fresh fetch. This test pins that contract: under a forced
 * stale-read scenario, contactPayloadDirty must be called more than
 * once.
 */
test('alias() must call contactPayloadDirty on every poll iteration', async t => {
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  // Swallow the wechaty-level error the alias() impl re-emits after
  // its 10 poll iterations all fail to confirm the new alias; without
  // this, the unhandled 'error' event tears down the test.
  wechaty.on('error', () => {})

  const mockMe   = puppet.mocker.createContact({ name: 'me' })
  const mockUser = puppet.mocker.createContact({ name: 'Alice' })

  await wechaty.start()
  await puppet.mocker.login(mockMe)

  let dirtyCount = 0
  puppet.contactPayloadDirty = async (_: string) => {
    dirtyCount++
  }

  // Simulate the protocol-layer "alias write accepted" but
  // payload reads keep returning the OLD alias — the exact stuck
  // scenario the polling loop is supposed to wait out.
  puppet.contactAlias = async (_id: string, _newAlias: string) => {}
  puppet.contactPayload = async (id: string) => ({
    id,
    alias: 'OLD',
    name:  'Alice',
  })

  const contact = await wechaty.Contact.find({ id: mockUser.id })
  t.ok(contact, 'sanity: find returned a contact')

  // alias() traps internally and emits through wechaty error channel.
  // We do NOT assert on the throw — only on dirty-call cadence.
  await contact!.alias('NEW')

  t.ok(
    dirtyCount > 1,
    `contactPayloadDirty must be called inside the retry loop, not just once before it; got ${dirtyCount}`,
  )

  await wechaty.stop()
})
