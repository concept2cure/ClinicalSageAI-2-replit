/**
 * TMF artifact persistence service.
 *
 * Durable, tenant-scoped, audited per-trial record of filed Trial Master File
 * documents, with inspection-readiness computed from the stored artifacts.
 * Every read/write is scoped to the caller's organizationId (never request
 * input); mutations are audited — mirroring
 * server/services/ind-lifecycle/ind-cross-reference-persistence.ts.
 *
 * An artifact code must be a known DIA TMF Reference Model code (the service
 * validates against `tmf-completeness`), keeping the store clean and the
 * completeness roll-up meaningful.
 *
 * @module server/services/etmf/tmf-artifact-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db, pool } from '../../db';
import { tmfArtifactFilings, type TmfArtifactFiling } from '../../../shared/schema/tmf-artifacts';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { getTmfReferenceModel, assessTmfCompleteness, type TmfCompletenessResult } from './tmf-completeness';

const logger = createScopedLogger('tmf-artifact-persistence');

export type TmfCtx = { organizationId: number; userId: number };

export class TmfArtifactError extends Error {
  constructor(public code: 'NOT_FOUND' | 'UNKNOWN_ARTIFACT' | 'UNRESOLVABLE_DOCUMENT_REF', message: string) {
    super(message);
    this.name = 'TmfArtifactError';
  }
}

/**
 * A `vault://<id>` reference must name a document that EXISTS.
 *
 * ── Why this guard exists ────────────────────────────────────────────────────
 * The eTMF surface's "File" button sent
 *   documentRef: 'vault://' + trialId + '/' + artifactCode
 * — a reference it MANUFACTURED from the two things it already knew. No
 * document was uploaded, none existed, and the store recorded the essential
 * document as filed against a path pointing at nothing. "File all N" did it for
 * every outstanding document in one click, which is how a trial reached
 * INSPECTION-READY without a single document having been filed.
 *
 * That is a false GCP record: an inspection-readiness verdict a sponsor acts
 * on, computed from filings that reference no documents. The client is fixed
 * too, but the guard belongs HERE — a store that accepts any string as proof a
 * document exists will be lied to again by the next caller.
 *
 * Absent/empty is still allowed and means what it says: a filing recorded with
 * no document attached. What is refused is a reference that CLAIMS a document
 * and cannot produce one.
 */
