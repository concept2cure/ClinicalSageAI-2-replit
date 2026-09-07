/**
 * Biostatistics bridge — the DB-facing service.
 *
 * Joins the design-as-data spine (`cdisc_prm_studies`), the biostatistics
 * engines, the regulatory program (`regulatory_programs` → filing type), the
 * project (`projects`, the integer key the task board and the artifact store
 * use), the governed statistical artifacts (`concept2cure_artifacts`), and the
 * canonical task board (`unified_tasks`) — through the pure adapters in this
 * directory and the platform's existing writers, never a parallel one:
 *
 *   • designs are written with `persistStudyDesignTx` + `recordGovernedAction`
 *     on one transaction, exactly as POST /api/study-design/persist does;
 *   • tasks are created with `unifiedTaskService.createUnifiedTask` and
 *     lineage-recorded with `auditTaskAction`, exactly as POST /api/tasks/tasks
 *     does.
 *
 * Every read is tenant-scoped by organization id. Nothing here fabricates: a
 * design that cannot be sized returns its gaps and no numbers; a program with
 * no filing type returns no placements rather than a guess.
 *
 * @module server/services/biostatistics-bridge/bridge-service
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db, pool } from '../../db';
import { cdiscPrmStudies, concept2cureArtifacts, projects, unifiedTasks } from '../../../shared/schema';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { recordGovernedAction } from '../../routes/c2c/actions';
import { computationEngine } from '../ana-biostats/computation-engine';
import { judgmentEngine } from '../ana-biostats/judgment-engine';
import type { ComputationResult, JudgmentResult, StatisticalDocumentType, StatisticalInput } from '../ana-biostats/types';
import { STATS_ENGINE, STATS_ENGINE_VERSION, hashInputs } from '../stats/computation-provenance';
import {
  isUuid,
  loadStudyDesign,
  persistStudyDesignTx,
  rowsToStudyDesign,
} from '../study-design/study-design-repository';
import type { StudyDesign } from '../study-design/study-design-types';
import { auditTaskAction } from '../tasking/task-audit';
import unifiedTaskService from '../unifiedTaskService';
import {
  applyPlanPatch,
  computationToPlanPatch,
  statisticalReadiness,
  studyDesignToStatisticalInput,
  type DesignAdapterResult,
  type StatisticalReadiness,
} from './design-adapter';
import {
  applicationTypeForProgramType,
  placementsForApplication,
  type ApplicationType,
  type FilingPlacement,
} from './filing-placement';
import { tasksFromAssessment, type TaskBlueprint } from './task-blueprint';
import { buildStatisticalReview, type StatisticalReview } from './statistical-review';
import type { DesignValidationReport } from '../study-design/design-validation';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BridgeDesignRow {
  studyId: string;
  programId: string | null;
  title: string;
  phase: string;
  indication: string;
  status: string;
  updatedAt: string | null;
  readiness: StatisticalReadiness;
}

export interface ProgramFilingContext {
  programId: string | null;
  programType: string | null;
  applicationType: ApplicationType | null;
  /** projects.id — the integer key tasks and artifacts carry; null when the program has no PM row. */
  projectId: number | null;
}

