/** Request-owned admission for the existing Submission Center read surfaces.
 * Background submission-service callers retain their explicit existing ABI. */
import { and, desc, eq, isNull, or, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { RequestSqlClient } from '../../db/requestDb';
import { expandRoleClaims, roleClaimsSatisfy } from '../../middleware/auth';
import { submissions, ectdSequences, submissionLeaves } from '../../../shared/schema/submissions';
import { isSameSubmissionType, resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import type { Pathway, SubmissionDeliverablesAvailability, DeliverableEvaluationScope } from '../../../shared/types/submission-api';
import { CTIS_MEMBER_STATE_CODES } from '../../../shared/types/submission-api';
import { canMutateProgram } from '../c2c/program-access';
import {
  getCurrentAccessibleProgramScope, readCurrentProgramActor, requireCurrentProgramAccess, requireProgramScopeStillCurrent,
  ProgramReadAccessError, type CurrentAccessibleProgramScope,
} from '../c2c/current-program-access';
import { deviceFlagsFromMetadata } from '../pathway-engines/estar/program-device-flags';
import type { AssessPathwayInput } from '../pathway-engines';

export class SubmissionReadError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 422 | 503, readonly code: string, message: string) {
    super(message); this.name = 'SubmissionReadError';
  }
}
export interface SubmissionReadActor { organizationId: number; userId: number }
export interface SubmissionReadSelection { expectedProgramId?: string; expectedSubmissionId?: number }
const identitySchema = z.object({ submissionId: z.number().int().positive(), programId: z.string().uuid().nullable(),
  applicationType: z.string(), primaryRegion: z.string(), sequenceId: z.number().int().positive().optional(), sequenceRegion: z.string().optional() });
type ParentIdentity = z.infer<typeof identitySchema>;
export interface AdmittedSubmissionSequence {
  organizationId: number; userId: number; submissionId: number; sequenceId: number;
  programId: string; projectId: number; applicationType: string; sequenceRegion: string;
}
interface Binding {
  q: RequestSqlClient; actor: SubmissionReadActor; identity: ParentIdentity; scope: CurrentAccessibleProgramScope;
  projectId?: number; evaluationFacts?: string; leafFacts?: string;
}
const sequenceBindings = new WeakMap<AdmittedSubmissionSequence, Binding>();

