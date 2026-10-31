#!/usr/bin/env -S node --no-warnings --loader ts-node/esm

import { clearTimeout as clearBarrierTimeout, setTimeout as setBarrierTimeout } from 'node:timers'

import { test, sinon } from 'tstest'
import type * as PUPPET from '@juzi/wechaty-puppet'
import { PuppetMock } from '@juzi/wechaty-puppet-mock'

import '../wechaty/wechaty-impl.js'
import { WechatyBase } from '../wechaty/wechaty-base.js'

type AuthListener = (payload: { contactId: string, data?: string }) => Promise<void>
type ReadyListener = (payload: { data: string }) => Promise<void>

function deferred (): { promise: Promise<void>, resolve: () => void } {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve, reject) => {
    const timeout = setBarrierTimeout(() => {
      reject(new Error('Test barrier timed out after 5000ms'))
    }, 5000)
    release = (): void => {
      clearBarrierTimeout(timeout)
      resolve()
    }
  })
  // A barrier may expire before its consumer attaches; keep the original
  // rejection observable to awaiters without an unhandled rejection.
  void promise.catch(() => {})
  return { promise, resolve: release }
}

async function fixture (): Promise<{
  puppet: PUPPET.impls.PuppetInterface
  wechaty: WechatyBase
  contactId: string
  login: AuthListener
  logout: AuthListener
  readyListener: ReadyListener
}> {
  const mock = new PuppetMock()
  const puppet = mock as unknown as PUPPET.impls.PuppetInterface
  const wechaty = new WechatyBase({ puppet })
  wechaty.on('error', () => {})
  const contactId = mock.mocker.createContact({ name: 'auth-projection' }).id
  await wechaty.init()
  const login = puppet.listeners('login').slice(-1)[0] as unknown as AuthListener
  const logout = puppet.listeners('logout').slice(-1)[0] as unknown as AuthListener
  const readyListener = puppet.listeners('ready').slice(-1)[0] as unknown as ReadyListener
  await wechaty.start()
  return { contactId, login, logout, puppet, readyListener, wechaty }
}

test('authentication projects event IDs in order without waiting for application business', async t => {
  const { puppet, wechaty, contactId, login, logout } = await fixture()
  const gate = deferred()
  const entered = deferred()
  const business = deferred()
  const sandbox = sinon.createSandbox()
  const original = puppet.contactPayload.bind(puppet)
  sandbox.stub(puppet, 'contactPayload').callsFake(async (id: string) => {
    entered.resolve()
    await gate.promise
    return original(id)
  })
  const delivered: string[] = []
  wechaty.on('login', async user => {
    delivered.push(`login:${user.id}`)
    await business.promise
  })
  wechaty.on('logout', user => { delivered.push(`logout:${user.id}`) })
  try {
    const loggingIn = login({ contactId })
    await entered.promise
    const loggingOut = logout({ contactId, data: 'expired' })
    t.same(delivered, [], 'logout cannot overtake payload resolution')
    gate.resolve()
    await Promise.all([ loggingIn, loggingOut ])
    t.same(delivered, [ `login:${contactId}`, `logout:${contactId}` ])
    t.notOk(wechaty.__loginIndicator.value(), 'final projection is logged out')
  } finally {
    gate.resolve()
    business.resolve()
    sandbox.restore()
    await wechaty.stop()
  }
})

test('stop cancels queued projections and restart does not wait for old I/O', async t => {
  const { puppet, wechaty, contactId, login, logout } = await fixture()
  const gate = deferred()
  const entered = deferred()
  const sandbox = sinon.createSandbox()
  const original = puppet.contactPayload.bind(puppet)
  const payload = sandbox.stub(puppet, 'contactPayload').callsFake(async (id: string) => {
    const snapshot = await original(id)
    entered.resolve()
    await gate.promise
    return { ...snapshot, name: 'obsolete-generation' }
  })
  const delivered: string[] = []
  let projectedName: (() => string) | undefined
  wechaty.on('login', user => {
    delivered.push(`login:${user.id}`)
    projectedName = (): string => user.name()
  })
  wechaty.on('logout', user => { delivered.push(`logout:${user.id}`) })
  try {
    const oldLogin = login({ contactId })
    await entered.promise
    const oldLogout = logout({ contactId })
    await wechaty.stop()
    await t.rejects(oldLogin, /cancelled/)
    await t.rejects(oldLogout, /cancelled/)
    await t.rejects(login({ contactId }), /cancelled/, 'stopped admission rejects')
    payload.restore()
    await wechaty.start()
    await login({ contactId })
    gate.resolve()
    await new Promise<void>(resolve => setImmediate(resolve))
    t.same(delivered, [ `login:${contactId}` ], 'old generation never emits into the new run')
    t.equal(projectedName?.(), 'auth-projection', 'late old payload cannot mutate the new pooled ContactSelf')
    t.ok(wechaty.__loginIndicator.value())
  } finally {
    gate.resolve()
    sandbox.restore()
    await wechaty.stop()
  }
})

