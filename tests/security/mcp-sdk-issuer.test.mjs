import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchToken } from '@modelcontextprotocol/sdk/client/auth.js';

// Exercise the installed dependency, not a mock of its issuer guard.
const issuer = 'https://trusted.example/';
function provider() {
  return {
    clientMetadata: {},
    clientInformation: () => ({ client_id: 'client', client_secret: 'synthetic-secret', issuer }),
    prepareTokenRequest: () => new URLSearchParams({ grant_type: 'client_credentials' }),
  };
}

test('OAuth credentials never reach a different authorization server', async () => {
  let requests = 0;
  await assert.rejects(fetchToken(provider(), new URL('https://untrusted.example/'), {
    fetchFn: async () => { requests++; throw new Error('credential egress'); },
  }), /bound to authorization server/);
  assert.equal(requests, 0);
});

test('credentials still work with their bound authorization server', async () => {
  let requests = 0;
  const tokens = await fetchToken(provider(), new URL(issuer), {
    metadata: { token_endpoint: `${issuer}token`, token_endpoint_auth_methods_supported: ['client_secret_post'] },
    fetchFn: async (url, init) => {
      requests++;
      assert.equal(String(url), `${issuer}token`);
      assert.equal(new URLSearchParams(init.body).get('client_secret'), 'synthetic-secret');
      return new Response(JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(requests, 1);
  assert.equal(tokens.access_token, 'synthetic-token');
});
