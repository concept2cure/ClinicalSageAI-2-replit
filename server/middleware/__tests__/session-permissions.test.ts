/**
 * The session's `governed:write` permission and requireEditorAccess agree, for
 * every role, because one is derived from the other's role set. If they ever
 * disagreed, the client would hide a control the server allows or offer one it
 * refuses (T2's UI half; shared/constants/permissions.ts).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { requireEditorAccess, sessionPermissions } from '../orgMembership';
import { GOVERNED_WRITE_PERMISSION, canGovernedWrite } from '../../../shared/constants/permissions';

function serverAllows(role: string): boolean {
  let allowed = false;
  const res = { status: () => ({ json: () => undefined }) };
  requireEditorAccess({ user: { role, organizationId: 7 } }, res, () => { allowed = true; });
  return allowed;
}

describe('sessionPermissions', () => {
  const ROLES = ['admin', 'manager', 'member', 'viewer', 'owner', 'super_admin', 'editor', 'user', 'Admin', 'VIEWER', ''];

  it.each(ROLES)('agrees with requireEditorAccess for role %j', (role) => {
    const offered = sessionPermissions(role).includes(GOVERNED_WRITE_PERMISSION);
    expect(offered).toBe(serverAllows(role));
    expect(canGovernedWrite({ permissions: sessionPermissions(role) })).toBe(serverAllows(role));
  });

  it('gives a viewer nothing and a member the write permission', () => {
    expect(sessionPermissions('viewer')).toEqual([]);
    expect(sessionPermissions(null)).toEqual([]);
    expect(sessionPermissions('member')).toEqual([GOVERNED_WRITE_PERMISSION]);
  });

  it('every auth response that returns a user derives its permissions, none hard-codes an empty list', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'routes', 'auth.ts'), 'utf8');
    expect(src).not.toMatch(/permissions:\s*\[\s*\]/);
    // session, login, dev-login, /me, mfa/verify
    expect(src.match(/permissions:\s*sessionPermissions\(/g)?.length).toBe(5);
  });
});