test('ready waiters and delayed ready cannot survive logout or restart', async t => {
  const { puppet, wechaty, contactId, login, logout } = await fixture()
  const fallbackReady = sinon.stub(puppet.readyIndicator, 'value').returns(false)
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  const ready = sinon.spy()
  wechaty.on('ready', ready)
  const loginListeners = wechaty.listenerCount('login')
  try {
    puppet.emit('ready', { data: 'old-waiter' })
    t.equal(wechaty.listenerCount('login'), loginListeners + 1)
    await wechaty.stop()
    t.equal(wechaty.listenerCount('login'), loginListeners, 'stop removes pending login waiter')
    t.equal(clock.countTimers(), 0, 'stop clears waiting timeout')
    await wechaty.start()
    await login({ contactId })
    puppet.emit('ready', { data: 'old-delay' })
    await logout({ contactId })
    t.equal(clock.countTimers(), 0, 'logout removes ready delay')
    await login({ contactId })
    await clock.tickAsync(15 * 1000)
    t.equal(ready.callCount, 0, 'neither old ready can fire after a new login')
    puppet.emit('ready', { data: 'fresh' })
    await clock.tickAsync(15 * 1000)
    t.same(ready.args, [ [ 'fresh' ] ])
    await wechaty.stop()
    t.equal(clock.countTimers(), 0)
  } finally {
    clock.restore()
    fallbackReady.restore()
    await wechaty.stop()
  }
})

test('ready receipt waits for login and delayed emission, while stop rejects pending receipt', async t => {
  const { wechaty, contactId, login, logout, readyListener } = await fixture()
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  const emitted = sinon.spy()
  wechaty.on('ready', emitted)
  try {
    let settled = false
    const receipt = readyListener({ data: 'tracked-ready' })
    const observed = receipt.then(() => {
      settled = true
      return undefined
    })
    await clock.tickAsync(1)
    t.notOk(settled, 'ready receipt waits for login')
    await login({ contactId })
    await clock.tickAsync(14999)
    t.notOk(settled, 'receipt remains pending before emission')
    t.equal(emitted.callCount, 0)
    await clock.tickAsync(1)
    await observed
    t.same(emitted.args, [ [ 'tracked-ready' ] ])
    t.ok(settled)

    const withdrawn = readyListener({ data: 'withdrawn-by-logout' })
    await logout({ contactId })
    await withdrawn
    t.equal(emitted.callCount, 1, 'normal logout explicitly withdraws readiness')

    const cancelled = readyListener({ data: 'stopped-ready' })
    await wechaty.stop()
    await t.rejects(cancelled, /cancelled/, 'stop must not acknowledge delivery')
    t.equal(clock.countTimers(), 0)
  } finally {
    clock.restore()
    await wechaty.stop()
  }
})

test('logout withdraws intervening ready and repeated ready delivers every payload', async t => {
  const { puppet, wechaty, contactId, login, logout, readyListener } = await fixture()
  const gate = deferred()
  const entered = deferred()
  const sandbox = sinon.createSandbox()
  const original = puppet.contactPayload.bind(puppet)
  const emitted = sinon.spy()
  wechaty.on('ready', emitted)
  await login({ contactId })
  const payload = sandbox.stub(puppet, 'contactPayload').callsFake(async (id: string) => {
    entered.resolve()
    await gate.promise
    return original(id)
  })
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  try {
    const loggingIn = login({ contactId })
    await entered.promise
    const loggingOut = logout({ contactId })
    const intervening = readyListener({ data: 'between-logout-admission-and-delivery' })
    gate.resolve()
    await Promise.all([ loggingIn, loggingOut ])
    await intervening
    payload.restore()
    const fallbackReady = sandbox.stub(puppet.readyIndicator, 'value').returns(false)
    await login({ contactId })
    await clock.tickAsync(15000)
    t.equal(emitted.callCount, 0, 'intervening ready cannot cross the authentication cycle')
    fallbackReady.restore()
    const first = readyListener({ data: 'first' })
    const second = readyListener({ data: 'second' })
    await clock.tickAsync(15000)
    const receipts = await Promise.allSettled([ first, second ])
    t.same(receipts.map(receipt => receipt.status), [ 'fulfilled', 'fulfilled' ])
    t.same(emitted.args, [ [ 'first' ], [ 'second' ] ])
  } finally {
    clock.restore()
    gate.resolve()
    entered.resolve()
    sandbox.restore()
    await wechaty.stop()
  }
})

