import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify-ana-answers.mjs', import.meta.url));
const TOKEN = 'synthetic-local-probe-token';
const text = { type: 'text', content: 'Synthetic protocol-only answer.' };
const done = { type: 'done', provider: 'openai', model: 'gpt-4o-mini',
  stoppedReason: 'no_more_tools', usage: { inputTokens: 4, outputTokens: 4 } };

/** Real child CLI and HTTP/SSE transport; never a provider or deployed app. */
async function probe(events, args = [], env = {}, options = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    requests.push({ path: req.url, authorization: req.headers.authorization,
      body: raw ? JSON.parse(raw) : null });
    if (req.url === '/api/auth/dev-login') {
      if (options.hangAuthHeaders) return;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (options.hangAuthBody) { res.flushHeaders(); return; }
      res.end(JSON.stringify({ accessToken: TOKEN })); return;
    }
    if (req.url === '/api/ana-ri/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')); return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const timeoutArgs = args.includes('--timeout-ms') ? [] : ['--timeout-ms', '2000'];
    const result = await new Promise(resolve => execFile(process.execPath,
      [script, '--base-url', base, ...timeoutArgs, ...args], {
        env: { PATH: process.env.PATH, NODE_ENV: 'test', ANA_VERIFY_TOKEN: TOKEN, ...env },
        encoding: 'utf8', timeout: options.childTimeoutMs ?? 5000,
      }, (error, stdout, stderr) => resolve({ code: error ? (error.code ?? error.signal ?? 1) : 0, stdout, stderr })));
    assert.equal((result.stdout + result.stderr).includes(TOKEN), false, 'authentication must not be printed');
    return { ...result, requests };
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('a complete current OpenAI receipt and answer pass the existing live check', async () => {
  const run = await probe([text, done], ['--require-live', '--expect-provider', 'openai']);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /OUTCOME: LIVE/);
  assert.match(run.stdout, /openai \/ gpt-4o-mini/);
  assert.equal(run.requests[0].authorization, `Bearer ${TOKEN}`);
});

test('a real provider receipt is not made a fixture by words about demo mode', async () => {
  const run = await probe([{ ...text, content: 'This is not demo mode.' }, done], ['--require-live']);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /OUTCOME: LIVE/);
});

test('text alone is not proof that a provider completed the turn', async () => {
  const run = await probe([text], ['--require-live']);
  assert.equal(run.code, 1, run.stdout);
  assert.match(run.stdout, /OUTCOME: UNVERIFIED/);
});

for (const [label, receipt] of [
  ['missing provider', { ...done, provider: undefined }],
  ['missing model', { ...done, model: undefined }],
  ['blank model', { ...done, model: '  ' }],
  ['non-string provider', { ...done, provider: 42 }],
  ['missing completion reason', { ...done, stoppedReason: undefined }],
  ['interview shortcut', { type: 'done', latencyMs: 1 }],
  ['stop-only receipt', { type: 'done', stoppedReason: 'cancelled', rounds: 1 }],
]) {
  test(`${label} cannot establish a completed live answer`, async () => {
    const run = await probe([text, receipt], ['--require-live']);
    assert.equal(run.code, 1, run.stdout);
    assert.match(run.stdout, /OUTCOME: UNVERIFIED/);
  });
}

for (const reason of ['answer_cut_off', 'cancelled', 'budget_exhausted']) {
  test(`a ${reason} turn with text and model metadata is not complete`, async () => {
    const run = await probe([text, { ...done, stoppedReason: reason }], ['--require-live']);
    assert.equal(run.code, 1, run.stdout);
    assert.match(run.stdout, /OUTCOME: UNVERIFIED/);
  });
}

test('contradictory terminal receipts do not certify the first provider', async () => {
  const run = await probe([text, done, { ...done, provider: 'anthropic' }], ['--require-live']);
  assert.equal(run.code, 1, run.stdout);
  assert.match(run.stdout, /OUTCOME: UNVERIFIED/);
});

