/**
 * Each organisation chooses the platform's gateway account or its own, per
 * agency gateway and environment (D7, founder decision 2026-10-01; evidence
 * docs/evidence/D7/2026-10-01-gateway-account-choice/).
 *
 * Before: every gateway read only the server's environment, so every
 * organisation transmitted under the platform's identity, nothing recorded
 * which account sent a transmittal, and there was no way to choose.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  account: null as null | Record<string, unknown>,
  database: null as PGlite | null,
  beforeQuery: null as ((text: string) => void) | null,
  calls: [] as Array<{ text: string; params: unknown[] }>,
}));
// The guard keeps the bytes it sends (sent-package-archive.ts); in memory here.
vi.mock('../../storage', async () => (await import('./sent-package-storage-stub')).storageModule);

vi.mock('../../../db', () => {
  const query = async (text: string, params: unknown[] = []) => {
      h.calls.push({ text: text.replace(/\s+/g, ' ').trim(), params });
      h.beforeQuery?.(text);
      if (h.database) return h.database.query<Record<string, unknown>>(text, params);
      if (/FROM organization_users ou/.test(text)) return { rows: params[0] === 11 && params[1] === 7 ? [{ role: 'admin' }] : [] };
      if (/FROM organization_gateway_accounts/.test(text)) return { rowCount: h.account ? 1 : 0, rows: h.account ? [{ id: 17, updated_at: '2026-11-13T00:00:00.000Z', ...h.account }] : [] };
      return /INSERT INTO submission_transmittals/.test(text) ? { rowCount: 1, rows: [{ id: 41 }] } : { rowCount: 1, rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { db: {}, pool, getPool: () => pool };
});

import { getGateway, listGateways, refusedBeforeWire } from '../index';
import { FdaEsgGateway } from '../fda-esg';
import { MhraGateway } from '../mhra-gateway';
import { EmaCespGateway } from '../ema-cesp';
import { CredentialError, UnverifiedTransportError, type GatewayTransmitRequest } from '../types';
import {
  GATEWAY_ACCOUNT_SPECS,
  GatewayAccountInputError,
  clientAccountRefusal,
  listGatewayAccounts,
  resolveGatewayAccount,
  resolveGatewayAccountForUse,
  captureGatewayTransmitRequest,
  specFor,
  writeGatewayAccount,
} from '../gateway-accounts';
import { encryptCredential } from '../../security/credential-cipher';
import * as sentPackages from '../sent-package-archive';

const PEM_CERT = '-----BEGIN CERTIFICATE-----\nMIIBclientcert\n-----END CERTIFICATE-----';
const PEM_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEclientkey\n-----END PRIVATE KEY-----';
const bundle = { path: '', sha256: '', sizeBytes: 0, format: 'ectd' as const };

beforeAll(async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const zip = new JSZip();
  zip.file('0000/m2/22-intro/intro.pdf', pdf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'gwa-bundle-')), 'b.zip');
  await fs.writeFile(p, buf);
  Object.assign(bundle, { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length });
});

beforeEach(() => {
  h.account = null;
  h.beforeQuery = null;
  h.calls.length = 0;
  vi.restoreAllMocks();
});
afterEach(async () => { const database = h.database; h.database = null; await database?.close(); });

function request(overrides: Partial<GatewayTransmitRequest> = {}): GatewayTransmitRequest {
  return {
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: null,
    bundle,
    environment: 'staging',
    submissionType: 'original',
    metadata: { applicationId: 'IND123456', sequence: '0000', environment: 'staging' },
    authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
    ...overrides,
  } as GatewayTransmitRequest;
}
const failureOf = (p: Promise<unknown>) => p.then(() => { throw new Error('expected the transmit to reject'); }, (e) => e);

/** A fake transaction client that keeps the one row the writer upserts. */
function memoryDb() {
  let row: Record<string, unknown> | null = null;
  return {
    get row() { return row; },
    query: async (text: string, params: unknown[] = []) => {
      if (/FROM organization_users ou/.test(text)) return { rows: params[0] === 11 && [7, 8].includes(Number(params[1])) ? [{ role: 'admin' }] : [] };
      if (/^\s*SELECT/i.test(text)) return { rows: row ? [row] : [] };
      if (/INSERT INTO organization_gateway_accounts/.test(text)) {
        row = { id: 1, updated_at: '2026-11-13T00:00:00.000Z', account_mode: params[4], sender_identifier: params[5], credentials_ciphertext: params[6], credential_fields: params[7], reason: params[8] };
      }
      return { rows: [] };
    },
  };
}

