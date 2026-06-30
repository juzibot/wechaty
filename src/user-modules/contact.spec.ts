#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/**
 *   Wechaty Chatbot SDK - https://github.com/wechaty/wechaty
 *
 *   @copyright 2016 Huan LI (李卓桓) <https://github.com/huan>, and
 *                   Wechaty Contributors <https://github.com/wechaty>.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */
import {
  test,
  sinon,
}           from 'tstest'

import type * as PUPPET from '@juzi/wechaty-puppet'
import { PuppetMock } from '@juzi/wechaty-puppet-mock'
import { WechatyBuilder } from '../wechaty-builder.js'

import {
  ContactImpl,
  ContactProtectedProperty,
}                             from './contact.js'

test('findAll()', async t => {
  const EXPECTED_NAME = 'TestingBot'
  const EXPECTED_ADDITIONAL_INFO = {
    subjectA: 'A',
    subjectB: 'B',
  }

  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const mockContact = puppet.mocker.createContact({ name: EXPECTED_NAME, additionalInfo: JSON.stringify(EXPECTED_ADDITIONAL_INFO) })

  await wechaty.start()
  await puppet.mocker.login(mockContact)

  const contactList = await wechaty.Contact.findAll()
  t.equal(contactList.length, 1, 'should find 1 contact')
  t.equal(contactList[0]!.name(), EXPECTED_NAME, 'should get name from payload')
  t.same(contactList[0]!.payload, mockContact.payload, 'should get payload from mockContact')
  const additionalInfo = contactList[0]!.additionalInfo()
  t.same(additionalInfo, EXPECTED_ADDITIONAL_INFO, 'additional info should be matched')

  await wechaty.stop()
})

test('Should not be able to instanciate directly', async t => {
  t.throws(() => {
    const c = ContactImpl.load('xxx')
    t.fail(c.name())
  }, 'should throw when `Contact.load()`')

  t.throws(() => {
    const c = ContactImpl.load('xxx')
    t.fail(c.name())
  }, 'should throw when `Contact.load()`')
})

test('Should not be able to instanciate through cloneClass without puppet', async t => {
  t.throws(() => {
    const c = ContactImpl.load('xxx')
    t.fail(c.name())
  }, 'should throw when `MyContact.load()` without puppet')

  t.throws(() => {
    const c = ContactImpl.load('xxx')
    t.fail(c.name())
  }, 'should throw when `MyContact.load()` without puppet')

})

test('should throw when instanciate the global class', async t => {
  t.throws(() => {
    const c = ContactImpl.load('xxx')
    t.fail('should not run to here')
    t.fail(c.toString())
  }, 'should throw when we instanciate a global class')
})

test('findAllIter() yields every contact returned by contactSearch', async t => {
  const TOTAL = 7

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `c-${idx}`)
  const buildPayload = (id: string) => ({ id, name: `name-${id}` } as PUPPET.payloads.Contact)

  sandbox.stub(puppet, 'contactSearch').resolves(idList)
  sandbox.stub(puppet, 'batchContactPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, buildPayload(id) ]))
  })

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const seen: string[] = []
  for await (const chunk of wechaty.Contact.findAllIter()) {
    for (const contact of chunk) {
      seen.push(contact.id)
    }
  }

  t.equal(seen.length, TOTAL, `should yield ${TOTAL} contacts`)
  t.same(seen, idList, 'should yield contacts in search order')

  await wechaty.stop()
})

test('findAllIter() chunks 101 contacts into [100, 1] at default batch=100', async t => {
  const TOTAL = 101

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `c-${idx}`)
  sandbox.stub(puppet, 'contactSearch').resolves(idList)
  sandbox.stub(puppet, 'batchContactPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, { id, name: id } as PUPPET.payloads.Contact ]))
  })

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const sizes: number[] = []
  for await (const chunk of wechaty.Contact.findAllIter()) {
    sizes.push(chunk.length)
  }

  t.same(sizes, [ 100, 1 ], 'should split into two batches: 100 and 1')

  await wechaty.stop()
})

