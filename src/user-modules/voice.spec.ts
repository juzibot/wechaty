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

import { FileBox }        from 'file-box'
import type * as PUPPET   from '@juzi/wechaty-puppet'
import { PuppetMock }     from '@juzi/wechaty-puppet-mock'
import { WechatyBuilder } from '../wechaty-builder.js'

const MESSAGE_ID = 'message-id-voice'

/**
 * The fallback must trigger ONLY when the puppet does not implement the new
 * RPC, never on transient failures: otherwise `text()` silently drops the
 * `noSpeech` discriminator and makes the bot re-run its own paid ASR.
 *
 * The puppet is built & started once and reused across cases (`wechaty.Voice`
 * is unavailable before `start()`). `messageVoice` / `messageVoiceText` are
 * assigned directly (rather than via `sinon.stub(puppet, ...)`) because the
 * installed wechaty-puppet-mock predates those methods, so stubbing a
 * non-existent property would throw.
 */
const puppet  = new PuppetMock() as any
const wechaty = WechatyBuilder.build({ puppet })

let started = false
async function ensureStarted () {
  if (!started) {
    await wechaty.start()
    started = true
  }
}

const voice = () => wechaty.Voice.create(MESSAGE_ID)

const UNSUPPORTED = new Error('Wechaty Puppet Unsupported API Error.')

test('Voice.file() returns the dedicated messageVoice result when supported', async t => {
  await ensureStarted()
  puppet.messageVoice = sinon.stub().resolves(FileBox.fromBuffer(Buffer.from('voice'), 'voice.silk'))
  puppet.messageFile  = sinon.stub().resolves(FileBox.fromBuffer(Buffer.from('file'), 'file.bin'))

  const fileBox = await voice().file()
  t.equal(fileBox.name, 'voice.silk', 'should return the messageVoice FileBox')
  t.ok(puppet.messageVoice.calledOnceWith(MESSAGE_ID), 'should call messageVoice')
  t.notOk(puppet.messageFile.called, 'should NOT fall back to messageFile when supported')
})

test('Voice.file() falls back to messageFile on unsupported error', async t => {
  await ensureStarted()
  puppet.messageVoice = sinon.stub().rejects(UNSUPPORTED)
  puppet.messageFile  = sinon.stub().resolves(FileBox.fromBuffer(Buffer.from('file'), 'file.bin'))

  const fileBox = await voice().file()
  t.equal(fileBox.name, 'file.bin', 'should fall back to messageFile')
  t.ok(puppet.messageFile.calledOnceWith(MESSAGE_ID), 'should call messageFile on fallback')
})

test('Voice.file() rethrows a transient error instead of falling back', async t => {
  await ensureStarted()
  puppet.messageVoice = sinon.stub().rejects(new Error('socket hang up'))
  puppet.messageFile  = sinon.stub().resolves(FileBox.fromBuffer(Buffer.from('file'), 'file.bin'))

  await t.rejects(() => voice().file(), /socket hang up/, 'should rethrow the transient error')
  t.notOk(puppet.messageFile.called, 'should NOT fall back on a transient error')
})

test('Voice.text() returns the dedicated messageVoiceText payload when supported', async t => {
  await ensureStarted()
  puppet.messageVoiceText = sinon.stub().resolves({ text: 'hello', noSpeech: false })
  puppet.messagePayload   = sinon.stub().resolves({ text: 'legacy' } as PUPPET.payloads.Message)

  const result = await voice().text()
  t.same(result, { text: 'hello', noSpeech: false }, 'should return the messageVoiceText payload')
  t.ok(puppet.messageVoiceText.calledOnceWith(MESSAGE_ID), 'should call messageVoiceText')
  t.notOk(puppet.messagePayload.called, 'should NOT fall back to messagePayload when supported')
})

test('Voice.text() preserves noSpeech=true from the puppet (skip paid ASR)', async t => {
  await ensureStarted()
  puppet.messageVoiceText = sinon.stub().resolves({ text: '', noSpeech: true })
  puppet.messagePayload   = sinon.stub().resolves({ text: '' } as PUPPET.payloads.Message)

  const result = await voice().text()
  t.equal(result.noSpeech, true, 'should preserve noSpeech=true so the bot can skip its own ASR')
  t.notOk(puppet.messagePayload.called, 'should NOT fall back when supported')
})

test('Voice.text() falls back to messagePayload().text on unsupported error', async t => {
  await ensureStarted()
  puppet.messageVoiceText = sinon.stub().rejects(UNSUPPORTED)
  puppet.messagePayload   = sinon.stub().resolves({ text: 'legacy asr' } as PUPPET.payloads.Message)

  const result = await voice().text()
  t.same(result, { text: 'legacy asr', noSpeech: false }, 'should fall back to legacy payload.text with noSpeech=false')
  t.ok(puppet.messagePayload.calledOnceWith(MESSAGE_ID), 'should call messagePayload on fallback')
})

test('Voice.text() falls back on gRPC UNIMPLEMENTED (code 12)', async t => {
  await ensureStarted()
  const unimplemented = Object.assign(new Error('12 UNIMPLEMENTED'), { code: 12 })
  puppet.messageVoiceText = sinon.stub().rejects(unimplemented)
  puppet.messagePayload   = sinon.stub().resolves({ text: 'legacy asr' } as PUPPET.payloads.Message)

  const result = await voice().text()
  t.same(result, { text: 'legacy asr', noSpeech: false }, 'should fall back when the server returns UNIMPLEMENTED')
  t.ok(puppet.messagePayload.calledOnceWith(MESSAGE_ID), 'should call messagePayload on fallback')
})

test('Voice.text() rethrows a transient error instead of falling back', async t => {
  await ensureStarted()
  puppet.messageVoiceText = sinon.stub().rejects(new Error('ETIMEDOUT'))
  puppet.messagePayload   = sinon.stub().resolves({ text: 'legacy asr' } as PUPPET.payloads.Message)

  await t.rejects(() => voice().text(), /ETIMEDOUT/, 'should rethrow the transient error')
  t.notOk(puppet.messagePayload.called, 'should NOT fall back on a transient error (would drop noSpeech)')
})

test('teardown: stop the shared wechaty', async t => {
  await wechaty.stop()
  t.pass('stopped')
})
