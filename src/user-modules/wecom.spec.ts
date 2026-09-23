#!/usr/bin/env -S node --no-warnings --loader ts-node/esm

import {
  sinon,
  test,
}                       from 'tstest'
import { PuppetMock }   from '@juzi/wechaty-puppet-mock'

import { WechatyBuilder } from '../wechaty-builder.js'

test('Wecom.orgBroadcastPayload() returns the puppet payload', async t => {
  const puppet  = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const payload = { id: 'org-broadcast-1', targets: [] }
  const stub    = sinon.stub().resolves(payload)
  puppet.orgBroadcastPayload = stub

  await wechaty.start()

  const result = await wechaty.Wecom.orgBroadcastPayload('org-broadcast-1')

  t.same(stub.args[0], [ 'org-broadcast-1' ], 'passes the id to the puppet')
  t.equal(result, payload, 'returns the puppet payload')

  await wechaty.stop()
})

test('Wecom.orgBroadcastExecute() forwards the optional target ids', async t => {
  const puppet  = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const stub = sinon.stub().resolves()
  puppet.orgBroadcastExecute = stub

  await wechaty.start()

  await wechaty.Wecom.orgBroadcastExecute('org-broadcast-1')
  await wechaty.Wecom.orgBroadcastExecute('org-broadcast-1', [ 'contact-1' ])

  t.same(stub.args[0], [ 'org-broadcast-1', undefined ], 'omits target ids for all targets')
  t.same(stub.args[1], [ 'org-broadcast-1', [ 'contact-1' ] ], 'forwards the selected target ids')

  await wechaty.stop()
})

test('Wecom.orgBroadcastExecute() rejects an explicit empty target list', async t => {
  const puppet  = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const stub = sinon.stub().resolves()
  puppet.orgBroadcastExecute = stub

  await wechaty.start()

  await t.rejects(
    wechaty.Wecom.orgBroadcastExecute('org-broadcast-1', []),
    /targetIds is empty/,
    'does not turn an empty selection into sending to all targets',
  )
  t.equal(stub.callCount, 0, 'never reaches the puppet')

  await wechaty.stop()
})

test('org-broadcast events are emitted with the plan id', async t => {
  const puppet  = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const createdSpy = sinon.spy()
  const sentSpy    = sinon.spy()
  wechaty.on('org-broadcast-created', createdSpy)
  wechaty.on('org-broadcast-sent', sentSpy)

  await wechaty.start()

  puppet.emit('org-broadcast-created', { orgBroadcastId: 'org-broadcast-1', messageId: 'message-1' })
  puppet.emit('org-broadcast-sent', { orgBroadcastId: 'org-broadcast-1' })

  t.same(createdSpy.args[0], [ 'org-broadcast-1', 'message-1' ], 'emits org-broadcast-created with id and card message id')
  t.same(sentSpy.args[0], [ 'org-broadcast-1' ], 'emits org-broadcast-sent with id')

  await wechaty.stop()
})
