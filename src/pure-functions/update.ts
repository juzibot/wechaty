import type { InfoUpdateValuePair } from '../schemas/update'

/**
 *
 * No need to go recursive on payload diff becasue
 *   1. most fields of payloads are primitive values
 *   2. users does not want to compare array items, they just need to know this field has changed. And we don't offer methods to get a subObject value
 */
export const diffPayload = <T>(objectOld: any, objectNew: any): InfoUpdateValuePair<T>[] => {
  const keys = new Set([ ...Object.keys(objectOld || {}), ...Object.keys(objectNew || {}) ])
  const result = []
  for (const item of keys) {
    const key = item as keyof T
    const subObjectOld = objectOld[key] as T[typeof key]
    const subObjectNew = objectNew[key] as T[typeof key]

    if (typeof subObjectOld !== typeof subObjectNew) {
      result.push({
        key,
        oldValue: subObjectOld,
        newValue: subObjectNew,
      })
    } else {
      if (typeof subObjectOld !== 'object') {
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
            oldValue: subObjectOld,
            newValue: subObjectNew,
          })
        }
      }
    }
  }

  return result
}

const objectDeepDiff = (objectA: any, objectB: any) => {
  const keys = new Set([ ...Object.keys(objectA), ...Object.keys(objectB) ])
  for (const key of keys) {
    if (typeof objectA[key] !== typeof objectB[key]) {
      return false
    }
    if (typeof objectA[key] !== 'object') {
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

export const checkUntilChanged = async (gapMilliseconds: number, maxRetry: number, judgement: () => Promise<boolean> | boolean): Promise<boolean> => {
  let changed = await judgement()
  let currentTry = 1
  while (!changed && (currentTry < maxRetry)) {
    await new Promise(resolve => setTimeout(resolve, gapMilliseconds))
    changed = await judgement()
    currentTry++
  }
  return changed
}
