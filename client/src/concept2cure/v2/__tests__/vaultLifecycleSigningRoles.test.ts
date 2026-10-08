/**
 * P-18 (2026-10-08): an approver and a reviewer are assignable, and each holds
 * the role it extends (approver → manager, reviewer → member). The Vault
 * lifecycle withheld "Send for review", "Sign review" and "Approve" from any
 * session whose roles it knew to carry no authoring grant — and it did not know
 * the two signing roles, so the people named to sign were the ones told
 * "Your role does not send, review or approve documents".
 */
import { describe, expect, it } from 'vitest';
import { rolesCannotAuthor } from '../surfaces/VaultLifecycle';

describe('rolesCannotAuthor', () => {
  it('admits an approver and a reviewer, as the sign-in session carries them', () => {
    expect(rolesCannotAuthor(['approver', 'user'])).toBe(false);
    expect(rolesCannotAuthor(['reviewer', 'user'])).toBe(false);
  });

  it('still withholds from a viewer, and leaves an unknown-only session to the server', () => {
    expect(rolesCannotAuthor(['viewer', 'user'])).toBe(true);
    expect(rolesCannotAuthor([])).toBe(false);
    expect(rolesCannotAuthor(['member', 'user'])).toBe(false);
  });
});
