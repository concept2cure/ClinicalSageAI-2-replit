import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { companyExportSnapshot } from '../company-export-snapshot';
import { readCompanyDocumentsExportEnvelope } from '../company-document-envelope';

let db: PGlite;
const release = vi.fn();
const query = (sql: string, params?: unknown[]) => db.query(sql, params);
const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE TABLE organizations(id integer PRIMARY KEY); INSERT INTO organizations VALUES(7); CREATE TABLE export_work(id integer)');
  await db.exec(`CREATE TABLE company_document_grants(organization_id integer,user_id integer,updated_at timestamptz);
    INSERT INTO company_document_grants VALUES(7,3,'2026-10-18T01:02:03.123456Z')`);
});
afterAll(async () => { await db?.close(); });

describe('company return snapshot lifetime', () => {
  it('returns a completed snapshot and releases its checked-out connection', async () => {
    expect(await companyExportSnapshot(pool, 7, async client => (await client.query('SELECT id FROM organizations')).rows)).toEqual([{ id: 7 }]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back a failed export transaction and releases the connection before another operation', async () => {
    release.mockClear();
    await expect(companyExportSnapshot(pool, 7, async client => {
      await client.query('INSERT INTO export_work VALUES(1)');
      throw new Error('Company metadata store became unavailable');
    })).rejects.toThrow('Company metadata store became unavailable');
    expect((await query('SELECT * FROM export_work')).rows).toEqual([]);
    expect(release).toHaveBeenCalledOnce();
    expect(await companyExportSnapshot(pool, 7, async client => (await client.query('SELECT id FROM organizations')).rows)).toEqual([{ id: 7 }]);
  });

  it('keeps timestamp microseconds and the same company digest across entry-session time zones', async () => {
    const read = () => companyExportSnapshot(pool, 7, client => readCompanyDocumentsExportEnvelope(client, 7,
      { company_documents_present: false, company_documents: null }));
    try {
      await db.exec("SET TIME ZONE 'Pacific/Honolulu'");
      const first = await read();
      expect((await query('SHOW TIME ZONE')).rows).toEqual([{ TimeZone: 'Pacific/Honolulu' }]);
      await db.exec("SET TIME ZONE 'Asia/Tokyo'");
      const second = await read();
      expect(second.sha256).toBe(first.sha256);
      expect(second.tables.company_document_grants[0].updated_at).toBe('2026-10-18T01:02:03.123456+00:00');
      expect((await query('SHOW TIME ZONE')).rows).toEqual([{ TimeZone: 'Asia/Tokyo' }]);
    } finally { await db.exec("SET TIME ZONE 'UTC'"); }
  });
});
