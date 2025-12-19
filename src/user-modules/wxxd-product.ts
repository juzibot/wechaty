import type { Constructor } from 'clone-class'
import type { PaginationRequest } from '@juzi/wechaty-puppet/filters'
import * as PUPPET from '@juzi/wechaty-puppet'

import { log } from '../config.js'
import { poolifyMixin } from '../user-mixins/poolify.js'
import { validationMixin } from '../user-mixins/validation.js'
import { wechatifyMixin } from '../user-mixins/wechatify.js'

const MixinBase = wechatifyMixin(
  poolifyMixin(Object)<WxxdProductImplInterface>(),
)

class WxxdProductMixin extends MixinBase {

  /**
   * Instance properties
   * @ignore
   */
  payload?: PUPPET.payloads.WxxdProduct

  /**
   * @hideconstructor
   */
  constructor (
    public readonly id: string,
  ) {
    super()
    log.silly('WxxdProduct', 'constructor(%s)', id)
  }

  /**
   * List all products
   */
  static async list (query: PaginationRequest) {
    log.verbose('WxxdProduct', 'list(%s)', JSON.stringify(query))

    return await this.wechaty.puppet.listWxxdProducts(query)
  }

  /**
   * Find product by id or filter
   */
  static async find (
    query: string | { id: string },
  ): Promise<WxxdProductInterface | undefined> {
    log.verbose('WxxdProduct', 'find(%s)', JSON.stringify(query))

    const id = typeof query === 'string' ? query : query.id

    if (!id) {
      return undefined
    }

    const product = (this.wechaty.WxxdProduct as any as typeof WxxdProductImpl).load(id)

    try {
      await product.ready()
    } catch (e) {
      this.wechaty.emitError(e)
      return undefined
    }

    return product
  }

  isReady (): boolean {
    return !!(this.payload && this.payload.productId)
  }

  async ready (forceSync = false): Promise<void> {
    log.silly('WxxdProduct', 'ready() @ %s with id="%s"', this.wechaty.puppet, this.id)

    if (!forceSync && this.isReady()) {
      log.silly('WxxdProduct', 'ready() isReady() true')
      return
    }

    try {
      this.payload = await this.wechaty.puppet.wxxdProductPayload(this.id)
    } catch (e) {
      this.wechaty.emitError(e)
      log.verbose('WxxdProduct', 'ready() this.wechaty.puppet.wxxdProductPayload(%s) exception: %s',
        this.id,
        (e as Error).message,
      )
      throw e
    }
  }

  /**
   * Get product title
   */
  title (): string {
    return this.payload?.title || ''
  }

  /**
   * Get product short title
   */
  shortTitle (): string {
    return this.payload?.shortTitle || ''
  }

  /**
   * Get product status
   */
  status (): PUPPET.types.WxxdProductStatus {
    return this.payload?.status || PUPPET.types.WxxdProductStatus.NotExist
  }

  /**
   * Get product min price
   */
  minPrice (): number {
    return this.payload?.minPrice || 0
  }

  /**
   * Get product total sold number
   */
  totalSoldNum (): number {
    return this.payload?.totalSoldNum || 0
  }

  /**
   * Get product SKUs
   */
  skus (): PUPPET.payloads.WxxdProductSku[] {
    return this.payload?.skus || []

  }
}

class WxxdProductImplBase extends validationMixin(WxxdProductMixin)<WxxdProductImplInterface>() { }
interface WxxdProductImplInterface extends WxxdProductImplBase { }

type WxxdProductProtectedProperty = 'ready'
type WxxdProductInterface = Omit<WxxdProductImplInterface, WxxdProductProtectedProperty>
class WxxdProductImpl extends validationMixin(WxxdProductImplBase)<WxxdProductInterface>() { }

type WxxdProductConstructor = Constructor<
  WxxdProductImplInterface,
  typeof WxxdProductImpl
>

export type {
  WxxdProductConstructor,
  WxxdProductProtectedProperty,
  WxxdProductInterface,
}
export {
  WxxdProductImpl,
}
