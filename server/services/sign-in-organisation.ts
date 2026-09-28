/**
 * The organisation an account's sign-in lands in, and so the one an event
 * about the account is recorded against.
 *
 * An account's organisation is its membership (organization_users), the
 * relation a session's tenant is selected from. users.default_organization_id
 * names a preference, not a membership (services/part11/resolve-signer-
 * identity.ts), and an account added through user administration has none.
 * Until VSR-001 F-41 (2026-09-27) auth.ts recorded its events against the
 * default alone, so every such event about such an account was written outside
 * its organisation.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { organizationUsers } from '../../shared/schema';

/** An account's memberships: the organisations it may act in. */
export function membershipsOf(userId: number) {
  return db
    .select({
      organizationId: organizationUsers.organizationId,
      role: organizationUsers.role,
    })
    .from(organizationUsers)
    .where(eq(organizationUsers.userId, userId))
    .limit(25);
}

/**
 * The membership an account's sign-in lands in: the one in its default
 * organisation when it holds one there, otherwise its first.
 */
export function signInMembership<M extends { organizationId: number }>(
  memberships: M[],
  defaultOrganizationId: number | null | undefined,
): M | undefined {
  return memberships.find(m => m.organizationId === defaultOrganizationId) ?? memberships[0];
}

/**
 * The organisation an event about an account is recorded against: the one its
 * sign-in lands in, so the event reaches that organisation's ledger; with no
 * membership, its default.
 */
export async function auditOrganizationOf(account: {
  id: number;
  defaultOrganizationId?: number | null;
}): Promise<number | null> {
  const membership = signInMembership(await membershipsOf(account.id), account.defaultOrganizationId);
  return membership?.organizationId ?? account.defaultOrganizationId ?? null;
}
