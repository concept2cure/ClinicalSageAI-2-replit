/** Current authority after the caller has reserved the actual QMS target. */
import { checkSigningAuthority } from '../part11/signing-authority-gate';
import { resolveSignerOrgRole, type SignerRoleExec } from '../part11/resolve-signer-role';
import { can } from '../governance/permissions';

export class QmsSigningAdmissionRefused extends Error {
  constructor(readonly status: 403 | 503, readonly code: string, message: string) { super(message); }
}

export async function assertCurrentQmsSigningAuthority(client: SignerRoleExec, input: {
  organizationId: number; userId: number; target: string;
}): Promise<void> {
  const authority = await checkSigningAuthority(input.userId, input.organizationId, client);
  if (authority) throw new QmsSigningAdmissionRefused(authority.status, authority.code, authority.message);
  if (process.env.GOVERNANCE_RBAC_ENFORCE !== 'true') return;
  try {
    const role = await resolveSignerOrgRole(input.userId, input.organizationId, client);
    if (!role) throw new Error('Current signer membership could not be verified.');
    const resourceType = input.target.split(':')[0];
    if (!(await can(input.organizationId, role, { action: 'sign', resourceType }, { executor: client, strict: true }))) {
      throw new QmsSigningAdmissionRefused(403, 'NOT_AUTHORIZED', `Your role does not hold sign permission for ${resourceType}. Nothing was signed.`);
    }
  } catch (error) {
    if (error instanceof QmsSigningAdmissionRefused) throw error;
    console.error('[qms-signing] current resource permission unavailable:', error instanceof Error ? error.message : error);
    throw new QmsSigningAdmissionRefused(503, 'SIGNING_PERMISSION_UNVERIFIED',
      'Your signing permission could not be verified, so nothing was signed. Try again; if this continues, contact your administrator.');
  }
}
