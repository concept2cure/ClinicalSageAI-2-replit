/** Existing filing/discovery suites use a real bounded intake response, while
 * their original request double still owns the endpoint under examination. */
import { beforeEach, afterEach, vi, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';

export const intakeFixture = { actorUserId: 12, organizationId: 7 };
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ id: String(intakeFixture.actorUserId), organizationId: String(intakeFixture.organizationId) }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: intakeFixture.organizationId }, currentClientWorkspace: { id: 999 }, setCurrentClientWorkspace: vi.fn() }) }));
beforeEach(() => {
  intakeFixture.organizationId = 7;
  setAuthToken(`e30.${btoa(JSON.stringify({ userId: intakeFixture.actorUserId, organizationId: intakeFixture.organizationId }))}.signature`);
});
afterEach(clearAuthToken);

export async function intakeFixtureRequest(request: (...args: unknown[]) => unknown, args: unknown[]): Promise<unknown> {
  if (args[0] === 'GET' && args[1] === '/api/clients?purpose=project-intake') return {
    ok: true, status: 200, json: async () => ({ success: true,
      clients: [{ id: '21', name: 'Sponsor A', organizationId: String(intakeFixture.organizationId), status: 'active' }],
      meta: { purpose: 'project-intake', ...intakeFixture } }),
  };
  const result = await request(...args) as { ok?: boolean; status?: number; json?: () => Promise<unknown> } | undefined;
  if (args[0] !== 'POST' || args[1] !== '/api/c2c/projects' || !result?.ok || !result.json) return result;
  const body = await result.json() as { data?: unknown; meta?: Record<string, unknown> };
  return { ...result, status: result.status ?? 201, json: async () => ({ ...body, meta: {
    created: true, projectAnchorId: 31, ...intakeFixture, clientWorkspaceId: 21, clientWorkspaceName: 'Sponsor A', ...body.meta,
  } }) };
}
export async function waitForIntakeWorkspace() {
  await waitFor(() => expect((screen.getByRole('combobox', { name: 'Client workspace' }) as HTMLSelectElement).value).toBe('21'));
}
