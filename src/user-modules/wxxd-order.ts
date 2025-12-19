import type { Constructor } from 'clone-class'
import type { PaginationRequest } from '@juzi/wechaty-puppet/filters'
import * as PUPPET from '@juzi/wechaty-puppet'

import { log } from '../config.js'
import { poolifyMixin } from '../user-mixins/poolify.js'
import { validationMixin } from '../user-mixins/validation.js'
import { wechatifyMixin } from '../user-mixins/wechatify.js'

const MixinBase = wechatifyMixin(
  poolifyMixin(Object)<WxxdOrderImplInterface>(),
)

class WxxdOrderMixin extends MixinBase {

  /**
   * Instance properties
   * @ignore
   */
  payload?: PUPPET.payloads.WxxdOrder

  /**
   * @hideconstructor
   */
  constructor (
    public readonly id: string,
  ) {
    super()
    log.silly('WxxdOrder', 'constructor(%s)', id)
  }

  /**
   * List all orders
   */
  static async list (query: PaginationRequest) {
    log.verbose('WxxdOrder', 'list(%s)', JSON.stringify(query))

    return await this.wechaty.puppet.listWxxdOrders(query)
  }

  /**
   * Find order by id or filter
   */
  static async find (
    query: string | { id: string },
  ): Promise<WxxdOrderInterface | undefined> {
    log.verbose('WxxdOrder', 'find(%s)', JSON.stringify(query))

    const id = typeof query === 'string' ? query : query.id

    if (!id) {
      return undefined
    }

    const order = (this.wechaty.WxxdOrder as any as typeof WxxdOrderImpl).load(id)

    try {
      await order.ready()
    } catch (e) {
      this.wechaty.emitError(e)
      return undefined
    }

    return order
  }

  isReady (): boolean {
    return !!(this.payload && this.payload.orderId)
  }

  async ready (forceSync = false): Promise<void> {
    log.silly('WxxdOrder', 'ready() @ %s with id="%s"', this.wechaty.puppet, this.id)

    if (!forceSync && this.isReady()) {
      log.silly('WxxdOrder', 'ready() isReady() true')
      return
    }

    try {
      this.payload = await this.wechaty.puppet.wxxdOrderPayload(this.id)
    } catch (e) {
      this.wechaty.emitError(e)
      log.verbose('WxxdOrder', 'ready() this.wechaty.puppet.wxxdOrderPayload(%s) exception: %s',
        this.id,
        (e as Error).message,
      )
      throw e
    }
  }

  /**
   * Get order ID
   */
  orderId (): string {
    return this.payload?.orderId || this.id
  }

  /**
   * Get order open ID
   */
  openId (): string {
    return this.payload?.openId || ''
  }

  /**
   * Get order status
   */
  status (): PUPPET.types.WxxdOrderStatus {
    return this.payload?.status || PUPPET.types.WxxdOrderStatus.Unpaid
  }

  /**
   * Get order create time
   */
  createTime (): number {
    return this.payload?.createTime || 0
  }

  /**
   * Get order update time
   */
  updateTime (): number {
    return this.payload?.updateTime || 0
  }

  /**
   * Get order products
   */
  products (): PUPPET.payloads.WxxdOrderProduct[] {
    return this.payload?.products || []
  }

  /**
   * Get order ext info
   */
  extInfo (): PUPPET.payloads.WxxdOrderExtInfo | undefined {
    return this.payload?.extInfo
  }
}

class WxxdOrderImplBase extends validationMixin(WxxdOrderMixin)<WxxdOrderImplInterface>() { }
interface WxxdOrderImplInterface extends WxxdOrderImplBase { }

type WxxdOrderProtectedProperty = 'ready'
type WxxdOrderInterface = Omit<WxxdOrderImplInterface, WxxdOrderProtectedProperty>
class WxxdOrderImpl extends validationMixin(WxxdOrderImplBase)<WxxdOrderInterface>() { }

type WxxdOrderConstructor = Constructor<
  WxxdOrderImplInterface,
  typeof WxxdOrderImpl
>

export type {
  WxxdOrderConstructor,
  WxxdOrderProtectedProperty,
  WxxdOrderInterface,
}
export {
  WxxdOrderImpl,
}
