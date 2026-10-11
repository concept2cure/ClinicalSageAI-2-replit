/**
 * A tenant's data return carries its data, not its key material.
 *
 * exportTenantFull reads every tenant-keyed table with SELECT *. Before
 * 2026-10-05 that handed the downloader OAuth tokens, agency-gateway
 * credentials and session keys alongside the customer's records. The values
 * in EXPORT_WITHHELD_COLUMNS are now withheld, visibly: a marker where a value
 * was, null where none was, and the table names what it withheld. Everything
 * else in the row, and every other table, is returned as stored.
 *
 * Real exportTenantFull over PGlite; the credential values are assembled at
 * runtime so no secret scanner reads one in this file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { exportTenantFull, EXPORT_WITHHELD_COLUMNS } from '../tenant-full-export.service';

let db: PGlite;
const asClient = () => ({ query: (sql: string, params?: unknown[]) => db.query(sql, params) }) as never;

const ORG = 7;
const OTHER = 8;
const ACCESS = ['ya29', 'a0AfB', 'fixture'].join('.');
const REFRESH = ['1', '', 'refresh', 'fixture'].join('/');
const CIPHER = ['v1', 'iv', 'tag', 'ciphertext-fixture'].join(':');
const LICENSE_ACCESS = ['license', 'access', 'fixture'].join('.');
const MAILBOX_REFERENCE = ['credential-store', 'mailbox', 'fixture'].join('/');
const P8_TOKENS = { STUDY_NAME: 'ACM stability', DURATION_MONTHS: 24, RESULTS_SUMMARY: '12 test results recorded' };
const AUDIT_SEAL = 'record-integrity-seal-fixture';

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE TABLE organizations (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, status TEXT);
    INSERT INTO organizations VALUES (${ORG}, 'acme', 'Acme Bio', 'active'), (${OTHER}, 'other', 'Other', 'active');
    CREATE TABLE integration_tokens (
      id SERIAL PRIMARY KEY, organization_id INTEGER, provider TEXT, access_token TEXT, refresh_token TEXT
    );
    CREATE TABLE organization_gateway_accounts (
      id SERIAL PRIMARY KEY, organization_id INTEGER, gateway TEXT, account_mode TEXT,
      sender_identifier TEXT, credentials_ciphertext TEXT, credential_fields TEXT[]
    );
    CREATE TABLE regulatory_programs (id SERIAL PRIMARY KEY, organization_id INTEGER, name TEXT);
    CREATE TABLE licenses (
      id SERIAL PRIMARY KEY, organization_id INTEGER, access_token TEXT, license_type TEXT, status TEXT
    );
    CREATE TABLE c2c_mailbox_connections (
      id SERIAL PRIMARY KEY, organization_id INTEGER, token_reference TEXT, provider TEXT,
      mailbox_identifier TEXT, auth_state TEXT, scopes JSONB
    );
    CREATE TABLE stab_exports (
      id SERIAL PRIMARY KEY, organization_id INTEGER, study_id TEXT, export_type TEXT,
      tokens JSONB, markdown TEXT
    );
    CREATE TABLE audit_events (
      id SERIAL PRIMARY KEY, organization_id INTEGER, hmac_seal TEXT, action TEXT, record_hash TEXT
    );
  `);
  await db.query(`INSERT INTO integration_tokens (organization_id, provider, access_token, refresh_token) VALUES ($1,'google',$2,$3), ($1,'box',NULL,NULL), ($4,'google',$2,$3)`, [ORG, ACCESS, REFRESH, OTHER]);
  await db.query(
    `INSERT INTO organization_gateway_accounts (organization_id, gateway, account_mode, sender_identifier, credentials_ciphertext, credential_fields)
     VALUES ($1,'esg','client','ACME-ESG-01',$2,ARRAY['username','password']), ($1,'cesp','platform',NULL,NULL,'{}')`,
    [ORG, CIPHER],
  );
  await db.query(`INSERT INTO regulatory_programs (organization_id, name) VALUES ($1, 'ACM-101 IND')`, [ORG]);
  await db.query(
    `INSERT INTO licenses (organization_id, access_token, license_type, status)
     VALUES ($1,$2,'enterprise','active'), ($1,NULL,'trial','expired'), ($3,$2,'enterprise','active')`,
    [ORG, LICENSE_ACCESS, OTHER],
  );
  await db.query(
    `INSERT INTO c2c_mailbox_connections (organization_id, token_reference, provider, mailbox_identifier, auth_state, scopes)
     VALUES ($1,$2,'microsoft365','regulatory@acme.example','connected','["Mail.Read"]'),
            ($1,NULL,'manual','archive','disconnected','[]'),
            ($3,$2,'microsoft365','other@example.test','connected','[]')`,
    [ORG, MAILBOX_REFERENCE, OTHER],
  );
  await db.query(
    `INSERT INTO stab_exports (organization_id, study_id, export_type, tokens, markdown)
     VALUES ($1,'study-acm','p8_authoring',$2,'## 3.2.P.8 Stability'),
            ($3,'study-other','p8_authoring','{}','other content')`,
    [ORG, JSON.stringify(P8_TOKENS), OTHER],
  );
  await db.query(
    `INSERT INTO audit_events (organization_id, hmac_seal, action, record_hash)
     VALUES ($1,$2,'document.exported','record-hash-fixture'),
            ($1,NULL,'document.created','unsealed-record-hash'),
            ($3,$2,'other.action','other-record-hash')`,
    [ORG, AUDIT_SEAL, OTHER],
  );
});

afterAll(async () => {
  await db?.close?.();
});

const tableOf = (exp: Awaited<ReturnType<typeof exportTenantFull>>, name: string) => exp.tables.find((t) => t.table === name)!;

describe('exportTenantFull withholds credential material', () => {
  it('replaces each withheld value with a marker naming what it was, and keeps null as null', async () => {
    const exp = await exportTenantFull(asClient(), ORG);
    const tokens = tableOf(exp, 'integration_tokens');
    expect(tokens.withheldColumns).toEqual(['access_token', 'refresh_token']);
    const google = tokens.rows.find((r) => r.provider === 'google')!;
    expect(google.access_token).toBe(`[withheld: ${EXPORT_WITHHELD_COLUMNS.integration_tokens.access_token}]`);
    expect(google.refresh_token).toBe(`[withheld: ${EXPORT_WITHHELD_COLUMNS.integration_tokens.refresh_token}]`);
    const box = tokens.rows.find((r) => r.provider === 'box')!;
    expect(box.access_token).toBeNull();
    expect(box.refresh_token).toBeNull();
  });

  it('returns the rest of a gateway account: which gateway, which mode, which identity, which fields', async () => {
    const exp = await exportTenantFull(asClient(), ORG);
    const accounts = tableOf(exp, 'organization_gateway_accounts');
    expect(accounts.rowCount).toBe(2);
    const client = accounts.rows.find((r) => r.gateway === 'esg')!;
    expect(client).toMatchObject({ account_mode: 'client', sender_identifier: 'ACME-ESG-01', credential_fields: ['username', 'password'] });
    expect(client.credentials_ciphertext).toMatch(/^\[withheld: /);
    expect(accounts.rows.find((r) => r.gateway === 'cesp')!.credentials_ciphertext).toBeNull();
  });

  it('no withheld value appears anywhere in the export', async () => {
    const text = JSON.stringify(await exportTenantFull(asClient(), ORG));
    for (const secret of [ACCESS, REFRESH, CIPHER, LICENSE_ACCESS, MAILBOX_REFERENCE]) expect(text).not.toContain(secret);
  });

  it('a table with nothing to withhold is returned as stored, with no withheld list', async () => {
    const programs = tableOf(await exportTenantFull(asClient(), ORG), 'regulatory_programs');
    expect(programs.withheldColumns).toBeUndefined();
    expect(programs.rows[0]).toMatchObject({ organization_id: ORG, name: 'ACM-101 IND' });
  });

  it('still returns only the tenant’s own rows', async () => {
    const tokens = tableOf(await exportTenantFull(asClient(), ORG), 'integration_tokens');
    expect(tokens.rowCount).toBe(2);
    expect(tokens.rows.every((r) => r.organization_id === ORG)).toBe(true);
  });

  it('withholds license access material while returning license facts and retaining null', async () => {
    const licenses = tableOf(await exportTenantFull(asClient(), ORG), 'licenses');
    expect(licenses.withheldColumns).toEqual(['access_token']);
    expect(licenses.rows.find((r) => r.license_type === 'enterprise')).toMatchObject({
      access_token: '[withheld: a license access token]', license_type: 'enterprise', status: 'active',
    });
    expect(licenses.rows.find((r) => r.license_type === 'trial')).toMatchObject({ access_token: null, status: 'expired' });
  });

  it('withholds a mailbox token reference while returning connection facts and retaining null', async () => {
    const mailboxes = tableOf(await exportTenantFull(asClient(), ORG), 'c2c_mailbox_connections');
    expect(mailboxes.withheldColumns).toEqual(['token_reference']);
    expect(mailboxes.rows.find((r) => r.provider === 'microsoft365')).toMatchObject({
      token_reference: '[withheld: a mailbox token or credential-store reference]',
      mailbox_identifier: 'regulatory@acme.example', auth_state: 'connected', scopes: ['Mail.Read'],
    });
    expect(mailboxes.rows.find((r) => r.provider === 'manual')).toMatchObject({ token_reference: null, auth_state: 'disconnected' });
  });

  it('returns the recorded P.8 authoring tokens as customer data', async () => {
    const stability = tableOf(await exportTenantFull(asClient(), ORG), 'stab_exports');
    expect(stability.withheldColumns).toBeUndefined();
    expect(stability.rows[0]).toMatchObject({ tokens: P8_TOKENS, study_id: 'study-acm', markdown: '## 3.2.P.8 Stability' });
  });

  it('returns audit integrity seals unchanged and keeps an unsealed record null', async () => {
    const audit = tableOf(await exportTenantFull(asClient(), ORG), 'audit_events');
    expect(audit.withheldColumns).toBeUndefined();
    expect(audit.rows.find((r) => r.action === 'document.exported')).toMatchObject({ hmac_seal: AUDIT_SEAL, record_hash: 'record-hash-fixture' });
    expect(audit.rows.find((r) => r.action === 'document.created')!.hmac_seal).toBeNull();
  });

  it('isolates tenant rows in all four newly classified tables', async () => {
    const exp = await exportTenantFull(asClient(), ORG);
    for (const [name, count] of [['licenses', 2], ['c2c_mailbox_connections', 2], ['stab_exports', 1], ['audit_events', 2]] as const) {
      const table = tableOf(exp, name);
      expect(table.rowCount).toBe(count);
      expect(table.rows.every((r) => r.organization_id === ORG)).toBe(true);
    }
  });
});