export interface DesignAssessment {
  studyId: string;
  title: string;
  readiness: StatisticalReadiness;
  adapter: DesignAdapterResult;
  computation: ComputationResult | null;
  judgment: JudgmentResult | null;
  /** The design gates' report (ICH E9 / E9(R1) / E10 / E3), as /api/study-design returns it. */
  validation: DesignValidationReport;
  /** The reviewer's risk table and defensibility verdict, assembled from the gates and the engines. */
  review: StatisticalReview;
  provenance: { engine: string; engineVersion: string; inputsSha256: string | null; reproducible: true };
  filing: ProgramFilingContext;
  placements: FilingPlacement[];
  /** Statistical document types already persisted for the project. */
  existingDeliverables: StatisticalDocumentType[];
  proposedTasks: TaskBlueprint[];
  /** Blueprint keys already on the board for this design (open, not archived). */
  existingTaskKeys: string[];
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** This tenant's persisted designs, optionally narrowed to one program, each with its statistical readiness. */
export async function listBridgeDesigns(
  organizationId: number,
  opts: { programId?: string; limit?: number } = {},
): Promise<BridgeDesignRow[]> {
  const where =
    opts.programId !== undefined
      ? and(
          eq(cdiscPrmStudies.tenantId, organizationId),
          // An invalid program id matches nothing — never the whole tenant.
          isUuid(opts.programId) ? eq(cdiscPrmStudies.programId, opts.programId) : sql`false`,
        )
      : eq(cdiscPrmStudies.tenantId, organizationId);
  const rows = await db
    .select()
    .from(cdiscPrmStudies)
    .where(where)
    .orderBy(desc(cdiscPrmStudies.updatedAt))
    .limit(Math.min(opts.limit ?? 50, 200));

  const out: BridgeDesignRow[] = [];
  for (const r of rows) {
    const design = rowsToStudyDesign(r);
    // A PRM row that is not a design spine (no c2c.studyDesign.v1 metadata) has
    // no statistical plan to read; it is listed with an honest zero readiness.
    const readiness: StatisticalReadiness = design
      ? statisticalReadiness(design)
      : { percent: 0, checks: [], plannedSampleSize: r.plannedSubjects ?? null, power: null, alpha: null, primaryEndpoint: null };
    out.push({
      studyId: r.studyId,
      programId: r.programId ?? null,
      title: r.protocolTitle,
      phase: r.studyPhase ?? '',
      indication: r.indication ?? '',
      status: r.protocolStatus ?? 'draft',
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
      readiness,
    });
  }
  return out;
}

/** The filing context of a program: its type, the application it files, and its PM project id. */
export async function programFilingContext(organizationId: number, programId: string | null | undefined): Promise<ProgramFilingContext> {
  if (!programId || !isUuid(programId)) {
    return { programId: null, programType: null, applicationType: null, projectId: null };
  }
  const [program] = await db
    .select({ programType: regulatoryPrograms.programType })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.regulatoryProgramId, programId), eq(projects.organizationId, organizationId)))
    .limit(1);
  const programType = program?.programType ?? null;
  return {
    programId,
    programType,
    applicationType: applicationTypeForProgramType(programType),
    projectId: project?.id ?? null,
  };
}

/** Statistical document types already persisted for the project (the governed-documents list's source). */
export async function existingStatisticalDeliverables(organizationId: number, projectId: number | null): Promise<StatisticalDocumentType[]> {
  if (projectId === null) return [];
  const rows = await db
    .select({ metadata: concept2cureArtifacts.metadata })
    .from(concept2cureArtifacts)
    .where(
      and(
        eq(concept2cureArtifacts.organizationId, organizationId),
        eq(concept2cureArtifacts.projectId, projectId),
        eq(concept2cureArtifacts.type, 'statistical_summary'),
      ),
    )
    .limit(500);
  const out = new Set<StatisticalDocumentType>();
  for (const r of rows) {
    const t = (r.metadata as { statisticalDocumentType?: unknown } | null)?.statisticalDocumentType;
    if (typeof t === 'string') out.add(t as StatisticalDocumentType);
  }
  return [...out];
}

/** Blueprint keys of the open tasks this bridge already raised for a design. */
export async function existingBlueprintKeys(organizationId: number, studyId: string): Promise<string[]> {
  const rows = await db
    .select({ metadata: unifiedTasks.metadata, status: unifiedTasks.status })
    .from(unifiedTasks)
    .where(
      and(
        eq(unifiedTasks.organizationId, organizationId),
        eq(unifiedTasks.sourceEntityType, 'study_design'),
        eq(unifiedTasks.sourceEntityId, studyId),
        isNull(unifiedTasks.deletedAt),
      ),
    )
    .limit(500);
  const keys: string[] = [];
  for (const r of rows) {
    if (r.status === 'completed' || r.status === 'cancelled') continue;
    const k = (r.metadata as { blueprintKey?: unknown } | null)?.blueprintKey;
    if (typeof k === 'string') keys.push(k);
  }
  return keys;
}

