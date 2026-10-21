#!/usr/bin/env -S node --no-warnings --loader ts-node/esm

import { test, sinon } from 'tstest'
import type * as PUPPET from '@juzi/wechaty-puppet'
import { PuppetMock } from '@juzi/wechaty-puppet-mock'

import { WechatyBuilder } from '../wechaty-builder.js'
import type { WechatyInterface } from '../wechaty/mod.js'

const READY_DELAY_MS = 15 * 1000

interface Fixture {
  puppet: PUPPET.impls.PuppetInterface
  wechaty: WechatyInterface
}

type Teardown = (fn: () => Promise<void> | void) => void

async function startedFixture (teardown: Teardown): Promise<Fixture> {
  const puppet = new PuppetMock() as unknown as PUPPET.impls.PuppetInterface
  const wechaty = WechatyBuilder.build({ puppet })
  teardown(async (): Promise<void> => { await wechaty.stop() })
  await wechaty.start()
  return { puppet, wechaty }
}

/** The ready handler only emits for a logged-in Wechaty; the mock puppet has no real login. */
function markLoggedIn (wechaty: WechatyInterface): void {
  (wechaty as unknown as { __loginIndicator: { value (isLoggedIn: boolean): void } }).__loginIndicator.value(true)
}

async function flushMicrotasks (): Promise<void> {
  for (let i = 0; i < 10; i++) { await Promise.resolve() }
}

test('room-member-load forwards the {roomId} payload unchanged', async t => {
  const { puppet, wechaty } = await startedFixture(t.teardown.bind(t))
  const received = sinon.spy()
  wechaty.on('room-member-load', received)

  const payload: PUPPET.payloads.EventRoomMemberLoad = { roomId: 'room' }
  puppet.emit('room-member-load', payload)

  t.same(received.args, [ [ payload ] ])
})

test('room-member-lazy-load-finished is forwarded without arguments', async t => {
  const { puppet, wechaty } = await startedFixture(t.teardown.bind(t))
  const received = sinon.spy()
  wechaty.on('room-member-lazy-load-finished', received)

  puppet.emit('room-member-lazy-load-finished', {})

  t.same(received.args, [ [] ])
})

test('roomMemberLazyLoadNow is reachable through wechaty.puppet', async t => {
  const { puppet, wechaty } = await startedFixture(t.teardown.bind(t))
  const loadNow = sinon.stub().resolves()
  Object.assign(puppet, { roomMemberLazyLoadNow: loadNow })

  await wechaty.puppet.roomMemberLazyLoadNow()

  t.equal(loadNow.callCount, 1)
})

for (const [ title, payload, expected ] of [
  [ 'with data', { data: 'lazy-load' }, 'lazy-load' ],
  [ 'without data', {}, undefined ],
] as const) {
  test(`ready ${title} is forwarded after the login settle delay`, async t => {
    const { puppet, wechaty } = await startedFixture(t.teardown.bind(t))
    markLoggedIn(wechaty)
    const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
    t.teardown((): void => { clock.restore() })

    const ready = sinon.spy()
    wechaty.on('ready', ready)
    puppet.emit('ready', payload)
    await flushMicrotasks()
    t.equal(ready.callCount, 0, 'ready waits for the settle delay')

    await clock.tickAsync(READY_DELAY_MS)

    t.equal(ready.callCount, 1)
    t.same(ready.args[0], [ expected ])
  })
}

test('legacy no-argument ready listeners still compile and run', async t => {
  const { puppet, wechaty } = await startedFixture(t.teardown.bind(t))
  markLoggedIn(wechaty)
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  t.teardown((): void => { clock.restore() })

  let calls = 0
  wechaty.on('ready', (): void => { calls++ })
  puppet.emit('ready', { data: 'ignored' })
  await clock.tickAsync(READY_DELAY_MS)

  t.equal(calls, 1)
})
