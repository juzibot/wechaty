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
}             from 'tstest'

import type * as PUPPET from '@juzi/wechaty-puppet'
import { PuppetMock }   from '@juzi/wechaty-puppet-mock'

import { WechatyBuilder } from '../wechaty-builder.js'
import type {
  RoomImpl,
  RoomProtectedProperty,
}                         from './room.js'

test('findAll()', async t => {
  const EXPECTED_ROOM_ID      = 'test-id'
  const EXPECTED_ROOM_TOPIC   = 'test-topic'
  const EXPECTED_ROOM_ID_LIST = [ EXPECTED_ROOM_ID ]

  const sandbox = sinon.createSandbox()

  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  await wechaty.start()

  sandbox.stub(puppet, 'roomSearch').resolves(EXPECTED_ROOM_ID_LIST)
  sandbox.stub(puppet, 'roomMemberList').resolves([])
  sandbox.stub(puppet, 'roomPayload').callsFake(async () => {
    await new Promise(resolve => setImmediate(resolve))
    return {
      topic: EXPECTED_ROOM_TOPIC,
    } as PUPPET.payloads.Room
  })
  const mockContact = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(mockContact)

  const future = new Promise(resolve => {
    wechaty.on('login', resolve)
  })
  await future

  const roomList = await wechaty.Room.findAll()
  t.equal(roomList.length, 1, 'should find 1 room')
  t.equal(await roomList[0]!.topic(), EXPECTED_ROOM_TOPIC, 'should get topic from payload')

  await wechaty.stop()
})

test('room.findAll() not login test', async t => {
  const EXPECTED_ROOM_ID      = 'test-id'
  const EXPECTED_ROOM_TOPIC   = 'test-topic'
  const EXPECTED_ROOM_ID_LIST = [ EXPECTED_ROOM_ID ]

  const sandbox = sinon.createSandbox()

  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  await wechaty.start()

  sandbox.stub(puppet, 'roomSearch').resolves(EXPECTED_ROOM_ID_LIST)
  sandbox.stub(puppet, 'roomMemberList').resolves([])
  sandbox.stub(puppet, 'roomPayload').callsFake(async () => {
    await new Promise(resolve => setImmediate(resolve))
    return {
      topic: EXPECTED_ROOM_TOPIC,
    } as PUPPET.payloads.Room
  })

  await t.rejects(wechaty.Room.findAll())

  await wechaty.stop()
})