test('a live answer from a different provider fails an explicit OpenAI expectation', async () => {
  const run = await probe([text, { ...done, provider: 'anthropic', model: 'existing-claude-model' }],
    ['--require-live', '--expect-provider', 'openai']);
  assert.equal(run.code, 1, run.stdout);
  assert.match(run.stdout, /OUTCOME: UNVERIFIED/);
});

test('the existing optional fixture mode remains available without claiming LIVE', async () => {
  const run = await probe([text, { type: 'done', model: 'demo-mode', provider: 'demo' }]);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /OUTCOME: FIXTURES/);
});

test('require-live continues to reject deterministic fixtures', async () => {
  const run = await probe([text, { type: 'done', model: 'demo-mode', deterministic: true }], ['--require-live']);
  assert.equal(run.code, 1, run.stdout);
  assert.match(run.stdout, /OUTCOME: FIXTURES/);
});

test('expect-provider alone cannot be satisfied by fixtures', async () => {
  const run = await probe([text, { type: 'done', model: 'demo-mode', provider: 'demo' }], ['--expect-provider', 'openai']);
  assert.equal(run.code, 1, run.stdout);
});

test('the existing silent-answer check still refuses an empty completed stream', async () => {
  const run = await probe([done], ['--require-live']);
  assert.equal(run.code, 1, run.stdout);
  assert.match(run.stdout, /OUTCOME: SILENT/);
});

test('an explicit stream error still refuses an otherwise plausible answer', async () => {
  const run = await probe([text, done, { type: 'error', message: 'Synthetic refusal' }], ['--require-live']);
  assert.equal(run.code, 1, run.stdout);
  assert.match(run.stdout, /OUTCOME: UNREACHABLE/);
});

for (const phase of ['hangAuthHeaders', 'hangAuthBody']) {
  test(`the existing timeout also bounds ${phase}`, async () => {
    const run = await probe([text, done], ['--timeout-ms', '100'], { ANA_VERIFY_TOKEN: '' }, { [phase]: true, childTimeoutMs: 1500 });
    assert.equal(run.code, 1, run.stdout + run.stderr);
    assert.match(run.stderr, /OUTCOME: UNREACHABLE/);
    assert.equal(run.requests.length, 1);
    assert.equal(run.requests[0].path, '/api/auth/dev-login');
  });
}

test('model and project options use only the existing admitted request fields', async () => {
  const project = '11111111-2222-4333-8444-555555555555';
  const run = await probe([text, done], ['--model', 'gpt-4o-mini', '--project-id', project,
    '--expect-provider', 'openai', '--question', 'Return the synthetic fixture answer.']);
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(run.requests[0].body, { message: 'Return the synthetic fixture answer.',
    model_override: 'gpt-4o-mini', project_id: project });
});

for (const option of ['--model', '--project-id', '--expect-provider']) {
  test(`${option} without a value is refused before authentication or traffic`, async () => {
    const run = await probe([text, done], [option], { ANA_VERIFY_TOKEN: '' });
    assert.equal(run.code, 1, run.stdout);
    assert.equal(run.requests.length, 0);
  });
}

for (const [label, args, env, email] of [
  ['explicit identity', ['--email', 'explicit@example.test'], { ANA_VERIFY_EMAIL: 'env@example.test', VITE_DEV_LOGIN_EMAIL: 'dev@example.test' }, 'explicit@example.test'],
  ['verification identity', [], { ANA_VERIFY_EMAIL: 'verify@example.test', VITE_DEV_LOGIN_EMAIL: 'dev@example.test' }, 'verify@example.test'],
  ['configured dev identity', [], { VITE_DEV_LOGIN_EMAIL: 'dev@example.test', DEMO_AUTHOR_EMAIL: 'author@example.test' }, 'dev@example.test'],
  ['configured demo author', [], { DEMO_AUTHOR_EMAIL: 'author@example.test' }, 'author@example.test'],
  ['legacy identity fallback', [], {}, 'raj.patel@concept2cure.pro'],
]) {
  test(`the ${label} is used for the existing dev-login path`, async () => {
    const run = await probe([text, done], args, { ANA_VERIFY_TOKEN: '', ...env });
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.requests[0].path, '/api/auth/dev-login');
    assert.equal(run.requests[0].body.email, email);
  });
}
