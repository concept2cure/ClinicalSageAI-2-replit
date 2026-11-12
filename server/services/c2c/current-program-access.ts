/** Current actor, exact program anchor and existing project sharing admission.
 * No read grant grants a write; callers retain their action-specific policy. */
import { programInOrganization } from './program-access';
import { listProgramAnchorCandidates, readProgramAnchorRow } from './program-project-anchor';
import { CsrScopeError, readCsrProjectActor, type CsrScopeExecutor } from '../csr/project-scope';
import { canAccessReportProject, getAccessibleReportProjectIds } from '../report-os/project-access';

export type ProgramAccessExecutor = CsrScopeExecutor;
export interface CurrentProgramActor { userId: number; role: string }
export class ProgramReadAccessError extends Error {
  constructor(readonly status: 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'ProgramReadAccessError';
  }
}
export interface ProgramAccessInput {
  organizationId: number;
  userId: number | undefined;
  programId: string;
  /** Retained lifecycle/hold caller only. Never accepted from ordinary reads. */
  includeDeleted?: boolean;
  /** Inside a writer's transaction, retain current OU/user/org until commit. */
  forShare?: boolean;
}
export interface CurrentProgramAccess {
  actor: CurrentProgramActor;
  programId: string;
  projectId: number;
  clientWorkspaceId: number | null;
}
export interface CurrentAccessibleProgramScope {
  scope: 'verified-accessible-programs';
  actor: CurrentProgramActor;
  programIds: string[];
  /** Generic only: a positively accessible recorded relationship needs repair.
   * No hidden program identity or number of unresolved records is disclosed. */
  reconciliationRequired: boolean;
}

/** The exact tracking relationship admitted with a program, never chosen again
 * by a later portfolio join. Kept private to the verified scope's provenance. */
export interface VerifiedProgramAnchor {
  readonly programId: string;
  readonly projectId: number;
  readonly clientWorkspaceId: number | null;
}

type ProgramScopeIdentity = {
  organizationId: number; userId: number | undefined; programId?: string | null; forShare?: boolean;
};
const verifiedScopes = new WeakMap<CurrentAccessibleProgramScope, {
  executor: ProgramAccessExecutor; organizationId: number; userId: number | undefined; programId: string | null;
  anchors: readonly VerifiedProgramAnchor[];
}>();

function rememberScope(q: ProgramAccessExecutor, input: ProgramScopeIdentity, scope: CurrentAccessibleProgramScope,
  anchors: readonly VerifiedProgramAnchor[]): CurrentAccessibleProgramScope {
  Object.freeze(scope.actor);
  Object.freeze(scope.programIds);
  Object.freeze(scope);
  verifiedScopes.set(scope, {executor:q,organizationId:input.organizationId,userId:input.userId,programId:input.programId?.toLowerCase() ?? null,
    anchors:Object.freeze(anchors.map(anchor => Object.freeze({...anchor})))});
  return scope;
}

/** The same accepted anchors, accessible only with this scope's actor/executor
 * provenance. No optional fallback can manufacture a portfolio relationship. */
export function verifiedProgramAnchors(q: ProgramAccessExecutor, input: ProgramScopeIdentity,
  scope: CurrentAccessibleProgramScope): readonly VerifiedProgramAnchor[] {
  assertVerifiedProgramScope(q,input,scope);
  return verifiedScopes.get(scope)!.anchors;
}

/** Internal read composition only. A constructed allowlist, different actor or
 * executor cannot substitute for canonical admission on this request. */
export function assertVerifiedProgramScope(q: ProgramAccessExecutor, input: ProgramScopeIdentity, scope: CurrentAccessibleProgramScope): void {
  const identity = verifiedScopes.get(scope);
  if (!identity || identity.executor !== q || identity.organizationId !== input.organizationId ||
      identity.userId !== input.userId || identity.programId !== (input.programId?.toLowerCase() ?? null)) {
    throw new ProgramReadAccessError(403,'PROJECT_SCOPE_UNVERIFIED','A verified current project scope is required.');
  }
}

/** Before a multi-arm read exposes prose or counts, an observed permission
 * change refuses the combined result rather than retaining earlier private hits. */
export async function requireProgramScopeStillCurrent(q: ProgramAccessExecutor, input: ProgramScopeIdentity, scope: CurrentAccessibleProgramScope): Promise<void> {
  assertVerifiedProgramScope(q,input,scope);
  const current = await getCurrentAccessibleProgramScope(q,input);
  const samePrograms = current.programIds.length === scope.programIds.length &&
    current.programIds.every((id,index) => id === scope.programIds[index]);
  const previousAnchors = verifiedProgramAnchors(q,input,scope);
  const currentAnchors = verifiedProgramAnchors(q,input,current);
  const sameAnchors = previousAnchors.length === currentAnchors.length && currentAnchors.every((anchor,index) => {
    const previous = previousAnchors[index];
    return previous.programId === anchor.programId && previous.projectId === anchor.projectId &&
      previous.clientWorkspaceId === anchor.clientWorkspaceId;
  });
  if (current.actor.userId !== scope.actor.userId || current.actor.role !== scope.actor.role ||
      current.reconciliationRequired !== scope.reconciliationRequired || !samePrograms || !sameAnchors) {
    throw new ProgramReadAccessError(503,'PROJECT_ACCESS_CHANGED','Current project access changed during the read. No project data was supplied.');
  }
}

