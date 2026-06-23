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
import { validationMixin } from '../user-mixins/validation.js'
import { log } from '../config.js'

import {
  wechatifyMixinBase,
}                       from '../user-mixins/wechatify.js'

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
      log.verbose('Voice', 'file() messageVoice() failed, fallback to messageFile(): %s', (e as Error).message)
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
  async text (): Promise<{ text: string; noSpeech: boolean }> {
    log.verbose('Voice', 'text() for id: "%s"', this.id)
    try {
      const payload = await this.wechaty.puppet.messageVoiceText(this.id)
      return payload
    } catch (e) {
      log.verbose('Voice', 'text() messageVoiceText() failed, fallback to messagePayload().text: %s', (e as Error).message)
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
