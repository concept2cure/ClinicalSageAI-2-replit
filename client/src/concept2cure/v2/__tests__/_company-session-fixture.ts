/** Synthetic credentials exercise the real canonical session owner and refresh path. */
import { vi } from 'vitest';
import { authService, type AuthUser } from '@/services/portal/authService';

export const COMPANY_SESSION_ACTOR: AuthUser = {
  id: '42', organizationId: '1', organizationName: 'Company session fixture',
  email: 'company-owner@example.test', firstName: 'Company', lastName: 'Owner',
  displayName: 'Company Owner', roles: ['owner'], permissions: ['governed:write'],
  mfaEnabled: false, mfaMethods: [], mustChangePassword: false,
};

function bearer(user: AuthUser, suffix: string): string {
  return `fixture.${btoa(JSON.stringify({ userId: Number(user.id), organizationId: Number(user.organizationId), session: suffix }))}.synthetic`;
}

export function seedCompanySession(user: Partial<AuthUser> = {}, suffix = 'original'): string {
  const actor = { ...COMPANY_SESSION_ACTOR, ...user };
  const token = bearer(actor, suffix);
  authService.setToken(token, actor, `company-refresh-${suffix}`, 3600);
  return token;
}

export function endCompanySession(): void {
  authService.endSession(null);
}

export async function rotateCompanyBearer(): Promise<string> {
  const actor = authService.getUser();
  if (!actor) throw new Error('Seed the company session before refreshing its bearer.');
  const token = bearer(actor, 'rotated');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    accessToken: token, refreshToken: 'company-refresh-rotated', expiresIn: 3600,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  if (!await authService.refreshToken()) throw new Error('The canonical company-session refresh failed.');
  return token;
}
