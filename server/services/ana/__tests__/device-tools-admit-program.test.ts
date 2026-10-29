/**
 * AnA's two device-record tools file a row under a project only when the
 * caller's organization owns it (D3, 2026-10-29;
 * docs/evidence/D3-DEVICE-WRITES-ADMIT-PROGRAM/2026-10-29/ana-tools-and-role-gate/).
 *
 * 8d37e8ad made POST/PATCH /api/mdx/udi and /api/mdx/labeling ask
 * `programInOrganization` before they write. Its README handed on
 * `create_udi_record` and `create_labeling_document`: their handler bodies
 * insert the model's `program_id` with no ownership check. The bodies do. The
 * tools do not: every handler is registered through `registerToolHandler`,
 * whose wrapper runs, before the handler,
 *
 *   - `writeRoleRefusal`: both tools are class `confirm`, so a caller without an
 *     editor role (GOVERNED_WRITE_ROLES, the set `requireEditorAccess` uses) is
 *     refused;
 *   - `foreignProgramRefusal` (tool-record-scope.ts): a `program_id` the
 *     organization does not own, or one that cannot be checked, is refused.
 *
 * That has held since 2026-10-22. Nothing pinned it for these two tools. This
 * file does, through the real wrapper, the real tool-record-scope, the real
 * `programInOrganization` and the real handlers, against a database double that
 * records every statement. Only the database and the role lookup are doubles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** The caller organization's own project, soft-deleted. */
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Sent = { kind: 'ownership' } | { kind: 'write'; table: string; programId: unknown } | { kind: 'other'; sql: string };

const h = vi.hoisted(() => {
  const state = { owner: new Map<string, number>(), deleted: new Set<string>(), ownershipDown: false, role: 'member' as string | null };
  /** Every statement the tools sent, in order. */
  const sent: Sent[] = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (/FROM regulatory_programs/.test(sql)) {
      sent.push({ kind: 'ownership' });
      if (state.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      const [id, org] = args as [string, number];
      const live = !(state.deleted.has(id) && /deleted_at IS NULL/.test(sql));
      return { rows: state.owner.get(id) === org && live ? [{ id }] : [] };
    }
    const insert = /^\s*INSERT INTO (udi_records|labeling_documents)\b/.exec(sql);
    if (insert) {
      // Both tools put organization_id in $1 and program_id in $2.
      sent.push({ kind: 'write', table: insert[1], programId: args[1] });
      return { rows: [{ id: 1, device_name: args[2] }] };
    }
    sent.push({ kind: 'other', sql });
    return { rows: [] };
  });
  return { state, sent, query };
});

vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
// The organization role of the verified principal (editor-role.ts reads it here).
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => h.state.role }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => h.state.role }));

import { getToolHandler } from '../AnaToolExecutor';
import { toolAuthorizationOf } from '../tool-authorization';

const CONFIRMED = { organizationId: ORG, userId: 42, humanConfirmed: true };

const TOOLS = [
  { tool: 'create_udi_record', table: 'udi_records', input: { device_name: 'Infusion pump', udi_di: '00812345678901', issuing_agency: 'GS1' } },
  { tool: 'create_labeling_document', table: 'labeling_documents', input: { device_name: 'Infusion pump', doc_kind: 'ifu' } },
] as const;

async function run(tool: string, input: Record<string, unknown>) {
  const handler = getToolHandler(tool);
  if (!handler) throw new Error(`${tool} is not registered`);
  return JSON.parse(await handler(input, CONFIRMED as never)) as Record<string, unknown>;
}
const writes = () => h.sent.filter(s => s.kind === 'write');
const anyWriteSql = () => h.query.mock.calls.some(([sql]) => /^\s*(insert|update|delete)\b/i.test(String(sql)));

beforeEach(() => {
  h.sent.length = 0;
  h.query.mockClear();
  h.state.owner = new Map([[OWN, ORG], [FOREIGN, OTHER_ORG], [DELETED, ORG]]);
  h.state.deleted = new Set([DELETED]);
  h.state.ownershipDown = false;
  h.state.role = 'member';
});

describe.each(TOOLS)('$tool: the project a record is filed under must be the caller organization\'s', ({ tool, table, input }) => {
  it('is a confirm-class write (the premise of the role check)', () => {
    expect(toolAuthorizationOf(tool, { ...input }).class).toBe('confirm');
  });

  it.each([
    ["another organization's project", FOREIGN],
    ['a project that does not exist', MISSING],
    ["the organization's own deleted project", DELETED],
  ])('refuses %s, and writes no row', async (_label, programId) => {
    const out = await run(tool, { ...input, program_id: programId });
    // First, so a failure shows the row that was written and the project it names.
    expect(h.sent).toEqual([{ kind: 'ownership' }]);
    expect(anyWriteSql()).toBe(false);
    expect(out.code).toBe('PROGRAM_NOT_IN_ORGANIZATION');
    expect(String(out.error)).toMatch(/program_id does not name one of this organization's programs, so nothing was read or changed/);
    // The model's id is not echoed back into the conversation.
    expect(JSON.stringify(out)).not.toContain(programId);
  });

  it('says so when ownership cannot be checked, and writes no row', async () => {
    h.state.ownershipDown = true;
    const out = await run(tool, { ...input, program_id: OWN });
    expect(writes()).toEqual([]);
    expect(out.code).toBe('PROGRAM_CHECK_UNAVAILABLE');
    expect(String(out.error)).toMatch(/could not be checked just now, so nothing was read or changed/);
    expect(anyWriteSql()).toBe(false);
  });

  it("files the record under the caller's own project, after asking", async () => {
    const out = await run(tool, { ...input, program_id: OWN });
    expect(out.ok).toBe(true);
    expect(h.sent).toEqual([{ kind: 'ownership' }, { kind: 'write', table, programId: OWN }]);
  });

  it('with no program_id, files an organization-level record without asking, as before', async () => {
    const out = await run(tool, { ...input });
    expect(out.ok).toBe(true);
    expect(h.sent).toEqual([{ kind: 'write', table, programId: null }]);
  });

  it('refuses a viewer, as the HTTP write refuses one, and writes no row', async () => {
    h.state.role = 'viewer';
    const out = await run(tool, { ...input, program_id: OWN });
    expect(writes()).toEqual([]);
    expect(anyWriteSql()).toBe(false);
    expect(String(out.error)).toMatch(/needs an editor role in this organization\. Nothing was changed/);
  });
});
