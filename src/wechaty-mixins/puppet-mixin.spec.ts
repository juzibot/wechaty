#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
import { test } from 'tstest'

import type {
  PuppetMixin,
  ProtectedPropertyPuppetMixin,
}                                             from './puppet-mixin.js'
import PuppetMock from '@juzi/wechaty-puppet-mock'
import { WechatyBuilder } from '../wechaty-builder.js'

test('ProtectedPropertyPuppetMixin', async t => {
  type NotExistInMixin = Exclude<ProtectedPropertyPuppetMixin, keyof InstanceType<PuppetMixin>>
  type NotExistTest = NotExistInMixin extends never ? true : false

  const noOneLeft: NotExistTest = true
  t.ok(noOneLeft, 'should match Mixin properties for every protected property')
})

test('ReadyDelay', async t => {

  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const mockContact = puppet.mocker.createContact({ name: 'any' })

  await wechaty.start()

  let loginCalled = false
  wechaty.on('login', () => {
    loginCalled = true
  })

  const future = new Promise<void>(resolve => {
    wechaty.on('ready', () => {
      if (loginCalled) {
        t.pass('ready emitted after login')
      } else {
        t.fail('ready emitted before login')
      }
      resolve()
    })
  })

  puppet.emit('ready')
  await puppet.mocker.login(mockContact)

  await future
  await wechaty.stop()
})
