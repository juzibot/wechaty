/* eslint-disable valid-typeof */
import * as PUPPET from '@juzi/wechaty-puppet'

type ContactImportantKeys = 'name' | 'tags' | 'alias' | 'phone' | 'description'
type RoomImportantKeys = 'topic' | 'memberIdList' | 'ownerId'

type ContactUpdatableKeys = Omit<PUPPET.payloads.Contact, ContactImportantKeys>
type RoomUpdateableKeys = Omit<PUPPET.payloads.Room, RoomImportantKeys>

type PayloadTypeToUpdateInterface<U> = {
  [SubType in keyof U]: {
    type: SubType,
    id: string,
    updates: InfoUpdateValuePair<U[SubType]>[],
  }
}[keyof U]

type InfoUpdateValuePair<U> = {
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