function requestReadDb(q: RequestSqlClient) {
  // Drizzle's existing request adapter only needs the pinned client's query surface.
  return drizzle(q as PoolClient);
}
function unavailable(error: unknown): never {
  if (error instanceof SubmissionReadError || error instanceof ProgramReadAccessError) throw error;
  throw new SubmissionReadError(503, 'SUBMISSION_READ_UNAVAILABLE', 'The submission records could not be verified.');
}
function requireFunctionalRead(scope: CurrentAccessibleProgramScope): void {
  if (!roleClaimsSatisfy({ role: scope.actor.role, roles: expandRoleClaims(scope.actor.role, undefined) }, ['regulatory-author'])) {
    throw new SubmissionReadError(403, 'SUBMISSION_PERMISSION_DENIED', 'Current organization permissions do not permit this read.');
  }
}
async function parentIdentity(q: RequestSqlClient, actor: SubmissionReadActor, target: { submissionId: number } | { sequenceId: number }): Promise<ParentIdentity> {
  const result = 'sequenceId' in target
    ? await q.query(`SELECT s.id AS "submissionId",s.program_id::text AS "programId",s.application_type AS "applicationType",
        s.primary_region AS "primaryRegion",e.id AS "sequenceId",e.region AS "sequenceRegion"
      FROM ectd_sequences e JOIN submissions s ON s.id=e.submission_id AND s.organization_id=e.organization_id
      WHERE e.id=$1 AND e.organization_id=$2 AND s.organization_id=$2 AND e.deleted_at IS NULL AND s.deleted_at IS NULL`, [target.sequenceId, actor.organizationId])
    : await q.query(`SELECT s.id AS "submissionId",s.program_id::text AS "programId",s.application_type AS "applicationType",s.primary_region AS "primaryRegion"
      FROM submissions s WHERE s.id=$1 AND s.organization_id=$2 AND s.deleted_at IS NULL`, [target.submissionId, actor.organizationId]);
  if (result.rows.length !== 1) throw new SubmissionReadError(404, 'NOT_FOUND', 'Submission record not found.');
  return identitySchema.parse(result.rows[0]);
}
function verifySelection(identity: ParentIdentity, selection: SubmissionReadSelection): void {
  if ((selection.expectedSubmissionId !== undefined && selection.expectedSubmissionId !== identity.submissionId) ||
    (selection.expectedProgramId !== undefined && selection.expectedProgramId.toLowerCase() !== identity.programId?.toLowerCase())) {
    throw new SubmissionReadError(404, 'NOT_FOUND', 'Submission record not found in the selected scope.');
  }
}
async function admitParent(q: RequestSqlClient, actor: SubmissionReadActor, identity: ParentIdentity, selection: SubmissionReadSelection = {}): Promise<CurrentAccessibleProgramScope> {
  verifySelection(identity, selection);
  if (!identity.programId) throw new SubmissionReadError(409, 'UNANCHORED_SUBMISSION', 'Anchor this submission to a project before reading its sequence or sources.');
  const scope = await getCurrentAccessibleProgramScope(q, { ...actor, programId: identity.programId });
  requireFunctionalRead(scope);
  const program = await q.query('SELECT program_type FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL', [identity.programId, actor.organizationId]);
  if (program.rows.length !== 1 || !isSameSubmissionType(identity.applicationType, typeof program.rows[0].program_type === 'string' ? program.rows[0].program_type : null)) {
    throw new SubmissionReadError(409, 'APPLICATION_TYPE_MISMATCH', 'The recorded submission and project filing types do not agree.');
  }
  return scope;
}
async function requireRecordedProjectAnchor(q: RequestSqlClient, binding: Binding): Promise<void> {
  if (binding.projectId === undefined) return;
  const current = await requireCurrentProgramAccess(q, {
    ...binding.actor, programId: z.string().uuid().parse(binding.identity.programId),
  });
  if (current.projectId !== binding.projectId) throw new Error('Retained project anchor changed');
}
async function recheckParent(q: RequestSqlClient, binding: Binding): Promise<void> {
  try {
    const target = binding.identity.sequenceId === undefined ? { submissionId: binding.identity.submissionId } : { sequenceId: binding.identity.sequenceId };
    const current = await parentIdentity(q, binding.actor, target);
    if (JSON.stringify(current) !== JSON.stringify(binding.identity)) throw new Error('Retained parent changed');
    await requireProgramScopeStillCurrent(q, { ...binding.actor, programId: binding.identity.programId }, binding.scope);
    await requireRecordedProjectAnchor(q, binding);
    const program = await q.query('SELECT program_type FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL', [binding.identity.programId, binding.actor.organizationId]);
    if (program.rows.length !== 1 || !isSameSubmissionType(binding.identity.applicationType, typeof program.rows[0].program_type === 'string' ? program.rows[0].program_type : null)) throw new Error('Recorded filing type changed');
    if (binding.evaluationFacts !== undefined && JSON.stringify(await evaluationFacts(q, binding.actor, binding.identity, binding.identity.sequenceRegion ?? binding.identity.primaryRegion)) !== binding.evaluationFacts) {
      throw new SubmissionReadError(503, 'SUBMISSION_EVALUATION_CHANGED', 'The recorded evaluation inputs changed during the read.');
    }
    if (binding.leafFacts !== undefined && JSON.stringify(await currentLeaves(q, binding.actor.organizationId, z.number().int().positive().parse(binding.identity.sequenceId))) !== binding.leafFacts) {
      throw new SubmissionReadError(503, 'SUBMISSION_PLACEMENTS_CHANGED', 'The retained placements changed during the read.');
    }
  } catch (error) {
    if ((error instanceof ProgramReadAccessError || error instanceof SubmissionReadError) && error.status === 503) throw error;
    throw new SubmissionReadError(503, 'SUBMISSION_ACCESS_CHANGED', 'Submission access changed during the read. Refresh to try again.');
  }
}

