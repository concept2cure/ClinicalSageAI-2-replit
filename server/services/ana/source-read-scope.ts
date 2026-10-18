/** Actor-aware source discovery uses the existing project policy. This DTO
 * is produced by the server, never accepted as authority from a tool body.
 * Checks are point-in-time; callers re-admit after provider awaits. */
import type { RequestSqlClient } from '../../db/requestDb';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../../lib/project-id.js';
import { getAccessibleReportProjectIds } from '../report-os/project-access.js';
import { admitAnaProjectScope, AnaProjectScopeError, readActiveAnaActorRole } from './project-scope-admission.js';

export interface AnaSourceReadScopeInput {
  organizationId: number;
  userId: number;
  projectId?: number | null;
  projectRef?: string | null;
  requestedProgramId?: string | null;
}

export interface AdmittedAnaSourceReadScope {
  readonly organizationId: number;
  readonly userId: number;
  readonly role: string;
  readonly projectId: number | null;
  readonly programId: string | null;
  readonly accessibleProgramIds: readonly string[];
  readonly actorFiltered: true;
}

const positiveId = (value: unknown): value is number => typeof value === 'number' &&
  Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
const present = (value: unknown): boolean => value !== undefined && value !== null;
function invalid(): never {
  throw new AnaProjectScopeError(400, 'ANA_PROJECT_SCOPE_INVALID', 'Choose a valid project identifier.');
}
function unavailable(): never {
  throw new AnaProjectScopeError(503, 'ANA_PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. AnA has not read its sources.');
}
function changed(): never {
  throw new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_CHANGED', 'Current source access changed during this request. AnA has not returned its source results; retry with the current project access.');
}

function optionalProjectId(value: unknown): number | null {
  if (!present(value)) return null;
  return positiveId(value) ? value : invalid();
}

function optionalProgramId(value: unknown): string | null {
  if (!present(value)) return null;
  return typeof value === 'string' && looksLikeProgramUuid(value) ? value.trim().toLowerCase() : invalid();
}

function optionalProjectRef(value: unknown): string | null {
  if (!present(value)) return null;
  if (typeof value !== 'string' || (!looksLikeProgramUuid(value) && !positiveId(parseIntegerProjectId(value)))) invalid();
  return value.trim().toLowerCase();
}

/** Take primitive copies synchronously so a caller cannot alter pending scope. */
function snapshotInput(raw: AnaSourceReadScopeInput): Readonly<AnaSourceReadScopeInput> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const { organizationId, userId, projectId, projectRef, requestedProgramId } = raw;
  if (!positiveId(organizationId) || !positiveId(userId)) {
    throw new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'An identified organization member is required to read project sources.');
  }
  return Object.freeze({ organizationId, userId,
    projectId: optionalProjectId(projectId), projectRef: optionalProjectRef(projectRef),
    requestedProgramId: optionalProgramId(requestedProgramId) });
}

function result(input: Readonly<AnaSourceReadScopeInput>, role: string, projectId: number | null,
  programId: string | null, programIds: readonly string[]): AdmittedAnaSourceReadScope {
  const accessibleProgramIds = Object.freeze([...programIds].sort());
  return Object.freeze({ organizationId: input.organizationId, userId: input.userId, role,
    projectId, programId, accessibleProgramIds, actorFiltered: true as const });
}

/** Validate ALL organization anchors first. Intersecting accessible projects
 * earlier could launder an inaccessible duplicate into a seemingly unique row. */
async function accessiblePrograms(q: RequestSqlClient, input: Readonly<AnaSourceReadScopeInput>, role: string): Promise<string[]> {
  const accessible = new Set(await getAccessibleReportProjectIds(input.organizationId, { userId: input.userId, role }, q));
  const { rows } = await q.query(`SELECT p.id, p.organization_id, p.regulatory_program_id,
      rp.organization_id AS program_organization_id, rp.deleted_at AS program_deleted_at
    FROM projects p LEFT JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id
    WHERE p.organization_id = $1 AND p.regulatory_program_id IS NOT NULL
    ORDER BY p.id`, [input.organizationId]);
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    if (!positiveId(row.id) || row.organization_id !== input.organizationId || !looksLikeProgramUuid(row.regulatory_program_id)) unavailable();
    if (row.program_organization_id !== null && !positiveId(row.program_organization_id)) unavailable();
    if (row.program_deleted_at === undefined) unavailable();
    const program = String(row.regulatory_program_id).trim().toLowerCase();
    const group = grouped.get(program) ?? [];
    group.push(row);
    grouped.set(program, group);
  }
  const programs: string[] = [];
  for (const [program, anchors] of grouped) {
    if (anchors.length !== 1) continue;
    const anchor = anchors[0];
    if (anchor.program_organization_id === input.organizationId && anchor.program_deleted_at === null && accessible.has(Number(anchor.id))) {
      programs.push(program);
    }
  }
  return programs.sort();
}

