/**
 * One scope evaluation asks each project's access once, not once per source (2026-11-12). A catalog read of a
 * sponsor's four projects made about 28,000 database round trips, most of them the same access question repeated
 * for every source. The answer is reused inside one evaluation only: the next evaluation asks again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ scope: vi.fn(), access: vi.fn(), still: vi.fn() }));
vi.mock('../../c2c/current-program-access', () => {
  class ProgramReadAccessError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
  return { getCurrentAccessibleProgramScope: h.scope, requireCurrentProgramAccess: h.access, requireProgramScopeStillCurrent: h.still, ProgramReadAccessError };
});
vi.mock('../record-source', () => ({ createNativeRecordAdmission: () => async () => undefined, NATIVE_RECORD_ORIGIN: 'native_record_snapshot' }));
vi.mock('../../ana/project-scope-admission', () => ({ AnaProjectScopeError: class extends Error {} }));

import { ProgramReadAccessError } from '../../c2c/current-program-access';
import { getCurrentReadableSourceScope, requireSourceReadScopeStillCurrent } from '../source-read-access';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const row = (id: number, program: string, workspace: number | null = null) => ({ id, organization_id: 7, visibility_class: 'client_private',
  source_type: 'client_document', client_program_id: program, client_workspace_id: workspace, is_current: true, checksum: 'c', provenance: {}, metadata: {} });
const rows = [row(1, A), row(2, A), row(3, A), row(4, B), row(5, B)];
const q = { query: vi.fn(async (_sql: string, args?: unknown[]) => {
  const selected = args?.[1] as number[] | null;
  return { rows: selected ? rows.filter(r => selected.includes(r.id)) : rows };
}) };
const input = { organizationId: 7, userId: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  h.scope.mockResolvedValue({ actor: { userId: 3, role: 'member' }, programIds: [A, B] });
  h.access.mockImplementation(async (_q: unknown, p: { programId: string }) => ({ programId: p.programId, projectId: 1, clientWorkspaceId: 40 }));
  h.still.mockResolvedValue(undefined);
});

describe('a source scope evaluation', () => {
  it('asks each project once for all of its sources', async () => {
    const scope = await getCurrentReadableSourceScope(q as never, input);
    expect(scope.sourceIds).toEqual([1, 2, 3, 4, 5]);
    expect(h.access.mock.calls.map(c => c[1].programId)).toEqual([A, B]);
  });

  it('asks again in the next evaluation, so a grant revoked during a read is still caught', async () => {
    const scope = await getCurrentReadableSourceScope(q as never, input);
    h.access.mockImplementation(async (_q: unknown, p: { programId: string }) => {
      if (p.programId === B) throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'denied');
      return { programId: p.programId, projectId: 1, clientWorkspaceId: 40 };
    });
    await expect(requireSourceReadScopeStillCurrent(q as never, input, scope)).rejects.toMatchObject({ status: 503, code: 'SOURCE_READ_ACCESS_CHANGED' });
    expect(h.access).toHaveBeenCalledTimes(4);
  });

  it('refuses every source of a refused project, and still admits the other project\'s', async () => {
    h.access.mockImplementation(async (_q: unknown, p: { programId: string }) => {
      if (p.programId === A) throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'denied');
      return { programId: p.programId, projectId: 1, clientWorkspaceId: 40 };
    });
    expect((await getCurrentReadableSourceScope(q as never, input)).sourceIds).toEqual([4, 5]);
    expect(h.access).toHaveBeenCalledTimes(2);
  });

  it('still checks each source\'s own recorded workspace against the project\'s', async () => {
    rows.push(row(6, B, 99));
    try {
      expect((await getCurrentReadableSourceScope(q as never, input)).sourceIds).toEqual([1, 2, 3, 4, 5]);
      await expect(getCurrentReadableSourceScope(q as never, { ...input, sourceIds: [6] })).rejects.toMatchObject({ status: 409, code: 'SOURCE_PARENT_UNRESOLVED' });
    } finally { rows.pop(); }
  });
});