function computeFor(adapter: DesignAdapterResult): { computation: ComputationResult | null; judgment: JudgmentResult | null; inputsSha256: string | null } {
  if (!adapter.input) return { computation: null, judgment: null, inputsSha256: null };
  const computation = computationEngine.compute(adapter.input);
  const judgment = judgmentEngine.judge(adapter.input, computation);
  return { computation, judgment, inputsSha256: hashInputs(adapter.input) };
}

/**
 * The full read-only assessment of one design: what the engines say, what the
 * design lacks, where its deliverables file, and which tasks that implies.
 * Nothing is written.
 */
export async function assessDesign(organizationId: number, studyId: string): Promise<DesignAssessment | null> {
  const loaded = await loadStudyDesign(studyId, organizationId);
  if (!loaded) return null;
  const { design, validation } = loaded;

  const adapter = studyDesignToStatisticalInput(design);
  const { computation, judgment, inputsSha256 } = computeFor(adapter);
  const review = buildStatisticalReview({ validation, judgment, computation, input: adapter.input, gaps: adapter.gaps });
  const filing = await programFilingContext(organizationId, design.programId);
  const [existingDeliverables, existingTaskKeys] = await Promise.all([
    existingStatisticalDeliverables(organizationId, filing.projectId),
    existingBlueprintKeys(organizationId, studyId),
  ]);

  const proposedTasks = tasksFromAssessment({
    designTitle: design.title,
    judgment,
    input: adapter.input,
    gaps: adapter.gaps,
    applicationType: filing.applicationType,
    existingDeliverables,
    findings: validation.findings,
  });

  return {
    studyId,
    title: design.title,
    readiness: statisticalReadiness(design),
    adapter,
    computation,
    judgment,
    validation,
    review,
    provenance: { engine: STATS_ENGINE, engineVersion: STATS_ENGINE_VERSION, inputsSha256, reproducible: true },
    filing,
    placements: filing.applicationType ? placementsForApplication(filing.applicationType) : [],
    existingDeliverables,
    proposedTasks,
    existingTaskKeys,
  };
}

// ─── Governed writes ─────────────────────────────────────────────────────────

export interface ApplySampleSizeResult {
  studyId: string;
  plannedSampleSize: number;
  power: number;
  actionId: string;
  auditId: string;
  sha256Chain: string;
  design: StudyDesign;
}

export class BridgeError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'CANNOT_SIZE' | 'REASON_REQUIRED' | 'NO_TASKS' | 'NO_PROJECT', message: string, public readonly details?: unknown) {
    super(message);
  }
}

/**
 * Write the engine's sample size and power onto the design's statistical plan.
 * One transaction: the PRM upsert and its Part 11 audit row commit together.
 */
