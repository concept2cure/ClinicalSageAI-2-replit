/**
 * The custody signature of a departing tenant's export (P-58, D6, 2026-10-29;
 * services/tenant/offboarding-custody.ts): its target, its meaning, and the one
 * act that may be signed from an organisation pending deletion.
 *
 * The platform's signing authority (checkSigningAuthority) admits a signer
 * only while their organisation is active, and a tenant in pending_deletion is
 * read-only. The custody signature is the exception the offboarding needs: the
 * final export is taken once the tenant is frozen in pending_deletion, and
 * custody belongs on that export. So an act may ask for pending_deletion
 * signers (SignedAct.signerOrganizationStatuses, routes/governed-signed-act.ts)
 * only when it is this act, by its target, its domain and its meanings
 * together; any other act that asks is held to active organisations.
 *
 * @module server/services/part11/custody-signature
 */
import type { GovernedSignMeaning } from './signature-meanings';

/** Every custody signature's target: 'tenant-export-custody:<export digest>'. */
export const CUSTODY_TARGET_PREFIX = 'tenant-export-custody:';
/** The ledger domain the custody act records under. */
export const CUSTODY_DOMAIN = 'tenant-offboarding';
/** A custody signature means the signer takes responsibility for the records. */
export const CUSTODY_ACT_MEANINGS = ['responsibility'] as const satisfies readonly GovernedSignMeaning[];

/** True only for the custody act: its target, its domain, and exactly its meanings. */
export function isCustodyAct(act: { target: string; domain: string; meanings: readonly string[] }): boolean {
  return act.target.startsWith(CUSTODY_TARGET_PREFIX)
    && act.domain === CUSTODY_DOMAIN
    && act.meanings.length === CUSTODY_ACT_MEANINGS.length
    && act.meanings.every((m) => (CUSTODY_ACT_MEANINGS as readonly string[]).includes(m));
}

/**
 * The organisation statuses a signer of `act` may sign from: what the act asks
 * for, without pending_deletion unless it is the custody act. Active when it
 * asks for nothing.
 */
export function signerOrganizationStatusesFor(act: {
  target: string; domain: string; meanings: readonly string[]; signerOrganizationStatuses?: readonly string[];
}): readonly string[] {
  const asked = act.signerOrganizationStatuses?.length ? act.signerOrganizationStatuses : ['active'];
  return isCustodyAct(act) ? asked : asked.filter((s) => s !== 'pending_deletion');
}
