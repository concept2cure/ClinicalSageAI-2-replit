import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:https';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const state = vi.hoisted(() => ({ queries: [] as Array<{ sql: string; args: any[] }>, failure: '' as '' | 'throw' | 'missing-row' | 'prewire', status: 'pending' }));
vi.mock('../../../db', () => ({ pool: { query: vi.fn(async (sql: string, args: any[] = []) => {
  state.queries.push({ sql, args });
  if (sql.includes('INSERT INTO submission_transmittals')) return { rows: [{ id: 9001 }], rowCount: 1 };
  if (sql.includes('jsonb_set') && args[2] === 'as2Receipt') {
    if (state.failure === 'throw') throw new Error('receipt persistence unavailable');
    if (state.failure === 'missing-row') return { rows: [], rowCount: 0 };
  }
  if (sql.includes('jsonb_set') && args[2] === 'as2' && state.failure === 'prewire') return { rows: [], rowCount: 0 };
  if (sql.startsWith('UPDATE submission_transmittals')) {
    const index = sql.match(/\bstatus\s*=\s*\$(\d+)/)?.[1];
    if (index) state.status = args[Number(index) - 1];
    return { rows: [{ id: 9001 }], rowCount: 1 };
  }
  return { rows: [], rowCount: 1 };
}) } }));
import { FdaEsgGateway } from '../fda-esg';
import { GatewayError } from '../types';
import { as2CmsFixture, receiptReport } from './support/as2-cms-fixture';
import { makeMtlsPki, type MtlsPki } from './support/mtls-pki';
let fixture: ReturnType<typeof as2CmsFixture>, pki: MtlsPki, server: Server, port: number, calls = 0, verifiedAtPeer = false;
const PAYLOAD = Buffer.from('offline controlled bundle bytes');
beforeAll(async () => {
  fixture = as2CmsFixture(); pki = makeMtlsPki();
  writeFileSync(join(fixture.directory, 'bundle.zip'), PAYLOAD, { mode: 0o600 });
  server = createServer({ key: pki.serverKeyPem, cert: pki.serverCertPem, ca: pki.caPem, requestCert: true, rejectUnauthorized: true }, (req, res) => {
    calls++; const chunks: Buffer[] = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => {
      try {
        const entity = fixture.roundtrip(Buffer.concat(chunks), 'agency', pki.clientCertPem);
        verifiedAtPeer = entity.includes(PAYLOAD) && String(req.headers['content-type']).includes('enveloped-data');
        const mic = createHash('sha256').update(entity).digest('base64');
        const signed = fixture.signedReceipt(receiptReport(String(req.headers['message-id']), mic));
        res.writeHead(200, { 'Content-Type': signed.contentType, 'Message-ID': '<verified-local-mdn@agency>' }); res.end(signed.body);
      } catch { res.writeHead(400); res.end('Offline test peer refused unverifiable CMS.'); }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); port = (server.address() as { port: number }).port;
  const vars: Record<string, string> = { TRANSPORT: 'as2', URL: `https://localhost:${port}`, AS2_FROM: 'SPONSOR-AS2', AS2_TO: 'OFFLINE-AGENCY', CERT_PATH: pki.paths.clientCert, KEY_PATH: pki.paths.clientKey, FDA_CERT_PATH: join(fixture.directory, 'agency.pem'), MDN_CERT_PATH: join(fixture.directory, 'agency.pem'), TLS_CA_PATH: pki.paths.ca };
  for (const [suffix, value] of Object.entries(vars)) vi.stubEnv(`FDA_ESG_STAGING_${suffix}`, value);
}, 30_000);
beforeEach(() => { state.queries = []; state.failure = ''; state.status = 'pending'; calls = 0; verifiedAtPeer = false; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); fixture.cleanup(); pki.cleanup(); vi.unstubAllEnvs(); });
function request() { return { region: 'fda', gateway: 'esg', environment: 'staging', organizationId: 42, userId: 7, programId: null, packageId: null,
  authorization: { kind: 'governed-http', actorUserId: 7, reauthVerifiedAt: new Date() }, account: { mode: 'platform', senderIdentifier: null, credentials: null },
  bundle: { path: join(fixture.directory, 'bundle.zip'), format: 'ectd', sizeBytes: PAYLOAD.length, sha256: createHash('sha256').update(PAYLOAD).digest('hex') },
} as any; }
describe('actual CMS/mTLS send followed by receipt persistence failures', () => {
  it('accepts the exact agency-signed MIC receipt after the peer decrypts and verifies the signed bundle', async () => {
    const result = await new FdaEsgGateway().transmit(request());
    expect(result.status).toBe('received'); expect(verifiedAtPeer).toBe(true); expect(calls).toBe(1);
    const receipt = state.queries.find(q => q.args[2] === 'as2Receipt'); expect(JSON.parse(receipt!.args[3]).verified).toBe(true);
  });
  it.each(['throw', 'missing-row'] as const)('retains the duplicate-send lock after verified remote receipt when persistence %s fails', async failure => {
    state.failure = failure;
    const error = await new FdaEsgGateway().transmit(request()).catch(error => error);
    expect(error).toBeInstanceOf(GatewayError); expect(error.message).toMatch(/may hold it|in transit/);
    expect(verifiedAtPeer).toBe(true); expect(calls).toBe(1); expect(state.status).toBe('in_transit');
    expect(state.queries.filter(q => q.sql.startsWith('UPDATE submission_transmittals')).some(q => q.args.includes('rejected'))).toBe(false);
  });
  it('proves no transmission when original binding persistence fails before the POST', async () => {
    state.failure = 'prewire';
    const error = await new FdaEsgGateway().transmit(request()).catch(error => error);
    expect(error.transmitted).toBe(false); expect(calls).toBe(0); expect(state.status).toBe('rejected');
  });
});
