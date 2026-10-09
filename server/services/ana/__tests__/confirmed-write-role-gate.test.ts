/**
 * A confirmed AnA write runs only for a caller who may edit in the organization.
 *
 * Weekly launch-catalog review 2026-09-28, open item 1. The tool register
 * classes every record-changing tool `confirm`, so it runs only on a person's
 * yes — but nothing asked WHO said yes. /api/ana-ri is mounted behind
 * authenticateToken only, and 93 of the 179 confirm/conditional handlers wrote
 * a governed record with no role check (among them create_qms_document,
 * save_document_to_vault, update_vault_document, create_protocol_document), so a
 * `viewer` could confirm any of them from chat. The HTTP routes for the same
 * records run requireEditorAccess (GOVERNED_WRITE_ROLES).
 *
 * The check lives in the registry wrapper, beside the confirmation gate, so it
 * covers every handler and every way of reaching one. The role is read from
 * organization_users for the verified principal, never from the tool input.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { query, connect, resolveSignerOrgRole } = vi.hoisted(() => {
  const query = vi.fn(async (_sql?: string, _params?: unknown[]) => ({ rows: [] as unknown[] }));
  return {
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
    resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'viewer'),
  };
});
vi.mock('../../../db', () => ({ pool: { query, connect }, getPool: () => ({ query, connect }) }));
vi.mock('../../../db.js', () => ({ pool: { query, connect }, getPool: () => ({ query, connect }) }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { getToolHandler } from '../AnaToolExecutor';
import { toolAuthorizationOf } from '../tool-authorization';

const CONFIRMED = { organizationId: 7, userId: 42, humanConfirmed: true } as never;
// With the person's reason: a governed write without one is refused before any gate below (governed-reason-not-invented.test.ts).
const CREATE_SOP = { doc_number: 'SOP-901', title: 'Supplier qualification', doc_type: 'sop', reason: 'New SOP for supplier qualification.' };

async function run(tool: string, input: Record<string, unknown>, ctx: unknown = CONFIRMED) {
  return JSON.parse(await getToolHandler(tool)!(input, ctx as never));
}
const wroteAnything = () => query.mock.calls.some(([sql]) => /^\s*(insert|update|delete)\b/i.test(String(sql)));

beforeEach(() => {
  vi.clearAllMocks();
  resolveSignerOrgRole.mockImplementation(async () => 'viewer');
});

describe('a confirmed write needs an editor role', () => {
  it('create_qms_document is a confirm-class write (the premise)', () => {
    expect(toolAuthorizationOf('create_qms_document', CREATE_SOP).class).toBe('confirm');
  });

  it.each([
    ['a viewer', 'viewer'],
    ['someone who is not a member', null],
    ['an unknown role', 'auditor-guest'],
  ])('refuses %s, before the handler runs, and writes nothing', async (_label, role) => {
    resolveSignerOrgRole.mockImplementation(async () => role);
    const out = await run('create_qms_document', CREATE_SOP);
    expect(out.error).toMatch(/editor role/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(connect).not.toHaveBeenCalled();
    expect(wroteAnything()).toBe(false);
  });

  it('reads the role for the verified principal, not for anything in the input', async () => {
    await run('create_qms_document', { ...CREATE_SOP, userId: 1, organizationId: 1, role: 'admin' });
    expect(resolveSignerOrgRole).toHaveBeenCalledWith(42, 7);
  });

  it('fails closed when the role cannot be read', async () => {
    resolveSignerOrgRole.mockImplementation(async () => {
      throw new Error('connection refused');
    });
    const out = await run('create_qms_document', CREATE_SOP);
    expect(out.error).toMatch(/could not confirm your role/);
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses a confirmed write with no identified member', async () => {
    const out = await run('create_qms_document', CREATE_SOP, { organizationId: 7, humanConfirmed: true });
    expect(out.error).toMatch(/identified member/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('lets an editor role through to the handler', async () => {
    resolveSignerOrgRole.mockImplementation(async () => 'member');
    await run('create_qms_document', CREATE_SOP);
    expect(connect).toHaveBeenCalled();
  });

  it('does not ask for a role on a read', async () => {
    const read = Object.keys((await import('../tool-authorization')).TOOL_REGISTER).find(
      (n) => toolAuthorizationOf(n, {}).class === 'read' && getToolHandler(n)
    )!;
    await getToolHandler(read)!({}, CONFIRMED).catch(() => undefined);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
});
