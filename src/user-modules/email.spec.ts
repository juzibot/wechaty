#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/**
 *   Wechaty Chatbot SDK - https://github.com/wechaty/wechaty
 *
 *   @copyright 2016 Huan LI (李卓桓) <https://github.com/huan>, and
 *                   Wechaty Contributors <https://github.com/wechaty>.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */
import { test } from 'tstest'
import type * as PUPPET from '@juzi/wechaty-puppet'
import { log } from '@juzi/wechaty-puppet'

import type { Wechaty } from '../mods/mod.js'

import { MessageImpl } from './message.js'
import { wechatifyUserModule } from './mod.js'
import { EmailImpl } from './email.js'

const wechaty = {
  log,
  puppet: {} as any,
} as any as Wechaty

const EmailTest = wechatifyUserModule(EmailImpl)(wechaty)

const PAYLOAD: PUPPET.payloads.Email = {
  attachments : [ { filename: 'report.pdf', contentType: 'application/pdf', size: 1024 } ],
  cc          : [ { address: 'cc@example.com' } ],
  from        : { address: 'alice@example.com', name: 'Alice' },
  html        : '<p>hello</p>',
  inReplyTo   : '<parent@example.com>',
  mimeMessageId : '<abc@example.com>',
  replyTo     : [ { address: 'reply@example.com' } ],
  subject     : 'Hello World',
  text        : 'hello',
  to          : [ { address: 'bob@example.com', name: 'Bob' } ],
}

test('Email getters expose the payload', async t => {
  const email = new EmailTest(PAYLOAD)

  t.equal(email.subject(),         PAYLOAD.subject,         'should expose subject')
  t.same(email.from(),             PAYLOAD.from,            'should expose from')
  t.same(email.to(),               PAYLOAD.to,              'should expose to')
  t.same(email.cc(),               PAYLOAD.cc,              'should expose cc')
  t.same(email.replyTo(),          PAYLOAD.replyTo,         'should expose replyTo')
  t.equal(email.text(),            PAYLOAD.text,            'should expose text')
  t.equal(email.html(),            PAYLOAD.html,            'should expose html')
  t.equal(email.mimeMessageId(),   PAYLOAD.mimeMessageId,   'should expose mimeMessageId')
  t.equal(email.inReplyTo(),       PAYLOAD.inReplyTo,       'should expose inReplyTo')
  t.same(email.attachments(),      PAYLOAD.attachments,     'should expose attachments metadata')
})

test('Email absent optional fields are undefined', async t => {
  const email = new EmailTest({
    from    : { address: 'alice@example.com' },
    subject : 'Bare',
    to      : [ { address: 'bob@example.com' } ],
  })

  t.equal(email.cc(),   undefined, 'should return undefined for absent cc')
  t.equal(email.bcc(),  undefined, 'should return undefined for absent bcc')
  t.equal(email.html(), undefined, 'should return undefined for absent html')
})

test('Email.valid()', async t => {
  const email = new EmailTest(PAYLOAD)
  t.ok(EmailImpl.valid(email), 'should pass the validation of EmailImpl')
  t.notOk(MessageImpl.valid(email), 'should not pass the validation of MessageImpl')
})
