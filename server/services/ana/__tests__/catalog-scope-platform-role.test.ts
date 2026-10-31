/**
 * AnA's catalog scope refuses the platform role (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * catalogScope writes the admitted membership role to app.current_user_role on
 * the request's connection, for the rest of its session (set_config(..., false)),
 * and the platform arm of about 977 tenant policies compares that setting with
 * 'app_super_admin'. It took the role as given. It is refused now, however
 * cased or padded, before the statement, with slice 1a's own refusal
 * (tenantStore.ts), and the tool answers PLATFORM_SCOPE_ROLE_REFUSED with no
 * source listing or content.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ role: 'reviewer', accessible: vi.fn() }));
vi.mock('../../vault/document-catalog.service.js', () => ({
  withAnaSourceReadScope: async (actor: { organizationId: number; userId: number }, fn: (q: unknown, s: unknown) => unknown) =>
    fn(null, { organizationId: actor.organizationId, userId: actor.userId, role: h.role, projectId: null, programId: null, accessibleProgramIds: [], actorFiltered: true }),
}));
vi.mock('../../c2c/current-program-access.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCurrentAccessibleProgramScope: (...a: unknown[]) => h.accessible(...a),
}));
import { catalogScope } from '../catalog-scope';

const sent: Array<{ sql: string; params?: unknown[] }> = [];
const executor = { query: async (sql: string, params?: unknown[]) => { sent.push({ sql, params }); return { rows: [] }; } };
const ctx = { userId: 5, organizationId: 7 } as never;

beforeEach(() => {
  sent.length = 0;
  h.role = 'reviewer';
  h.accessible.mockReset().mockImplementation(async () => ({ actor: { userId: 5, role: h.role }, programIds: [] }));
});

describe('catalogScope and the platform role', () => {
  it.each(['app_super_admin', 'APP_SUPER_ADMIN', ' app_super_admin ', 'App_Super_Admin\n'])(
    'admitted role %j: refused, and nothing reaches app.current_user_role',
    async (role) => {
      h.role = role;
      const scope = await catalogScope(ctx, 7, null, 'read', executor as never);
      expect(scope).toEqual({ code: 'PLATFORM_SCOPE_ROLE_REFUSED', error: expect.stringMatching(/No source listing or content was returned\.$/) });
      expect(sent.filter((s) => s.sql.includes('app.current_user_role'))).toEqual([]);
      expect(h.accessible).not.toHaveBeenCalled();
    },
  );

  it('an ordinary membership role is written and the scope admitted', async () => {
    const scope = await catalogScope(ctx, 7, null, 'read', executor as never);
    expect('error' in scope).toBe(false);
    expect(sent.filter((s) => s.sql.includes('app.current_user_role')).map((s) => s.params)).toEqual([['7', 'reviewer']]);
  });
});