async function clientAccountDatabase() {
  const database = new PGlite(); h.database = database;
  await database.exec(`CREATE TABLE organizations (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO organizations VALUES (7,'active');
    CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO users VALUES (11,'active');
    CREATE TABLE organization_users (organization_id INTEGER,user_id INTEGER,role TEXT); INSERT INTO organization_users VALUES (7,11,'admin');
    CREATE TABLE audit_logs (id UUID PRIMARY KEY,tenant_id INTEGER,user_id INTEGER,action TEXT,table_name TEXT,record_id TEXT,actor_id INTEGER,target TEXT,payload_hash TEXT,sha256_chain TEXT,chain_seq BIGSERIAL,occurred_at TIMESTAMPTZ,hmac_seal TEXT,old_values JSON,new_values JSON,ip_address TEXT,user_agent TEXT,reason TEXT);`);
  await database.exec(await fs.readFile(path.resolve('migrations/20261001g_organization_gateway_accounts.sql'), 'utf8'));
  const q = { query: (sql: string, params: unknown[] = []) => database.query<Record<string, unknown>>(sql, params) };
  await writeGatewayAccount(q, { organizationId: 7, userId: 11, region: 'fda', gateway: 'esg', environment: 'staging', mode: 'client',
    senderIdentifier: 'ZZACME001', credentials: { clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY }, reason: 'Fixture client account setup' });
  return database;
}

function useAccount(db: Parameters<typeof resolveGatewayAccountForUse>[0], account: Parameters<typeof resolveGatewayAccountForUse>[1], scope: Parameters<typeof resolveGatewayAccountForUse>[2]) {
  return resolveGatewayAccountForUse(db, account, scope, request({ organizationId: scope.organizationId, environment: scope.environment }),
    { storageVersionId: 'fixture-version', provider: 'memory', sha256: bundle.sha256, sizeBytes: bundle.sizeBytes, filename: 'b.zip' });
}

