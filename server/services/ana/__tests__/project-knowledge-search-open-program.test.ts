/**
 * project_knowledge_search finds the project a v2 conversation is in
 * (row 74, ADR-0015 §6; PF-10 F6, decided 2026-10-05).
 *
 * The tool searched only when its context held an integer project id AND the
 * tenant uuid. On the chat stream neither was true for a v2 project: the
 * project arrives as a regulatory_programs UUID, whose integer form is null,
 * and the stream's tool context carries no tenant uuid. So with a project open
 * AnA answered "No active project is in context" — she could not search the
 * project she was working in.
 *
 * Pinned here, through the real handler:
 *   - a program UUID is resolved to its project by the one canonical resolver
 *     (integerProjectForRef), for the caller's own organization;
 *   - the tenant uuid comes from the request's own tenant scope, and only for
 *     the same tenant;
 *   - a program the resolver does not give for this organization is not
 *     searched (no fallback to anything else), and nothing is invented
 *     outside a scope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const OURS = '7abb1c22-0000-4000-8000-000000000001';
const ORG_UUID = '11111111-2222-4333-8444-555555555555';
const BROKEN = 'bbbbbbbb-0000-4000-8000-00000000000b';
const ORG8_UUID = '88888888-2222-4333-8444-555555555588';

const rag = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
const resolver = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock('../../ragRouter', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    ragRouter: {
      ...(real.ragRouter as object),
      retrieve: async (params: Record<string, unknown>) => {
        rag.calls.push(params);
        return { documents: [] };
      },
    },
  };
});

// The canonical resolver (PF-10 S6a) answers for the caller's organization only.
vi.mock('../../c2c/project-ref.js', () => ({
  integerProjectForRef: async (_db: unknown, params: { ref: unknown; orgId: number }) => {
    resolver.calls.push(params);
    if (params.ref === BROKEN) throw new Error('anchor read failed');
    return params.ref === OURS && params.orgId === 7 ? 42 : null;
  },
}));

import { getToolHandler } from '../AnaToolExecutor';
import { runWithTenantScope } from '../../../db/tenantStore';

const search = (ctx: Record<string, unknown>) =>
  getToolHandler('project_knowledge_search')!({ query: 'primary endpoint' }, ctx as any);
const inScope = <T,>(tenantId: string, orgUuid: string | null, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId, orgUuid, role: null, source: 'request', caller: 'test' } as any, fn);

beforeEach(() => {
  rag.calls = [];
  resolver.calls = [];
});

describe('project_knowledge_search with a v2 project open (as the chat stream calls it)', () => {
  it('searches the program\'s project, with the tenant uuid from the request scope', async () => {
    await inScope('7', ORG_UUID, () => search({ organizationId: 7, userId: 3, projectId: null, projectRef: OURS }));
    expect(rag.calls).toHaveLength(1);
    expect(rag.calls[0]).toMatchObject({
      intent: 'project_scoped',
      organizationUuid: ORG_UUID,
      artifactScope: { projectId: 42, organizationUuid: ORG_UUID },
    });
  });

  it('does not search a program the resolver does not give for this organization', async () => {
    const out = await inScope('7', ORG_UUID, () =>
      search({ organizationId: 7, userId: 3, projectId: null, projectRef: '99999999-0000-4000-8000-000000000009' }),
    );
    expect(rag.calls).toHaveLength(0);
    expect(String(out)).toMatch(/No active project/);
  });

  it('never takes another tenant\'s uuid from the scope', async () => {
    const out = await inScope('8', ORG_UUID, () => search({ organizationId: 7, userId: 3, projectId: null, projectRef: OURS }));
    expect(rag.calls).toHaveLength(0);
    expect(String(out)).toMatch(/No active project/);
  });

  it('resolves for the caller\'s own organization: another organization\'s caller does not get org 7\'s project', async () => {
    const out = await inScope('8', ORG8_UUID, () => search({ organizationId: 8, userId: 4, projectId: null, projectRef: OURS }));
    expect(resolver.calls.at(-1)).toMatchObject({ orgId: 8 });
    expect(rag.calls).toHaveLength(0);
    expect(String(out)).toMatch(/No active project/);
  });

  it('a lookup that fails is no project, never a guessed one', async () => {
    const out = await inScope('7', ORG_UUID, () => search({ organizationId: 7, userId: 3, projectId: null, projectRef: BROKEN }));
    expect(rag.calls).toHaveLength(0);
    expect(String(out)).toMatch(/No active project/);
  });

  it('control: an integer project with a uuid in context is searched exactly as before, without the resolver', async () => {
    await search({ organizationId: 7, userId: 3, projectId: 12, organizationUuid: ORG_UUID });
    expect(resolver.calls).toHaveLength(0);
    expect(rag.calls[0]).toMatchObject({ artifactScope: { projectId: 12, organizationUuid: ORG_UUID } });
  });
});
