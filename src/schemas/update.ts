import type * as PUPPET from '@juzi/wechaty-puppet'

export interface InfoUpdateInterface {
  type: PUPPET.types.Payload,
  id: string,
  updates: {
    key: string,
    oldValue: string,
    newValue: string
  }[],
  fresh?: boolean,  // will be true when old data is null
}
