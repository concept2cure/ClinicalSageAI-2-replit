/**
 * AnA's register_supplier and log_nonconforming_product write through the QMS
 * routes' writer (services/qms/qms-record-create.ts), so each record carries the
 * route's §11.10(e) row, and a row that did not land is said in the tool's
 * answer. They inserted through the pool with no audit row until 2026-10-29.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  audit: [] as Array<Record<string, unknown>>,
  persisted: true,
  query: vi.fn(async (sql: string, args: unknown[] = []) => {
    if (/^\s*INSERT INTO qms_suppliers\b/.test(sql)) {
      return { rows: [{ id: 21, supplier_name: args[1], criticality: args[4], approval_status: 'pending' }] };
    }
    if (/^\s*INSERT INTO qms_nonconforming_products\b/.test(sql)) {
      return { rows: [{ id: 31, nc_number: args[1], source: args[4], disposition: 'pending' }] };
    }
    return { rows: [] };
  }),
}));

vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'member' }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'member' }));
vi.mock('../../audit/audit-write-outcome', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordAuditRow: async (entry: Record<string, unknown>) => {
    h.audit.push(entry);
    return h.persisted ? { persisted: true, chained: true } : { persisted: false, message: 'Its audit record was not written.' };
  },
}));

import { getToolHandler } from '../AnaToolExecutor';

const CONFIRMED = { organizationId: 7, userId: 42, humanConfirmed: true };
async function run(tool: string, input: Record<string, unknown>) {
  const handler = getToolHandler(tool);
  if (!handler) throw new Error(`${tool} is not registered`);
  return JSON.parse(await handler(input, CONFIRMED as never)) as Record<string, unknown>;
}

beforeEach(() => { h.audit.length = 0; h.persisted = true; h.query.mockClear(); });

describe("AnA's QMS record tools write the route's audited record", () => {
  it('register_supplier records the supplier, pending, with its audit row', async () => {
    const out = await run('register_supplier', { supplier_name: 'Acme Resins', criticality: 'critical' });
    expect(out).toMatchObject({ ok: true, id: 21, approval_status: 'pending', auditTrail: { persisted: true } });
    expect(h.audit).toEqual([expect.objectContaining({
      action: 'mdx.qms.supplier.qualify', tenantId: 7, userId: 42, resourceType: 'qms_supplier', resourceId: 21,
    })]);
  });

  it('log_nonconforming_product records the nonconformance with its audit row', async () => {
    const out = await run('log_nonconforming_product', { nc_number: 'NC-2026-015', description: 'Weld porosity on housing lot 7' });
    expect(out).toMatchObject({ ok: true, id: 31, disposition: 'pending', auditTrail: { persisted: true } });
    expect(h.audit).toEqual([expect.objectContaining({
      action: 'mdx.qms.nonconforming.create', tenantId: 7, userId: 42, resourceType: 'qms_nonconforming_product', resourceId: '31',
    })]);
  });

  it('says so when the audit row did not land', async () => {
    h.persisted = false;
    const out = await run('register_supplier', { supplier_name: 'Acme Resins', criticality: 'major' });
    expect(String(out.message)).toContain('Its audit record was not written.');
  });
});