export async function admitAnaSourceReadScope(q: RequestSqlClient, raw: AnaSourceReadScopeInput): Promise<AdmittedAnaSourceReadScope> {
  const input = snapshotInput(raw);
  try {
    const role = await readActiveAnaActorRole(q, input);
    const explicitProject = input.projectId != null || input.projectRef != null;
    if (explicitProject || input.requestedProgramId != null) {
      return await admitExplicitSourceScope(q, input, role, explicitProject);
    }
    const programs = await accessiblePrograms(q, input, role);
    if (await readActiveAnaActorRole(q, input) !== role) changed();
    return result(input, role, null, null, programs);
  } catch (error) {
    if (error instanceof AnaProjectScopeError) throw error;
    return unavailable();
  }
}

async function admitExplicitSourceScope(q: RequestSqlClient, input: Readonly<AnaSourceReadScopeInput>,
  role: string, explicitProject: boolean): Promise<AdmittedAnaSourceReadScope> {
  const admitted = await admitAnaProjectScope(q, {
    organizationId: input.organizationId, userId: input.userId, projectId: input.projectId,
    projectRef: input.projectRef ?? (explicitProject ? null : input.requestedProgramId),
  });
  if (!positiveId(admitted.projectId) || (admitted.programId != null && !looksLikeProgramUuid(admitted.programId))) unavailable();
  const programId = admitted.programId == null ? null : admitted.programId.toLowerCase();
  if (input.requestedProgramId != null && input.requestedProgramId !== programId) {
    throw new AnaProjectScopeError(403, 'CROSS_PROJECT', 'This conversation is held in its own project. Open the other project to work with its documents.');
  }
  if (await readActiveAnaActorRole(q, input) !== role) changed();
  return result(input, role, admitted.projectId, programId, programId ? [programId] : []);
}

function canonicalRole(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim().toLowerCase()) invalid();
  return value;
}

function scopeProgramIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) invalid();
  const programs: string[] = [];
  // Iteration examines sparse slots as undefined; Array.some would skip them.
  for (const id of value) {
    if (typeof id !== 'string' || !looksLikeProgramUuid(id) || id !== id.trim().toLowerCase()) invalid();
    programs.push(id);
  }
  if (new Set(programs).size !== programs.length) invalid();
  return Object.freeze(programs.sort());
}

function assertProjectProgramRelation(projectId: number | null, programId: string | null, programIds: readonly string[]): void {
  if (projectId === null) {
    if (programId !== null) invalid();
    return;
  }
  if (programId === null) {
    if (programIds.length !== 0) invalid();
  } else if (programIds.length !== 1 || programIds[0] !== programId) invalid();
}

/** A scope object is not self-attesting. Validate its shape before deriving
 * the pinned server context for a fresh canonical admission. */
function snapshotScope(raw: AdmittedAnaSourceReadScope): AdmittedAnaSourceReadScope {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const { organizationId, userId, role, projectId, programId, accessibleProgramIds, actorFiltered } = raw;
  if (!positiveId(organizationId) || !positiveId(userId) || actorFiltered !== true) invalid();
  // Unlike optional input values, canonical DTO fields must be explicit null
  // or exact identifiers, so omission cannot widen an explicit scope.
  if (projectId === undefined || programId === undefined) invalid();
  const parsedProject = optionalProjectId(projectId);
  const parsedProgram = optionalProgramId(programId);
  const programs = scopeProgramIds(accessibleProgramIds);
  if (parsedProgram !== programId) invalid();
  assertProjectProgramRelation(parsedProject, parsedProgram, programs);
  return Object.freeze({ organizationId, userId, role: canonicalRole(role), projectId: parsedProject, programId: parsedProgram,
    accessibleProgramIds: programs, actorFiltered: true as const });
}

export function assertAnaSourceProgramAllowed(raw: AdmittedAnaSourceReadScope, programId: unknown): void {
  const scope = snapshotScope(raw);
  if (!looksLikeProgramUuid(programId) || !scope.accessibleProgramIds.includes(String(programId).trim().toLowerCase())) {
    throw new AnaProjectScopeError(403, 'ANA_SOURCE_ACCESS_DENIED', 'You do not have current access to the selected source.');
  }
}

export async function revalidateAnaSourceReadScope(q: RequestSqlClient, raw: AdmittedAnaSourceReadScope): Promise<AdmittedAnaSourceReadScope> {
  const pinned = snapshotScope(raw);
  const current = await admitAnaSourceReadScope(q, { organizationId: pinned.organizationId, userId: pinned.userId,
    projectId: pinned.projectId, projectRef: pinned.programId });
  if (current.role !== pinned.role || current.projectId !== pinned.projectId || current.programId !== pinned.programId ||
      current.accessibleProgramIds.length !== pinned.accessibleProgramIds.length ||
      current.accessibleProgramIds.some((id, index) => id !== pinned.accessibleProgramIds[index])) changed();
  return current;
}
