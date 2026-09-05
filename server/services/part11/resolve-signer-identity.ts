/**
 * The §11.50 printed name of the person signing — resolved, never supplied.
 *
 * 21 CFR 11.50(a)(1) requires a signed record to carry "the printed name of the
 * signer". `concept2cure_signatures.signer_name` and `.signer_email` are that
 * manifestation, and both are NOT NULL — which is exactly why two writers
 * invented values rather than fail. `submission-chat-apply-rewrite` fell back to
 * `user-${id}` and `user-${id}@unknown.local`; `verifiedSealService` passed `''`
 * into the NOT NULL email. Neither is a person's name, and an inspector reading
 * the column cannot tell an invented one from a real one — which is the whole
 * point of the column.
 *
 * The fabrication was worse than a wrong string in one of those writers: the
 * §11.200 attribution hash is computed over the signer's email, so a signature
 * hashed over `user-41@unknown.local` cannot be re-derived from the real
 * signer's identity. Verification would report a mismatch, and a mismatch reads
 * as tampering. A signature that looks falsified under correct verification is
 * worse than one that was never taken.
 *
 * So: resolve the identity from the membership record, and REFUSE when it does
 * not resolve. A Part 11 signature whose signer cannot be named is not a
 * weaker signature, it is not a signature.
 *
 * The lookup is the one `persistGovernedActionSignature` already performs for
 * `electronic_signatures`, extracted here so the two substrates cannot drift on
 * the question of who signed. Its reasoning is preserved verbatim below because
 * it is the part that is easy to get wrong twice.
 *
 * @module server/services/part11/resolve-signer-identity
 * @compliance 21 CFR Part 11 §11.50(a)(1), §11.100(b)
 */

/** Minimal shape of a pg client / transaction — whatever the caller is holding. */
export interface SignerIdentityExec {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface SignerIdentity {
  /** §11.50 printed name. Falls back to the email only because an email IS an identifier of the person; never to a synthesised string. */
  name: string;
  email: string;
  title: string | null;
}

/** Thrown when the signer cannot be attributed. Callers must not proceed. */
export class SignerNotAttributableError extends Error {
  readonly code = 'SIGNER_NOT_ATTRIBUTABLE';
  constructor(command: string, userId: number, orgId: number) {
    // Non-membership and non-existence are one refusal on purpose: both mean
    // this org cannot attribute this signature, and distinguishing them in the
    // error would disclose whether a user id exists in another tenant.
    super(
      `${command}: signer user ${userId} is not a member of org ${orgId} — cannot attribute signature (§11.100).`,
    );
    this.name = 'SignerNotAttributableError';
  }
}

/**
 * Resolve the signer's printed name, email and title, on the CALLER'S client so
 * the lookup participates in the same transaction as the signature it names.
 *
 * Joined to organization_users so the printed name resolves ONLY for a signer
 * who is a member of the org this signature is being made in. A bare
 * primary-key read of `users` is safe as called when every caller passes the
 * authenticated actor's own id — but safe by convention: nothing stops a future
 * caller passing any user id, and §11.50 requires the printed name OF THE
 * SIGNER. A name resolved across a tenant boundary is a misattributed signature
 * in a filing an agency reads.
 *
 * NOT scoped on `users.default_organization_id`, which is the obvious fix and
 * the wrong one: it names a preference, not a membership, so a signer
 * legitimately acting outside their default org would fail to resolve and a
 * valid signature would be refused. organization_users is the authorization
 * relation — the same one `server/auth.ts` selects a session's tenant from.
 *
 * @throws SignerNotAttributableError when the signer is not attributable in this org.
 */
export async function resolveSignerIdentity(
  client: SignerIdentityExec,
  userId: number,
  orgId: number,
  command = 'sign',
): Promise<SignerIdentity> {
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(orgId) || orgId <= 0) {
    throw new SignerNotAttributableError(command, userId, orgId);
  }
  const signer = await client.query(
    `SELECT u.name, u.email, u.title
       FROM users u
       JOIN organization_users ou
         ON ou.user_id = u.id
        AND ou.organization_id = $2
      WHERE u.id = $1
      LIMIT 1`,
    [userId, orgId],
  );
  const row = signer.rows[0];
  // An email with no name still names the person. A row with neither does not,
  // and NOT NULL is not a reason to write something in its place.
  if (!row || !row.email) {
    throw new SignerNotAttributableError(command, userId, orgId);
  }
  return {
    name: row.name || row.email,
    email: row.email,
    title: row.title ?? null,
  };
}
