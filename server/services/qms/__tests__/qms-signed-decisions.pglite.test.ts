/**
 * The domain writes of the signed QMS decisions, against PostgreSQL in process
 * with the canonical DDL: a disposition is written once, on an open record of
 * the signer's organization; a supplier's standing changes, or refuses when it
 * would not. The ceremony around them is covered by the route test
 * (server/routes/__tests__/qms-signed-decisions.test.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { NcDispositionRefused, recordNcDisposition } from '../nonconformance-disposition';
import { SupplierApprovalRefused, recordSupplierApproval } from '../supplier-approval';

let jdb: JourneyDb;
const client = () => ({ query: (sql: string, params?: unknown[]) => jdb.pglite.query<Record<string, unknown>>(sql, params) });

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users']) +
      extractTableDdl('migrations/20260524_program_workbench_schema.sql', ['regulatory_programs']),
    migrations: ['migrations/20260511_qms_and_labeling.sql'],
  });
  await jdb.pglite.exec(`INSERT INTO organizations (id, name, slug) VALUES (1, 'Sponsor', 'sponsor'), (2, 'Other', 'other');`);
}, 60_000);
beforeEach(async () => {
  await jdb.pglite.exec(`
    TRUNCATE qms_nonconforming_products, qms_suppliers RESTART IDENTITY CASCADE;
    INSERT INTO qms_suppliers (organization_id, supplier_name, criticality, approval_status) VALUES
      (1, 'Acme Resins', 'critical', 'pending'), (2, 'Foreign Co', 'minor', 'pending');
    INSERT INTO qms_nonconforming_products (organization_id, nc_number, description, disposition) VALUES
      (1, 'NC-001', 'Assay out of specification', NULL),
      (1, 'NC-002', 'Label misprint', 'pending'),
      (2, 'NC-003', 'Foreign record', NULL);
  `);
});
afterAll(async () => { await jdb?.close(); });

const refusal = (p: Promise<unknown>) => p.then(() => null,
  (e: unknown) => (e instanceof NcDispositionRefused || e instanceof SupplierApprovalRefused ? e.code : String(e)));

describe('a signed nonconformance disposition', () => {
  it('sets an open record once, with the signer reason as its rationale', async () => {
    const row = await recordNcDisposition(client(), 1, 1, 'rework', 'Re-test after column replacement.');
    expect(row).toMatchObject({ nc_number: 'NC-001', disposition: 'rework', disposition_rationale: 'Re-test after column replacement.' });
    expect(row.disposition_at).toBeTruthy();
    expect(await refusal(recordNcDisposition(client(), 1, 1, 'scrap', 'Second thoughts.'))).toBe('NC_ALREADY_DISPOSITIONED');
    expect((await jdb.pglite.query('SELECT disposition FROM qms_nonconforming_products WHERE id = 1')).rows).toEqual([{ disposition: 'rework' }]);
  });

  it("treats 'pending' as open, and never reaches another organization's record", async () => {
    expect(await recordNcDisposition(client(), 1, 2, 'use_as_is', 'Within tolerance per the specification.')).toMatchObject({ disposition: 'use_as_is' });
    expect(await refusal(recordNcDisposition(client(), 1, 3, 'scrap', 'Not ours to decide.'))).toBe('NC_NOT_FOUND');
    expect((await jdb.pglite.query('SELECT disposition FROM qms_nonconforming_products WHERE id = 3')).rows).toEqual([{ disposition: null }]);
  });
});

describe("a signed supplier standing", () => {
  it('approves with the signing day as its approval date, revokes, and refuses an unchanged or foreign standing', async () => {
    const approved = await recordSupplierApproval(client(), 1, 1, 'approved');
    expect(approved).toMatchObject({ approval_status: 'approved' });
    expect(approved.approval_date).toBeTruthy();
    expect(await refusal(recordSupplierApproval(client(), 1, 1, 'approved'))).toBe('SUPPLIER_STANDING_UNCHANGED');
    expect(await recordSupplierApproval(client(), 1, 1, 'revoked')).toMatchObject({ approval_status: 'revoked' });
    expect(await refusal(recordSupplierApproval(client(), 1, 2, 'approved'))).toBe('SUPPLIER_NOT_FOUND');
    expect((await jdb.pglite.query('SELECT approval_status FROM qms_suppliers WHERE id = 2')).rows).toEqual([{ approval_status: 'pending' }]);
  });
});
