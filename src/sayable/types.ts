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
}                       from 'file-box'

import {
  ContactInterface,
  DelayInterface,
  LocationInterface,
  MessageInterface,
  MiniProgramInterface,
  PostInterface,
  UrlLinkInterface,
  ChannelInterface,
  ContactImpl,
  MessageImpl,
}                           from '../user-modules/mod.js'

import type {
  WechatyInterface,
}                           from '../wechaty/mod.js'

type Sayable =
  | ContactInterface
  | DelayInterface
  | FileBoxInterface
  | LocationInterface
  | MessageInterface
  | MiniProgramInterface
  | number
  | PostInterface
  | string
  | UrlLinkInterface
  | ChannelInterface

interface SayableSayer {
  id      : string,
  wechaty : WechatyInterface,
  say (
    sayable  : Sayable,
    options? : SayOptions,
  ): Promise<void | MessageInterface>
}

interface SayOptionsObject {
  mentionList?: (ContactInterface | '@all')[],
  quoteMessage?: MessageInterface,
}

const sayOptionKeys = [
  'mentionList',
  'quoteMessage',
]

export const isSayOptionsObject = (target: any) => {
  return (typeof target === 'object'
    && Object.keys(target).every(item => sayOptionKeys.includes(item))
    && (typeof target.mentionList === 'undefined' || (Array.isArray(target.mentionList) && target.mentionList.every((c: any) => ContactImpl.valid(c) || (c as string) === '@all')))
    && (typeof target.quoteMessage === 'undefined' || MessageImpl.valid(target.quoteMessage))
  )
}

type SayOptions = (ContactInterface | '@all') | (ContactInterface | '@all')[] | SayOptionsObject

export type {
  SayableSayer,
  Sayable,
  SayOptions,
  SayOptionsObject,
}
