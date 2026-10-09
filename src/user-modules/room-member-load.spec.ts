#!/usr/bin/env -S node --no-warnings --loader ts-node/esm

import { test, sinon } from 'tstest'
import * as PUPPET from '@juzi/wechaty-puppet'
import { PuppetMock } from '@juzi/wechaty-puppet-mock'

import { WechatyBuilder } from '../wechaty-builder.js'

import type { RoomImpl } from './room.js'

// The published mock uses its own older Puppet runtime, without the new APIs.
function createMemberLoadPuppetMock (): PUPPET.impls.PuppetInterface {
  return Object.assign(new PuppetMock(), {
    roomMemberSync: async (): Promise<PUPPET.payloads.RoomMemberLoadState> => {
      throw new Error('roomMemberSync must be stubbed')
    },
    roomMemberLoadState: async (): Promise<PUPPET.payloads.RoomMemberLoadState> => {
      throw new Error('roomMemberLoadState must be stubbed')
    },
    roomMemberSnapshot: async (): Promise<PUPPET.payloads.RoomMemberSnapshot> => {
      throw new Error('roomMemberSnapshot must be stubbed')
    },
  }) as unknown as PUPPET.impls.PuppetInterface
}

test('member APIs delegate unchanged arguments/results without reading or dirtying', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = createMemberLoadPuppetMock()
  const wechaty = WechatyBuilder.build({ puppet })
  t.teardown(async (): Promise<void> => {
    sandbox.restore()
    await wechaty.stop()
  })
  await wechaty.start()
  const room = (wechaty.Room as typeof RoomImpl).load('delegated-room')
  const state: PUPPET.payloads.RoomMemberLoadState = {
    roomId: room.id,
    taskId: 'task',
    status: PUPPET.types.RoomMemberLoadStatus.Loading,
    revision: '9007199254740993',
  }
  const snapshot: PUPPET.payloads.RoomMemberSnapshot = {
    roomId: room.id, revision: state.revision, members: [], nextPageToken: 'next',
  }
  const sync = sandbox.stub(puppet, 'roomMemberSync').resolves(state)
  const loadState = sandbox.stub(puppet, 'roomMemberLoadState').resolves(state)
  const memberSnapshot = sandbox.stub(puppet, 'roomMemberSnapshot').resolves(snapshot)
  const roomPayload = sandbox.stub(puppet, 'roomPayload').rejects(new Error('unexpected read'))
  const memberList = sandbox.stub(puppet, 'roomMemberList').rejects(new Error('unexpected read'))
  const contactFind = sandbox.stub(wechaty.Contact, 'find').rejects(new Error('unexpected read'))
  const roomDirty = sandbox.stub(puppet, 'roomPayloadDirty').rejects(new Error('unexpected dirty'))
  const memberDirty = sandbox.stub(puppet, 'roomMemberPayloadDirty').rejects(new Error('unexpected dirty'))
  t.equal(await room.syncMembers(), state, 'sync returns acceptance state directly')
  const syncOptions: PUPPET.types.RoomMemberSyncOptions = { force: false }
  t.equal(await room.syncMembers(syncOptions), state, 'sync result is not transformed')
  t.same(sync.args, [ [ room.id, undefined ], [ room.id, syncOptions ] ], 'no default force')
  t.equal(sync.secondCall.args[1], syncOptions, 'sync options identity is retained')
  t.equal(await room.memberLoadState(), state, 'state is returned unchanged')
  t.same(loadState.args, [ [ room.id ] ], 'state only receives room id')
  t.equal(await room.memberSnapshot(state.revision), snapshot, 'snapshot is returned unchanged')
  const snapshotOptions: PUPPET.types.RoomMemberSnapshotOptions = { pageToken: 'page', pageSize: 20 }
  await room.memberSnapshot(state.revision, snapshotOptions)
  t.same(memberSnapshot.args, [ [ room.id, state.revision, undefined ],
    [ room.id, state.revision, snapshotOptions ] ], 'revision stays a string; no implicit pagination')
  t.equal(memberSnapshot.secondCall.args[2], snapshotOptions, 'snapshot options identity is retained')

  const failure = new Error('puppet failure')
  sync.rejects(failure)
  loadState.rejects(failure)
  memberSnapshot.rejects(failure)
  await t.rejects(room.syncMembers(), failure, 'sync failure propagates')
  await t.rejects(room.memberLoadState(), failure, 'state failure propagates')
  await t.rejects(room.memberSnapshot(state.revision), failure, 'snapshot failure propagates')
  for (const unexpected of [ roomPayload, memberList, contactFind, roomDirty, memberDirty ]) {
    t.equal(unexpected.callCount, 0, 'member APIs never perform additional reads/dirty')
  }
  t.notOk(room.payload, 'member APIs do not ready the room')
})

