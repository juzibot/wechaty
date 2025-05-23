import * as PUPPET      from '@juzi/wechaty-puppet'
import { log }          from '@juzi/wechaty-puppet'
import {
  GError,
  timeoutPromise,
  TimeoutPromiseGError,
}                       from 'gerror'

import {
  StateSwitch,
  BooleanIndicator,
  StateSwitchInterface,
}  from 'state-switch'

import { config, PUPPET_PAYLOAD_SYNC_GAP, PUPPET_PAYLOAD_SYNC_MAX_RETRY }               from '../config.js'
import { timestampToDate }      from '../pure-functions/timestamp-to-date.js'
import type {
  ContactImpl,
  ContactInterface,
  MessageImpl,
  RoomImpl,
  TagGroupInterface,
  TagInterface,
}                               from '../user-modules/mod.js'

import type {
  WechatifyUserModuleMixin,
}                               from './wechatify-user-module-mixin.js'

import type { GErrorMixin } from './gerror-mixin.js'
import type { IoMixin }     from './io-mixin.js'
import { checkUntilChanged } from '../pure-functions/retry-policy.js'
import { ScanType } from '@juzi/wechaty-puppet/types'

const PUPPET_MEMORY_NAME = 'puppet'

/**
 * Huan(202111): `puppetMixin` must extend `pluginMixin`
 *  because the `wechaty-redux` plugin need to be installed before
 *  the puppet started
 *
 * Huan(20211128): `puppetMixin` must extend `IoMixin`
 *  because the Io need the puppet instance to be ready when it starts
 */
