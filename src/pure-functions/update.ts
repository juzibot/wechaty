import type { InfoUpdateValuePair } from '../schemas/update'

const baseDataTypes = [
  'undefined',
  'null',
  'number',
  'boolean',
  'string',
]

/**
 *
 * No need to go recursive on payload diff becasue
 *   1. most fields of payloads are primitive values
 *   2. users does not want to compare array items, they just need to know this field has changed. And we don't offer methods to get a subObject value
 */
export const diffPayload = (objectOld: any, objectNew: any): InfoUpdateValuePair[] => {
  const keys = new Set([...Object.keys(objectOld || {}), ...Object.keys(objectNew || {})])
  const result = []
  for (const key of keys) {
    const subObjectOld = objectOld[key]
    const subObjectNew = objectNew[key]

    if (typeof subObjectOld !== typeof subObjectNew) {
      result.push({
        key,
        oldValue: baseDataTypes.some(e => e === typeof subObjectOld) ? subObjectOld : JSON.stringify(subObjectOld),
        newValue: baseDataTypes.some(e => e === typeof subObjectNew) ? subObjectNew : JSON.stringify(subObjectNew),
      })
    } else {
      if (baseDataTypes.some(e => e === typeof subObjectOld)) {
        if (subObjectOld === subObjectNew) {
          continue
        } else {
          result.push({
            key,
            oldValue: subObjectOld,
            newValue: subObjectNew,
          })
        }
      } else {
        // for objects, we just judge if they were same or not, but do not record every different value
        if (objectDeepDiff(subObjectOld, subObjectNew)) {
          continue
        } else {
          result.push({
            key,
            oldValue: JSON.stringify(subObjectOld),
            newValue: JSON.stringify(subObjectNew),
          })
        }
      }
    }
  }

  return result
}

const objectDeepDiff = (objectA: any, objectB: any) => {
  const keys = new Set([...Object.keys(objectA), ...Object.keys(objectB)])
  for (const key of keys) {
    if (typeof objectA[key] !== typeof objectB[key]) {
      return false
    }
    if (baseDataTypes.some(e => e === objectA[key])) {
      if (objectA[key] !== objectB[key]) {
        return false
      }
    } else {
      if (!objectDeepDiff(objectA[key], objectB[key])) {
        return false
      }
    }
  }
  return true
}
