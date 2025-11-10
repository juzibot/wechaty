import type * as PUPPET from '@juzi/wechaty-puppet'
import { FileBox } from 'file-box'

import {
  ContactImpl,
  MessageImpl,
  DelayImpl,
  UrlLinkImpl,
  MiniProgramImpl,
  PostImpl,
  LocationImpl,
  ChannelImpl,
  ChannelCardImpl,
  PremiumOnlineAppointmentCardImpl,
  ConsultCardImpl,
  DouyinOneClickPhoneCollectionImpl,
}                     from '../user-modules/mod.js'

import type { Sayable, SayOptionsObject } from './types.js'

/**
 * TODO: add unit test to ensure the interface validation code works
 */
const deliverSayableConversationPuppet = (puppet: PUPPET.impls.PuppetInterface) => (conversationId: string) => async (sayable: Sayable, options?: SayOptionsObject) => {
  let msgId: string | void

  if (typeof sayable === 'number') {
    sayable = String(sayable)
  }

  if (typeof sayable === 'string') {
    return puppet.messageSendText(
      conversationId,
      sayable,
      {
        mentionIdList: options?.mentionList?.map(c => c === '@all' ? '@all' : c.id),
        quoteId: options?.quoteMessage?.id,
      },
    )
  }

  /**
   * Huan(202110): Checking `looseInstanceOf` is enough for the following types:
   *  so we do not check `interfaceOfClass` anymore because it will consume more resources.
   */
  if (FileBox.valid(sayable)) {
    /**
     * 1. File
     */
    msgId = await puppet.messageSendFile(
      conversationId,
      sayable,
    )
  } else if (MessageImpl.validInstance(sayable)) {
    /**
     * 2. Message
     */
    msgId = await puppet.messageForward(
      conversationId,
      sayable.id,
    )
  } else if (ContactImpl.validInstance(sayable)) {
    /**
     * 3. Contact
     */
    msgId = await puppet.messageSendContact(
      conversationId,
      sayable.id,
    )
  } else if (UrlLinkImpl.validInstance(sayable)) {
    /**
     * 4. Link Message
     */
    msgId = await puppet.messageSendUrl(
      conversationId,
      sayable.payload,
    )
  } else if (MiniProgramImpl.validInstance(sayable)) {
    /**
     * 5. Mini Program
     */
    msgId = await puppet.messageSendMiniProgram(
      conversationId,
      sayable.payload,
    )
  } else if (LocationImpl.validInstance(sayable)) {
    /**
     * 6. Location
     */
    msgId = await puppet.messageSendLocation(
      conversationId,
      sayable.payload,
    )
  } else if (DelayImpl.validInstance(sayable)) {
    /**
     * 7. Delay for a while
     */
    await sayable.wait()
  } else if (PostImpl.validInstance(sayable)) {
    /**
     * 8. Post
     */
    msgId = await puppet.messageSendPost(
      conversationId,
      sayable.payload,
    )
  } else if (ChannelImpl.validInstance(sayable)) {
    msgId = await puppet.messageSendChannel(
      conversationId,
      sayable.payload,
    )
  } else if (ChannelCardImpl.validInstance(sayable)) {
    msgId = await puppet.messageSendChannelCard(
      conversationId,
      sayable.payload,
    )
  } else if (ConsultCardImpl.validInstance(sayable)) {
    msgId = await puppet.messageSendConsultCard(
      conversationId,
      sayable.payload,
    )
  } else if (PremiumOnlineAppointmentCardImpl.validInstance(sayable)) {
    msgId = await puppet.messageSendPremiumOnlineAppointmentCard(
      conversationId,
      {
        cardType: sayable.payload.cardType,
        componentId: sayable.componentId(),
      },
    )
  } else if (DouyinOneClickPhoneCollectionImpl.validInstance(sayable)) {
    msgId = await puppet.messageSendDouyinOneClickPhoneCollection(
      conversationId,
      {},
    )
  } else {
    throw new Error('unsupported arg: ' + sayable)
  }

  return msgId
}

export {
  deliverSayableConversationPuppet,
}
