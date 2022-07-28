/* eslint-disable valid-typeof */
import type * as PUPPET from '@juzi/wechaty-puppet'

export interface InfoUpdateInterface {
  type: PUPPET.types.Payload,
  id: string,
  updates: InfoUpdateValuePair[],
}

export interface InfoUpdateValuePair {
  key: string,
  oldValue: string,
  newValue: string
}
