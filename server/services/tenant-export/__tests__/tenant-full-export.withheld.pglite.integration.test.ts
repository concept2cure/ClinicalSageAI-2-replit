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
  `);
  await db.query(`INSERT INTO integration_tokens (organization_id, provider, access_token, refresh_token) VALUES ($1,'google',$2,$3), ($1,'box',NULL,NULL), ($4,'google',$2,$3)`, [ORG, ACCESS, REFRESH, OTHER]);
  await db.query(
    `INSERT INTO organization_gateway_accounts (organization_id, gateway, account_mode, sender_identifier, credentials_ciphertext, credential_fields)
     VALUES ($1,'esg','client','ACME-ESG-01',$2,ARRAY['username','password']), ($1,'cesp','platform',NULL,NULL,'{}')`,
    [ORG, CIPHER],
  );
  await db.query(`INSERT INTO regulatory_programs (organization_id, name) VALUES ($1, 'ACM-101 IND')`, [ORG]);
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
    for (const secret of [ACCESS, REFRESH, CIPHER]) expect(text).not.toContain(secret);
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
});
