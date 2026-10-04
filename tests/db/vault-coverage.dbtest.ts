/**
 * Vault coverage on the real schema (VR-15, row D2): the resolver's required
 * list and the Vault's confirmed filings, read as the runtime role in the
 * tenant's scope with RLS enforcing.
 *
 * Robust to whichever rule pack a deployment seeds: it reads what is required,
 * files a confirmed document at one missing section, and expects exactly one
 * more covered. A suggestion at another missing section must not count.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-coverage ';
const CODE = 'DBTEST-COVERAGE';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let programId: string;

async function coverage() {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const { readVaultCoverage } = await import('../../server/services/vault/vault-coverage');
  return runWithTenantScope(
    { tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'tests/db/vault-coverage.dbtest.ts' },
    () => readVaultCoverage(pool, { view: 'pharma', programType: 'ind', primaryAgency: 'FDA', programId, organizationId: orgId }),
  );
}

async function fileAt(code: string, section: string, status: 'confirmed' | 'suggested') {
  await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
       content_hash, s3_bucket, s3_key, file_name, folder_id, ctd_section, placement_status)
     VALUES ($1, $2, $3, 'Doc', 'OTHER', '1.0', $4, 'local', 'k', 'doc.pdf', $5, $6, $7)`,
    [programId, orgId, code, code.padEnd(64, '0').slice(0, 64), `module-${section[0]}`, section, status],
  );
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, 'dbtest-coverage-tenant')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}tenant`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE}%`],
  );
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 'DBTEST-COVERAGE', $2, 'ind', 'drug', 'FDA', 'Coverin 5mg') RETURNING id`,
    [`${PROBE}program`, orgId],
  );
  programId = String(prog.rows[0].id);
});

afterAll(async () => {
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]).catch(() => {});
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE}%`],
  ).catch(() => {});
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]).catch(() => {});
  await owner.end().catch(() => {});
});

describe('Vault coverage on PostgreSQL, as the runtime role (VR-15)', () => {
  it('counts one more covered section for a confirmed filing, and none for a suggestion', async () => {
    const before = await coverage();
    expect(before.state, JSON.stringify(before)).toBe('available');
    if (before.state !== 'available') return;
    const missing = before.modules.flatMap((m) => m.missing);
    expect(missing.length, 'the required list names sections to cover').toBeGreaterThan(1);

    await fileAt(`${CODE}-SUGGESTED`, missing[1], 'suggested');
    await fileAt(`${CODE}-CONFIRMED`, missing[0], 'confirmed');
    const after = await coverage();
    expect(after).toMatchObject({ state: 'available', required: before.required, covered: before.covered + 1 });
    if (after.state === 'available') {
      expect(after.modules.flatMap((m) => m.covered)).toContain(missing[0]);
      expect(after.modules.flatMap((m) => m.missing)).toContain(missing[1]);
    }
  });
});
