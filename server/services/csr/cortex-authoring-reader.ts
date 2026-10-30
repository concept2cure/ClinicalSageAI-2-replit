/** Reuses the existing project-authorized, receipt-verified table reader. No
 * source ingestion, evidence promotion or model training happens on this path. */
import type { RequestSqlClient } from '../../db/requestDb.js';
import { buildCsrAuthoringEvidence, parseCsrEvidenceSelection, CsrAuthoringContextError,
  type RetainedCsrTables } from './cortex-authoring-context.js';

type Actor = { organizationId: number; userId: number };
type Loader = (q: RequestSqlClient, scope: Actor & { programId: string }, runId: string,
  options?: { requireCurrent?: boolean }) => Promise<RetainedCsrTables>;

export async function loadCsrAuthoringEvidence(
  q: RequestSqlClient, actor: Actor, selection: unknown, load?: Loader,
  options: { requireCurrent?: boolean } = {},
) {
  if (!Number.isSafeInteger(actor.organizationId) || actor.organizationId <= 0 ||
    !Number.isSafeInteger(actor.userId) || actor.userId <= 0)
    throw new CsrAuthoringContextError('CSR_EVIDENCE_ACTOR_REQUIRED', 403);
  const requested = parseCsrEvidenceSelection(selection);
  const reader = load ?? (await import('./saved-clinical-tables.js')).readSavedClinicalTables;
  // The canonical reader authorizes current project membership BEFORE loading
  // retained inputs and rejects withdrawn/disallowed sources. Do not catch that
  // error and turn it into an apparently successful empty evidence context.
  const scope = { ...actor, programId: requested.programId };
  const retained = options.requireCurrent === true
    ? await reader(q, scope, requested.runId, { requireCurrent: true })
    : await reader(q, scope, requested.runId);
  return buildCsrAuthoringEvidence(retained, requested);
}