test('room-member-load forwards the raw payload without reads or synthetic joins', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = createMemberLoadPuppetMock()
  const wechaty = WechatyBuilder.build({ puppet })
  t.teardown(async (): Promise<void> => {
    sandbox.restore()
    await wechaty.stop()
  })
  await wechaty.start()
  const roomFind = sandbox.stub(wechaty.Room, 'find').resolves(undefined)
  const contactFind = sandbox.stub(wechaty.Contact, 'find').resolves(undefined)
  const snapshot = sandbox.stub(puppet, 'roomMemberSnapshot').rejects(new Error('unexpected snapshot'))
  const roomPayload = sandbox.stub(puppet, 'roomPayload').rejects(new Error('unexpected read'))
  const memberList = sandbox.stub(puppet, 'roomMemberList').rejects(new Error('unexpected read'))
  const roomDirty = sandbox.stub(puppet, 'roomPayloadDirty').rejects(new Error('unexpected dirty'))
  const memberDirty = sandbox.stub(puppet, 'roomMemberPayloadDirty').rejects(new Error('unexpected dirty'))
  const join = sinon.spy()
  const received = sinon.spy()
  wechaty.on('room-join', join)
  wechaty.on('room-member-load', received)
  for (const status of [ PUPPET.types.RoomMemberLoadStatus.Loaded, PUPPET.types.RoomMemberLoadStatus.Failed ]) {
    const payload: PUPPET.payloads.EventRoomMemberLoad = {
      roomId: 'event-room',
      taskId: 'task',
      status,
      revision: '9007199254740993',
      ...(status === PUPPET.types.RoomMemberLoadStatus.Failed ? { error: 'load failed' } : { loadedAt: 123 }),
    }
    puppet.emit('room-member-load', payload)
    t.equal(received.args.at(-1)?.[0], payload, 'same payload object is forwarded synchronously')
  }
  t.equal(received.callCount, 2, 'loaded and failed events are both forwarded')
  t.equal(join.callCount, 0, 'completion is not a room-join')
  for (const unexpected of [ roomFind, contactFind, snapshot, roomPayload, memberList, roomDirty, memberDirty ]) {
    t.equal(unexpected.callCount, 0, 'event never performs reads or dirty')
  }
})