describe('actual gateway account use records current custody before adapter handoff', () => {
  it.each(['membership', 'user', 'organization', 'role'] as const)('%s revoked during archival never reaches the adapter', async standing => {
    const pg = await clientAccountDatabase(), archive = sentPackages.archiveSentPackage;
    const mutation = { membership: 'DELETE FROM organization_users WHERE organization_id=7 AND user_id=11',
      user: "UPDATE users SET status='inactive' WHERE id=11", organization: "UPDATE organizations SET status='inactive' WHERE id=7",
      role: "UPDATE organization_users SET role='viewer' WHERE organization_id=7 AND user_id=11" }[standing];
    vi.spyOn(sentPackages, 'archiveSentPackage').mockImplementation(async (...args) => {
      const receipt = await archive(...args); await pg.exec(mutation); return receipt;
    });
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    await expect(getGateway('fda', 'esg').transmit(request())).rejects.toBeInstanceOf(CredentialError);
    expect(wire).not.toHaveBeenCalled();
  });
  it.each(['rotation', 'replacement'] as const)('account %s during the use-audit prevents adapter handoff', async change => {
    const pg = await clientAccountDatabase();
    const cipher = encryptCredential(JSON.stringify({ clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY.replace('clientkey', 'rotatedkey') }));
    const mutation = change === 'rotation' ? `UPDATE organization_gateway_accounts SET credentials_ciphertext='${cipher}',updated_at=NOW() WHERE organization_id=7;`
      : 'UPDATE organization_gateway_accounts SET id=id+100 WHERE organization_id=7;';
    await pg.exec(`CREATE FUNCTION rotate_on_use() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='credential.use' THEN ${mutation} END IF; RETURN NEW; END; $$;
      CREATE TRIGGER rotate_on_use AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION rotate_on_use();`);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    await expect(getGateway('fda', 'esg').transmit(request())).rejects.toBeInstanceOf(CredentialError);
    expect(wire).not.toHaveBeenCalled(); expect((await pg.query("SELECT id FROM audit_logs WHERE action='credential.use'")).rows).toHaveLength(1);
  });
  it('a member revoked by the actual use-audit never reaches the adapter', async () => {
    const pg = await clientAccountDatabase();
    await pg.exec(`CREATE FUNCTION revoke_on_use() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='credential.use' THEN DELETE FROM organization_users WHERE organization_id=NEW.tenant_id AND user_id=11; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER revoke_on_use AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION revoke_on_use();`);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    await expect(getGateway('fda', 'esg').transmit(request())).rejects.toBeInstanceOf(CredentialError);
    expect(wire).not.toHaveBeenCalled();
    expect((await pg.query("SELECT user_id FROM audit_logs WHERE action='credential.use'")).rows).toEqual([{ user_id: 11 }]);
  });
  it('a refused durable use-audit prevents adapter handoff', async () => {
    const pg = await clientAccountDatabase(); await pg.exec('ALTER TABLE audit_logs ADD CONSTRAINT refuse_use CHECK (false) NOT VALID');
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    await expect(getGateway('fda', 'esg').transmit(request())).rejects.toBeInstanceOf(CredentialError);
    expect(wire).not.toHaveBeenCalled();
  });
  it('records the actual account last-change and retained bytes without credential material', async () => {
    const pg = await clientAccountDatabase();
    vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    const result = await getGateway('fda', 'esg').transmit(request({ metadata: { actorUserId: 999, accountId: 999, reason: PEM_KEY } }));
    const rows = (await pg.query<{ user_id: number; new_values: Record<string, unknown> }>("SELECT user_id,new_values FROM audit_logs WHERE action='credential.use'")).rows;
    expect(rows).toHaveLength(1); expect(rows[0].user_id).toBe(11);
    expect(rows[0].new_values).toMatchObject({ purpose: 'gateway_transmit', accountId: 1, accountMode: 'client', region: 'fda', gateway: 'esg', environment: 'staging',
      bundleSha256: bundle.sha256, storageVersionId: result.sentPackage?.storageVersionId });
    const actual = (await pg.query<{ id: number; updated_at: Date }>('SELECT id,updated_at FROM organization_gateway_accounts')).rows[0];
    expect(rows[0].new_values).toMatchObject({ accountId: actual.id, accountUpdatedAt: actual.updated_at.toISOString() });
    expect(JSON.stringify(rows)).not.toContain('clientkey'); expect(JSON.stringify(rows)).not.toContain('clientcert');
    expect(rows[0].new_values).not.toHaveProperty('fingerprint'); expect(rows[0].new_values).not.toHaveProperty('grantId');
  });
  it('keeps the historical platform default and records no invented account or grant', async () => {
    const pg = await clientAccountDatabase(); await pg.exec('DELETE FROM organization_gateway_accounts');
    vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    const result = await getGateway('fda', 'esg').transmit(request());
    expect(result.gatewayAccount).toEqual({ mode: 'platform', senderIdentifier: null });
    const row = (await pg.query<{ new_values: Record<string, unknown> }>("SELECT new_values FROM audit_logs WHERE action='credential.use'")).rows[0];
    expect(row.new_values).toMatchObject({ accountMode: 'platform', accountId: null, accountUpdatedAt: null });
    expect(row.new_values).not.toHaveProperty('grantId'); expect(row.new_values).not.toHaveProperty('revision');
  });
});

