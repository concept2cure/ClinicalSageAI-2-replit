/**
 * Each organisation chooses the platform's gateway account or its own, per
 * agency gateway and environment (D7, founder decision 2026-10-01; evidence
 * docs/evidence/D7/2026-10-01-gateway-account-choice/).
 *
 * Before: every gateway read only the server's environment, so every
 * organisation transmitted under the platform's identity, nothing recorded
 * which account sent a transmittal, and there was no way to choose.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const h = vi.hoisted(() => ({
  account: null as null | Record<string, unknown>,
  calls: [] as Array<{ text: string; params: unknown[] }>,
}));
vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: async (text: string, params: unknown[] = []) => {
      h.calls.push({ text: text.replace(/\s+/g, ' ').trim(), params });
      if (/FROM organization_gateway_accounts/.test(text)) return { rowCount: h.account ? 1 : 0, rows: h.account ? [h.account] : [] };
      return /INSERT INTO submission_transmittals/.test(text) ? { rowCount: 1, rows: [{ id: 41 }] } : { rowCount: 1, rows: [] };
    },
  },
}));

import { getGateway, listGateways, refusedBeforeWire } from '../index';
import { FdaEsgGateway } from '../fda-esg';
import { MhraGateway } from '../mhra-gateway';
import { CredentialError, type GatewayTransmitRequest } from '../types';
import {
  GATEWAY_ACCOUNT_SPECS,
  GatewayAccountInputError,
  clientAccountRefusal,
  listGatewayAccounts,
  resolveGatewayAccount,
  specFor,
  writeGatewayAccount,
} from '../gateway-accounts';
import { encryptCredential } from '../../security/credential-cipher';

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
  h.calls.length = 0;
  vi.restoreAllMocks();
});

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
      if (/^\s*SELECT/i.test(text)) return { rows: row ? [row] : [] };
      if (/INSERT INTO organization_gateway_accounts/.test(text)) {
        row = { account_mode: params[4], sender_identifier: params[5], credentials_ciphertext: params[6], credential_fields: params[7], reason: params[8] };
      }
      return { rows: [] };
    },
  };
}

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

describe('the guarded transmit honours the choice, before the wire', () => {
  it('an organisation that chose its own MHRA account is refused — never sent under the platform identity', async () => {
    h.account = { account_mode: 'client', sender_identifier: 'MHRA-ACME', credentials_ciphertext: null };
    const wire = vi.spyOn(MhraGateway.prototype, 'transmit');
    const err = await failureOf(getGateway('uk', 'mhra_gateway').transmit(request()));
    expect(err).toBeInstanceOf(CredentialError);
    expect(String((err as Error).message)).toMatch(/its own MHRA account/);
    expect(wire).not.toHaveBeenCalled();
    expect(refusedBeforeWire(err)).toBe(true);
    expect(h.calls.some((c) => /INSERT INTO submission_transmittals/.test(c.text))).toBe(false);
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

  it('clientAccountRefusal is null for the platform account and for a complete FDA client account', () => {
    const fda = specFor('fda', 'esg')!;
    expect(clientAccountRefusal(fda, { mode: 'platform', senderIdentifier: null, credentials: null }, 'production')).toBeNull();
    expect(clientAccountRefusal(fda, { mode: 'client', senderIdentifier: 'Z', credentials: { clientCertPem: PEM_CERT, clientKeyPem: PEM_KEY } }, 'production')).toBeNull();
  });
});
