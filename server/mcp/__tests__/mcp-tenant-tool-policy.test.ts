/**
 * A tool the tenant disabled does not run over the connector either.
 *
 * `organizations.settings.anaToolPolicy.deny` withholds a tool from every
 * AnA chat door (governedToolsetFor). The connector's callAnaHandler ran AnA's
 * registered handlers directly, so the same tool still ran for the same
 * organization over MCP. It now applies the deny-list with the loader and
 * filter the chat doors use. `allow` stays scoped to governed mutations, as
 * filterToolsByPolicy documents, so it does not strip these read tools.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  settings: new Map<number, unknown>(),
  query: vi.fn(),
}));
vi.mock('../../db', () => ({ getPool: () => ({ query: h.query }), pool: { query: h.query } }));
vi.mock('../../db.js', () => ({ getPool: () => ({ query: h.query }), pool: { query: h.query } }));

import { callAnaHandler, type ToolRunContext } from '../tools/runtime';

const ctx = (organizationId: number) =>
  ({ principal: {} as never, config: {} as never, ana: { organizationId, userId: 3, organizationUuid: null } }) as ToolRunContext;

// callAnaHandler imports AnA's handler graph lazily, on its first call. Cold,
// that took 8.7-9.3 s here inside the first test's 10 s budget, so the test
// passed or failed on machine load, not on the policy (seen 2026-10-01: it timed
// out at 10 007 ms once another suite shared the fork). The hook has 60 s; each
// test now measures the policy, and still makes the same first call.
beforeAll(async () => {
  await Promise.all([import('../../services/ana/AnaToolExecutor'), import('../../services/ana-ri/mdx-tool-policy')]);
}, 60_000);

beforeEach(() => {
  h.settings.clear();
  h.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/FROM organizations WHERE id = \$1/.test(sql)) {
      return { rows: h.settings.has(params[0] as number) ? [{ settings: h.settings.get(params[0] as number) }] : [] };
    }
    return { rows: [] };
  });
});

describe('callAnaHandler and the tenant tool policy', () => {
  it('refuses a tool the organization denied', async () => {
    h.settings.set(7, { anaToolPolicy: { deny: ['lookup_ich_guideline'] } });
    const out = await callAnaHandler('lookup_ich_guideline', { guideline: 'E6(R3)' }, ctx(7));
    expect(out.kind).toBe('refused');
    expect(out.kind === 'refused' && out.reason).toMatch(/disabled by your organization's AnA tool policy/);
  });

  it('runs it for an organization that did not deny it', async () => {
    h.settings.set(7, { anaToolPolicy: { deny: ['lookup_ich_guideline'] } });
    h.settings.set(8, { anaToolPolicy: { deny: ['some_other_tool'] } });
    const out = await callAnaHandler('lookup_ich_guideline', { guideline: 'E6(R3)' }, ctx(8));
    expect(out.kind).toBe('ok');
  });

  it('does not let an allowlist for governed mutations strip a read tool, as on the chat doors', async () => {
    h.settings.set(9, { anaToolPolicy: { allow: ['execute_platform_command'] } });
    const out = await callAnaHandler('lookup_ich_guideline', { guideline: 'E6(R3)' }, ctx(9));
    expect(out.kind).toBe('ok');
  });
});