describe('gateway use retains the captured server request and receipt', () => {
  it('caller mutation cannot switch actor, organization, bundle, attempt or nested package facts', async () => {
    const pg = await clientAccountDatabase(), archive = sentPackages.archiveSentPackage;
    const input = request({ bundle: { ...bundle, leafManifest: [], submissionGrade: { total: 1, pdfLeaves: 1, pdfaConverted: 1, notConverted: [], allPdfA: true } },
      dispatchBinding: { attemptId: '12345678-1234-4234-8234-123456789012', organizationId: 7, sequenceId: 31, signatureActionId: 'sig-1', bundleSha256: bundle.sha256 } });
    vi.spyOn(sentPackages, 'archiveSentPackage').mockImplementation(async (...args) => {
      const receipt = await archive(...args); input.organizationId = 99; input.userId = 99; input.authorization.actorUserId = 99;
      input.bundle.sha256 = 'f'.repeat(64); input.bundle.submissionGrade?.notConverted.push('changed.pdf');
      if (input.metadata) input.metadata.applicationId = 'CHANGED';
      if (input.dispatchBinding) input.dispatchBinding.attemptId = 'changed';
      return receipt;
    });
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    await getGateway('fda', 'esg').transmit(input);
    expect(wire.mock.calls[0][0]).toMatchObject({ organizationId: 7, userId: 11, authorization: { actorUserId: 11 },
      bundle: { sha256: bundle.sha256, submissionGrade: { notConverted: [] } }, dispatchBinding: { sequenceId: 31, attemptId: '12345678-1234-4234-8234-123456789012' } });
    expect(wire.mock.calls[0][0].metadata?.applicationId).toBe('IND123456');
    const row = (await pg.query<{ new_values: Record<string, unknown> }>("SELECT new_values FROM audit_logs WHERE action='credential.use'")).rows[0];
    expect(row.new_values).toMatchObject({ sequenceId: 31, transmitAttemptId: '12345678-1234-4234-8234-123456789012', signatureActionId: 'sig-1', bundleSha256: bundle.sha256 });
  });
  it('a mutable archive receipt cannot relabel the audit, adapter or result during policy awaits', async () => {
    const pg = await clientAccountDatabase(), archive = sentPackages.archiveSentPackage;
    vi.spyOn(sentPackages, 'archiveSentPackage').mockImplementation(async (...args) => {
      const receipt = await archive(...args);
      h.beforeQuery = text => { if (/FROM organization_users ou/.test(text)) { receipt.sha256 = 'f'.repeat(64); receipt.storageVersionId = 'changed'; } };
      return receipt;
    });
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);
    const result = await getGateway('fda', 'esg').transmit(request());
    expect(result.sentPackage?.sha256).toBe(bundle.sha256); expect(result.sentPackage?.storageVersionId).not.toBe('changed');
    expect(wire.mock.calls[0][0].metadata?.sentPackage).toEqual(result.sentPackage);
    const row = (await pg.query<{ new_values: Record<string, unknown> }>("SELECT new_values FROM audit_logs WHERE action='credential.use'")).rows[0];
    expect(row.new_values).toMatchObject({ bundleSha256: bundle.sha256, storageVersionId: result.sentPackage?.storageVersionId });
  });
  it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1, 99])('invalid or mismatched actor %s cannot reach account use', async actorUserId => {
    const pg = await clientAccountDatabase(), wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit');
    await expect(getGateway('fda', 'esg').transmit(request({ authorization: { kind: 'governed-signature', actorUserId, signatureActionId: 'sig-1' } }))).rejects.toHaveProperty('name', 'TransmitAuthorizationError');
    expect(wire).not.toHaveBeenCalled(); expect((await pg.query("SELECT id FROM audit_logs WHERE action='credential.use'")).rows).toEqual([]);
  });
  it('the snapshot detaches a reauthentication Date and rejects unsupported authorization kinds', () => {
    const when = new Date('2026-11-13T12:00:00Z'), input = request({ authorization: { kind: 'governed-http', actorUserId: 11, reason: 'Fixture approved transmit', reauthVerifiedAt: when } });
    const captured = captureGatewayTransmitRequest(input); when.setTime(0);
    expect(captured.authorization).toMatchObject({ reauthVerifiedAt: new Date('2026-11-13T12:00:00Z') });
    expect(() => captureGatewayTransmitRequest(request({ authorization: { kind: 'arbitrary', actorUserId: 11 } as never }))).toThrow('supported human authorization');
  });
  it('direct account use with an unknown authorization kind writes no use-audit', async () => {
    const pg = await clientAccountDatabase(), scope = { organizationId: 7, region: 'fda', gateway: 'esg', environment: 'staging' } as const;
    const account = await resolveGatewayAccount({ query: (sql, params) => pg.query<Record<string, unknown>>(sql, params) }, 7, 'fda', 'esg', 'staging');
    const input = request({ authorization: { kind: 'arbitrary', actorUserId: 11 } as never });
    const archived = await sentPackages.archiveSentPackage(input, 'fda', 'esg');
    await expect(resolveGatewayAccountForUse({ query: (sql, params) => pg.query<Record<string, unknown>>(sql, params) }, account, scope, input, archived)).rejects.toBeInstanceOf(CredentialError);
    expect((await pg.query("SELECT id FROM audit_logs WHERE action='credential.use'")).rows).toEqual([]);
  });
});

