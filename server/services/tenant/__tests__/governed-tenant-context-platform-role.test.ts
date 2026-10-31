/**
 * setTenantContextTx refuses the platform role (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * It writes its `role` argument to app.current_user_role on the governed
 * transaction, and the platform arm of about 977 tenant policies compares that
 * setting with 'app_super_admin'. Slice 1a refused the string on every scope
 * the pool and the request middleware open; this writer took it as given, so
 * a caller's role string opened every tenant's rows for the rest of the
 * transaction. It is refused now, however cased or padded, before any
 * statement, with slice 1a's own refusal (tenantStore.ts).
 */
import { describe, expect, it } from 'vitest';
import { setTenantContextTx } from '../governed-tenant-context';
import { PlatformScopeRoleRefusedError } from '../../../db/tenantStore';

function recorder() {
  const sent: Array<{ sql: string; params?: unknown[] }> = [];
  return { sent, client: { query: async (sql: string, params?: unknown[]) => { sent.push({ sql, params }); return { rows: [] }; } } };
}

describe('setTenantContextTx', () => {
  it.each(['app_super_admin', 'APP_SUPER_ADMIN', ' app_super_admin ', 'App_Super_Admin\n'])(
    'refuses %j before any statement: nothing reaches app.current_user_role',
    async (role) => {
      const { sent, client } = recorder();
      await expect(setTenantContextTx(client, 7, role)).rejects.toBeInstanceOf(PlatformScopeRoleRefusedError);
      expect(sent).toEqual([]);
    },
  );

  it('refuses it with no organisation too: the refusal does not depend on the caller\'s other arguments', async () => {
    const { sent, client } = recorder();
    await expect(setTenantContextTx(client, null, 'app_super_admin')).rejects.toMatchObject({ code: 'PLATFORM_SCOPE_ROLE_REFUSED' });
    expect(sent).toEqual([]);
  });

  it('still stamps the tenant and an ordinary membership role', async () => {
    const { sent, client } = recorder();
    await setTenantContextTx(client, 7, 'admin');
    expect(sent.map((s) => s.params)).toEqual([['7'], ['admin']]);
    expect(sent[1].sql).toContain("set_config('app.current_user_role', $1, true)");
  });
});
