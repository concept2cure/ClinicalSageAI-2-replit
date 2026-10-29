/** Program access and the typed refusal for CSR source reads, with no Vault byte
 * reader behind it. Split from vault-source-input.ts (2026-10-29, CSR slice 1)
 * so that readers of RETAINED tables (saved-clinical-tables.ts and the AnA tool
 * get_csr_section_evidence) do not reach the Vault upload/ingest module graph,
 * which ci:step-presentation counts as model reach. vault-source-input.ts
 * re-exports both, so every existing importer is unchanged. */
import type { RequestSqlClient } from '../../db/requestDb.js';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from '../authoring/authoring-program-access.js';
import { CsrSourceInputError } from './csr-source-error.js';

export interface CsrSourceScope { organizationId: number; userId: number; programId: string }
export { CsrSourceInputError };

export async function authorizeCsrSourceProgram(q: RequestSqlClient, scope: CsrSourceScope, forWrite = false) {
  try {
    return await authorizeAuthoringProgram(q, { tenantId: scope.organizationId, actor: { id: String(scope.userId), email: '' },
      programId: scope.programId, forWrite });
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) throw new CsrSourceInputError(error.status, error.code, error.message);
    throw error;
  }
}
