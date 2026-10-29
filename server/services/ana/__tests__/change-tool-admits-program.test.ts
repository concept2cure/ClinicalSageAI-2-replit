/**
 * AnA's qms_change_create raises a change under a project only when the
 * caller's organization owns it (founder decision P-60, D2 / D6, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/).
 *
 * 20261029l gives qms_change_controls a project key, so a product's Engineering
 * screen reads its own design changes. The tool takes an optional `program_id`
 * and createChange stamps it. The ownership question is the registry wrapper's
 * (`foreignProgramRefusal`, tool-record-scope.ts, over programInOrganization),
 * which runs before every handler, as nonconforming-tool-admits-program.test.ts
 * pins for log_nonconforming_product. Only the database, the audit write and
 * the role lookup are doubles.
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
    if (/^\s*INSERT INTO qms_change_controls\b/.test(sql)) {
      const cols = /INSERT INTO qms_change_controls \(([^)]*)\)/.exec(sql)?.[1].split(',').map((c) => c.trim()) ?? [];
      const at = cols.indexOf('program_id');
      sent.push({ kind: 'write', programId: at >= 0 ? args[at] : 'NOT WRITTEN' });
      return { rows: [{ id: 1, change_number: args[1], status: 'proposed', classification: 'minor' }] };
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
vi.mock('../../audit/audit-write-outcome.js', () => ({ recordAuditRow: async () => ({ persisted: true, chained: true }) }));
vi.mock('../../audit/audit-write-outcome', () => ({ recordAuditRow: async () => ({ persisted: true, chained: true }) }));

import { getToolHandler } from '../AnaToolExecutor';
import { QMS_CHANGE_CREATE } from '../qms-labeling-analytics-tool-defs';

const CONFIRMED = { organizationId: ORG, userId: 42, humanConfirmed: true };
const INPUT = {
  change_number: 'CC-2026-032', title: 'Replace housing resin supplier', change_type: 'supplier',
  reason: 'The current resin supplier is discontinuing the grade we use',
};

async function run(input: Record<string, unknown>) {
  const handler = getToolHandler('qms_change_create');
  if (!handler) throw new Error('qms_change_create is not registered');
  return JSON.parse(await handler(input, CONFIRMED as never)) as Record<string, unknown>;
}
const writes = () => h.sent.filter((s) => s.kind === 'write');

beforeEach(() => {
  h.sent.length = 0;
  h.query.mockClear();
  h.state.owner = new Map([[OWN, ORG], [FOREIGN, OTHER_ORG]]);
  h.state.role = 'member';
});

describe('qms_change_create: the project a change is raised against', () => {
  it('offers the model a program_id to name the project', () => {
    expect(Object.keys(QMS_CHANGE_CREATE.input_schema.properties as Record<string, unknown>)).toContain('program_id');
  });

  it("raises it under the caller's own project, after asking", async () => {
    const out = await run({ ...INPUT, program_id: OWN });
    expect(out.ok).toBe(true);
    expect(h.sent.filter((s) => s.kind !== 'other')).toEqual([{ kind: 'ownership' }, { kind: 'write', programId: OWN }]);
  });

  it("refuses another organization's project, and writes no row", async () => {
    const out = await run({ ...INPUT, program_id: FOREIGN });
    expect(writes()).toEqual([]);
    expect(out.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
  });

  it('with no program_id, raises an organization-level change without asking, as before', async () => {
    const out = await run({ ...INPUT });
    expect(out.ok).toBe(true);
    expect(h.sent.filter((s) => s.kind !== 'other')).toEqual([{ kind: 'write', programId: null }]);
  });
});
