import * as PUPPET from '@juzi/wechaty-puppet'

import type { Constructor } from 'clone-class'
import { log } from '../config.js'

import { validationMixin } from '../user-mixins/validation.js'

import {
  wechatifyMixinBase,
} from '../user-mixins/wechatify.js'
import { FileBox } from 'file-box'
import type { FileBoxInterface } from 'file-box'
import type { LocationInterface } from './location.js'
import type { MiniProgramInterface } from './mini-program.js'
import type { UrlLinkInterface } from './url-link.js'

type ChatHistoryMessageType = string | LocationInterface | MiniProgramInterface | UrlLinkInterface | ChatHistoryInterface | FileBoxInterface

class ChatHistoryMixin extends wechatifyMixinBase() {

  static async create (): Promise<ChatHistoryInterface> {
    log.verbose('ChatHistory', 'create()')

    const payload: PUPPET.payloads.ChatHistory[] = [
      {
        type: PUPPET.types.Message.Text,
        avatar: FileBox.fromUrl(''),
        senderName: 'senderName',
        corpName: 'corpName',
        time: 1699889645,
        title: '群聊的聊天记录',
        message: 'text',
      },
    ]

    return new this(payload)
  }

  /*
   * @hideconstructor
   */
  constructor (
      public readonly payload: PUPPET.payloads.ChatHistory[],
  ) {
    super()
    log.verbose('ChatHistory', 'constructor()')
  }

  // avatar (): FileBoxInterface {
  //   return this.payload.avatar
  // }

  // name (): undefined | string {
  //   const senderName = this.payload.senderName
  //   const corpName = this.payload.corpName
  //   if (corpName) {
  //     return `${senderName}@${corpName}`
  //   }
  //   return senderName
  // }

  // date (): Date {
  //   const time = this.payload.time
  //   return timestampToDate(Number(time)) // FIXME: change the type from string to number
  // }

  // async message (): Promise<ChatHistoryMessageType> {
  //   const type = this.type()
  //   const message = this.payload.message
  //   switch (type) {
  //     case PUPPET.types.Message.Text:
  //     case PUPPET.types.Message.Contact:
  //       return message as string
  //     case PUPPET.types.Message.Attachment:
  //     case PUPPET.types.Message.Audio:
  //     case PUPPET.types.Message.Emoticon:
  //     case PUPPET.types.Message.Image:
  //     case PUPPET.types.Message.Video:
  //       return message as FileBoxInterface
  //     case PUPPET.types.Message.Url:
  //       return new this.wechaty.UrlLink(message)
  //     case PUPPET.types.Message.Location:
  //       return new this.wechaty.Location(message)
  //     case PUPPET.types.Message.MiniProgram:
  //       return new this.wechaty.MiniProgram(message)
  //     case PUPPET.types.Message.Channel:
  //       return new this.wechaty.Channel(message)
  //     case PUPPET.types.Message.ChatHistory:
  //       return new this.wechaty.ChatHistory(message)
  //     default:
  //       throw new Error(`Unsupported message type of chat history: ${PUPPET.types.Message[type]}`)
  //   }
  // }

  // type (): PUPPET.types.Message {
  //   return this.payload.type
  // }

  messageList () {
    const payloadList = this.payload
    const responseList: ChatHistoryMessageType[] = []
    for (const payload of payloadList) {
      const type = payload.type
      switch (type) {
        case PUPPET.types.Message.Text:
        case PUPPET.types.Message.Contact:
        case PUPPET.types.Message.Audio:
        case PUPPET.types.Message.GroupNote:
        case PUPPET.types.Message.Emoticon:
        case PUPPET.types.Message.Channel:
          responseList.push(payload.message as string)
          break
        case PUPPET.types.Message.Attachment:
        case PUPPET.types.Message.Image:
        case PUPPET.types.Message.Video:
          responseList.push(payload.message)
          break
        case PUPPET.types.Message.Url:
          responseList.push(new this.wechaty.UrlLink(payload))
          break
        case PUPPET.types.Message.Location:
          responseList.push(new this.wechaty.Location(payload))
          break
        case PUPPET.types.Message.MiniProgram:
          responseList.push(new this.wechaty.MiniProgram(payload))
          break
        case PUPPET.types.Message.ChatHistory:
          responseList.push(new this.wechaty.ChatHistory(payload))
          break
        default:
          throw new Error(`Unsupported message type of chat history: ${PUPPET.types.Message[type]}`)
      }
    }
    return responseList
  }

}

class ChatHistoryImpl extends validationMixin(ChatHistoryMixin)<ChatHistoryInterface>() { }
interface ChatHistoryInterface extends ChatHistoryImpl { }

type ChatHistoryConstructor = Constructor<
  ChatHistoryInterface,
  typeof ChatHistoryImpl
>

export type {
  ChatHistoryConstructor,
  ChatHistoryInterface,
}
export {
  ChatHistoryImpl,
}
