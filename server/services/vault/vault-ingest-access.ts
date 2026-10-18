/** Current target and source admission checks shared by the canonical Vault ingest phases. */
import type { RequestSqlClient } from '../../db/requestDb.js';
import type { VaultIngestArgs, VaultIngestResult } from './vault-ingest.service.js';
import { vaultWriteRefusal } from './vault-write-authority.js';
import { ProgramReadAccessError, readCurrentProgramActor, requireCurrentProgramAccess } from '../c2c/current-program-access';
import { AnaProjectScopeError } from '../ana/project-scope-admission';

function accessRefusal(error: unknown): Extract<VaultIngestResult, { ok: false }> {
  if (error instanceof ProgramReadAccessError || error instanceof AnaProjectScopeError) {
    return { ok: false, status: error.status, code: error.code, message: error.message };
  }
  return { ok: false, status: 503, code: 'VAULT_SOURCE_ACCESS_UNAVAILABLE',
    message: 'Current source access could not be verified. No document was admitted.' };
}

export async function ingestTargetRefusal(q: RequestSqlClient, args: VaultIngestArgs, orgId: number,
  forShare = false): Promise<Extract<VaultIngestResult, { ok: false }> | null> {
  try {
    const actor = await readCurrentProgramActor(q, { organizationId: orgId, userId: args.userId ?? undefined, forShare });
    const roleRefusal = vaultWriteRefusal(actor.role);
    if (roleRefusal) return roleRefusal;
    const access = await requireCurrentProgramAccess(q, { organizationId: orgId, userId: actor.userId, programId: args.programId, forShare });
    return vaultWriteRefusal(access.actor.role);
  } catch (error) { return accessRefusal(error); }
}

export async function ingestSourceRefusal(q: RequestSqlClient, args: VaultIngestArgs,
  phase: 'preview' | 'commit'): Promise<Extract<VaultIngestResult, { ok: false }> | null> {
  try { await args.assertSourceAccess?.(q, phase); return null; }
  catch (error) { return accessRefusal(error); }
}
