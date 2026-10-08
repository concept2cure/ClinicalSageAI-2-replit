/**
 * Who may sign a Vault version's review or approval, as the server decides it
 * (QA 2026-10-08, walk 2, j3).
 *
 * A manager opened a version in review, was offered "Sign review", typed a
 * reason and a password, and only then was refused (403, §11.10(g): managers do
 * not sign, P-18). Nothing on the version said who could sign it, and in that
 * organization nobody the walk could use was able to. The page now reads the
 * answer with the versions instead of guessing it from the client's role list:
 *
 *   - `canSign` for the person reading: the platform's one check,
 *     checkSigningAuthority (services/part11/signing-authority-gate.ts) — the
 *     same question the Gateway's transmit asks before the password. Null when
 *     the lookup failed: not "you cannot", and the server still decides;
 *   - `signers`: the members whose membership role carries signing authority
 *     under the one policy (isSigningAuthorized). The page leaves out the
 *     people separation of duties excludes for a given version (its uploader,
 *     whoever sent it for review, the reviewer for the approval).
 *
 * Read-only. It never grants anything: the lifecycle route re-checks the
 * signer's authority and re-verifies them before it records a sign-off.
 *
 * @module server/services/vault/vault-signing-posture
 */
import { checkSigningAuthority } from '../part11/signing-authority-gate';
import { isSigningAuthorized } from '../part11/signing-authority';

export interface SignerQueryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** A member who may apply an electronic signature, by printed name. */
export interface OrgSigner {
  id: number;
  name: string;
}

export interface SigningPosture {
  /** Whether the reader's role carries signing authority; null when it could not be read. */
  canSign: boolean | null;
  /** Every member whose role carries signing authority; null when the list could not be read. */
  signers: OrgSigner[] | null;
}

/** The organization's members whose role carries signing authority, by name. */
export async function readOrgSigners(q: SignerQueryable, organizationId: number): Promise<OrgSigner[]> {
  const { rows } = await q.query(
    `SELECT u.id, COALESCE(NULLIF(TRIM(u.name), ''), u.email) AS name, u.email, ou.role
       FROM organization_users ou
       JOIN users u ON u.id = ou.user_id
      WHERE ou.organization_id = $1
      ORDER BY 2, 1`,
    [organizationId],
  );
  const signers = rows.filter((r) => isSigningAuthorized(r.role));
  // Two members with one printed name are told apart by their address.
  const seen = new Map<string, number>();
  for (const r of signers) seen.set(String(r.name), (seen.get(String(r.name)) ?? 0) + 1);
  return signers.map((r) => {
    const name = String(r.name ?? `user ${r.id}`);
    return { id: Number(r.id), name: (seen.get(name) ?? 0) > 1 && r.email ? `${name} (${r.email})` : name };
  });
}

/** Whether this person may sign here, from the check every signing route applies. */
export async function readerCanSign(userId: number | null, organizationId: number): Promise<boolean | null> {
  if (userId === null) return false;
  const refusal = await checkSigningAuthority(userId, organizationId);
  if (refusal === null) return true;
  return refusal.status === 403 ? false : null;
}

/** Both halves; a failed signer list is null, never an empty list. */
export async function readSigningPosture(
  q: SignerQueryable,
  organizationId: number,
  userId: number | null,
): Promise<SigningPosture> {
  const [canSign, signers] = await Promise.all([
    readerCanSign(userId, organizationId),
    readOrgSigners(q, organizationId).catch(() => null),
  ]);
  return { canSign, signers };
}
