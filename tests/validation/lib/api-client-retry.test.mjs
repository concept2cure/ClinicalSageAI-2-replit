/** Real shared client and native Request serialization; no network or sleeps. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from './harness.mjs';

function setup(t, statuses) {
  const attempts = [], waits = [], records = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    waits.push(delay); globalThis.queueMicrotask(() => callback(...args)); return 0;
  });
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const request = new Request(url, options);
    const headers = Object.fromEntries(request.headers);
    const body = options.body instanceof FormData ? await request.formData() : await request.text();
    attempts.push({ url, headers, body, originalBody: options.body });
    return new Response('{"synthetic":true}', { status: statuses[Math.min(attempts.length - 1, statuses.length - 1)],
      headers: { 'content-type': 'application/json', 'retry-after': '1' } });
  });
  return { attempts, waits, records, api: createApiClient({ baseUrl: 'https://synthetic.invalid',
    accessToken: 'synthetic-test-token', onRecord: record => records.push(record) }) };
}
const multipart = () => {
  const form = new FormData(); form.append('programId', 'synthetic-program');
  form.append('file', new Blob([new Uint8Array([0, 1, 254, 255])], { type: 'application/octet-stream' }), 'synthetic-source.bin');
  return form;
};

test('multipart HTTP429 retries a fresh Request with identical fields, filename, bytes and auth', async t => {
  const state = setup(t, [429, 201]); const form = multipart();
  const result = await state.api('POST', '/api/vault/ingest', form);
  assert.equal(result.status, 201); assert.equal(state.attempts.length, 2); assert.equal(result.retries, 1);
  for (const attempt of state.attempts) {
    assert.equal(attempt.originalBody, form);
    assert.equal(attempt.headers.authorization, 'Bearer synthetic-test-token');
    assert.equal(attempt.headers.origin, 'https://synthetic.invalid');
    assert.equal(attempt.headers.accept, 'application/json');
    assert.match(attempt.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.equal(attempt.body.get('programId'), 'synthetic-program');
    const file = attempt.body.get('file');
    assert.equal(file.name, 'synthetic-source.bin'); assert.equal(file.type, 'application/octet-stream');
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [0, 1, 254, 255]);
  }
  assert.equal(state.records[0].response.rateLimitRetries, 1);
  assert.ok(state.waits.includes(1500), 'existing Retry-After wait retained without sleeping');
});
test('multipart retries remain bounded at six after the initial request', async t => {
  const state = setup(t, [429]); const result = await state.api('POST', '/api/vault/ingest', multipart());
  assert.equal(result.status, 429); assert.equal(result.retries, 6); assert.equal(state.attempts.length, 7);
  assert.equal(state.records[0].response.rateLimitRetries, 6);
});
for (const status of [201, 403, 503]) {
  test(`multipart HTTP${status} makes one attempt`, async t => {
    const state = setup(t, [status]); const result = await state.api('POST', '/api/vault/ingest', multipart());
    assert.equal(result.status, status); assert.equal(result.retries, 0); assert.equal(state.attempts.length, 1);
  });
}
test('existing JSON HTTP429 retry and content headers remain intact', async t => {
  const state = setup(t, [429, 201]); const result = await state.api('POST', '/api/tasks/tasks', { title: 'Synthetic task' });
  assert.equal(result.status, 201); assert.equal(state.attempts.length, 2);
  for (const attempt of state.attempts) {
    assert.equal(attempt.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(attempt.body), { title: 'Synthetic task' });
  }
});
