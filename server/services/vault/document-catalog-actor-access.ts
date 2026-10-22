/** Short interactive source reads share one connection, current role and
 * canonical project policy. No transaction spans an embedding/provider await. */
import { pool } from '../../db.js';
import { getTenantScope } from '../../db/tenantStore.js';
import { AnaProjectScopeError, readActiveAnaActorRole } from '../ana/project-scope-admission.js';
import {
  admitAnaSourceReadScope, revalidateAnaSourceReadScope,
  type AnaSourceReadScopeInput, type AdmittedAnaSourceReadScope,
} from '../ana/source-read-scope.js';
import { setTenantContextTx } from '../tenant/governed-tenant-context.js';
import type { Queryable } from './document-catalog.service.js';

export type { AnaSourceReadScopeInput, AdmittedAnaSourceReadScope } from '../ana/source-read-scope.js';

export async function withAnaSourceReadScope<T>(
  input: AnaSourceReadScopeInput,
  run: (q: Queryable, scope: AdmittedAnaSourceReadScope) => Promise<T>,
): Promise<T> {
  // Snapshot only identity input. A model's accessibleProgramIds/role cannot
  // become authority merely by resembling an admitted DTO.
  const pinned: AnaSourceReadScopeInput = {
    organizationId: input.organizationId, userId: input.userId,
    projectId: input.projectId, projectRef: input.projectRef,
    requestedProgramId: input.requestedProgramId,
  };
  const ambient = getTenantScope();
  if (!Number.isSafeInteger(pinned.organizationId) || Number(pinned.organizationId) <= 0 ||
      !Number.isSafeInteger(pinned.userId) || Number(pinned.userId) <= 0 ||
      !ambient || ambient.tenantId !== String(pinned.organizationId)) {
    throw new AnaProjectScopeError(403, 'ANA_SOURCE_ACCESS_DENIED', 'A matching identified organization member is required to read sources.');
  }
  const q = await pool.connect().catch(() => {
    throw new AnaProjectScopeError(503, 'ANA_SOURCE_ACCESS_UNAVAILABLE', 'Current source access could not be verified. No source content or complete listing was produced.');
  });
  try {
    await q.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await setTenantContextTx(q, Number(pinned.organizationId));
    const role = await readActiveAnaActorRole(q, pinned);
    await setTenantContextTx(q, Number(pinned.organizationId), role);
    const scope = await admitAnaSourceReadScope(q, pinned);
    if (scope.role !== role) {
      throw new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_CHANGED', 'Current organization membership changed before source admission. No source content was read.');
    }
    const result = await run(q, scope);
    await revalidateAnaSourceReadScope(q, scope);
    await q.query('COMMIT');
    return result;
  } catch (error) {
    try { await q.query('ROLLBACK'); } catch { /* Preserve the read refusal. */ }
    if (error instanceof AnaProjectScopeError) throw error;
    throw new AnaProjectScopeError(503, 'ANA_SOURCE_ACCESS_UNAVAILABLE', 'Current source access could not be verified. No source content or complete listing was produced.');
  } finally {
    q.release();
  }
}

/** Composite callers pin one initial scope and use this after independent
 * read awaits. A freshly admitted accessible superset is not the old scope. */
export function revalidateActorSourceScope(input: AnaSourceReadScopeInput, pinnedScope: AdmittedAnaSourceReadScope): Promise<void> {
  const pinned = { ...pinnedScope, accessibleProgramIds: [...pinnedScope.accessibleProgramIds] };
  return withAnaSourceReadScope(input, async (q, current) => {
    if (current.organizationId !== pinned.organizationId || current.userId !== pinned.userId ||
        current.role !== pinned.role || current.projectId !== pinned.projectId || current.programId !== pinned.programId ||
        current.accessibleProgramIds.length !== pinned.accessibleProgramIds.length ||
        current.accessibleProgramIds.some((id, index) => id !== pinned.accessibleProgramIds[index])) {
      throw new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_CHANGED', 'Current source access changed during this request. No stale source result was returned.');
    }
    await revalidateAnaSourceReadScope(q, pinned);
  });
}
