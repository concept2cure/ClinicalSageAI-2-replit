/**
 * A connector search runs on the calling organization's own credentials.
 *
 * The registry kept one instance per connector for every tenant and wrote the
 * caller's credentials onto it, and Google Drive, Box and OneDrive skip the
 * token refresh while a cached token is valid. So organization B's search,
 * within the hour of organization A's, went out with A's access token — B
 * searching A's Drive — and two tenants' concurrent calls shared one
 * instance's fields. The store and the providers are stubbed; the registry,
 * the connectors and the credential encryption are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'crypto';

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  query: vi.fn(),
  requests: [] as Array<{ url: string; auth: string | undefined }>,
}));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));

import { searchConnectors, storeCredentials } from '../connector-registry.js';

const privateKey = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const realFetch = globalThis.fetch;

beforeEach(() => {
  h.store.clear();
  h.requests.length = 0;
  h.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/INSERT INTO connector_credentials/.test(sql)) {
      h.store.set(`${params[0]}:${params[1]}`, params[2] as string);
      return { rows: [] };
    }
    if (/SELECT credentials FROM connector_credentials/.test(sql)) {
      const v = h.store.get(`${params[0]}:${params[1]}`);
      return { rows: v ? [{ credentials: v }] : [] };
    }
    return { rows: [] };
  });
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const body = new URLSearchParams(String(init?.body ?? ''));
    if (url === 'https://oauth2.googleapis.com/token') {
      const iss = JSON.parse(Buffer.from(body.get('assertion')!.split('.')[1], 'base64url').toString()).iss;
      return json({ access_token: `drive-token-${iss}`, expires_in: 3600 });
    }
    if (url === 'https://api.box.com/oauth2/token') {
      return json({ access_token: `box-token-${body.get('client_id')}`, expires_in: 3600 });
    }
    h.requests.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    return json(url.includes('box.com') ? { entries: [] } : { files: [] });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const search = (org: number, connector: string) => searchConnectors(org, [connector], { keywords: ['protocol'] });

describe('a credentialed connector searches with the caller\'s credentials', () => {
  it('Google Drive: organization B, right after A, searches with its own token', async () => {
    await storeCredentials(1, 'google_drive', { clientId: 'svc-a@a.iam', clientSecret: privateKey() });
    await storeCredentials(2, 'google_drive', { clientId: 'svc-b@b.iam', clientSecret: privateKey() });

    const [a] = await search(1, 'google_drive');
    const [b] = await search(2, 'google_drive');

    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(h.requests.map((r) => r.auth)).toEqual(['Bearer drive-token-svc-a@a.iam', 'Bearer drive-token-svc-b@b.iam']);
  });

  it('Box: the same, organization by organization', async () => {
    await storeCredentials(1, 'box', { clientId: 'box-a', clientSecret: 's-a', baseUrl: '111' });
    await storeCredentials(2, 'box', { clientId: 'box-b', clientSecret: 's-b', baseUrl: '222' });

    await search(1, 'box');
    await search(2, 'box');

    expect(h.requests.map((r) => r.auth)).toEqual(['Bearer box-token-box-a', 'Bearer box-token-box-b']);
  });

  it('two organizations searching at once each use their own token', async () => {
    await storeCredentials(1, 'box', { clientId: 'box-a', clientSecret: 's-a', baseUrl: '111' });
    await storeCredentials(2, 'box', { clientId: 'box-b', clientSecret: 's-b', baseUrl: '222' });

    await Promise.all([search(1, 'box'), search(2, 'box'), search(1, 'box'), search(2, 'box')]);

    expect(h.requests.map((r) => r.auth).sort()).toEqual([
      'Bearer box-token-box-a',
      'Bearer box-token-box-a',
      'Bearer box-token-box-b',
      'Bearer box-token-box-b',
    ]);
  });

  it('an organization with no credentials gets no search, even after another authenticated', async () => {
    await storeCredentials(1, 'google_drive', { clientId: 'svc-a@a.iam', clientSecret: privateKey() });
    await search(1, 'google_drive');
    const [c] = await search(3, 'google_drive');
    expect(c.error).toMatch(/not available or not configured/);
    expect(h.requests).toHaveLength(1);
  });
});