describe('the catalogue of gateways an organisation can choose an account for', () => {
  it('names exactly the gateways the transmit registry holds', () => {
    const registry = listGateways().map((g) => `${g.region}:${g.gateway}`).sort();
    expect(GATEWAY_ACCOUNT_SPECS.map((s) => `${s.region}:${s.gateway}`).sort()).toEqual(registry);
  });
  it('FDA ESG can send under a client account; the others record the choice and refuse to send under it', () => {
    expect(specFor('fda', 'esg')?.clientTransmit).toBe(true);
    expect(GATEWAY_ACCOUNT_SPECS.filter((s) => s.clientTransmit).map((s) => s.gateway)).toEqual(['esg']);
  });
});

describe('writing the choice', () => {
  const base = { organizationId: 7, userId: 11, region: 'fda', gateway: 'esg', environment: 'production', reason: 'Sponsor files under its own FDA ESG account' };

  it('stores client credentials encrypted, names the fields held, and never stores a value in the clear', async () => {
    const db = memoryDb();
    const w = await writeGatewayAccount(db, { ...base, mode: 'client', senderIdentifier: 'ZZACME001', credentials: { clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY } });
    expect(w).toMatchObject({ mode: 'client', previousMode: 'platform', credentialFieldsHeld: ['clientCertPem', 'clientKeyPem'], credentialsChanged: true });
    expect(String(db.row!.credentials_ciphertext)).not.toContain('clientkey');
    const resolved = await resolveGatewayAccount(db, 7, 'fda', 'esg', 'production');
    expect(resolved).toEqual({ mode: 'client', senderIdentifier: 'ZZACME001', credentials: { clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY } });
  });

  it('keeps fields not re-sent, and clears every secret on a switch back to the platform account', async () => {
    const db = memoryDb();
    await writeGatewayAccount(db, { ...base, mode: 'client', senderIdentifier: 'ZZACME001', credentials: { clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY } });
    await writeGatewayAccount(db, { ...base, mode: 'client', credentials: { clientCertPem: PEM_CERT.replace('client', 'rotated') } });
    expect((await resolveGatewayAccount(db, 7, 'fda', 'esg', 'production')).credentials?.clientKeyPem).toBe(PEM_KEY);
    await writeGatewayAccount(db, { ...base, mode: 'platform' });
    expect(db.row).toMatchObject({ account_mode: 'platform', credentials_ciphertext: null, credential_fields: [], sender_identifier: null });
  });

  it('refuses what a person can correct: no reason, unknown gateway, unknown field, a key that is not PEM', async () => {
    const db = memoryDb();
    const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof GatewayAccountInputError ? e.code : String(e)));
    expect(await code(writeGatewayAccount(db, { ...base, mode: 'client', reason: 'short' }))).toBe('REASON_REQUIRED');
    expect(await code(writeGatewayAccount(db, { ...base, gateway: 'nope', mode: 'client' }))).toBe('UNKNOWN_GATEWAY');
    expect(await code(writeGatewayAccount(db, { ...base, mode: 'client', credentials: { password: 'x' } }))).toBe('UNKNOWN_FIELD');
    expect(await code(writeGatewayAccount(db, { ...base, mode: 'client', credentials: { clientKeyPem: 'not a key' } }))).toBe('NOT_PEM');
    expect(await code(writeGatewayAccount(db, { ...base, mode: 'shared' }))).toBe('INVALID_MODE');
    expect(db.row).toBeNull();
  });

  it('still clears an unreadable prior client credential, withholding a reason whose secrets cannot be checked', async () => {
    const db = memoryDb();
    await writeGatewayAccount(db, { ...base, mode: 'client', credentials: { clientKeyPem: PEM_KEY } });
    db.row!.credentials_ciphertext = 'unreadable-ciphertext';
    const written = await writeGatewayAccount(db, { ...base, mode: 'platform', reason: 'Clear account CANARY_UNREADABLE_SECRET_8833' });
    expect(db.row).toMatchObject({ account_mode: 'platform', credentials_ciphertext: null, credential_fields: [] });
    expect(written.reason).toBe(db.row!.reason);
    expect(JSON.stringify(written)).not.toContain('CANARY_UNREADABLE_SECRET_8833');
  });
});