test('late logout projection cannot withdraw ready admitted for a subsequent login', async t => {
  const { puppet, wechaty, contactId, login, logout, readyListener } = await fixture()
  const gate = deferred()
  const entered = deferred()
  const secondGate = deferred()
  const secondEntered = deferred()
  const sandbox = sinon.createSandbox()
  const original = puppet.contactPayload.bind(puppet)
  const payload = sandbox.stub(puppet, 'contactPayload')
  payload.onFirstCall().callsFake(async (id: string) => {
    entered.resolve()
    await gate.promise
    return original(id)
  })
  payload.callsFake(original)
  payload.onSecondCall().callsFake(async (id: string) => {
    secondEntered.resolve()
    await secondGate.promise
    return original(id)
  })
  const emitted = sinon.spy()
  wechaty.on('ready', emitted)
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  try {
    const firstLogin = login({ contactId })
    await entered.promise
    const loggingOut = logout({ contactId })
    const secondLogin = login({ contactId })
    let settled = false
    const secondReady = readyListener({ data: 'second-cycle' }).then(() => {
      settled = true
      return undefined
    })
    gate.resolve()
    await secondEntered.promise
    await clock.tickAsync(15000)
    t.notOk(settled, 'earlier login cannot start the later READY delivery timer')
    t.equal(emitted.callCount, 0, 'READY waits for its own login payload projection')
    secondGate.resolve()
    await Promise.all([ firstLogin, loggingOut, secondLogin ])
    t.ok(wechaty.__loginIndicator.value(), 'second login is the final projection')
    await clock.tickAsync(14999)
    t.notOk(settled, 'receipt stays pending until the second-cycle READY is emitted')
    await clock.tickAsync(1)
    await secondReady
    t.same(emitted.args, [ [ 'second-cycle' ] ], 'READY bound to the later login is emitted')
    t.ok(wechaty.__readyState.active(), 'wechaty.ready() can resolve')
  } finally {
    clock.restore()
    gate.resolve()
    secondGate.resolve()
    secondEntered.resolve()
    sandbox.restore()
    await wechaty.stop()
  }
})

test('later login retains fallback READY after an earlier queued logout', async t => {
  const { puppet, wechaty, contactId, login, logout } = await fixture()
  const gate = deferred()
  const entered = deferred()
  const sandbox = sinon.createSandbox()
  const original = puppet.contactPayload.bind(puppet)
  const payload = sandbox.stub(puppet, 'contactPayload').callsFake(original)
  payload.onFirstCall().callsFake(async (id: string) => {
    entered.resolve()
    await gate.promise
    return original(id)
  })
  sandbox.stub(puppet.readyIndicator, 'value').returns(true)
  const emitted = sinon.spy()
  wechaty.on('ready', emitted)
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  try {
    const firstLogin = login({ contactId })
    await entered.promise
    const loggingOut = logout({ contactId })
    const secondLogin = login({ contactId })
    gate.resolve()
    await Promise.all([ firstLogin, loggingOut, secondLogin ])
    await clock.tickAsync(14999)
    t.equal(emitted.callCount, 0)
    await clock.tickAsync(1)
    t.same(emitted.args, [ [ undefined ] ], 'only the last admitted login schedules fallback')
    t.ok(wechaty.__readyState.active())
  } finally {
    clock.restore()
    gate.resolve()
    entered.resolve()
    sandbox.restore()
    await wechaty.stop()
  }
})

test('authentication state and ready survive application removeAllListeners', async t => {
  const { wechaty, contactId, login, logout, readyListener } = await fixture()
  wechaty.removeAllListeners()
  wechaty.on('error', () => {})
  const loggedIn = sinon.spy()
  const ready = sinon.spy()
  wechaty.on('login', loggedIn)
  wechaty.on('ready', ready)
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  try {
    await login({ contactId })
    t.equal(loggedIn.callCount, 1)
    t.ok(wechaty.__loginIndicator.value(), 'bridge owns state independent of application listeners')
    const receipt = readyListener({ data: 'after-remove-all' })
    await clock.tickAsync(15000)
    await receipt
    t.same(ready.args, [ [ 'after-remove-all' ] ])
    await logout({ contactId })
    t.notOk(wechaty.__loginIndicator.value())
  } finally {
    clock.restore()
    await wechaty.stop()
  }
})

