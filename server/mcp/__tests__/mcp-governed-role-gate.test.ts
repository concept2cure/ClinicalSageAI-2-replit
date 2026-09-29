/**
 * A governed MCP tool runs only for a member who may edit in the organization.
 *
 * Coverage-gap sweep 2026-09-28, GS-S-1 (confirmed 2 of 3; the dissent was
 * that MCP is off in production, which is true — MCP_ENABLED is set nowhere —
 * and is why this is a precondition for turning it on, not a live exposure).
 * registerTool checked only the token's OAuth scope, and a first-party login
 * token resolves to every scope, so a viewer's own session could run
 * c2c_file_draft_for_review — a governed submission_leaves placement that the
 * REST route (requireRole AUTHOR) and AnA (writeRoleRefusal) both refuse them.
 * The wrapper now makes the same live organization_users decision as AnA
 * (server/services/part11/editor-role.ts) for every `governed: true` tool.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveSignerOrgRole, audits } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'viewer'),
  audits: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async (entry: Record<string, unknown>) => { audits.push(entry); return { persisted: true }; }) },
}));

import { registerTool } from '../tools/runtime';

type Handler = (input: Record<string, unknown>, extra: { authInfo?: unknown }) => Promise<any>;

function capture(spec: Record<string, unknown>) {
  let handler: Handler | null = null;
  const server = { registerTool: (_name: string, _meta: unknown, fn: Handler) => { handler = fn; } };
  registerTool(server as any, spec as any, {} as any);
  return handler!;
}

const principal = {
  userId: 42, organizationId: 7, organizationUuid: null, role: 'admin', // a claim, never trusted for this
  email: 'viewer@tenant.example', clientId: 'first-party', scopes: ['c2c:file', 'c2c:read'], tokenUse: 'platform',
};
const authInfo = { token: 't', clientId: 'first-party', scopes: principal.scopes, extra: { principal } };

function spec(governed: boolean, run = vi.fn(async () => ({ kind: 'ok', summary: 'placed', data: {} }))) {
  return { name: governed ? 'c2c_file_draft_for_review' : 'c2c_read_thing', title: 't', description: 'd', inputSchema: {}, scope: 'c2c:file', governed, implementation: 'test', run };
}

beforeEach(() => {
  vi.clearAllMocks();
  audits.length = 0;
  resolveSignerOrgRole.mockImplementation(async () => 'viewer');
});

describe('MCP governed tools need an editor role', () => {
  it.each([
    ['a viewer', async () => 'viewer'],
    ['someone who is no longer a member', async () => null],
  ])('refuses %s before the tool runs, and records the denial', async (_label, role) => {
    resolveSignerOrgRole.mockImplementation(role as never);
    const s = spec(true);
    const out = await capture(s)({ sequence_id: 1 }, { authInfo });
    expect(s.run).not.toHaveBeenCalled();
    expect(JSON.stringify(out)).toMatch(/editor role/);
    expect(resolveSignerOrgRole).toHaveBeenCalledWith(42, 7);
    expect(audits.some((a) => JSON.stringify(a).includes('denied'))).toBe(true);
  });

  it('fails closed when the role cannot be read', async () => {
    resolveSignerOrgRole.mockImplementation(async () => { throw new Error('connection refused'); });
    const s = spec(true);
    const out = await capture(s)({}, { authInfo });
    expect(s.run).not.toHaveBeenCalled();
    expect(JSON.stringify(out)).toMatch(/could not confirm your role/);
  });

  it('lets an editor run the governed tool', async () => {
    resolveSignerOrgRole.mockImplementation(async () => 'member');
    const s = spec(true);
    await capture(s)({}, { authInfo });
    expect(s.run).toHaveBeenCalledTimes(1);
  });

  it('does not ask for a role on a tool that is not governed', async () => {
    const s = spec(false);
    await capture(s)({}, { authInfo });
    expect(s.run).toHaveBeenCalledTimes(1);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
});