describe('gateway credential change reasons on PostgreSQL semantics', () => {
  it('keeps new and previous PEM variants out of capture, rotation and platform-revert reasons', async () => {
    const pg = new PGlite();
    const db = { query: (sql: string, params: unknown[] = []) => pg.query<Record<string, unknown>>(sql, params) };
    const oldKey = '  -----BEGIN PRIVATE KEY-----\r\nCANARY_FDA_OLD_442211\r\n-----END PRIVATE KEY-----\r\n';
    const newKey = '-----BEGIN PRIVATE KEY-----\nCANARY_FDA_NEW_775533\n-----END PRIVATE KEY-----\n';
    const variants = (value: string) => [value, value.trim(), value.replace(/\r\n?/g, '\n'),
      value.replace(/\r\n?/g, '\n').trim().replace(/\n/g, '\\n'), JSON.stringify(value).slice(1, -1)];
    const base = { organizationId: 7, userId: 11, region: 'fda', gateway: 'esg', environment: 'production' };
    try {
      await pg.exec(await fs.readFile(path.resolve('migrations/20261001g_organization_gateway_accounts.sql'), 'utf8'));
      for (const action of ['capture', 'rotate', 'revert'] as const) {
        const key = action === 'capture' ? oldKey : newKey;
        const values = action === 'rotate' ? [oldKey, newKey] : [key];
        const reason = `Approved ESG account ${action}: ${values.flatMap(variants).join(' | ')}`;
        const written = await writeGatewayAccount(db, { ...base, reason, mode: action === 'revert' ? 'platform' : 'client',
          ...(action === 'revert' ? {} : { credentials: { clientKeyPem: key, clientCertPem: PEM_CERT } }) });
        const row = (await pg.query<{ reason: string; credentials_ciphertext: string | null }>('SELECT reason, credentials_ciphertext FROM organization_gateway_accounts')).rows[0];
        const known = action === 'rotate' ? ['CANARY_FDA_OLD_442211', 'CANARY_FDA_NEW_775533']
          : [action === 'capture' ? 'CANARY_FDA_OLD_442211' : 'CANARY_FDA_NEW_775533'];
        for (const canary of known) {
          expect(row.reason, `${action} leaked a held credential into plaintext`).not.toContain(canary);
          expect(JSON.stringify(written)).not.toContain(canary);
        }
        expect(row.reason).toContain('[redacted]');
        expect(written.reason).toBe(row.reason);
        if (action === 'revert') expect(row.credentials_ciphertext).toBeNull();
        else expect((await resolveGatewayAccount(db, 7, 'fda', 'esg', 'production')).credentials?.clientKeyPem).toBe(key);
      }
    } finally { await pg.close(); }
  });
});

describe('what the organisation sees', () => {
  it('every gateway × environment, platform by default, with whether it can send', async () => {
    const db = { query: async () => ({ rows: [{ region: 'fda', gateway: 'esg', environment: 'production', account_mode: 'client', sender_identifier: 'ZZACME001', credential_fields: ['clientCertPem'], updated_at: null, updated_by: 11 }, { region: 'uk', gateway: 'mhra_gateway', environment: 'production', account_mode: 'client', sender_identifier: 'X', credential_fields: [], updated_at: null, updated_by: 11 }] }) };
    const views = await listGatewayAccounts(db, 7, async () => false);
    expect(views).toHaveLength(GATEWAY_ACCOUNT_SPECS.length * 2);
    const fda = views.find((v) => v.gateway === 'esg' && v.environment === 'production')!;
    expect(fda).toMatchObject({ mode: 'client', status: 'credentials_needed', credentialFieldsHeld: ['clientCertPem'] });
    expect(views.find((v) => v.gateway === 'mhra_gateway' && v.environment === 'production')!.status).toBe('client_not_supported');
    expect(views.find((v) => v.gateway === 'esg' && v.environment === 'staging')).toMatchObject({ mode: 'platform', status: 'platform_not_configured' });
    expect(JSON.stringify(views)).not.toMatch(/ciphertext/);
  });
});

