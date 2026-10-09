/**
 * revise_qms_document — who may open a controlled revision (Q-0928-2).
 *
 * POST /api/mdx/qms/documents/:id/revise runs requireEditorAccess; the AnA tool
 * that does the same thing (document back to draft, approval cleared, version
 * bumped) ran no role check at all, and /api/ana-ri is mounted behind
 * authenticateToken only — so a viewer could withdraw an effective SOP from
 * chat. Its reason floor was also 3 characters where every other QMS tool asks
 * QMS_REASON_MIN (8). Weekly launch-catalog review 2026-09-28.
 *
 * The role comes from organization_users for the verified principal
 * (ctx.userId, ctx.organizationId) via resolveSignerOrgRole — never from the
 * tool input, which the model writes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { connect, recordGovernedAction, resolveSignerOrgRole } = vi.hoisted(() => {
  const clientQuery = vi.fn(async (sql: string) => {
    if (/^\s*SELECT version FROM qms_documents/i.test(sql)) return { rows: [{ version: '3.1' }] };
    if (/^\s*UPDATE qms_documents/i.test(sql)) return { rows: [{ id: 3, doc_number: 'SOP-900', version: '4.0', status: 'draft' }] };
    return { rows: [] };
  });
  return {
    clientQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
    recordGovernedAction: vi.fn(async () => ({ actionId: 'act_test', auditId: 'aud_test', sha256Chain: '' })),
    resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
  };
});
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })), connect },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })), connect }),
}));
vi.mock('../../../db.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })), connect },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })), connect }),
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));
vi.mock('../../../routes/c2c/actions.js', () => ({ recordGovernedAction }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { getToolHandler } from '../AnaToolExecutor';

const CTX = { organizationId: 7, userId: 42, humanConfirmed: true } as never;
const INPUT = { document_id: 3, reason: 'Add re-qualification cadence.' };

async function revise(input: Record<string, unknown> = INPUT, ctx: unknown = CTX) {
  return JSON.parse(await getToolHandler('revise_qms_document')!(input, ctx as never));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveSignerOrgRole.mockImplementation(async () => 'member');
});

describe('revise_qms_document refuses a caller who may not edit', () => {
  it.each([
    ['viewer', 'viewer'],
    ['not a member of the organization', null],
    ['an unknown role', 'auditor'],
  ])('%s: nothing is opened and nothing is recorded', async (_label, role) => {
    resolveSignerOrgRole.mockImplementation(async () => role);
    const out = await revise();
    expect(out.ok).not.toBe(true);
    expect(out.error).toMatch(/Insufficient permissions/);
    expect(connect).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('reads the role for the verified principal, not for anything in the input', async () => {
    resolveSignerOrgRole.mockImplementation(async () => 'viewer');
    const out = await revise({ ...INPUT, role: 'admin', userId: 1, organizationId: 1 });
    expect(out.error).toMatch(/Insufficient permissions/);
    expect(resolveSignerOrgRole).toHaveBeenCalledWith(42, 7);
    expect(connect).not.toHaveBeenCalled();
  });

  it('a reason under QMS_REASON_MIN (8) is refused, even for an editor', async () => {
    const out = await revise({ document_id: 3, reason: 'fix' });
    expect(out.error).toMatch(/at least 8 characters/i);
    expect(connect).not.toHaveBeenCalled();
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });
});

describe('revise_qms_document runs for an editor-capable role', () => {
  it.each(['admin', 'manager', 'member'])('%s opens the revision and records it', async (role) => {
    resolveSignerOrgRole.mockImplementation(async () => role);
    const out = await revise();
    expect(out.ok).toBe(true);
    expect(out.version).toBe('4.0');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
  });
});