const puppetMixin = <MixinBase extends WechatifyUserModuleMixin & GErrorMixin & IoMixin> (mixinBase: MixinBase) => {
  log.verbose('WechatyPuppetMixin', 'puppetMixin(%s)', mixinBase.name)

  abstract class PuppetMixin extends mixinBase {

    __puppet?: PUPPET.impls.PuppetInterface

    get puppet (): PUPPET.impls.PuppetInterface {
      if (!this.__puppet) {

        throw new Error('NOPUPPET')
      }
      return this.__puppet
    }

    readonly __readyState : StateSwitchInterface

    __loginIndicator: BooleanIndicator

    __puppetMixinInited = false

    constructor (...args: any[]) {
      log.verbose('WechatyPuppetMixin', 'construct()')
      super(...args)

      this.__readyState = new StateSwitch('WechatyReady', { log })
      this.__loginIndicator = new BooleanIndicator()

      this.on('login', () => {
        this.__loginIndicator.value(true)
      })
      this.on('logout', () => {
        this.__loginIndicator.value(false)
      })
    }

    override async start (): Promise<void> {
      log.verbose('WechatyPuppetMixin', 'start()')

      log.verbose('WechatyPuppetMixin', 'start() super.start() ...')
      await super.start()
      log.verbose('WechatyPuppetMixin', 'start() super.start() ... done')

      try {
        /**
         * reset the `wechaty.ready()` state
         *  if it was previous set to `active`
         */
        if (this.__readyState.active()) {
          this.__readyState.inactive(true)
        }

        try {
          log.verbose('WechatyPuppetMixin', 'start() starting puppet ...')
          await timeoutPromise(
            this.puppet.start(),
            15 * 1000,  // 15 seconds timeout
          )
          log.verbose('WechatyPuppetMixin', 'start() starting puppet ... done')
        } catch (e) {
          if (e instanceof TimeoutPromiseGError) {
            /**
             * Huan(202111):
             *
             *  We should throw the Timeout error when the puppet.start() can not be finished in time.
             *  However, we need to compatible with some buggy puppet implementations which will not resolve the promise.
             *
             * TODO: throw the Timeout error when the puppet.start() can not be finished in time.
             *
             * e.g. after resolve @issue https://github.com/padlocal/wechaty-puppet-padlocal/issues/116
             */
            log.warn('WechatyPuppetMixin', 'start() starting puppet ... timeout')
            log.warn('WechatyPuppetMixin', 'start() puppet info: %s', this.puppet)
          } else {
            throw e
          }
        }

      } catch (e) {
        this.emitError(e)
      }
    }

    override async stop (): Promise<void> {
      log.verbose('WechatyPuppetMixin', 'stop()')

      try {
        log.verbose('WechatyPuppetMixin', 'stop() stopping puppet ...')
        await timeoutPromise(
          this.puppet.stop(),
          15 * 1000,  // 15 seconds timeout
        )
        log.verbose('WechatyPuppetMixin', 'stop() stopping puppet ... done')
      } catch (e) {
        if (e instanceof TimeoutPromiseGError) {
          log.warn('WechatyPuppetMixin', 'stop() stopping puppet ... timeout')
          log.warn('WechatyPuppetMixin', 'stop() puppet info: %s', this.puppet)
        }
        this.emitError(e)
      }

      log.verbose('WechatyPuppetMixin', 'stop() super.stop() ...')
      await super.stop()
      log.verbose('WechatyPuppetMixin', 'stop() super.stop() ... done')
    }

    async ready (): Promise<void> {
      log.verbose('WechatyPuppetMixin', 'ready()')
      await this.__readyState.stable('active')
      log.silly('WechatyPuppetMixin', 'ready() this.readyState.stable(on) resolved')
    }

    override async init (): Promise<void> {
      log.verbose('WechatyPuppetMixin', 'init()')
      await super.init()

      if (this.__puppetMixinInited) {
        log.verbose('WechatyPuppetMixin', 'init() skipped because this puppet has already been inited before.')
        return
      }
      this.__puppetMixinInited = true

      log.verbose('WechatyPuppetMixin', 'init() instanciating puppet instance ...')
      const puppetInstance = await PUPPET.helpers.resolvePuppet({
        puppet: this.__options.puppet || config.systemPuppetName(),
        puppetOptions: 'puppetOptions' in this.__options
          ? this.__options.puppetOptions
          : undefined,
      })
      log.verbose('WechatyPuppetMixin', 'init() instanciating puppet instance ... done')

      /**
       * Plug the Memory Card to Puppet
       */
      log.verbose('WechatyPuppetMixin', 'init() setting memory ...')
      const puppetMemory = this.memory.multiplex(PUPPET_MEMORY_NAME)
      puppetInstance.setMemory(puppetMemory)
      log.verbose('WechatyPuppetMixin', 'init() setting memory ... done')

      /**
       * Propagate Puppet Events to Wechaty
       */
      log.verbose('WechatyPuppetMixin', 'init() setting up events ...')
      this.__setupPuppetEvents(puppetInstance)
      log.verbose('WechatyPuppetMixin', 'init() setting up events ... done')

      /**
        * Private Event
        *   - Huan(202005): emit puppet when set
        *   - Huan(202110): @see https://github.com/wechaty/redux/blob/16af0ae01f72e37f0ee286b49fa5ccf69850323d/src/wechaty-redux.ts#L82-L98
        */
      log.verbose('WechatyPuppetMixin', 'init() emitting "puppet" event ...')
      ;(this.emit as any)('puppet', puppetInstance)
      log.verbose('WechatyPuppetMixin', 'init() emitting "puppet" event ... done')

      this.__puppet = puppetInstance
    }

    __setupPuppetEvents (puppet: PUPPET.impls.PuppetInterface): void {
      log.verbose('WechatyPuppetMixin', '__setupPuppetEvents(%s)', puppet)

      const eventNameList: PUPPET.types.PuppetEventName[] = Object.keys(PUPPET.types.PUPPET_EVENT_DICT) as PUPPET.types.PuppetEventName[]
      for (const eventName of eventNameList) {
        log.verbose('PuppetMixin',
          '__setupPuppetEvents() puppet.on(%s) (listenerCount:%s) registering...',
          eventName,
          puppet.listenerCount(eventName),
        )

        switch (eventName) {
          case 'dong':
            puppet.on('dong', payload => {
              this.emit('dong', payload.data)
            })
            break

          case 'error':
            puppet.on('error', payload => {
              /**
               * Huan(202112):
               *  1. remove `payload.data` after it has been sunset (after Dec 31, 2022)
               *  2. throw error if `payload.gerror` is not exists (for enforce puppet strict follow the error event schema)
               */
              this.emit('error', GError.from(payload.gerror || payload.data || payload))
            })
            break

          case 'heartbeat':
            puppet.on('heartbeat', payload => {
              /**
               * Use `watchdog` event from Puppet to `heartbeat` Wechaty.
               */
              // TODO: use a throttle queue to prevent beat too fast.
              this.emit('heartbeat', payload.data)
            })
            break

          case 'friendship':
            puppet.on('friendship', async payload => {
              const friendship = this.Friendship.load(payload.friendshipId)
              try {
                await friendship.ready()
                await friendship.contact().sync()
                this.emit('friendship', friendship)
                friendship.contact().emit('friendship', friendship)
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'login':
            puppet.on('login', async payload => {
              try {
                const contact = await this.ContactSelf.find({ id: payload.contactId })
                if (!contact) {
                  throw new Error('no contact found for id: ' + payload.contactId)
                }
                this.emit('login', contact)
                const readyTimeout = setTimeout(() => {
                  if (this.puppet.readyIndicator.value()) {
                    this.emit('ready')
                  }
                }, 15 * 1000)
                puppet.once('ready', () => {
                  // if we got ready from puppet, we don't have to fire it here.
                  // it will be fired by ready listener
                  clearTimeout(readyTimeout)
                })
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'logout':
            puppet.on('logout', async payload => {
              try {
                this.__readyState.inactive(true)
                const contact = await this.ContactSelf.find({ id: payload.contactId })
                if (contact) {
                  this.emit('logout', contact, payload.data)
                } else {
                  log.verbose('PuppetMixin',
                    '__setupPuppetEvents() logout event contact self not found for id: %s',
                    payload.contactId,
                  )
                }
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'message':
            puppet.on('message', async payload => {
              try {
                const msg = await this.Message.find({ id: payload.messageId })
                if (!msg) {
                  this.emit('error', GError.from('message not found for id: ' + payload.messageId))
                  return
                }

                this.emit('message', msg)

                const room     = msg.room()
                const listener = msg.listener()

                if (room) {
                  room.emit('message', msg)
                } else if (listener) {
                  listener.emit('message', msg)
                } else {
                  this.emit('error', GError.from('message without room and listener'))
                }
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'post':
            puppet.on('post', async payload => {
              try {
                const post = await this.Post.find({ id: payload.postId })
                if (!post) {
                  this.emit('error', GError.from('post not found for id: ' + payload.postId))
                  return
                }

                this.emit('post', post)
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'post-comment':
            puppet.on('post-comment', async payload => {
              try {
                const comment = await this.Post.find({ id: payload.commentId })
                const post = await this.Post.find({ id: payload.postId })
                if (!post) {
                  this.emit('error', GError.from('post not found for id: ' + payload.postId))
                  return
                }
                if (!comment) {
                  this.emit('error', GError.from('comment not found for id: ' + payload.commentId))
                  return
                }
                this.emit('post-comment', comment, post)
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'post-tap':
            puppet.on('post-tap', async payload => {
              try {
                const post = await this.Post.find({ id: payload.postId })
                const contact = await this.Contact.find({ id: payload.contactId })
                const date = timestampToDate(payload.timestamp)
                if (!post) {
                  this.emit('error', GError.from('post not found for id: ' + payload.postId))
                  return
                }
                if (!contact) {
                  this.emit('error', GError.from('contact not found for id: ' + payload.contactId))
                  return
                }
                this.emit('post-tap', post, contact, payload.tapType, payload.tap, date)
              }  catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'ready':
            puppet.on('ready', async () => {
              log.silly('WechatyPuppetMixin', '__setupPuppetEvents() puppet.on(ready)')

              // ready event should be emitted 15s after login
              let onceLogout: () => void
              let timeout: ReturnType<typeof setTimeout> // 'NodeJS' is not defined.
              const future = new Promise((resolve, reject) => {
                onceLogout = () => {
                  reject(new Error('puppet logout!'))
                }
                puppet.once('logout', onceLogout)
                timeout = setTimeout(() => {
                  reject(new Error('waiting for login timeout'))
                }, 60 * 1000)
                void this.__loginIndicator.ready(true).then(resolve)
              }).finally(() => {
                puppet.off('logout', onceLogout)
                clearTimeout(timeout)
              })

              try {
                await future
                await new Promise(resolve => {
                  setTimeout(resolve, 15 * 1000)
                })
                if (this.__loginIndicator.value()) {
                  this.emit('ready')
                  this.__readyState.active(true)
                }
              } catch (e) {
                log.error(`ready error: ${(e as Error).message}, will emit event anyway if it's logged in now`)
                if (this.puppet.isLoggedIn) {
                  this.emit('ready')
                  this.__loginIndicator.value(true)
                  this.__readyState.active(true)
                }
              }
            })
            break

          case 'room-invite':
            puppet.on('room-invite', async payload => {
              const roomInvitation = this.RoomInvitation.load(payload.roomInvitationId)
              this.emit('room-invite', roomInvitation)
            })
            break

          case 'room-join':
            puppet.on('room-join', async payload => {
              try {
                const room = await this.Room.find({ id: payload.roomId })
                if (!room) {
                  throw new Error('no room found for id: ' + payload.roomId)
                }
                await room.sync()

                const inviteeListAll = await Promise.all(
                  payload.inviteeIdList.map(id => this.Contact.find({ id })),
                )
                const inviteeList = inviteeListAll.filter(c => !!c) as ContactInterface[]

                const inviter = await this.Contact.find({ id: payload.inviterId })
                if (!inviter) {
                  throw new Error('no inviter found for id: ' + payload.inviterId)
                }

                const date = timestampToDate(payload.timestamp)

                this.emit('room-join', room, inviteeList, inviter, date)
                room.emit('join', inviteeList, inviter, date)
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'room-leave':
            puppet.on('room-leave', async payload => {
              try {
                const room = await this.Room.find({ id: payload.roomId })
                if (!room) {
                  throw new Error('no room found for id: ' + payload.roomId)
                }

                /**
                 * See: https://github.com/wechaty/wechaty/pull/1833
                 */
                await room.sync()

                const leaverListAll = await Promise.all(
                  payload.removeeIdList.map(id => this.Contact.find({ id })),
                )
                const leaverList = leaverListAll.filter(c => !!c) as ContactInterface[]

                const remover = await this.Contact.find({ id: payload.removerId })
                if (!remover) {
                  throw new Error('no remover found for id: ' + payload.removerId)
                }
                const date = timestampToDate(payload.timestamp)

                this.emit('room-leave', room, leaverList, remover, date)
                room.emit('leave', leaverList, remover, date)

                // issue #254
                if (payload.removeeIdList.includes(puppet.currentUserId)) {
                  await puppet.roomPayloadDirty(payload.roomId)
                  await puppet.roomMemberPayloadDirty(payload.roomId)
                }
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'room-topic':
            puppet.on('room-topic', async payload => {
              try {
                const room = await this.Room.find({ id: payload.roomId })
                if (!room) {
                  throw new Error('no room found for id: ' + payload.roomId)
                }
                await room.sync()

                const changer = await this.Contact.find({ id: payload.changerId })
                if (!changer) {
                  throw new Error('no changer found for id: ' + payload.changerId)
                }
                const date = timestampToDate(payload.timestamp)

                this.emit('room-topic', room, payload.newTopic, payload.oldTopic, changer, date)
                room.emit('topic', payload.newTopic, payload.oldTopic, changer, date)
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'room-announce':
            puppet.on('room-announce', async payload => {
              try {
                const room = await this.Room.find({ id: payload.roomId })
                if (!room) {
                  throw new Error('no room found for id: ' + payload.roomId)
                }

                await room.sync()
                let changer: ContactInterface | undefined
                try {
                  if (payload.changerId) {
                    changer = await this.Contact.find({ id: payload.changerId })
                  }
                } catch (e) {
                  log.warn('room-announce', 'room-announce event error: %s', (e as Error).message)
                }
                const date = timestampToDate(payload.timestamp)
                this.emit('room-announce', room, payload.newAnnounce, changer, payload.oldAnnounce, date)
                room.emit('announce', payload.newAnnounce, changer, payload.oldAnnounce, date)
              }  catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'scan':
            puppet.on('scan', async payload => {
              this.__readyState.inactive(true)
              const date = timestampToDate(payload.createTimestamp || payload.timestamp || 0)
              const expireDate = payload.expireTimestamp ? timestampToDate(payload.expireTimestamp) : undefined
              this.emit('scan', payload.qrcode || '', payload.status, payload.data || '', payload.type || ScanType.Unknown, date, expireDate)
            })
            break

          case 'tag':
            puppet.on('tag', async payload => {
              const date = timestampToDate(payload.timestamp)
              switch (payload.type) {
                case PUPPET.types.TagEvent.TagCreate: {
                  const newTagPromises = payload.idList.map(id => this.Tag.find({ id }))
                  const newTags = await Promise.all(newTagPromises)
                  this.emit('tag', payload.type, newTags, date)
                  break
                }
                case PUPPET.types.TagEvent.TagDelete: {
                  const deletedTagPromises = payload.idList.map(id => this.Tag.find({ id }))
                  const deletedTags = await Promise.all(deletedTagPromises)
                  this.emit('tag', payload.type, deletedTags, date)
                  // TODO: bind tag-delete to tag instance
                  break
                }
                case PUPPET.types.TagEvent.TagRename: {
                  const renamedTagPromises = payload.idList.map(id => this.Tag.find({ id }))
                  const renamedTags = (await Promise.all(renamedTagPromises)).filter(tag => !!tag) as TagInterface[]
                  await Promise.all(renamedTags.map(async tag => {
                    const oldName = tag.name()
                    const result = await checkUntilChanged(PUPPET_PAYLOAD_SYNC_GAP, PUPPET_PAYLOAD_SYNC_MAX_RETRY, async () => {
                      await tag.sync()
                      return tag.name() === oldName
                    })
                    if (!result) {
                      log.warn('WechatyPuppetMixin', 'tagRenameEvent still get old name after %s retries for tag %s', PUPPET_PAYLOAD_SYNC_MAX_RETRY, tag.id)
                    }
                  }))
                  this.emit('tag', payload.type, renamedTags, date)
                  // TODO: bind tag-rename to tag instance
                  break
                }
                default:
                  throw new Error('tagEventType ' + payload.type + ' unsupported!')
              }
            })
            break

          case 'tag-group':
            puppet.on('tag-group', async payload => {
              const date = timestampToDate(payload.timestamp)
              switch (payload.type) {
                case PUPPET.types.TagGroupEvent.TagGroupCreate: {
                  const newTagGroupPromises = payload.idList.map(id =>
                    this.TagGroup.find({ id }),
                  )
                  const newTagGroups = await Promise.all(newTagGroupPromises)
                  this.emit('tag-group', payload.type, newTagGroups, date)
                  break
                }
                case PUPPET.types.TagGroupEvent.TagGroupDelete: {
                  const deletedTagGroupPromises = payload.idList.map(id =>
                    this.TagGroup.find({ id }),
                  )
                  const deletedTagGroups = await Promise.all(deletedTagGroupPromises)
                  this.emit('tag-group', payload.type, deletedTagGroups, date)
                  break
                  // TODO: bind tagGroup-delete to tagGroup instance
                }
                case PUPPET.types.TagGroupEvent.TagGroupRename: {
                  const renamedTagGroupPromises = payload.idList.map(id =>
                    this.TagGroup.find({ id }),
                  )
                  const renamedTagGroups = (await Promise.all(renamedTagGroupPromises)) as TagGroupInterface[]
                  await Promise.all(renamedTagGroups.map(async tagGroup => {
                    const oldName = tagGroup.name()
                    const result = await checkUntilChanged(PUPPET_PAYLOAD_SYNC_GAP, PUPPET_PAYLOAD_SYNC_MAX_RETRY, async () => {
                      await tagGroup.sync()
                      return tagGroup.name() === oldName
                    })
                    if (!result) {
                      log.warn('WechatyPuppetMixin', 'tagGroupRenameEvent still get old name after %s retries for tagGroup %s', PUPPET_PAYLOAD_SYNC_MAX_RETRY, tagGroup.id)
                    }
                  }))
                  this.emit('tag-group', payload.type, renamedTagGroups, date)
                  // TODO: bind tagGroup-rename to tagGroup instance
                  break
                }
                default:
                  throw new Error('tagGroupEventType ' + payload.type + ' unsupported!')
              }

            })
            break

          case 'verify-code':
            puppet.on('verify-code', (payload) => {
              this.emit('verify-code', payload.id, payload.message || '', payload.scene || PUPPET.types.VerifyCodeScene.UNKNOWN, payload.status || PUPPET.types.VerifyCodeStatus.UNKNOWN)
            })
            break

          case 'reset':
            // Do not propagation `reset` event from puppet
            break

          case 'dirty':
            /**
             * https://github.com/wechaty/wechaty-puppet-service/issues/43
             */
            puppet.on('dirty', async ({ payloadType, payloadId }) => {
              try {
                switch (payloadType) {
                  case PUPPET.types.Payload.Contact: {
                    const contact = await this.Contact.find({ id: payloadId }) as unknown as undefined | ContactImpl
                    await contact?.ready(true)
                    break
                  }
                  case PUPPET.types.Payload.Room: {
                    const room = await this.Room.find({ id: payloadId })  as unknown as undefined | RoomImpl
                    await room?.ready(true)
                    break
                  }
                  case PUPPET.types.Payload.RoomMember: {
                    if (payloadId.includes(PUPPET.STRING_SPLITTER)) {
                      break
                    }
                    const room = await this.Room.find({ id: payloadId }) as unknown as undefined | RoomImpl
                    await room?.ready()
                    break
                  }

                  /**
                   * Huan(202008): noop for the following
                   */
                  case PUPPET.types.Payload.Friendship:
                    // Friendship has no payload
                    break
                  case PUPPET.types.Payload.Message: {
                    // Message does not need to dirty (?)
                    const message = await this.Message.find({ id: payloadId }) as unknown as undefined | MessageImpl
                    await message?.ready(true)
                    break
                  }
                  case PUPPET.types.Payload.Tag:
                    break
                  case PUPPET.types.Payload.TagGroup:
                    break
                  case PUPPET.types.Payload.Post:
                    break

                  case PUPPET.types.Payload.Unspecified:
                  default:
                    log.warn('unknown payload type: ' + payloadType)
                }
                this.emit('dirty', payloadId, payloadType)
              } catch (e) {
                this.emit('error', GError.from(e))
              }
            })
            break

          case 'login-url':
            puppet.on('login-url', (payload) => {
              this.emit('login-url', payload.url)
            })
            break

          default:
            /**
             * Check: The eventName here should have the type `never`
             */
            throw new Error('eventName ' + eventName + ' unsupported!')

        }
      }

      log.verbose('WechatyPuppetMixin', '__setupPuppetEvents() ... done')
    }

  }

  return PuppetMixin
}

type PuppetMixin = ReturnType<typeof puppetMixin>

type ProtectedPropertyPuppetMixin =
  | '__puppet'
  | '__readyState'
  | '__setupPuppetEvents'
  | '__loginIndicator'

export type {
  PuppetMixin,
  ProtectedPropertyPuppetMixin,
}
export {
  puppetMixin,
}