function unavailable(error: unknown): never {
  if (error instanceof ProgramReadAccessError) throw error;
  throw new ProgramReadAccessError(503,'PROJECT_ACCESS_UNAVAILABLE','Current project access could not be verified. No project data was supplied.');
}

export async function readCurrentProgramActor(q: ProgramAccessExecutor, input: {
  organizationId: number; userId: number | undefined; forShare?: boolean;
}): Promise<CurrentProgramActor> {
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId <= 0) {
    throw new ProgramReadAccessError(403,'PROJECT_ACTOR_REQUIRED','A current organization actor is required.');
  }
  try {
    const actor = await readCsrProjectActor(q,input.organizationId,input.userId,{forShare:input.forShare});
    if (typeof actor.role !== 'string' || !actor.role.trim()) throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED',403,'Current organization membership is required.');
    return {userId:actor.userId,role:actor.role};
  } catch (error) {
    if (error instanceof CsrScopeError && error.status===403) {
      throw new ProgramReadAccessError(403,'PROJECT_ACTOR_ACCESS_DENIED','The actor is not a current active member of this organization.');
    }
    return unavailable(error);
  }
}

/** Explicit program admission. All eligible anchors are counted before any
 * sharing test, so an accessible duplicate never hides a private anchor. */
export async function requireCurrentProgramAccess(q: ProgramAccessExecutor, input: ProgramAccessInput): Promise<CurrentProgramAccess> {
  try {
    if (!await programInOrganization(q,input.programId,input.organizationId,{includeDeleted:input.includeDeleted})) {
      throw new ProgramReadAccessError(404,'PROJECT_NOT_FOUND','Project not found.');
    }
    const actor = await readCurrentProgramActor(q,input);
    const anchor = await readProgramAnchorRow(q,{programId:input.programId,orgId:input.organizationId,
      context:'current-program-access',requireUnique:true,eligibility:input.includeDeleted?'all':'non-deleted'});
    if (!anchor) throw new ProgramReadAccessError(409,'PROJECT_ANCHOR_UNRESOLVED','This project needs one verified tracking record before its records can be supplied.');
    if (!await canAccessReportProject(input.organizationId,actor,anchor.id,q)) {
      throw new ProgramReadAccessError(403,'PROJECT_PERMISSION_DENIED','Current project access does not permit this operation.');
    }
    return {actor,programId:input.programId.toLowerCase(),projectId:anchor.id,clientWorkspaceId:anchor.clientWorkspaceId};
  } catch (error) { return unavailable(error); }
}

/** Evaluated list scope; failed verification never becomes an empty library.
 * Consumers MUST bind these IDs in SQL before counts, ranking or pagination. */
export async function getCurrentAccessibleProgramScope(q: ProgramAccessExecutor, input: {
  organizationId: number; userId: number | undefined; programId?: string | null; forShare?: boolean;
}): Promise<CurrentAccessibleProgramScope> {
  if (input.programId !== undefined && input.programId !== null) {
    const access = await requireCurrentProgramAccess(q,{...input,programId:input.programId});
    return rememberScope(q,input,{scope:'verified-accessible-programs',actor:access.actor,programIds:[access.programId],reconciliationRequired:false},
      [{programId:access.programId,projectId:access.projectId,clientWorkspaceId:access.clientWorkspaceId}]);
  }
  try {
    const actor = await readCurrentProgramActor(q,input);
    const programs = await q.query('SELECT id::text FROM regulatory_programs WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY id',[input.organizationId]);
    const candidates = await listProgramAnchorCandidates(q,{orgId:input.organizationId,eligibility:'non-deleted'});
    const permitted = new Set(await getAccessibleReportProjectIds(input.organizationId,actor,q));
    const grouped = new Map<string,typeof candidates>();
    for (const candidate of candidates) {
      const group = grouped.get(candidate.programId) ?? [];
      group.push(candidate);
      grouped.set(candidate.programId,group);
    }
    const programIds: string[] = [];
    const acceptedAnchors: VerifiedProgramAnchor[] = [];
    let reconciliationRequired = false;
    for (const row of programs.rows) {
      if (typeof row.id !== 'string') throw new Error('Program scope identity could not be read');
      const anchors = grouped.get(row.id) ?? [];
      const valid = anchors.length===1 && anchors[0].anchor !== null;
      if (valid && permitted.has(anchors[0].anchor!.id)) {
        programIds.push(row.id);
        acceptedAnchors.push({programId:row.id,projectId:anchors[0].anchor!.id,clientWorkspaceId:anchors[0].anchor!.clientWorkspaceId});
      }
      else if (anchors.some(candidate => candidate.anchor && permitted.has(candidate.anchor.id))) reconciliationRequired=true;
    }
    return rememberScope(q,input,{scope:'verified-accessible-programs',actor,programIds,reconciliationRequired},acceptedAnchors);
  } catch (error) { return unavailable(error); }
}
