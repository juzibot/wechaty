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
import type {
  FileBoxInterface,
}                   from 'file-box'
import type { Constructor } from 'clone-class'
import type * as PUPPET from '@juzi/wechaty-puppet'
import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
}                       from '../user-mixins/wechatify.js'

/**
 * gRPC status code for an RPC the server does not implement.
 * @see https://grpc.github.io/grpc/core/md_doc_statuscodes.html
 */
const GRPC_STATUS_UNIMPLEMENTED = 12

/**
 * Whether `e` means the puppet / server does not implement the new voice RPC,
 * i.e. it is safe to fall back to the legacy path.
 *
 * Transient errors (network / timeout / file expired / other gRPC codes) must
 * NOT match here: otherwise the fallback silently masks real failures and — for
 * `text()` — discards the `noSpeech` discriminator, making the bot re-run its
 * own paid ASR on voices the puppet already confirmed as empty.
 *
 * Note: the "method does not exist at all" case (an old puppet built against a
 * wechaty-puppet without the method) is detected up-front via a `typeof` guard
 * at the call site, NOT here — matching the `'is not a function'` text would
 * also swallow a genuine `TypeError` raised inside a working implementation.
 */
function isUnsupportedError (e: unknown): boolean {
  const err = e as { code?: number | string; message?: string } | undefined
  // old wechaty-puppet-service server without the new RPC → gRPC UNIMPLEMENTED
  if (err?.code === GRPC_STATUS_UNIMPLEMENTED) {
    return true
  }
  // puppet implements the abstract method via throwUnsupportedError()
  return (err?.message || '').includes('Unsupported API')
}

class VoiceMixin extends wechatifyMixinBase() {

  static create (id: string): VoiceInterface {
    this.log.verbose('Voice', 'static create(%s)', id)

    const voice = new this(id)
    return voice
  }

  constructor (
    public id: string,
  ) {
    super()
    this.log.verbose('Voice', 'constructor(%s)', id)
  }

  /**
   * Get the voice file (FileBox) via the puppet's dedicated `messageVoice` RPC.
   *
   * Falls back to the generic `messageFile` when the puppet does not implement
   * `messageVoice` — either the method is absent (old puppet built without it,
   * caught by the `typeof` guard) or it rejects with an unsupported-API error.
   * Keeps the behaviour compatible with the legacy "voice file via messageFile"
   * path. A genuine runtime error from a working `messageVoice` is rethrown.
   */
  async file (): Promise<FileBoxInterface> {
    this.log.verbose('Voice', 'file() for id: "%s"', this.id)
    const puppet = this.wechaty.puppet
    // puppet built against an old wechaty-puppet without the method at all
    if (typeof (puppet as { messageVoice?: unknown }).messageVoice !== 'function') {
      this.log.verbose('Voice', 'file() messageVoice() absent, fallback to messageFile()')
      return puppet.messageFile(this.id)
    }
    try {
      const fileBox = await puppet.messageVoice(this.id)
      return fileBox
    } catch (e) {
      if (!isUnsupportedError(e)) {
        throw e
      }
      this.log.verbose('Voice', 'file() messageVoice() unsupported, fallback to messageFile(): %s', (e as Error).message)
      const fileBox = await puppet.messageFile(this.id)
      return fileBox
    }
  }

  /**
   * Get the voice-to-text (ASR) result via the puppet's dedicated
   * `messageVoiceText` RPC. Returns a discriminated result so the bot can tell
   * "confirmed no speech" (`noSpeech=true`) from "normal transcription".
   *
   * Falls back to reading the legacy `messagePayload().text` when the puppet
   * does not implement `messageVoiceText` — either the method is absent (old
   * puppet built without it, caught by the `typeof` guard) or it rejects with
   * an unsupported-API error. Old puppets put the ASR result into
   * `payload.text`, so this keeps the behaviour compatible; `noSpeech` is
   * `false` in the fallback. A genuine runtime error is rethrown (so the bot
   * does not silently drop `noSpeech` and re-run its own paid ASR).
   */
  async text (): Promise<PUPPET.payloads.VoiceText> {
    this.log.verbose('Voice', 'text() for id: "%s"', this.id)
    const puppet = this.wechaty.puppet
    // puppet built against an old wechaty-puppet without the method at all
    if (typeof (puppet as { messageVoiceText?: unknown }).messageVoiceText !== 'function') {
      this.log.verbose('Voice', 'text() messageVoiceText() absent, fallback to messagePayload().text')
      const payload = await puppet.messagePayload(this.id)
      return { text: payload.text || '', noSpeech: false }
    }
    try {
      const payload = await puppet.messageVoiceText(this.id)
      return payload
    } catch (e) {
      if (!isUnsupportedError(e)) {
        throw e
      }
      this.log.verbose('Voice', 'text() messageVoiceText() unsupported, fallback to messagePayload().text: %s', (e as Error).message)
      const payload = await puppet.messagePayload(this.id)
      return { text: payload.text || '', noSpeech: false }
    }
  }

}

class VoiceImpl extends validationMixin(VoiceMixin)<VoiceInterface>() {}
interface VoiceInterface extends VoiceImpl { }

type VoiceConstructor = Constructor<
  VoiceInterface,
  typeof VoiceImpl
>

export type {
  VoiceConstructor,
  VoiceInterface,
}
export {
  VoiceImpl,
}
