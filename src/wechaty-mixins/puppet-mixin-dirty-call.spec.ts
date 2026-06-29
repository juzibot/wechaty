#!/usr/bin/env -S node --no-warnings --loader ts-node/esm

import { test }        from 'tstest'
import * as PUPPET     from '@juzi/wechaty-puppet'
import { PuppetMock }  from '@juzi/wechaty-puppet-mock'

import { WechatyBuilder } from '../wechaty-builder.js'

/**
 * Regression: the dirty event listener for `Payload.Call` in `puppet-mixin`
 * used to do `await this.puppet.callPayloadDirty(payloadId)` inside the
 * handler itself.
 *
 * Under wechaty-puppet-service, `callPayloadDirty` fires a gRPC
 * `DirtyPayload` to the server, which then re-emits `dirty` back to the
 * client through the event stream. That re-emit triggers the handler
 * again, forming an infinite client⇄server feedback loop.
 *
 * All other dirty branches (Contact / Room / Message / Wxxd*) only call
 * `find(...).ready(true)`; the Call branch was the outlier.
 *
 * The fix removes the in-handler `callPayloadDirty` call so the branch
 * matches the rest of the template. This test pins that contract:
 * emitting a Call-typed dirty event must NOT cause the handler to call
 * `puppet.callPayloadDirty` again.
 */
test('dirty(Call) handler must NOT call callPayloadDirty (would form a gRPC loop)', async t => {
  const puppet = new PuppetMock() as any
  const wechaty = WechatyBuilder.build({ puppet })

  await wechaty.start()

  let dirtyCallCount = 0
  const originalCallPayloadDirty = puppet.callPayloadDirty.bind(puppet)
  puppet.callPayloadDirty = async (id: string) => {
    dirtyCallCount++
    return originalCallPayloadDirty(id)
  }

  puppet.emit('dirty', {
    payloadType: PUPPET.types.Payload.Call,
    payloadId:   'call-id-x',
  })

  // Allow the async handler to run.
  await new Promise(resolve => setTimeout(resolve, 50))

  t.equal(
    dirtyCallCount,
    0,
    `dirty(Call) handler must not re-invoke callPayloadDirty; got ${dirtyCallCount} call(s)`,
  )

  await wechaty.stop()
})
