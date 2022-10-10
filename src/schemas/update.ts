/* eslint-disable valid-typeof */
import * as PUPPET from '@juzi/wechaty-puppet'

export const ContactImportantFields = [
  'name', 'tags', 'alias', 'phone', 'description', 'corporation',
] as const

export const RoomImportantFields = [
  'topic', 'memberIdList', 'ownerId',
] as const

type ContactImportantKeys = typeof ContactImportantFields[number]
type RoomImportantKeys = typeof RoomImportantFields[number]

type ContactUpdatableKeys = Omit<PUPPET.payloads.Contact, ContactImportantKeys>
type RoomUpdateableKeys = Omit<PUPPET.payloads.Room, RoomImportantKeys>

type PayloadTypeToUpdateInterface<U> = {
  [SubType in keyof U]: {
    type: SubType,
    id: string,
    updates: InfoUpdateValuePair<U[SubType]>[],
  }
}[keyof U]

export type InfoUpdateValuePair<U> = {
  [SubType in keyof U]: {
    key: SubType,
    oldValue?: U[SubType],
    newValue?: U[SubType],
  }
}[keyof U]

export type InfoUpdateInterface = PayloadTypeToUpdateInterface<{
  [PUPPET.types.Payload.Contact]: ContactUpdatableKeys,
  [PUPPET.types.Payload.Room]: RoomUpdateableKeys,
}>

export type ContactUpdatableValuePair = InfoUpdateValuePair<ContactUpdatableKeys>
export type RoomUpdatableValuePair = InfoUpdateValuePair<RoomUpdateableKeys>

export type ContactValuePair = InfoUpdateValuePair<PUPPET.payloads.Contact>
export type RoomValuePair = InfoUpdateValuePair<PUPPET.payloads.Room>