test('puppet stop can synchronously deliver terminal logout without payload I/O', async t => {
  const { puppet, wechaty, contactId, login } = await fixture()
  await login({ contactId })
  const sandbox = sinon.createSandbox()
  const loggedOut = sinon.spy()
  wechaty.on('logout', loggedOut)
  const payload = sandbox.stub(puppet, 'contactPayload').rejects(new Error('offline'))
  const originalStop = puppet.stop.bind(puppet)
  sandbox.stub(puppet, 'stop').callsFake(async (): Promise<void> => {
    puppet.emit('logout', { contactId, data: 'terminal-stop' })
    t.equal(loggedOut.callCount, 1, 'terminal logout is synchronous during stop')
    await originalStop()
  })
  try {
    await wechaty.stop()
    t.equal(loggedOut.firstCall.args[0].id, contactId)
    t.notOk(payload.called)
    t.notOk(wechaty.__loginIndicator.value())
  } finally {
    sandbox.restore()
    await wechaty.stop()
  }
})

test('ready failures are reported even when the error observer throws', async t => {
  const { puppet, wechaty, contactId, login, readyListener } = await fixture()
  const sandbox = sinon.createSandbox()
  const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] })
  const unhandled = sinon.spy()
  const reported = sinon.spy()
  const reportingFailures = sandbox.stub(wechaty.log, 'error')
  wechaty.on('error', error => {
    reported(error)
    throw new Error('application error reporter failed')
  })
  process.on('unhandledRejection', unhandled)
  try {
    const timedOut = readyListener({ data: 'no-login' })
    await clock.tickAsync(60000)
    await t.rejects(timedOut, /waiting for login timeout/)
    t.equal(reported.callCount, 1)

    sandbox.stub(puppet.readyIndicator, 'value').returns(true)
    wechaty.on('ready', () => { throw new Error('ready listener failed') })
    await login({ contactId })
    await clock.tickAsync(15000)
    t.equal(reported.callCount, 2, 'detached fallback failure is reported')

    const failed = readyListener({ data: 'direct-failure' })
    await clock.tickAsync(15000)
    await t.rejects(failed, /ready listener failed/)
    t.equal(reported.callCount, 3, 'direct READY retains rejection and reports it')
    t.equal(reportingFailures.callCount, 3)
    await new Promise<void>(resolve => setImmediate(resolve))
    t.equal(unhandled.callCount, 0, 'throwing error observers cannot leak a rejected child promise')
  } finally {
    process.off('unhandledRejection', unhandled)
    clock.restore()
    sandbox.restore()
    await wechaty.stop()
  }
})

test('ordinary puppet emit observes rejected projection without an unhandled rejection', async t => {
  const { puppet, wechaty, contactId } = await fixture()
  const sandbox = sinon.createSandbox()
  sandbox.stub(puppet, 'contactPayload').rejects(new Error('ordinary emitter failure'))
  const errors = sinon.spy()
  const unhandled = sinon.spy()
  wechaty.on('error', errors)
  process.on('unhandledRejection', unhandled)
  try {
    puppet.emit('login', { contactId })
    await new Promise<void>(resolve => setImmediate(resolve))
    t.ok(errors.called, 'projection errors remain visible')
    t.equal(unhandled.callCount, 0)
  } finally {
    process.off('unhandledRejection', unhandled)
    sandbox.restore()
    await wechaty.stop()
  }
})

test('projection failure rejects the returned listener promise and does not poison the queue', async t => {
  const { puppet, wechaty, contactId, login, logout, readyListener } = await fixture()
  const sandbox = sinon.createSandbox()
  const failure = new Error('contact payload unavailable')
  const payload = sandbox.stub(puppet, 'contactPayload').rejects(failure)
  const delivered = sinon.spy()
  const loggedOut = sinon.spy()
  wechaty.on('login', delivered)
  wechaty.on('logout', loggedOut)
  try {
    await t.rejects(login({ contactId }), /contact payload unavailable/)
    t.equal(delivered.callCount, 0)
    const readiness = readyListener({ data: 'withdraw-on-offline-logout' })
    await logout({ contactId })
    await readiness
    t.equal(payload.callCount, 1, 'logout requires no additional payload RPC')
    t.equal(loggedOut.callCount, 1, 'offline logout still reaches business cleanup')
    t.equal(loggedOut.firstCall.args[0].id, contactId)
    t.notOk(wechaty.__loginIndicator.value())
  } finally {
    sandbox.restore()
    await wechaty.stop()
  }
})
