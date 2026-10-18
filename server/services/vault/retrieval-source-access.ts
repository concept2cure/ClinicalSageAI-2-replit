/** Short actor/source fences for the existing AnA retrieval adapters. */
import type { AdmittedAnaSourceReadScope } from '../ana/source-read-scope.js';
import { revalidateAnaSourceReadScope, assertAnaSourceProgramAllowed } from '../ana/source-read-scope.js';
import { AnaProjectScopeError } from '../ana/project-scope-admission.js';
import { supersededSql } from './vault-version-family.js';
import { vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';

export type RetrievalQueryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export interface RetrievalSourceIdentity { documentId: string; programId: string; contentHash: string; }

export function pinRetrievalReadScope(scope: AdmittedAnaSourceReadScope): AdmittedAnaSourceReadScope {
  return Object.freeze({ ...scope, accessibleProgramIds: Object.freeze([...scope.accessibleProgramIds]) });
}

export function assertRetrievalScope(scope: AdmittedAnaSourceReadScope, organizationId: number, programId: string | null): void {
  if (scope.organizationId !== organizationId || scope.programId !== programId) {
    throw new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_MISMATCH', 'The requested source scope does not match this conversation.');
  }
}

/** Provider work belongs outside this callback; only short database reads run here. */
export async function withRetrievalReadScope<T>(
  scope: AdmittedAnaSourceReadScope,
  run: (q: RetrievalQueryable, current: AdmittedAnaSourceReadScope) => Promise<T>,
): Promise<T> {
  const { withAnaSourceReadScope } = await import('./document-catalog-actor-access.js');
  return withAnaSourceReadScope({
    organizationId: scope.organizationId, userId: scope.userId,
    projectId: scope.projectId, requestedProgramId: scope.programId,
  }, async (q, current) => {
    await revalidateAnaSourceReadScope(q, scope);
    return run(q, current);
  });
}

/** Never turn a changed selected source into a silently shortened result/count. */
export async function verifyRetrievalSources(
  q: RetrievalQueryable, scope: AdmittedAnaSourceReadScope, identities: readonly RetrievalSourceIdentity[],
): Promise<void> {
  if (!identities.length) return;
  const unique = new Map<string, RetrievalSourceIdentity>();
  for (const identity of identities) {
    assertAnaSourceProgramAllowed(scope, identity.programId);
    if (!/^[0-9a-f]{64}$/i.test(identity.contentHash)) {
      throw new AnaProjectScopeError(503, 'ANA_SOURCE_IDENTITY_UNAVAILABLE', 'The source identity could not be verified. Nothing was returned.');
    }
    const prior = unique.get(identity.documentId);
    if (prior && (prior.contentHash !== identity.contentHash || prior.programId !== identity.programId)) {
      throw new AnaProjectScopeError(503, 'ANA_SOURCE_IDENTITY_UNAVAILABLE', 'The source identity could not be verified. Nothing was returned.');
    }
    unique.set(identity.documentId, { ...identity });
  }
  const { rows } = await q.query(
    `SELECT d.id::text AS document_id, d.program_id::text AS program_id, d.content_hash
       FROM vault.documents d
       JOIN regulatory_programs p ON p.id=d.program_id AND p.organization_id=$1 AND p.deleted_at IS NULL
      WHERE d.organization_id=$1 AND d.id::text=ANY($2::text[])
        AND d.program_id=ANY($3::uuid[]) AND d.deleted_at IS NULL
        AND ${vaultDataEligibleSql('d')} AND NOT ${supersededSql('d')}`,
    [scope.organizationId, [...unique.keys()], [...scope.accessibleProgramIds]],
  );
  if (rows.length !== unique.size || new Set(rows.map(row => String(row.document_id))).size !== unique.size || rows.some(row => {
    const expected = unique.get(String(row.document_id));
    return !expected || row.program_id !== expected.programId || row.content_hash !== expected.contentHash;
  })) {
    throw new AnaProjectScopeError(409, 'ANA_SOURCE_CHANGED', 'Source access or identity changed during retrieval. Search again before using these sources.');
  }
}
