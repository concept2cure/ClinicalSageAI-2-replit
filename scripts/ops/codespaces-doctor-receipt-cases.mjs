// Imported by codespaces-doctor.test.mjs, preserving the existing npm test command.
// All provider requests use injected fixtures or loopback HTTP; no real API key/call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkOpenAI, checkAnthropic, checkAnthropicDrafting, runCodespacesDoctor } from './codespaces-doctor.mjs';

const env = { OPENAI_API_KEY: 'synthetic-fixture-only',
  APP_DATABASE_URL: 'postgresql://app_service@localhost/fixture', RLS_ENFORCE: 'on',
  JWT_SECRET: 'synthetic_fixture_only_signing_value_123456789' };
const draftingCall = { env: { ANTHROPIC_API_KEY: 'synthetic-fixture-only' }, models: ['claude-opus-5-5', 'claude-opus-5'] };

const openAIReply = (model = 'gpt-4o-mini') => ({ id: 'resp_synthetic', object: 'response',
  model, status: 'completed', error: null, incomplete_details: null,
  output: [{ id: 'msg_synthetic', type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'OK.', annotations: [] }] }] });
const anthropicReply = (model = 'claude-opus-5-5') => ({ id: 'msg_synthetic', type: 'message',
  model, role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK.' }] });

const providerProbes = {
  'OpenAI authentication': (fetcher, timeoutMs) => checkOpenAI({ env, fetcher, timeoutMs }),
  'OpenAI usage': (fetcher, timeoutMs) => checkOpenAI({ env, fetcher, timeoutMs, probeUsage: true }),
  'Anthropic discovery': (fetcher, timeoutMs) => checkAnthropic({ ...draftingCall, fetcher, timeoutMs }),
  'Anthropic usage': (fetcher, timeoutMs) => checkAnthropicDrafting({ ...draftingCall, fetcher, timeoutMs }),
};

for (const [name, probe] of Object.entries(providerProbes)) {
  test(`${name} cannot pass an unreadable HTTP 200 JSON body`, async () => {
    const result = await probe(async () => new Response('<html>private-upstream-marker</html>', { status: 200 }));
    assert.equal(result.status, 'blocked');
    assert.equal(result.authenticationVerified, false);
    assert.equal(result.billingVerified, false);
    assert.doesNotMatch(JSON.stringify(result), /private-upstream-marker/);
  });
  for (const partial of ['', '{"id":']) {
    test(`${name} refuses a body timeout after ${partial ? 'partial JSON' : 'headers'}`, { timeout: 3000 }, async () => {
      let readingBody = false;
      const server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.flushHeaders();
        if (partial) res.write(partial);
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const fetcher = async (_url, options) => {
          const response = await fetch(`http://127.0.0.1:${server.address().port}`, options);
          return { ok: response.ok, status: response.status,
            json: () => { readingBody = true; return response.json(); } };
        };
        const result = await probe(fetcher, 150);
        assert.equal(readingBody, true, 'the fixture must reach body reading, beyond headers');
        assert.equal(result.status, 'blocked');
        assert.match(result.code, /NETWORK_TIMEOUT$/);
        assert.equal(result.authenticationVerified, false);
        assert.equal(result.billingVerified, false);
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    });
  }
}

for (const [label, body] of [
  ['unrelated model list', { data: [] }],
  ['null receipt', null],
  ['empty object', {}],
  ['error envelope', { error: { message: 'private-upstream-marker' } }],
  ['empty output', { ...openAIReply(), output: [] }],
  ['failed generation', { ...openAIReply(), status: 'failed' }],
  ['incomplete generation', { ...openAIReply(), status: 'incomplete' }],
  ['contradictory error', { ...openAIReply(), error: { message: 'private-upstream-marker' } }],
  ['contradictory incomplete details', { ...openAIReply(), incomplete_details: { reason: 'max_output_tokens' } }],
  ['missing response identifier', { ...openAIReply(), id: '' }],
  ['different served model', openAIReply('gpt-4o')],
  ['unfinished message', { ...openAIReply(), output: [{ ...openAIReply().output[0], status: 'incomplete' }] }],
  ['wrong message role', { ...openAIReply(), output: [{ ...openAIReply().output[0], role: 'user' }] }],
  ['blank text', { ...openAIReply(), output: [{ ...openAIReply().output[0], content: [{ type: 'output_text', text: '  ' }] }] }],
  ['non-string text', { ...openAIReply(), output: [{ ...openAIReply().output[0], content: [{ type: 'output_text', text: 42 }] }] }],
  ['refusal only', { ...openAIReply(), output: [{ ...openAIReply().output[0], content: [{ type: 'refusal', refusal: 'Declined.' }] }] }],
]) {
  test(`OpenAI usage cannot be certified by ${label}`, async () => {
    const result = await checkOpenAI({ env, probeUsage: true,
      fetcher: async () => ({ ok: true, status: 200, json: async () => body }) });
    assert.equal(result.status, 'blocked');
    assert.equal(result.code, 'OPENAI_RESPONSE_UNVERIFIED');
    assert.equal(result.billingVerified, false);
    assert.doesNotMatch(JSON.stringify(result), /private-upstream-marker/);
  });
}

for (const [label, body] of [
  ['null receipt', null],
  ['empty object', {}],
  ['error envelope', { type: 'error', error: { message: 'private-upstream-marker' } }],
  ['missing identifier', { ...anthropicReply(), id: '' }],
  ['wrong message role', { ...anthropicReply(), role: 'user' }],
  ['different served model', anthropicReply('claude-opus-4-8')],
  ['empty content', { ...anthropicReply(), content: [] }],
  ['blank text', { ...anthropicReply(), content: [{ type: 'text', text: ' ' }] }],
  ['non-string text', { ...anthropicReply(), content: [{ type: 'text', text: { value: 'OK' } }] }],
  ...['max_tokens', 'tool_use', 'pause_turn', 'refusal', null].map(stop_reason =>
    [`unfinished/refused turn ${stop_reason}`, { ...anthropicReply(), stop_reason }]),
]) {
  test(`Anthropic usage cannot be certified by ${label}`, async () => {
    const result = await checkAnthropicDrafting({ ...draftingCall,
      fetcher: async () => ({ ok: true, status: 200, json: async () => body }) });
    assert.equal(result.status, 'blocked');
    assert.equal(result.code, 'ANTHROPIC_RESPONSE_UNVERIFIED');
    assert.equal(result.billingVerified, false);
    assert.doesNotMatch(JSON.stringify(result), /private-upstream-marker/);
  });
}

test('genuine readable reply receipts allow dated provider model versions without SDK convenience text', async () => {
  const openai = await checkOpenAI({ env, probeUsage: true,
    fetcher: async () => ({ ok: true, status: 200, json: async () => openAIReply('gpt-4o-mini-2024-07-18') }) });
  assert.equal(openai.status, 'passed');
  assert.equal(openai.billingVerified, true);
  const anthropic = await checkAnthropicDrafting({ ...draftingCall,
    fetcher: async () => ({ ok: true, status: 200, json: async () => anthropicReply('claude-opus-5-5-20261113') }) });
  assert.equal(anthropic.status, 'passed');
  assert.equal(anthropic.billingVerified, true);
});

test('malformed non-2xx bodies retain HTTP auth/rate-limit codes and the Anthropic 404 ladder', async () => {
  for (const [status, code] of [[401, 'OPENAI_KEY_INVALID'], [429, 'OPENAI_RATE_LIMIT']]) {
    const result = await checkOpenAI({ env, probeUsage: true,
      fetcher: async () => new Response('not-json', { status }) });
    assert.equal(result.code, code);
    assert.equal(result.status, 'blocked');
  }
  const asked = [];
  const result = await checkAnthropicDrafting({ ...draftingCall,
    fetcher: async (_url, options) => {
      const { model } = JSON.parse(options.body); asked.push(model);
      return asked.length === 1 ? new Response('not-json', { status: 404 })
        : { ok: true, status: 200, json: async () => anthropicReply(model) };
    } });
  assert.equal(result.status, 'passed');
  assert.deepEqual(asked, draftingCall.models);
  assert.deepEqual(result.modelsRefused, [draftingCall.models[0]]);
});

test('an invalid provider usage receipt refuses the full doctor prerequisites', async () => {
  const report = await runCodespacesDoctor({ env, args: ['--probe-openai-usage'],
    connectDb: async () => ({ ok: true, role: 'app_service', failures: [] }),
    fetcher: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }) });
  assert.equal(report.openai.status, 'blocked');
  assert.equal(report.prerequisitesVerified, false);
  assert.equal(report.ready, false);
});
