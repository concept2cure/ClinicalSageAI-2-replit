/**
 * AnA's log_nonconforming_product files a non-conformance under a project only
 * when the caller's organization owns it (D2 / D6, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-panels-keyed/).
 *
 * 20261029d gives qms_nonconforming_products a program key, so the Engineering
 * screen reads a project's own records. The tool takes an optional
 * `program_id` and stamps it. The ownership question is the registry wrapper's
 * (`foreignProgramRefusal`, tool-record-scope.ts, over programInOrganization),
 * which runs before every handler, as risk-tool-admits-program.test.ts pins for
 * create_risk_item. Only the database and the role lookup are doubles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Sent = { kind: 'ownership' } | { kind: 'write'; programId: unknown } | { kind: 'other'; sql: string };

const h = vi.hoisted(() => {
  const state = { owner: new Map<string, number>(), role: 'member' as string | null };
  const sent: Sent[] = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (/FROM regulatory_programs/.test(sql)) {
      sent.push({ kind: 'ownership' });
      const [id, org] = args as [string, number];
      return { rows: state.owner.get(id) === org ? [{ id }] : [] };
    }
    if (/^\s*INSERT INTO qms_nonconforming_products\b/.test(sql)) {
      const at = /program_id/.test(sql) ? args.length - 1 : -1;
      sent.push({ kind: 'write', programId: at >= 0 ? args[at] : 'NOT WRITTEN' });
      return { rows: [{ id: 1, nc_number: args[1], source: null, disposition: 'pending' }] };
    }
    sent.push({ kind: 'other', sql });
    return { rows: [] };
  });
  return { state, sent, query };
});

vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => h.state.role }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => h.state.role }));

import { getToolHandler } from '../AnaToolExecutor';
import { LOG_NONCONFORMING_PRODUCT } from '../qms-labeling-analytics-tool-defs';

const CONFIRMED = { organizationId: ORG, userId: 42, humanConfirmed: true };
const INPUT = { nc_number: 'NC-2026-015', description: 'Weld porosity on housing lot 7', device_name: 'Infusion pump' };

async function run(input: Record<string, unknown>) {
  const handler = getToolHandler('log_nonconforming_product');
  if (!handler) throw new Error('log_nonconforming_product is not registered');
  return JSON.parse(await handler(input, CONFIRMED as never)) as Record<string, unknown>;
}
const writes = () => h.sent.filter((s) => s.kind === 'write');

beforeEach(() => {
  h.sent.length = 0;
  h.query.mockClear();
  h.state.owner = new Map([[OWN, ORG], [FOREIGN, OTHER_ORG]]);
  h.state.role = 'member';
});

describe('log_nonconforming_product: the project a non-conformance is filed under', () => {
  it('offers the model a program_id to name the project', () => {
    expect(Object.keys(LOG_NONCONFORMING_PRODUCT.input_schema.properties as Record<string, unknown>)).toContain('program_id');
  });

  it("files it under the caller's own project, after asking", async () => {
    const out = await run({ ...INPUT, program_id: OWN });
    expect(out.ok).toBe(true);
    expect(h.sent).toEqual([{ kind: 'ownership' }, { kind: 'write', programId: OWN }]);
  });

  it("refuses another organization's project, and writes no row", async () => {
    const out = await run({ ...INPUT, program_id: FOREIGN });
    expect(writes()).toEqual([]);
    expect(out.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
  });

  it('with no program_id, files an organization-level record without asking, as before', async () => {
    const out = await run({ ...INPUT });
    expect(out.ok).toBe(true);
    expect(h.sent).toEqual([{ kind: 'write', programId: null }]);
  });
});
