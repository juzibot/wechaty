import type * as PUPPET from '@juzi/wechaty-puppet'

export interface InfoUpdateInterface {
  type: PUPPET.types.Payload,
  id: string,
  updates: InfoUpdateValuePair[],
  fresh?: boolean,  // will be true when old data is null
}

export interface InfoUpdateValuePair {
  key: string,
  oldValue: string,
  newValue: string
}

type UpdatablePayloads = PUPPET.payloads.Contact | PUPPET.payloads.Room | PUPPET.payloads.Message | {} | undefined

export const diffPayload = (oldPayload: UpdatablePayloads, newPayload: UpdatablePayloads): {
  isFresh: boolean,
  updates: InfoUpdateValuePair[]
} => {
  const result = {
    isFresh: false,
    updates: [],
  }
  if (!oldPayload) {
    result.isFresh = true
    return result
  }

  return result
}

const baseDataTypes = [
  'undefined',
  'null',
]

const diff = (path: string, objectA: any, objectB: any): InfoUpdateValuePair => {
  const keys = new Set([...Object.keys(objectA || {}), ...Object.keys(objectB || {})])
  for (const key of keys) {
    const subObjectA = objectA[key]
    const subObjectB = objectB[key]

  }
}