export async function listSubmissionsForRequest(q: RequestSqlClient, actor: SubmissionReadActor, programId?: string) {
  try {
    const scope = await getCurrentAccessibleProgramScope(q, { ...actor, programId }); requireFunctionalRead(scope);
    const managerUnanchored = programId === undefined && canMutateProgram({ actor: { userId: scope.actor.userId, orgRole: scope.actor.role }, program: { leadUserId: null } });
    const rows = await requestReadDb(q).select().from(submissions).where(and(eq(submissions.organizationId, actor.organizationId), isNull(submissions.deletedAt),
      or(inArray(submissions.programId, scope.programIds), managerUnanchored ? isNull(submissions.programId) : sql`false`))).orderBy(desc(submissions.updatedAt), desc(submissions.id));
    await requireProgramScopeStillCurrent(q, { ...actor, programId }, scope);
    return rows;
  } catch (error) { return unavailable(error); }
}
export async function getSubmissionForRequest(q: RequestSqlClient, actor: SubmissionReadActor, submissionId: number, selection: SubmissionReadSelection = {}) {
  try {
    await readCurrentProgramActor(q, actor);
    const identity = await parentIdentity(q, actor, { submissionId }); verifySelection(identity, selection);
    // Keep the existing manager's metadata-only pre-anchor remedy reachable.
    const scope = identity.programId ? await admitParent(q, actor, identity, selection) : await getCurrentAccessibleProgramScope(q, actor);
    requireFunctionalRead(scope);
    if (!identity.programId && !canMutateProgram({ actor: { userId: scope.actor.userId, orgRole: scope.actor.role }, program: { leadUserId: null } })) {
      throw new SubmissionReadError(409, 'UNANCHORED_SUBMISSION', 'This submission needs a verified project anchor.');
    }
    const [row] = await requestReadDb(q).select().from(submissions).where(and(eq(submissions.id, submissionId), eq(submissions.organizationId, actor.organizationId), isNull(submissions.deletedAt)));
    if (!row) throw new SubmissionReadError(404, 'NOT_FOUND', 'Submission record not found.');
    if (identity.programId) await recheckParent(q, { q, actor, identity, scope });
    else { await requireProgramScopeStillCurrent(q, actor, scope); const current = await parentIdentity(q, actor, { submissionId }); if (JSON.stringify(current) !== JSON.stringify(identity)) throw new SubmissionReadError(503, 'SUBMISSION_ACCESS_CHANGED', 'Submission access changed during the read.'); }
    return row;
  } catch (error) { return unavailable(error); }
}
export async function readSubmissionSequenceForRequest(q: RequestSqlClient, actor: SubmissionReadActor, sequenceId: number, selection: SubmissionReadSelection = {}): Promise<AdmittedSubmissionSequence> {
  try {
    await readCurrentProgramActor(q, actor);
    const identity = await parentIdentity(q, actor, { sequenceId });
    const scope = await admitParent(q, actor, identity, selection);
    const access = await requireCurrentProgramAccess(q, { ...actor, programId: z.string().uuid().parse(identity.programId) });
    const admitted = Object.freeze({ ...actor, submissionId: identity.submissionId, sequenceId, programId: access.programId, projectId: access.projectId,
      applicationType: identity.applicationType, sequenceRegion: z.string().parse(identity.sequenceRegion) });
    sequenceBindings.set(admitted, { q, actor, identity, scope, projectId: access.projectId }); return admitted;
  } catch (error) { return unavailable(error); }
}
function bindingFor(q: RequestSqlClient, admitted: AdmittedSubmissionSequence): Binding {
  const binding = sequenceBindings.get(admitted);
  if (!binding || binding.q !== q) throw new SubmissionReadError(403, 'SUBMISSION_SCOPE_UNVERIFIED', 'A verified current submission scope is required.');
  return binding;
}
export async function readSubmissionLeavesForRequest(q: RequestSqlClient, admitted: AdmittedSubmissionSequence) {
  const binding = bindingFor(q, admitted);
  try {
    const rows = await currentLeaves(q, admitted.organizationId, admitted.sequenceId);
    binding.leafFacts = JSON.stringify(rows); return rows;
  } catch (error) { return unavailable(error); }
}
function currentLeaves(q: RequestSqlClient, organizationId: number, sequenceId: number) {
  return requestReadDb(q).select().from(submissionLeaves).where(and(eq(submissionLeaves.sequenceId, sequenceId), eq(submissionLeaves.organizationId, organizationId), isNull(submissionLeaves.deletedAt))).orderBy(submissionLeaves.sectionCode, submissionLeaves.id);
}
export async function requireSubmissionReadStillCurrent(q: RequestSqlClient, admitted: AdmittedSubmissionSequence): Promise<void> {
  await recheckParent(q, bindingFor(q, admitted));
}