describe('captured account authority', () => {
  it('does not accept a copied account or reuse authority in another organization or environment', async () => {
    const db = memoryDb();
    const captured = await resolveGatewayAccount(db, 7, 'fda', 'esg', 'production');
    const scope = { organizationId: 7, region: 'fda', gateway: 'esg', environment: 'production' } as const;
    await expect(useAccount(db, { ...captured }, scope)).rejects.toBeInstanceOf(CredentialError);
    await expect(useAccount(db, captured, { ...scope, organizationId: 8 })).rejects.toBeInstanceOf(CredentialError);
    await expect(useAccount(db, captured, { ...scope, environment: 'staging' })).rejects.toBeInstanceOf(CredentialError);
    await expect(useAccount(db, captured, { ...scope, region: 'ema', gateway: 'cesp' })).rejects.toBeInstanceOf(CredentialError);
  });

  it('re-establishes credentials from the store, ignoring changes to the captured object', async () => {
    const db = memoryDb();
    await writeGatewayAccount(db, { organizationId: 7, userId: 11, region: 'fda', gateway: 'esg', environment: 'production',
      reason: 'Sponsor uses its own FDA account', mode: 'client', senderIdentifier: 'ZZACME001',
      credentials: { clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY } });
    const captured = await resolveGatewayAccount(db, 7, 'fda', 'esg', 'production');
    captured.senderIdentifier = 'FORGED';
    captured.credentials!.clientKeyPem = 'FORGED';
    const current = await useAccount(db, captured, { organizationId: 7, region: 'fda', gateway: 'esg', environment: 'production' });
    expect(current.senderIdentifier).toBe('ZZACME001');
    expect(current.credentials!.clientKeyPem).toBe(PEM_KEY);
  });

  it('fails closed with a content-free credential refusal if the authority store cannot be re-read', async () => {
    const captured = await resolveGatewayAccount(memoryDb(), 7, 'fda', 'esg', 'production');
    const unavailable = { query: async () => { throw new Error('CANARY-private-store-error'); } };
    const error = await failureOf(useAccount(unavailable, captured,
      { organizationId: 7, region: 'fda', gateway: 'esg', environment: 'production' }));
    expect(error).toBeInstanceOf(CredentialError);
    expect((error as Error).message).not.toContain('CANARY-private-store-error');
  });
});