export async function applySampleSizeToDesign(args: {
  organizationId: number;
  userId: number;
  studyId: string;
  reason: string;
  idempotencyKey?: string | null;
}): Promise<ApplySampleSizeResult> {
  const reason = args.reason.trim();
  if (reason.length < 8) throw new BridgeError('REASON_REQUIRED', 'Provide a reason of at least 8 characters.');

  const loaded = await loadStudyDesign(args.studyId, args.organizationId);
  if (!loaded) throw new BridgeError('NOT_FOUND', 'No such design in this organization.');

  const adapter = studyDesignToStatisticalInput(loaded.design);
  if (!adapter.input) {
    throw new BridgeError('CANNOT_SIZE', 'The design cannot be sized until its blocking gaps are resolved.', adapter.gaps.filter((g) => g.severity === 'blocking'));
  }
  const computation = computationEngine.compute(adapter.input);
  const inputsSha256 = hashInputs(adapter.input);
  const patch = computationToPlanPatch(adapter.input, computation, { engine: STATS_ENGINE, version: STATS_ENGINE_VERSION, inputsSha256 });
  const next = applyPlanPatch(loaded.design, patch);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const studyId = await persistStudyDesignTx(client, next, { tenantId: args.organizationId, userId: args.userId });
    const gov = await recordGovernedAction(client, {
      orgId: args.organizationId,
      userId: args.userId,
      command: 'apply-sample-size',
      target: `study-design:${studyId}`,
      reason,
      payload: {
        studyId,
        method: computation.method,
        plannedSampleSize: patch.plannedSampleSize,
        power: patch.power,
        alpha: patch.alpha,
        dropoutRate: patch.dropoutRate,
        engine: STATS_ENGINE,
        engineVersion: STATS_ENGINE_VERSION,
        inputsSha256,
        previousPlannedSampleSize: loaded.design.statisticalPlan?.plannedSampleSize ?? null,
      },
      domain: 'biostatistics',
      surface: 'biostat-bridge',
      idempotencyKey: args.idempotencyKey ?? null,
    });
    await client.query('COMMIT');
    return {
      studyId,
      plannedSampleSize: patch.plannedSampleSize as number,
      power: patch.power as number,
      ...gov,
      design: next,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface CreatedBridgeTask {
  taskId: string;
  key: string;
  title: string;
  priority: string;
}

/**
 * Raise the selected proposed tasks on the canonical board. Each task carries
 * the design as its source entity and the blueprint key in its metadata, so a
 * re-run proposes the same set and skips what is already open.
 */
export async function createTasksForDesign(args: {
  organizationId: number;
  userId: number | null;
  studyId: string;
  keys: string[];
  reason?: string;
}): Promise<{ created: CreatedBridgeTask[]; skipped: string[] }> {
  const assessment = await assessDesign(args.organizationId, args.studyId);
  if (!assessment) throw new BridgeError('NOT_FOUND', 'No such design in this organization.');

  const wanted = new Set(args.keys);
  const chosen = assessment.proposedTasks.filter((t) => wanted.has(t.key));
  if (chosen.length === 0) throw new BridgeError('NO_TASKS', 'None of the requested keys is a proposed task for this design.');

  const already = new Set(assessment.existingTaskKeys);
  const created: CreatedBridgeTask[] = [];
  const skipped: string[] = [];
  for (const b of chosen) {
    if (already.has(b.key)) { skipped.push(b.key); continue; }
    const task = await unifiedTaskService.createUnifiedTask({
      moduleType: 'Biostatistics',
      title: b.title,
      description: b.description,
      category: b.category,
      taskType: b.taskType,
      priority: b.priority,
      organizationId: args.organizationId,
      projectId: assessment.filing.projectId ?? undefined,
      sourceEntityType: 'study_design',
      sourceEntityId: args.studyId,
      tags: ['biostatistics', b.trigger, ...(b.deliverable ? [b.deliverable] : [])],
      metadata: {
        blueprintKey: b.key,
        trigger: b.trigger,
        deliverable: b.deliverable ?? null,
        regulatoryImpact: b.regulatoryImpact,
        criticalPath: b.criticalPath,
        applicationType: assessment.filing.applicationType,
        programId: assessment.filing.programId,
        raisedBy: 'biostat-bridge',
      },
    });
    await auditTaskAction({
      orgId: args.organizationId,
      userId: args.userId,
      command: 'task.create',
      taskId: task.taskId,
      payload: {
        moduleType: 'Biostatistics',
        title: b.title,
        priority: b.priority,
        status: 'pending',
        sourceEntityType: 'study_design',
        sourceEntityId: args.studyId,
        blueprintKey: b.key,
      },
      reason: args.reason ?? `Raised from the biostatistics assessment of "${assessment.title}" (${b.trigger})`,
    });
    created.push({ taskId: task.taskId, key: b.key, title: b.title, priority: b.priority });
  }
  return { created, skipped };
}

/** Exposed for the route's catalog endpoint; kept here so the route imports one module. */
export { placementsForApplication, isApplicationType, APPLICATION_TYPE_VALUES } from './filing-placement';
export type { StatisticalInput };