async function assertDocumentRefResolves(documentRef: string, organizationId: number): Promise<void> {
  const m = /^vault:\/\/(.+)$/.exec(documentRef.trim());
  if (!m) {
    // A non-vault scheme (an external URL, a paper-archive locator) is not
    // something this service can verify, and refusing it would break filings
    // that are legitimately recorded against off-platform originals.
    return;
  }
  const id = m[1].trim();
  // The manufactured form was `vault://<trialId>/<artifactCode>` — a path, not
  // an id. Nothing in vault.documents has ever been keyed that way, so it can
  // never resolve; naming that shape explicitly makes the refusal legible
  // rather than a generic "not found".
  if (id.includes('/')) {
    throw new TmfArtifactError(
      'UNRESOLVABLE_DOCUMENT_REF',
      `"${documentRef}" is not a vault document reference — it is a path built from the trial and artifact code. File the actual document and reference the id the vault returns.`,
    );
  }
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM vault.documents d
        WHERE d.id::text = $1
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id
               AND rp.organization_id = $2
               AND rp.deleted_at IS NULL
          )
        LIMIT 1`,
      [id, organizationId],
    );
    if (rows.length === 0) {
      throw new TmfArtifactError(
        'UNRESOLVABLE_DOCUMENT_REF',
        `No vault document ${id} exists, so this artifact cannot be recorded as filed against it.`,
      );
    }
  } catch (err) {
    if (err instanceof TmfArtifactError) throw err;
    // An unprovisioned vault schema must not silently wave the reference
    // through — that is the exact failure this guard exists to prevent.
    if ((err as { code?: string })?.code === '42P01') {
      throw new TmfArtifactError(
        'UNRESOLVABLE_DOCUMENT_REF',
        'The vault document store is not provisioned in this deployment, so a vault reference cannot be verified.',
      );
    }
    throw err;
  }
}

/** code → zone number, from the reference model (single source of truth). */
const ARTIFACT_ZONE: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  for (const zone of getTmfReferenceModel()) {
    for (const a of zone.artifacts) m.set(a.code, zone.number);
  }
  return m;
})();

export interface RecordArtifactInput {
  trialId: string;
  artifactCode: string;
  documentRef?: string | null;
}

/**
 * Record (or re-file) a TMF artifact for a trial. Idempotent on
 * (org, trial, artifact) — re-filing updates the document ref + timestamp.
 * Rejects an unknown artifact code. Audited, org-scoped.
 */
export async function recordTmfArtifactFiling(input: RecordArtifactInput, ctx: TmfCtx): Promise<TmfArtifactFiling> {
  const zone = ARTIFACT_ZONE.get(input.artifactCode);
  if (zone === undefined) {
    throw new TmfArtifactError('UNKNOWN_ARTIFACT', `"${input.artifactCode}" is not a known TMF Reference Model artifact code.`);
  }
  const ref = typeof input.documentRef === 'string' ? input.documentRef.trim() : '';
  if (ref) await assertDocumentRefResolves(ref, ctx.organizationId);

  const [row] = await db
    .insert(tmfArtifactFilings)
    .values({
      organizationId: ctx.organizationId,
      trialId: input.trialId,
      artifactCode: input.artifactCode,
      zoneNumber: zone,
      documentRef: input.documentRef ?? null,
      createdBy: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [tmfArtifactFilings.organizationId, tmfArtifactFilings.trialId, tmfArtifactFilings.artifactCode],
      set: { documentRef: input.documentRef ?? null, updatedAt: new Date(), filedAt: new Date() },
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'TMF_ARTIFACT_FILED',
    resourceType: 'tmf_artifact',
    resourceId: row.id,
    details: { trialId: input.trialId, artifactCode: input.artifactCode, zone },
  });
  logger.info('Filed TMF artifact', { trialId: input.trialId, artifactCode: input.artifactCode, organizationId: ctx.organizationId });
  return row as TmfArtifactFiling;
}

/** List a trial's filed TMF artifacts (org-scoped, stable order). */
export async function listTmfArtifacts(trialId: string, ctx: { organizationId: number }): Promise<TmfArtifactFiling[]> {
  return (await db
    .select()
    .from(tmfArtifactFilings)
    .where(and(eq(tmfArtifactFilings.organizationId, ctx.organizationId), eq(tmfArtifactFilings.trialId, trialId)))
    .orderBy(asc(tmfArtifactFilings.artifactCode))) as TmfArtifactFiling[];
}

/** Remove a filed TMF artifact (audited, org-scoped). */
export async function removeTmfArtifactFiling(id: string, ctx: TmfCtx): Promise<void> {
  const [row] = await db
    .delete(tmfArtifactFilings)
    .where(and(eq(tmfArtifactFilings.id, id), eq(tmfArtifactFilings.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new TmfArtifactError('NOT_FOUND', 'TMF artifact not found.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'TMF_ARTIFACT_REMOVED',
    resourceType: 'tmf_artifact',
    resourceId: id,
    details: { artifactCode: row.artifactCode },
  });
}

/**
 * Compute inspection-readiness for a trial from its stored artifacts.
 * Org-scoped. `scope` ('essential' default | 'all') mirrors the checker.
 */
export async function getTrialTmfCompleteness(
  trialId: string,
  ctx: { organizationId: number },
  scope: 'essential' | 'all' = 'essential',
): Promise<TmfCompletenessResult> {
  const rows = await listTmfArtifacts(trialId, ctx);
  return assessTmfCompleteness({ providedArtifacts: rows.map((r) => r.artifactCode), scope });
}