test('room.say() smoke testing', async () => {

  const sandbox = sinon.createSandbox()
  const callback = sinon.spy()

  const puppet = new PuppetMock()
  const wechaty = WechatyBuilder.build({ puppet })

  const bot = puppet.mocker.createContact()
  puppet.mocker.login(bot)

  await wechaty.start()

  const EXPECTED_ROOM_ID         = 'roomId'
  const EXPECTED_ROOM_TOPIC      = 'test-topic'
  const EXPECTED_ROOM_ADDITIONAL_INFO = {
    subjectA: 'A',
    subjectB: 'B',
  }
  const EXPECTED_CONTACT_1_ID    = 'contact1'
  const EXPECTED_CONTACT_1_ALIAS = 'little1'
  const EXPECTED_CONTACT_2_ID    = 'contact2'
  const EXPECTED_CONTACT_2_ALIAS = 'big2'
  const CONTACT_MAP: { [contactId: string]: string } = {}
  CONTACT_MAP[EXPECTED_CONTACT_1_ID] = EXPECTED_CONTACT_1_ALIAS
  CONTACT_MAP[EXPECTED_CONTACT_2_ID] = EXPECTED_CONTACT_2_ALIAS

  sandbox.stub(puppet, 'roomMemberPayload').callsFake(async (_, contactId) => {
    await new Promise(resolve => setImmediate(resolve))
    return {
      id: contactId,
      roomAlias: CONTACT_MAP[contactId],
    } as PUPPET.payloads.RoomMember
  })
  sandbox.stub(puppet, 'roomPayload').callsFake(async () => {
    await new Promise(resolve => setImmediate(resolve))
    return {
      topic: EXPECTED_ROOM_TOPIC,
      additionalInfo: JSON.stringify(EXPECTED_ROOM_ADDITIONAL_INFO),
    } as PUPPET.payloads.Room
  })
  sandbox.stub(puppet, 'contactPayload').callsFake(async (contactId) => {
    await new Promise(resolve => setImmediate(resolve))
    return {
      id: contactId,
    } as PUPPET.payloads.Contact
  })
  // sandbox.spy(puppet, 'messageSendText')
  sandbox.stub(puppet, 'messageSendText').callsFake(callback)
  sandbox.stub(puppet, 'roomMemberList').resolves([])

  const fakeIdSearcher = async (...args: any[]) => {
    await new Promise(setImmediate)
    return [ args[0].id ]
  }
  sandbox.stub(puppet, 'contactSearch').callsFake(fakeIdSearcher)
  sandbox.stub(puppet, 'roomSearch').callsFake(fakeIdSearcher)

  const room = await wechaty.Room.find({ id: EXPECTED_ROOM_ID })
  const contact1 = await wechaty.Contact.find({ id: EXPECTED_CONTACT_1_ID })
  const contact2 = await wechaty.Contact.find({ id: EXPECTED_CONTACT_2_ID })

  if (!room || !contact1 || !contact2) {
    throw new Error('find by id: not found')
  }
  // await contact1.sync()
  // await contact2.sync()
  // await room.sync()

  test('room additional info', async t => {
    callback.resetHistory()
    const additionalInfo = room.additionalInfo()

    t.same(additionalInfo, EXPECTED_ROOM_ADDITIONAL_INFO, 'additional info should be matched')
  })

  test('say with Tagged Template', async t => {
    callback.resetHistory()
    await room.say`To be ${contact1} or not to be ${contact2}`

    t.same(callback.getCall(0).args, [
      // { contactId: EXPECTED_CONTACT_1_ID, roomId: EXPECTED_ROOM_ID },
      EXPECTED_ROOM_ID,
      'To be @little1 or not to be @big2',
      [ EXPECTED_CONTACT_1_ID, EXPECTED_CONTACT_2_ID ],
    ], 'Tagged Template say should be matched')
  })

  test('say with regular mention contact', async t => {
    callback.resetHistory()
    await room.say('Yo', contact1)

    t.same(callback.getCall(0).args, [
      // { contactId: EXPECTED_CONTACT_1_ID, roomId: EXPECTED_ROOM_ID },
      EXPECTED_ROOM_ID,
      '@little1 Yo',
      [ EXPECTED_CONTACT_1_ID ],
    ], 'Single mention should work with old ways')
  })

  test('say with multiple mention contact', async t => {
    callback.resetHistory()
    await room.say('hey buddies, let\'s party', contact1, contact2)

    t.same(callback.getCall(0).args, [
      // { contactId: EXPECTED_CONTACT_1_ID, roomId: EXPECTED_ROOM_ID },
      EXPECTED_ROOM_ID,
      '@little1 @big2 hey buddies, let\'s party',
      [ EXPECTED_CONTACT_1_ID, EXPECTED_CONTACT_2_ID ],
    ], 'Multiple mention should work with new way')
  })

  test('say with @all', async t => {
    callback.resetHistory()
    await room.say('hey buddies, let\'s party', '@all', contact1)

    t.same(callback.getCall(0).args, [
      // { contactId: EXPECTED_CONTACT_1_ID, roomId: EXPECTED_ROOM_ID },
      EXPECTED_ROOM_ID,
      '@all @little1 hey buddies, let\'s party',
      [ '@all', EXPECTED_CONTACT_1_ID ],
    ], 'should be alble to call with say')
  })

  test('say template string array with @all', async t => {
    callback.resetHistory()
    await room.say`hey ${'@all'} let's party, especially ${contact1}`

    t.same(callback.getCall(0).args, [
      // { contactId: EXPECTED_CONTACT_1_ID, roomId: EXPECTED_ROOM_ID },
      EXPECTED_ROOM_ID,
      'hey @all let\'s party, especially @little1',
      [ '@all', EXPECTED_CONTACT_1_ID ],
    ], 'should be alble to call with template string array')
  })

  await wechaty.stop()
})

test('Room.findAllIter() yields every room returned by roomSearch', async t => {
  const TOTAL = 6

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `r-${idx}`)
  const buildPayload = (id: string) => ({ id, topic: `topic-${id}`, memberIdList: [], adminIdList: [] } as PUPPET.payloads.Room)

  sandbox.stub(puppet, 'roomSearch').resolves(idList)
  sandbox.stub(puppet, 'batchRoomPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, buildPayload(id) ]))
  })

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const seen: string[] = []
  for await (const chunk of wechaty.Room.findAllIter()) {
    for (const room of chunk) {
      seen.push(room.id)
    }
  }

  t.equal(seen.length, TOTAL, `should yield ${TOTAL} rooms`)
  t.same(seen, idList, 'should yield rooms in search order')

  await wechaty.stop()
})

test('Room.findAllIter() chunks 101 rooms into [100, 1] at default batch=100', async t => {
  const TOTAL = 101

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `r-${idx}`)
  sandbox.stub(puppet, 'roomSearch').resolves(idList)
  sandbox.stub(puppet, 'batchRoomPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, { id, topic: id, memberIdList: [], adminIdList: [] } as PUPPET.payloads.Room ]))
  })

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const sizes: number[] = []
  for await (const chunk of wechaty.Room.findAllIter()) {
    sizes.push(chunk.length)
  }

  t.same(sizes, [ 100, 1 ], 'should split into two batches: 100 and 1')

  await wechaty.stop()
})

