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
import { log } from '../config.js'

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
 */
function isUnsupportedError (e: unknown): boolean {
  const err = e as { code?: number | string; message?: string } | undefined
  // old wechaty-puppet-service server without the new RPC → gRPC UNIMPLEMENTED
  if (err?.code === GRPC_STATUS_UNIMPLEMENTED) {
    return true
  }
  const message = err?.message || ''
  // puppet implements the abstract method via throwUnsupportedError()
  if (message.includes('Unsupported API')) {
    return true
  }
  // puppet built against an old wechaty-puppet without the method at all
  if (message.includes('is not a function')) {
    return true
  }
  return false
}

/**
 * Sourced from the puppet method signature (single source of truth) rather than
 * re-declared, since `@juzi/wechaty-puppet` does not re-export `VoiceTextPayload`
 * through its public `payloads` barrel.
 */
type VoiceTextPayload = Awaited<ReturnType<PUPPET.impls.PuppetInterface['messageVoiceText']>>

class VoiceMixin extends wechatifyMixinBase() {

  static create (id: string): VoiceInterface {
    log.verbose('Voice', 'static create(%s)', id)

    const voice = new this(id)
    return voice
  }

  constructor (
    public id: string,
  ) {
    super()
    log.verbose('Voice', 'constructor(%s)', id)
  }

  /**
   * Get the voice file (FileBox) via the puppet's dedicated `messageVoice` RPC.
   *
   * Falls back to the generic `messageFile` when the puppet does not implement
   * `messageVoice` (old puppet without the new RPC → rejection), keeping the
   * behaviour compatible with the legacy "voice file via messageFile" path.
   */
  async file (): Promise<FileBoxInterface> {
    log.verbose('Voice', 'file() for id: "%s"', this.id)
    try {
      const fileBox = await this.wechaty.puppet.messageVoice(this.id)
      return fileBox
    } catch (e) {
      if (!isUnsupportedError(e)) {
        throw e
      }
      log.verbose('Voice', 'file() messageVoice() unsupported, fallback to messageFile(): %s', (e as Error).message)
      const fileBox = await this.wechaty.puppet.messageFile(this.id)
      return fileBox
    }
  }

  /**
   * Get the voice-to-text (ASR) result via the puppet's dedicated
   * `messageVoiceText` RPC. Returns a discriminated result so the bot can tell
   * "confirmed no speech" (`noSpeech=true`) from "normal transcription".
   *
   * Falls back to reading the legacy `messagePayload().text` when the puppet
   * does not implement `messageVoiceText` (old puppet without the new RPC →
   * rejection). Old puppets put the ASR result into `payload.text`, so this
   * keeps the behaviour compatible; `noSpeech` is `false` in the fallback.
   */
  async text (): Promise<VoiceTextPayload> {
    log.verbose('Voice', 'text() for id: "%s"', this.id)
    try {
      const payload = await this.wechaty.puppet.messageVoiceText(this.id)
      return payload
    } catch (e) {
      if (!isUnsupportedError(e)) {
        throw e
      }
      log.verbose('Voice', 'text() messageVoiceText() unsupported, fallback to messagePayload().text: %s', (e as Error).message)
      const payload = await this.wechaty.puppet.messagePayload(this.id)
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