for (const status of [ PUPPET.types.RoomMemberLoadStatus.Pending, PUPPET.types.RoomMemberLoadStatus.Loaded ]) {
  test(`lazy find/ready/dirty never fetch members, status=${status}`, async t => {
    const sandbox = sinon.createSandbox()
    const puppet = new PuppetMock() as unknown as PUPPET.impls.PuppetInterface
    const wechaty = WechatyBuilder.build({ puppet })
    t.teardown(async (): Promise<void> => {
      sandbox.restore()
      await wechaty.stop()
    })
    await wechaty.start()

    const payload = {
      id: 'lazy-room',
      topic: 'lazy',
      memberIdList: [],
      adminIdList: [],
      memberLoadMode: PUPPET.types.RoomMemberLoadMode.Lazy,
      memberLoadStatus: status,
    } as PUPPET.payloads.Room
    const roomPayload = sandbox.stub(puppet, 'roomPayload').resolves(payload)
    const memberList = sandbox.stub(puppet, 'roomMemberList').resolves([ 'member' ])
    const contactFind = sandbox.stub(wechaty.Contact, 'find').resolves(undefined)
    const roomDirty = sandbox.stub(puppet, 'roomPayloadDirty').resolves()
    const memberDirty = sandbox.stub(puppet, 'roomMemberPayloadDirty').resolves()
    const room = await wechaty.Room.find({ id: payload.id }) as RoomImpl | undefined
    if (!room) { throw new Error('lazy room not found') }
    t.equal(room.payload, payload, 'find retains basic payload')
    await room.ready()
    t.equal(roomPayload.callCount, 1, 'cached ready does not reread')
    await room.ready(true)
    t.equal(roomPayload.callCount, 2, 'forced ready refreshes basic payload')

    sandbox.stub(wechaty, 'isLoggedIn').get((): boolean => true)
    sandbox.stub(puppet, 'roomSearch').resolves([ payload.id ])
    sandbox.stub(puppet, 'roomValidate').resolves(true)
    t.equal(await wechaty.Room.find({ topic: 'lazy' }), room, 'query find uses lazy ready')
    const dirtyHandled = new Promise<void>(resolve => {
      wechaty.once('dirty', (): void => { resolve() })
    })
    puppet.emit('dirty', { payloadType: PUPPET.types.Payload.Room, payloadId: payload.id })
    await dirtyHandled
    t.equal(roomPayload.callCount, 3, 'dirty refreshes basic payload')
    room.payload = undefined
    const coldDirtyHandled = new Promise<void>(resolve => {
      wechaty.once('dirty', (): void => { resolve() })
    })
    puppet.emit('dirty', { payloadType: PUPPET.types.Payload.Room, payloadId: payload.id })
    await coldDirtyHandled
    t.equal(roomPayload.callCount, 5, 'cold dirty runs both find.ready and ready(true)')
    t.equal(memberList.callCount, 0, 'find/ready/dirty do not fetch members')
    t.equal(contactFind.callCount, 0, 'find/ready/dirty do not find contacts')
    t.equal(roomDirty.callCount, 0, 'dirty handler does not dirty puppet again')
    t.equal(memberDirty.callCount, 0, 'dirty handler does not dirty members')

    await room.sync()
    t.equal(roomDirty.callCount, 1, 'sync retains room invalidation')
    t.equal(memberDirty.callCount, 1, 'sync retains member invalidation')
    t.equal(memberList.callCount, 0, 'lazy sync does not preload members')
    t.equal(contactFind.callCount, 0, 'lazy sync does not preload contacts')
  })
}

for (const mode of [ undefined, PUPPET.types.RoomMemberLoadMode.Normal, PUPPET.types.RoomMemberLoadMode.Unspecified ]) {
  test(`normal/legacy ready still loads members, mode=${mode}`, async t => {
    const sandbox = sinon.createSandbox()
    const puppet = new PuppetMock() as unknown as PUPPET.impls.PuppetInterface
    const wechaty = WechatyBuilder.build({ puppet })
    t.teardown(async (): Promise<void> => {
      sandbox.restore()
      await wechaty.stop()
    })
    await wechaty.start()
    sandbox.stub(puppet, 'roomPayload').resolves({
      id: 'normal-room',
      topic: 'normal',
      memberIdList: [],
      adminIdList: [],
      ...(mode === undefined ? {} : { memberLoadMode: mode }),
    } as PUPPET.payloads.Room)
    const memberList = sandbox.stub(puppet, 'roomMemberList').resolves([ 'member-a', 'member-b' ])
    const contactFind = sandbox.stub(wechaty.Contact, 'find').resolves(undefined)
    const room = await wechaty.Room.find({ id: 'normal-room' }) as RoomImpl | undefined
    if (!room) { throw new Error('normal room not found') }
    await room.ready(true)
    t.equal(memberList.callCount, 2, 'find and forced ready read members')
    t.equal(contactFind.callCount, 4, 'both contacts are read on every refresh')
    t.same(contactFind.firstCall.args, [ { id: 'member-a' } ], 'first member is read')
    t.same(contactFind.secondCall.args, [ { id: 'member-b' } ], 'second member is read')
  })
}

test('ready propagates basic room payload failure without member reads', async t => {
  const sandbox = sinon.createSandbox()
  const puppet = new PuppetMock() as unknown as PUPPET.impls.PuppetInterface
  const wechaty = WechatyBuilder.build({ puppet })
  t.teardown(async (): Promise<void> => {
    sandbox.restore()
    await wechaty.stop()
  })
  await wechaty.start()
  const failure = new Error('room payload unavailable')
  sandbox.stub(puppet, 'roomPayload').rejects(failure)
  const memberList = sandbox.stub(puppet, 'roomMemberList').resolves([])
  const contactFind = sandbox.stub(wechaty.Contact, 'find').resolves(undefined)
  const room = (wechaty.Room as typeof RoomImpl).load('failed-room')
  await t.rejects(room.ready(true), failure, 'payload failure propagates')
  t.equal(memberList.callCount, 0, 'failure does not fetch members')
  t.equal(contactFind.callCount, 0, 'failure does not find contacts')
})