/** Engine compatibility comes from the recorded filing's canonical registry ID.
 * This is dispatch to existing engines, not a second regulatory requirement tree. */
const ENGINE_BY_REGISTRY: Readonly<Record<string, Pathway>> = {
  EU_CTA: 'ctis', EU_MDR_TECHDOC: 'mdr', EU_IVDR_TECHDOC: 'ivdr', US_510K: 'estar_510k', US_510K_IVD: 'estar_510k',
  US_DE_NOVO: 'estar_de_novo', US_DE_NOVO_IVD: 'estar_de_novo', JP_SHONIN: 'pmda_shonin', US_PMA: 'pma', US_PMA_IVD: 'pma',
  US_PMA_SUPP: 'pma', US_QSUB: 'prestar_q_sub', US_IVD_QSUB: 'prestar_q_sub', US_IDE: 'prestar_ide', US_513G: 'prestar_513g',
};
function compatiblePathways(applicationType: string): Pathway[] {
  const entry = resolveToRegistryEntry(applicationType);
  if (!entry) return [];
  const pathway = ENGINE_BY_REGISTRY[entry.id] ?? (entry.parentApplicationType ? ENGINE_BY_REGISTRY[entry.parentApplicationType] : undefined);
  return pathway ? [pathway] : [];
}
function recordedFramework(recorded: string, compatible: Pathway[]): Pathway | null {
  if (recorded === 'estar') return compatible.find(value => value === 'estar_510k' || value === 'estar_de_novo') ?? null;
  return compatible.find(value => value === recorded) ?? null;
}
async function availability(q: RequestSqlClient, actor: SubmissionReadActor, identity: ParentIdentity, region: string, facts?: Awaited<ReturnType<typeof evaluationFacts>>): Promise<SubmissionDeliverablesAvailability> {
  const compatible = compatiblePathways(identity.applicationType);
  const entry = resolveToRegistryEntry(identity.applicationType);
  if (compatible.length && (!entry || canonicalRegionOf(region) !== entry.region || canonicalRegionOf(identity.primaryRegion) !== entry.region)) throw new SubmissionReadError(409, 'PATHWAY_REGION_CONFLICT', 'The recorded filing and sequence region do not agree.');
  const recorded = facts ?? await evaluationFacts(q, actor, identity, region);
  const frameworks = [...new Set(recorded.frameworks.map(row => row.pathway))];
  if (frameworks.length > 1) throw new SubmissionReadError(409, 'PATHWAY_RECORD_CONFLICT', 'The recorded submission frameworks do not agree.');
  const framework = frameworks.length === 1 ? recordedFramework(frameworks[0], compatible) : null;
  if (compatible.length && frameworks.length === 1 && !framework) throw new SubmissionReadError(409, 'PATHWAY_RECORD_CONFLICT', 'The recorded framework does not match this filing type.');
  return { available: compatible.length > 0, compatiblePathways: compatible, recordedPathway: framework,
    reasonCode: compatible.length ? (framework ? null : 'PATHWAY_SELECTION_REQUIRED') : 'PATHWAY_COVERAGE_UNAVAILABLE' };
}
async function evaluationFacts(q: RequestSqlClient, actor: SubmissionReadActor, identity: ParentIdentity, region: string) {
  const rows = await q.query('SELECT program_type,product_type,metadata,code,name FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL', [identity.programId, actor.organizationId]);
  if (rows.rows.length !== 1) throw new SubmissionReadError(503, 'SUBMISSION_READ_UNAVAILABLE', 'The current evaluation inputs could not be verified.');
  const row = rows.rows[0];
  const regions = await q.query('SELECT id,region,pathway FROM submission_regions WHERE submission_id=$1 AND organization_id=$2 AND deleted_at IS NULL ORDER BY id', [identity.submissionId, actor.organizationId]);
  return { programType: z.string().parse(row.program_type), productType: z.string().parse(row.product_type),
    programCode: z.string().parse(row.code), programTitle: z.string().parse(row.name),
    deviceFlags: deviceFlagsFromMetadata(row.metadata) ?? null,
    frameworks: regions.rows.filter(value => canonicalRegionOf(z.string().parse(value.region)) === canonicalRegionOf(region)).map(value => ({ id: z.number().int().positive().parse(value.id), region: z.string().parse(value.region), pathway: z.string().parse(value.pathway) })) };
}
export async function listSequencesForRequest(q: RequestSqlClient, actor: SubmissionReadActor, submissionId: number, selection: SubmissionReadSelection = {}) {
  try {
    await readCurrentProgramActor(q, actor);
    const identity = await parentIdentity(q, actor, { submissionId }); const scope = await admitParent(q, actor, identity, selection);
    const rows = await currentSequences(q, actor.organizationId, submissionId);
    const output = []; const captured: Array<{ region: string; facts: string }> = [];
    for (const row of rows) {
      const facts = await evaluationFacts(q, actor, identity, row.region);
      output.push({ ...row, deliverables: await availability(q, actor, identity, row.region, facts) });
      captured.push({ region: row.region, facts: JSON.stringify(facts) });
    }
    await recheckParent(q, { q, actor, identity, scope });
    if (JSON.stringify(await currentSequences(q, actor.organizationId, submissionId)) !== JSON.stringify(rows)) throw new SubmissionReadError(503, 'SUBMISSION_ACCESS_CHANGED', 'The recorded sequences changed during the read.');
    for (const recorded of captured) {
      if (JSON.stringify(await evaluationFacts(q, actor, identity, recorded.region)) !== recorded.facts) throw new SubmissionReadError(503, 'SUBMISSION_EVALUATION_CHANGED', 'The recorded evaluation inputs changed during the read.');
    }
    return output;
  } catch (error) { return unavailable(error); }
}
function currentSequences(q: RequestSqlClient, organizationId: number, submissionId: number) {
  return requestReadDb(q).select().from(ectdSequences).where(and(eq(ectdSequences.submissionId, submissionId), eq(ectdSequences.organizationId, organizationId), isNull(ectdSequences.deletedAt))).orderBy(ectdSequences.sequenceNumber, ectdSequences.id);
}