test('Room.findAllIter() honors early break without throwing', async t => {
  const TOTAL = 250

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `r-${idx}`)
  sandbox.stub(puppet, 'roomSearch').resolves(idList)
  const batchSpy = sandbox.stub(puppet, 'batchRoomPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, { id, topic: id, memberIdList: [], adminIdList: [] } as PUPPET.payloads.Room ]))
  })

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  let received = 0
  await t.resolves((async () => {
    for await (const chunk of wechaty.Room.findAllIter()) {
      received += chunk.length
      if (received >= 100) {
        break
      }
    }
  })(), 'breaking the loop should not throw')

  t.equal(received, 100, 'should stop after the first batch')
  t.equal(batchSpy.callCount, 1, 'should not invoke batchRoomPayload again after break')

  await wechaty.stop()
})

test('Room.findAllIter() invokes batchRoomPayload ceil(N/batch) times, not N times', async t => {
  const TOTAL = 100
  const BATCH = 25

  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  const idList = Array.from({ length: TOTAL }, (_, idx) => `r-${idx}`)
  sandbox.stub(puppet, 'roomSearch').resolves(idList)

  const batchSpy = sandbox.stub(puppet, 'batchRoomPayload').callsFake(async (...args: any[]) => {
    const ids = args[0] as string[]
    return new Map(ids.map(id => [ id, { id, topic: id, memberIdList: [], adminIdList: [] } as PUPPET.payloads.Room ]))
  })
  const rawSpy = sandbox.spy(puppet, 'roomRawPayload')

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const rawCountBefore = rawSpy.callCount

  let received = 0
  for await (const chunk of wechaty.Room.findAllIter(undefined, { batch: BATCH })) {
    received += chunk.length
  }

  t.equal(received, TOTAL, 'should iterate all rooms')
  t.equal(batchSpy.callCount, Math.ceil(TOTAL / BATCH), `should invoke batchRoomPayload ${Math.ceil(TOTAL / BATCH)} times`)
  t.equal(rawSpy.callCount, rawCountBefore, 'should never fall back to per-id roomRawPayload during iteration')

  await wechaty.stop()
})

test('Room.findAllIter() with empty roomSearch yields nothing and does not throw', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  sandbox.stub(puppet, 'roomSearch').resolves([])
  const batchSpy = sandbox.stub(puppet, 'batchRoomPayload').resolves(new Map())

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  let chunkCount = 0
  await t.resolves((async () => {
    for await (const _chunk of wechaty.Room.findAllIter()) {
      chunkCount++
    }
  })(), 'empty iteration should not throw')

  t.equal(chunkCount, 0, 'should yield zero chunks')
  t.equal(batchSpy.callCount, 0, 'should not call batchRoomPayload when no ids')

  await wechaty.stop()
})

test('Room.findAllIter() throws when batch <= 0', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  sandbox.stub(puppet, 'roomSearch').resolves([])
  sandbox.stub(puppet, 'batchRoomPayload').resolves(new Map())

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  for (const badBatch of [ 0, -1 ]) {
    await t.rejects(
      (async () => {
        for await (const _chunk of wechaty.Room.findAllIter(undefined, { batch: badBatch })) {
          // should never reach here
        }
      })(),
      /batch must be positive/,
      `should throw when batch=${badBatch}`,
    )
  }

  await wechaty.stop()
})

test('Room.findAllIter() skips ids missing from payloadMap', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  sandbox.stub(puppet, 'roomSearch').resolves([ 'r1', 'r2', 'r3' ])
  sandbox.stub(puppet, 'batchRoomPayload').resolves(
    new Map([ [ 'r1', { id: 'r1', topic: 'topic-r1', memberIdList: [], adminIdList: [] } as PUPPET.payloads.Room ] ]),
  )

  await wechaty.start()
  const bot = puppet.mocker.createContact({ name: 'bot' })
  await puppet.mocker.login(bot)

  const seen: string[] = []
  await t.resolves((async () => {
    for await (const chunk of wechaty.Room.findAllIter()) {
      for (const room of chunk) {
        seen.push(room.id)
      }
    }
  })(), 'missing ids should not throw or stall iteration')

  t.same(seen, [ 'r1' ], 'should yield only rooms whose payload was returned')

  await wechaty.stop()
})

test('ProtectedProperties', async t => {
  type NotExistInWechaty = Exclude<RoomProtectedProperty, keyof RoomImpl>
  type NotExistTest = NotExistInWechaty extends never ? true : false

  const noOneLeft: NotExistTest = true
  t.ok(noOneLeft, 'should match Wechaty properties for every protected property')
})