test('findAllIter() honors early break without throwing', async t => {
  const TOTAL = 250

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `c-${idx}`)
  sandbox.stub(puppet, 'contactSearch').resolves(idList)
  const batchSpy = sandbox.stub(puppet, 'batchContactPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, { id, name: id } as PUPPET.payloads.Contact ]))
  })

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  let received = 0
  await t.resolves((async () => {
    for await (const chunk of wechaty.Contact.findAllIter()) {
      received += chunk.length
      if (received >= 100) {
        break
      }
    }
  })(), 'breaking the loop should not throw')

  t.equal(received, 100, 'should stop after the first batch')
  t.equal(batchSpy.callCount, 1, 'should not invoke batchContactPayload again after break')

  await wechaty.stop()
})

test('findAllIter() invokes batchContactPayload ceil(N/batch) times, not N times', async t => {
  const TOTAL = 100
  const BATCH = 25

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `c-${idx}`)
  sandbox.stub(puppet, 'contactSearch').resolves(idList)

  const batchSpy = sandbox.stub(puppet, 'batchContactPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, { id, name: id } as PUPPET.payloads.Contact ]))
  })
  const rawSpy = sandbox.spy(puppet, 'contactRawPayload')

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const rawCountBefore = rawSpy.callCount

  let received = 0
  for await (const chunk of wechaty.Contact.findAllIter(undefined, { batch: BATCH })) {
    received += chunk.length
  }

  t.equal(received, TOTAL, 'should iterate all contacts')
  t.equal(batchSpy.callCount, Math.ceil(TOTAL / BATCH), `should invoke batchContactPayload ${Math.ceil(TOTAL / BATCH)} times`)
  t.equal(rawSpy.callCount, rawCountBefore, 'should never fall back to per-id contactRawPayload during iteration')

  await wechaty.stop()
})

test('findAllIter() with empty contactSearch yields nothing and does not throw', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  sandbox.stub(puppet, 'contactSearch').resolves([])
  const batchSpy = sandbox.stub(puppet, 'batchContactPayload').resolves(new Map())

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  let chunkCount = 0
  await t.resolves((async () => {
    for await (const _chunk of wechaty.Contact.findAllIter()) {
      chunkCount++
    }
  })(), 'empty iteration should not throw')

  t.equal(chunkCount, 0, 'should yield zero chunks')
  t.equal(batchSpy.callCount, 0, 'should not call batchContactPayload when no ids')

  await wechaty.stop()
})

test('findAllIter() throws when batch <= 0', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  sandbox.stub(puppet, 'contactSearch').resolves([])
  sandbox.stub(puppet, 'batchContactPayload').resolves(new Map())

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  for (const badBatch of [ 0, -1 ]) {
    await t.rejects(
      (async () => {
        for await (const _chunk of wechaty.Contact.findAllIter(undefined, { batch: badBatch })) {
          // should never reach here
        }
      })(),
      /batch must be positive/,
      `should throw when batch=${badBatch}`,
    )
  }

  await wechaty.stop()
})

test('findAllIter() skips ids missing from payloadMap', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  sandbox.stub(puppet, 'contactSearch').resolves([ 'c1', 'c2', 'c3' ])
  sandbox.stub(puppet, 'batchContactPayload').resolves(
    new Map([ [ 'c1', { id: 'c1', name: 'name-c1' } as PUPPET.payloads.Contact ] ]),
  )

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const seen: string[] = []
  await t.resolves((async () => {
    for await (const chunk of wechaty.Contact.findAllIter()) {
      for (const contact of chunk) {
        seen.push(contact.id)
      }
    }
  })(), 'missing ids should not throw or stall iteration')

  t.same(seen, [ 'c1' ], 'should yield only contacts whose payload was returned')

  await wechaty.stop()
})

test('ProtectedProperties', async t => {
  type NotExistInWechaty = Exclude<ContactProtectedProperty, keyof ContactImpl>
  type NotExistTest = NotExistInWechaty extends never ? true : false

  const noOneLeft: NotExistTest = true
  t.ok(noOneLeft, 'should match Wechaty properties for every protected property')
})