// Explicit CTIS input scope; these ISO codes identify the current EU member states.
const CTIS_STATES: ReadonlySet<string> = new Set(CTIS_MEMBER_STATE_CODES);
export function normalizeCtisMemberStates(raw: string | undefined): string[] {
  if (!raw) return [];
  if (raw.length > 256) throw new SubmissionReadError(400, 'CTIS_MEMBER_STATES_INVALID', 'Choose valid EU member-state codes.');
  const states = raw.split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  if (states.length > 27 || states.some(value => !CTIS_STATES.has(value))) throw new SubmissionReadError(400, 'CTIS_MEMBER_STATES_INVALID', 'Choose valid EU member-state codes.');
  return [...new Set(states)].sort();
}
interface EvaluationSelection { pathway?: Pathway; memberStates?: string; regulation?: 'mdr' | 'ivdr' }
function selectEvaluationPathway(choices: SubmissionDeliverablesAvailability, requested: EvaluationSelection): Pathway {
  if (!choices.available) throw new SubmissionReadError(422, 'PATHWAY_COVERAGE_UNAVAILABLE', 'Required-deliverable coverage is not implemented for this recorded filing type. Use its existing validation and dispatch workspaces.');
  if (requested.regulation && requested.pathway && requested.regulation !== requested.pathway) throw new SubmissionReadError(400, 'PATHWAY_INPUT_CONFLICT', 'The selected framework inputs do not agree.');
  const pathway = requested.regulation ?? requested.pathway ?? choices.recordedPathway;
  if (!pathway) throw new SubmissionReadError(409, 'PATHWAY_SELECTION_REQUIRED', 'Choose a compatible framework; no framework is recorded for this sequence.');
  if (!choices.compatiblePathways.includes(pathway)) throw new SubmissionReadError(409, 'PATHWAY_INCOMPATIBLE', 'The selected framework does not match this recorded filing type.');
  return pathway;
}
function refuseUnrecordedSubtype(pathway: Pathway, registryId?: string) {
  if (pathway === 'prestar_q_sub') throw new SubmissionReadError(409, 'QSUB_TYPE_UNRECORDED', 'The Q-Submission subtype must be recorded before its required deliverables can be evaluated.');
  if (pathway === 'pma' && registryId === 'US_PMA_SUPP') throw new SubmissionReadError(409, 'PMA_SUPPLEMENT_TYPE_UNRECORDED', 'The PMA supplement subtype must be recorded before its required deliverables can be evaluated.');
}
function evaluationEngine(pathway: Pathway, memberStates: string[], facts: Awaited<ReturnType<typeof evaluationFacts>>, registryId?: string): Omit<AssessPathwayInput, 'leaves'> {
  return { pathway, memberStates, deviceFlags: facts.deviceFlags ?? undefined,
    ...(facts.productType === 'ivd' ? { deviceVariant: 'ivd' as const } : {}),
    ...(pathway === 'pma' && registryId !== 'US_PMA_SUPP' ? { pmaSubmissionType: 'original' as const } : {}) };
}
export async function readDeliverableEvaluationInput(q: RequestSqlClient, admitted: AdmittedSubmissionSequence, requested: EvaluationSelection): Promise<{ scope: DeliverableEvaluationScope; engine: Omit<AssessPathwayInput, 'leaves'> }> {
  const binding = bindingFor(q, admitted);
  try {
    const facts = await evaluationFacts(q, binding.actor, binding.identity, admitted.sequenceRegion);
    const choices = await availability(q, binding.actor, binding.identity, admitted.sequenceRegion, facts);
    const pathway = selectEvaluationPathway(choices, requested);
    const memberStates = normalizeCtisMemberStates(requested.memberStates);
    if (pathway !== 'ctis' && memberStates.length) throw new SubmissionReadError(400, 'CTIS_MEMBER_STATES_INVALID', 'Member-state scope is only supported for CTIS.');
    if (!isSameSubmissionType(admitted.applicationType, facts.programType)) throw new SubmissionReadError(409, 'APPLICATION_TYPE_MISMATCH', 'The recorded submission and project filing types do not agree.');
    binding.evaluationFacts = JSON.stringify(facts);
    const entry = resolveToRegistryEntry(admitted.applicationType);
    refuseUnrecordedSubtype(pathway, entry?.id);
    const scope: DeliverableEvaluationScope = { organizationId: admitted.organizationId, programId: admitted.programId, projectId: admitted.projectId,
      submissionId: admitted.submissionId, sequenceId: admitted.sequenceId, sequenceRegion: admitted.sequenceRegion,
      programCode: facts.programCode, programTitle: facts.programTitle,
      recordedApplicationType: admitted.applicationType, recordedPathway: choices.recordedPathway,
      evaluatedPathway: pathway, memberStates, regulation: pathway === 'mdr' || pathway === 'ivdr' ? pathway : null,
      inputOrigin: requested.pathway || requested.regulation ? 'explicit-compatible' : 'recorded',
      evaluation: 'retained-placement-content-coverage', dispatchReadiness: 'separate-governed-assessment' };
    return { scope, engine: evaluationEngine(pathway, memberStates, facts, entry?.id) };
  } catch (error) { return unavailable(error); }
}
