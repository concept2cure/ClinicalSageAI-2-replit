/**
 * FDA ESG NextGen REST transport — the second transport option behind the one
 * SubmissionGateway interface (runbook B16, W5 2026-09-20).
 *
 * What is pinned: with `FDA_ESG_TRANSPORT=rest` the gateway resolves its REST
 * credentials from the environment (CredentialError naming each missing
 * variable), and then — because the platform holds no verified copy of FDA's
 * ESG NextGen API contract — refuses with the typed UnverifiedTransportError
 * BEFORE any transmittal row exists and BEFORE any socket opens. It never
 * pretends. An unrecognised transport value is refused too, rather than
 * quietly falling back to AS2. The AS2 path is untouched when the variable is
 * unset.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { poolQueries, httpsRequests } = vi.hoisted(() => ({
  poolQueries: [] as Array<{ sql: string; args: unknown[] }>,
  httpsRequests: [] as unknown[],
}));

vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string, args: unknown[] = []) => {
      poolQueries.push({ sql, args });
      if (sql.includes('INSERT INTO submission_transmittals')) return { rows: [{ id: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  },
}));

vi.mock('node:https', () => {
  const request = (options: unknown) => {
    httpsRequests.push(options);
    throw new Error('the REST adapter must not open a socket');
  };
  return { request, default: { request } };
});

import { FdaEsgGateway, resolveFdaEsgTransport, loadFdaRestCredentials } from '../fda-esg';
import { CredentialError, UnverifiedTransportError } from '../types';
import type { GatewayTransmitRequest } from '../types';

const ENV_KEYS = [
  'FDA_ESG_TRANSPORT', 'FDA_ESG_STAGING_TRANSPORT',
  'FDA_ESG_REST_URL', 'FDA_ESG_REST_CLIENT_ID', 'FDA_ESG_REST_CLIENT_SECRET', 'FDA_ESG_REST_SUBMITTER_ID',
  'FDA_ESG_STAGING_REST_URL', 'FDA_ESG_STAGING_REST_CLIENT_ID', 'FDA_ESG_STAGING_REST_CLIENT_SECRET', 'FDA_ESG_STAGING_REST_SUBMITTER_ID',
  'FDA_ESG_URL', 'FDA_ESG_AS2_FROM', 'FDA_ESG_CERT_PATH', 'FDA_ESG_KEY_PATH', 'FDA_ESG_FDA_CERT_PATH',
];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  poolQueries.length = 0;
  httpsRequests.length = 0;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

function request(): GatewayTransmitRequest {
  return {
    organizationId: 11, userId: 7, programId: null, packageId: 42,
    bundle: { path: '/nonexistent/pkg.zip', sha256: 'a'.repeat(64), sizeBytes: 10, format: 'estar' },
    authorization: { kind: 'governed-http', actorUserId: 7, reason: 'RA + QA sign-off complete', reauthVerifiedAt: new Date() },
    environment: 'production',
    submissionType: '510k',
  };
}

function configureRest(prefix = 'FDA_ESG_') {
  process.env[`${prefix}TRANSPORT`] = 'rest';
  process.env[`${prefix}REST_URL`] = 'https://esg-nextgen.fda.example/api';
  process.env[`${prefix}REST_CLIENT_ID`] = 'client-1';
  process.env[`${prefix}REST_CLIENT_SECRET`] = 'secret-1';
  process.env[`${prefix}REST_SUBMITTER_ID`] = 'ESG-SUBMITTER-1';
}

describe('resolveFdaEsgTransport', () => {
  it('defaults to AS2 when unset (every existing deployment)', () => {
    expect(resolveFdaEsgTransport('production')).toBe('as2');
    expect(resolveFdaEsgTransport('staging')).toBe('as2');
  });
  it('selects REST when asked, case-insensitively, per environment prefix', () => {
    process.env.FDA_ESG_TRANSPORT = 'REST';
    expect(resolveFdaEsgTransport('production')).toBe('rest');
    expect(resolveFdaEsgTransport('staging')).toBe('as2');
    process.env.FDA_ESG_STAGING_TRANSPORT = 'rest';
    expect(resolveFdaEsgTransport('staging')).toBe('rest');
  });
  it('refuses an unrecognised value instead of falling back to AS2 silently', () => {
    process.env.FDA_ESG_TRANSPORT = 'webtrader';
    const err = (() => { try { resolveFdaEsgTransport('production'); return null; } catch (e) { return e as CredentialError; } })();
    expect(err).toBeInstanceOf(CredentialError);
    expect(err!.missing[0]).toMatch(/FDA_ESG_TRANSPORT \(must be 'as2' or 'rest'; got 'webtrader'\)/);
  });
});

describe('loadFdaRestCredentials', () => {
  it('names every missing REST variable', () => {
    const err = (() => { try { loadFdaRestCredentials('production'); return null; } catch (e) { return e as CredentialError; } })();
    expect(err).toBeInstanceOf(CredentialError);
    expect(err!.missing).toEqual([
      'FDA_ESG_REST_URL', 'FDA_ESG_REST_CLIENT_ID', 'FDA_ESG_REST_CLIENT_SECRET', 'FDA_ESG_REST_SUBMITTER_ID',
    ]);
  });
  it('uses the staging prefix for staging', () => {
    const err = (() => { try { loadFdaRestCredentials('staging'); return null; } catch (e) { return e as CredentialError; } })();
    expect(err!.missing[0]).toBe('FDA_ESG_STAGING_REST_URL');
  });
});

describe('FdaEsgGateway with FDA_ESG_TRANSPORT=rest', () => {
  it('no credentials → CredentialError naming the REST variables; nothing inserted, no socket', async () => {
    process.env.FDA_ESG_TRANSPORT = 'rest';
    const gw = new FdaEsgGateway();
    const err = await gw.transmit(request()).catch((e) => e);
    expect(err).toBeInstanceOf(CredentialError);
    expect(err.missing).toContain('FDA_ESG_REST_CLIENT_SECRET');
    expect(err.missing).not.toContain('FDA_ESG_URL'); // the AS2 vars are not demanded on the REST path
    expect(poolQueries.filter((q) => q.sql.includes('INSERT INTO submission_transmittals'))).toHaveLength(0);
    expect(httpsRequests).toHaveLength(0);
    expect(await gw.isConfigured(11, 'production')).toBe(false);
  });

  it('credentials present → typed UnverifiedTransportError, transmitted:false, no row, no socket, no identifier', async () => {
    configureRest();
    const gw = new FdaEsgGateway();
    expect(await gw.isConfigured(11, 'production')).toBe(true);

    const err = await gw.transmit(request()).catch((e) => e);
    expect(err).toBeInstanceOf(UnverifiedTransportError);
    expect(err.name).toBe('UnverifiedTransportError');
    expect(err.transmitted).toBe(false);
    expect(err.transport).toBe('rest');
    expect(err.errorClass).toBe('transport');
    expect(err.message).toMatch(/has not been verified/);
    expect(err.message).toContain('https://esg-nextgen.fda.example/api');
    expect(err.message).toContain('FDA_ESG_TRANSPORT=as2');

    expect(poolQueries.filter((q) => q.sql.includes('submission_transmittals'))).toHaveLength(0);
    expect(httpsRequests).toHaveLength(0);
  });

  it('the staging environment reads the FDA_ESG_STAGING_* REST variables', async () => {
    configureRest('FDA_ESG_STAGING_');
    const gw = new FdaEsgGateway();
    const err = await gw.transmit({ ...request(), environment: 'staging' }).catch((e) => e);
    expect(err).toBeInstanceOf(UnverifiedTransportError);
    // Production is untouched: still AS2, still unconfigured.
    expect(resolveFdaEsgTransport('production')).toBe('as2');
    expect(await gw.isConfigured(11, 'production')).toBe(false);
  });

  it('with the variable unset the AS2 path is still the one taken (CredentialError names the AS2 vars)', async () => {
    const gw = new FdaEsgGateway();
    const err = await gw.transmit(request()).catch((e) => e);
    expect(err).toBeInstanceOf(CredentialError);
    expect(err.missing).toEqual(['FDA_ESG_URL', 'FDA_ESG_AS2_FROM', 'FDA_ESG_CERT_PATH', 'FDA_ESG_KEY_PATH', 'FDA_ESG_FDA_CERT_PATH']);
  });
});