describe('the guarded transmit honours the choice, before the wire', () => {
  // 2026-10-22 (MR-02 Stage 1): the record-only client refusal is exercised on
  // EMA CESP, a sourced gateway. Since e1f3fd425 the guard refuses the
  // unsourced MHRA adapter (UnverifiedTransportError) before any account is
  // resolved, so MHRA can no longer reach clientAccountRefusal — pinned below.
  it('an organisation that chose its own CESP account is refused — never sent under the platform identity', async () => {
    h.account = { account_mode: 'client', sender_identifier: 'CESP-ACME', credentials_ciphertext: null };
    const wire = vi.spyOn(EmaCespGateway.prototype, 'transmit');
    const err = await failureOf(getGateway('ema', 'cesp').transmit(request({ metadata: { applicationId: 'EMEA/H/C/000000', sequence: '0000' } })));
    expect(err).toBeInstanceOf(CredentialError);
    expect(String((err as Error).message)).toMatch(/its own EMA account/);
    expect(wire).not.toHaveBeenCalled();
    expect(refusedBeforeWire(err)).toBe(true);
    expect(h.calls.some((c) => /FROM organization_gateway_accounts/.test(c.text))).toBe(true);
    expect(h.calls.some((c) => /INSERT INTO submission_transmittals/.test(c.text))).toBe(false);
  });

  it('an unsourced gateway (MHRA) is refused before any account is read, whatever the organisation chose', async () => {
    h.account = { account_mode: 'client', sender_identifier: 'MHRA-ACME', credentials_ciphertext: null };
    const wire = vi.spyOn(MhraGateway.prototype, 'transmit');
    const err = await failureOf(getGateway('uk', 'mhra_gateway').transmit(request()));
    expect(err).toBeInstanceOf(UnverifiedTransportError);
    expect((err as UnverifiedTransportError).transmitted).toBe(false);
    expect(wire).not.toHaveBeenCalled();
    expect(refusedBeforeWire(err)).toBe(true);
    expect(h.calls.some((c) => /FROM organization_gateway_accounts|submission_transmittals/.test(c.text))).toBe(false);
  });

  it('an FDA client account missing its key is refused, naming what is missing', async () => {
    h.account = { account_mode: 'client', sender_identifier: 'ZZACME001', credentials_ciphertext: encryptCredential(JSON.stringify({ clientCertPem: PEM_CERT })) };
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit');
    const err = await failureOf(getGateway('fda', 'esg').transmit(request()));
    expect(err).toBeInstanceOf(CredentialError);
    expect((err as CredentialError).missing.join(' ')).toMatch(/private key/);
    expect(wire).not.toHaveBeenCalled();
  });

  it('a complete FDA client account reaches the gateway with the account and a stamped record of it', async () => {
    h.account = { account_mode: 'client', sender_identifier: 'ZZACME001', credentials_ciphertext: encryptCredential(JSON.stringify({ clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY })) };
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41, transmissionId: 'm-1', status: 'submitted', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok' } as never);
    const result = await getGateway('fda', 'esg').transmit(request({ metadata: { applicationId: 'IND123456', sequence: '0000', gatewayAccount: { mode: 'platform', senderIdentifier: 'FORGED' } } }));
    const sent = wire.mock.calls[0][0] as GatewayTransmitRequest;
    expect(sent.account).toMatchObject({ mode: 'client', senderIdentifier: 'ZZACME001' });
    // A caller cannot supply the record of which account sent it.
    expect(sent.metadata?.gatewayAccount).toEqual({ mode: 'client', senderIdentifier: 'ZZACME001' });
    expect(result.gatewayAccount).toEqual({ mode: 'client', senderIdentifier: 'ZZACME001' });
  });

  it('no choice recorded is the platform account, as before, and says so on the record', async () => {
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41, transmissionId: 'm-1', status: 'submitted', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok' } as never);
    const result = await getGateway('fda', 'esg').transmit(request());
    expect((wire.mock.calls[0][0] as GatewayTransmitRequest).account).toEqual({ mode: 'platform', senderIdentifier: null, credentials: null });
    expect(result.gatewayAccount).toEqual({ mode: 'platform', senderIdentifier: null });
  });

  it.each(['rotation', 'sender change', 'switch to platform', 'deletion'])('an account %s during archival revokes this transmit before the wire', async change => {
    h.account = { account_mode: 'client', sender_identifier: 'ZZACME001', credentials_ciphertext: encryptCredential(JSON.stringify({ clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY })) };
    const archive = sentPackages.archiveSentPackage;
    vi.spyOn(sentPackages, 'archiveSentPackage').mockImplementation(async (req, region, gateway) => {
      const stored = await archive(req, region, gateway);
      if (change === 'rotation') h.account = { ...h.account, credentials_ciphertext: encryptCredential(JSON.stringify({ clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY.replace('client', 'rotated') })) };
      if (change === 'sender change') h.account = { ...h.account, sender_identifier: 'ANOTHER-SENDER' };
      if (change === 'switch to platform') h.account = { account_mode: 'platform', sender_identifier: null, credentials_ciphertext: null };
      if (change === 'deletion') h.account = null;
      return stored;
    });
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41 } as never);

    const error = await failureOf(getGateway('fda', 'esg').transmit(request()));

    expect(error).toBeInstanceOf(CredentialError);
    expect((error as Error).message).toMatch(/account changed/i);
    expect(refusedBeforeWire(error)).toBe(true);
    expect(wire).not.toHaveBeenCalled();
    expect(h.calls.some(c => /INSERT INTO submission_transmittals/.test(c.text))).toBe(false);
    expect((error as Error).message).not.toContain(PEM_KEY);
    expect((error as Error).message).not.toContain('credentials_ciphertext');
  });

  it('clientAccountRefusal is null for the platform account and for a complete FDA client account', () => {
    const fda = specFor('fda', 'esg')!;
    expect(clientAccountRefusal(fda, { mode: 'platform', senderIdentifier: null, credentials: null }, 'production')).toBeNull();
    expect(clientAccountRefusal(fda, { mode: 'client', senderIdentifier: 'Z', credentials: { clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY } }, 'production')).toBeNull();
  });
});
