/**
 * Only the active agreement can be accepted, and an agreement cannot be
 * published without its text.
 *
 * Until 2026-10-15:
 * - recordAcceptance accepted a draft or superseded agreement: it read the row
 *   by id with no status check, so a user could be recorded as accepting terms
 *   that were not (or were no longer) in force;
 * - publishAgreement accepted neither body nor url, superseded the active
 *   agreement with the empty one, and every user then owed an acceptance of
 *   an agreement no one could read (or accept: acceptance refuses a text-less
 *   agreement).
 */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as PGlite | null }));
vi.mock('../../../db.js', () => {
  const query = async (sql: string, args?: unknown[]) => {
    if (!h.pg) return { rows: [] };
    if (!args && sql.includes(';')) return (await h.pg.exec(sql)).at(-1) ?? { rows: [] };
    return h.pg.query(sql, args);
  };
  return { pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { publishAgreement, recordAcceptance } from '../eula-service';

const SUPERSEDED = '30000000-0000-4000-8000-000000000001';
const DRAFT = '30000000-0000-4000-8000-000000000002';
const ACTIVE = '30000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  vi.stubEnv('AUDIT_HMAC_KEY', 'synthetic-eula-audit-key-only-for-local-tests');
  h.pg = new PGlite();
  await h.pg.exec(await readFile('db/migrations/20260621_intelligent_licensing_eula.sql', 'utf8'));
  await h.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pg.exec(await readFile('migrations/20260921_audit_logs_chain_seq.sql', 'utf8'));
  await h.pg.query(
    `INSERT INTO license_agreements(id,agreement_key,version,title,body,scope,status) VALUES
       ($1,'terms','1','Terms v1','Old terms.','user','superseded'),
       ($2,'terms','3','Terms v3','Draft terms.','user','draft'),
       ($3,'terms','2','Terms v2','Current terms.','user','active')`,
    [SUPERSEDED, DRAFT, ACTIVE],
  );
});
afterAll(async () => { await h.pg?.close(); vi.unstubAllEnvs(); });

describe('recordAcceptance', () => {
  it('refuses a superseded or draft agreement and records nothing', async () => {
    for (const id of [SUPERSEDED, DRAFT]) {
      await expect(recordAcceptance({ agreementId: id, userId: 7, organizationId: 9 }), id).rejects.toThrow(/not active|is (superseded|draft)/);
    }
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(0);
  });

  it('still records acceptance of the active agreement', async () => {
    await recordAcceptance({ agreementId: ACTIVE, userId: 7, organizationId: 9 });
    expect((await h.pg!.query('SELECT * FROM license_acceptances')).rows).toHaveLength(1);
  });
});

describe('publishAgreement', () => {
  it('refuses an agreement with neither body nor url, and leaves the active one active', async () => {
    await expect(publishAgreement({ agreementKey: 'terms', version: '4', title: 'Terms v4' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(publishAgreement({ agreementKey: 'terms', version: '4', title: 'Terms v4', body: '   ' })).rejects.toMatchObject({ statusCode: 400 });
    const active = await h.pg!.query<{ id: string }>(`SELECT id FROM license_agreements WHERE agreement_key = 'terms' AND status = 'active'`);
    expect(active.rows.map(r => r.id)).toEqual([ACTIVE]);
  });
});
