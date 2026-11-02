import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestJournal } from '../../tests/e2e/fixtures/requestJournal.ts';

void test('redacts secret-shaped values from JSON form raw strings and buffers', () => {
  const journal = createRequestJournal();
  const sentinel = ['OAUTH_CLIENT', 'SECRET', 'SENTINEL', 'journal'].join('_');
  const basic = `Basic ${Buffer.from(`client:${sentinel}`).toString('base64')}`;
  const bearer = 'Bearer eyJmaXh0dXJl.eyJqb3VybmFsIjp0cnVlfQ.signature';

  journal.record({
    handlerId: 'journal-contract',
    request: {
      method: 'POST',
      path: '/contract',
      query: {},
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientSecret: sentinel, access_token: sentinel, safe: 'visible' }),
    },
    response: {
      status: 200,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: Buffer.from(
        new URLSearchParams({ client_secret: sentinel, access_token: sentinel, safe: 'visible' }).toString()
      ),
    },
  });
  journal.record({
    handlerId: 'raw-contract',
    request: { method: 'POST', path: '/raw', query: {}, headers: {}, body: `${basic}\n${bearer}` },
  });

  const attachment = JSON.stringify(journal.entries);
  assert.equal(attachment.includes(sentinel), false);
  assert.equal(attachment.includes(basic), false);
  assert.equal(attachment.includes(bearer), false);
  assert.match(attachment, /\[REDACTED\]/);
  assert.match(attachment, /visible/);
});

void test('scrubs runtime credential prefixes and sentinels from headers queries malformed buffers and errors', () => {
  const journal = createRequestJournal();
  const runtimeCredential = ['epc', 'secret', 'v1', 'journal', 'runtime'].join('_');
  const sentinel = ['OAUTH_CLIENT', 'CREDENTIAL', 'SENTINEL', 'error'].join('_');

  journal.record({
    handlerId: 'runtime-scrub-contract',
    request: {
      method: 'POST',
      path: '/contract',
      query: { safe: [runtimeCredential] },
      headers: { 'x-debug-value': sentinel, 'content-type': 'application/octet-stream' },
      body: Buffer.from(`malformed-prefix=${runtimeCredential}\u0000${sentinel}`),
    },
    response: {
      status: 500,
      headers: { 'x-runtime-debug': runtimeCredential },
      body: JSON.stringify({ safeField: sentinel }),
    },
    error: `handler rejected ${runtimeCredential} after ${sentinel}`,
  });

  const attachment = JSON.stringify(journal.entries);
  assert.equal(attachment.includes(runtimeCredential), false);
  assert.equal(attachment.includes(sentinel), false);
  assert.match(attachment, /\[REDACTED\]/);
});
