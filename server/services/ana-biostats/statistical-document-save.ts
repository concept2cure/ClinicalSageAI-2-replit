/**
 * The workbench's explicit save of a statistical planning document into the one
 * editor (split from workflow-integrator.ts, 2026-11-08).
 *
 * The save reaches the authoring writer (authoring-from-draft), and through it the
 * Vault catalog and its embeddings. The integrator is the deterministic engine
 * behind compute_sample_size, compare_statistical_scenarios,
 * assess_statistical_defensibility and analyze_missing_data_impact, which the
 * register claims as `source: engine`. Kept in that module, the save made each of
 * those tools reach a model at file level (ci:step-presentation), though none
 * calls one. Only routes/ana-biostats.ts saves.
 */
import type {
  GovernedStatisticalDocument,
  StatisticalDocumentBasis,
  StatisticalAuthoringOrigin,
} from './types';
import type { CreateContext } from '../authoring/authoring-documents';
import type { Queryable } from '../authoring/authoring-evidence';
import { calculateContentHash } from './workflow-integrator';

export class StatisticalDocumentSaveError extends Error {
  constructor(readonly status: 400 | 409, readonly code: string, message: string) {
    super(message); this.name = 'StatisticalDocumentSaveError';
  }
}

function rejectStatisticalBasis(): never {
  throw new StatisticalDocumentSaveError(400, 'STATISTICAL_BASIS_REQUIRED', 'Name the worked example or the loaded study design before saving.');
}

function requestedExampleBasis(value: Record<string, unknown>): StatisticalDocumentBasis {
  if (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 200 || /[\r\n]/.test(value.label) ||
      value.studyId != null || value.sizingRunId != null) return rejectStatisticalBasis();
  return { kind: 'worked_example', label: value.label.trim() };
}

function requestedStudyBasis(value: Record<string, unknown>): StatisticalDocumentBasis {
  if (typeof value.studyId !== 'string' || !value.studyId.trim() || value.studyId.length > 200 ||
      typeof value.designInputsSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.designInputsSha256) ||
      (value.sizingRunId != null && (!Number.isSafeInteger(value.sizingRunId) || Number(value.sizingRunId) <= 0))) return rejectStatisticalBasis();
  return { kind: 'study_design', studyId: value.studyId, designInputsSha256: value.designInputsSha256,
    ...(value.sizingRunId != null ? { sizingRunId: Number(value.sizingRunId) } : {}) };
}

function requestedBasis(raw: unknown): StatisticalDocumentBasis {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (value.kind === 'worked_example') return requestedExampleBasis(value);
  if (value.kind === 'study_design') return requestedStudyBasis(value);
  return rejectStatisticalBasis();
}

type StatisticalSaveSource = { programId: string; basis: StatisticalDocumentBasis; document: GovernedStatisticalDocument; content: string };
type StudyDocumentBasis = Extract<StatisticalDocumentBasis, { kind: 'study_design' }>;

async function computedStatisticalOrigin(q: Queryable, ctx: CreateContext, source: StatisticalSaveSource): Promise<StatisticalAuthoringOrigin> {
  const { programId, basis, document, content } = source;
  const [{ authorizeAuthoringProgram }, { hashInputs }, { anaBiostatsOrchestrator }, { documentGenerator }] = await Promise.all([
    import('../authoring/authoring-program-access'), import('../stats/computation-provenance'),
    import('./orchestrator'), import('./document-generator')]);
  const admitted = await authorizeAuthoringProgram(q, { tenantId: ctx.tenantId, actor: ctx.actor, programId });
  const recalculated = anaBiostatsOrchestrator.quickCompute(document.provenance.computationInputs);
  if (!recalculated.validation.valid || !recalculated.computation || !recalculated.judgment || !recalculated.domain) {
    throw new StatisticalDocumentSaveError(409, 'STATISTICAL_COMPUTATION_UNVERIFIED', 'The statistical calculation could not be reproduced for this save.');
  }
  const verified = documentGenerator.generate(document.type, recalculated.validation.normalizedInput, recalculated.computation,
    recalculated.judgment, recalculated.domain, recalculated.regulatory, { organizationId: ctx.tenantId, projectId: admitted.projectId, userId: Number(ctx.actor.id) });
  if (verified.content !== document.content || hashInputs(verified.provenance.computationResults) !== hashInputs(document.provenance.computationResults)) {
    throw new StatisticalDocumentSaveError(409, 'STATISTICAL_COMPUTATION_UNVERIFIED', 'The displayed statistical calculation differs from the server computation. Refresh it before saving.');
  }
  const computation = JSON.parse(JSON.stringify(verified.provenance)) as GovernedStatisticalDocument['provenance'];
  return {
    version: 1, organizationId: ctx.tenantId, programId, projectId: admitted.projectId, documentType: document.type, basis,
    computation: { ...computation, execution: 'server_recomputed', method: 'ana-biostats:quickCompute',
      inputsSha256: hashInputs(computation.computationInputs), outputsSha256: hashInputs(computation.computationResults) },
    contentSha256: calculateContentHash(content), design: null, sizingRun: { state: 'not_applicable' },
  };
}

async function verifiedStudyDesign(q: Queryable, scope: { tenantId: number; programId: string }, basis: StudyDocumentBasis,
  computationInputsSha256: string): Promise<NonNullable<StatisticalAuthoringOrigin['design']>> {
  const [{ hashInputs }, { rowsToStudyDesign }, { studyDesignToStatisticalInput }, { inputNormalizer }] = await Promise.all([
    import('../stats/computation-provenance'), import('../study-design/study-design-repository'),
    import('../biostatistics-bridge/design-adapter'), import('./input-normalizer')]);
  const rows = await q.query(`SELECT id, study_id, program_id, metadata, updated_at FROM cdisc_prm_studies
    WHERE tenant_id=$1 AND program_id=$2 AND study_id=$3 FOR SHARE`, [scope.tenantId, scope.programId, basis.studyId]);
  const row = rows.rows.length === 1 ? rows.rows[0] : null;
  const design = rowsToStudyDesign(row);
  if (!row || !design || (design.id && design.id !== basis.studyId) || (design.programId && design.programId !== scope.programId)) {
    throw new StatisticalDocumentSaveError(409, 'STATISTICAL_STUDY_UNVERIFIED', 'The named study cannot be verified in this project. Reload its design before saving.');
  }
  const adapted = studyDesignToStatisticalInput(design).input;
  if (!adapted || hashInputs(adapted) !== basis.designInputsSha256) {
    throw new StatisticalDocumentSaveError(409, 'STATISTICAL_DESIGN_CHANGED', 'The saved study’s statistical inputs changed. Reload it before saving this statistical document.');
  }
  const normalized = inputNormalizer.normalize(adapted);
  const normalizedHash = normalized.valid ? hashInputs(JSON.parse(JSON.stringify(normalized.normalizedInput))) : null;
  return { studyId: basis.studyId, studyRef: Number(row.id), updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    snapshot: globalThis.structuredClone(design), snapshotSha256: hashInputs(design), adaptedInputs: adapted,
    adaptedInputsSha256: basis.designInputsSha256, storedAdaptedInputsSha256: hashInputs(JSON.parse(JSON.stringify(adapted))),
    calculationInputs: normalizedHash === computationInputsSha256 ? 'matches_design' : 'modified' };
}

async function verifiedSizingRun(q: Queryable, scope: { tenantId: number; programId: string; studyRef: number }, basis: StudyDocumentBasis,
  computation: StatisticalAuthoringOrigin['computation']): Promise<StatisticalAuthoringOrigin['sizingRun']> {
  const [{ hashInputs, STATS_ENGINE_VERSION }, { SAMPLE_SIZE_METHOD }] = await Promise.all([
    import('../stats/computation-provenance'), import('../stats/computation-runs')]);
  const runs = await q.query(`SELECT id, created_at, method, engine, engine_version, purpose, inputs, inputs_sha256, outputs, outputs_sha256
    FROM stats_computation_runs WHERE organization_id=$1 AND program_id=$2 AND study_ref=$3
      AND purpose='study-design:planned-sample-size' AND ($4::bigint IS NULL OR id=$4::bigint)
    ORDER BY created_at DESC, id DESC LIMIT 1 FOR SHARE`,
  [scope.tenantId, scope.programId, scope.studyRef, basis.sizingRunId ?? null]);
  const run = runs.rows[0];
  if (!run) {
    if (basis.sizingRunId) throw new StatisticalDocumentSaveError(409, 'STATISTICAL_RUN_UNVERIFIED', 'The named sizing run cannot be verified for this study. Reload the study before saving.');
    return { state: 'none' };
  }
  if (run.method !== SAMPLE_SIZE_METHOD || hashInputs(run.inputs) !== run.inputs_sha256 || hashInputs(run.outputs) !== run.outputs_sha256) {
    throw new StatisticalDocumentSaveError(409, 'STATISTICAL_RUN_UNVERIFIED', 'The saved sizing run failed its input/output integrity check. No document was created.');
  }
  return { state: 'recorded', runId: Number(run.id), recordedAt: new Date(run.created_at).toISOString(),
    purpose: run.purpose, method: run.method, engine: run.engine, engineVersion: run.engine_version,
    inputs: run.inputs, inputsSha256: run.inputs_sha256, outputs: run.outputs, outputsSha256: run.outputs_sha256,
    inputsMatchCalculation: run.inputs_sha256 === computation.inputsSha256,
    outputsMatchCalculation: run.outputs_sha256 === computation.outputsSha256,
    engineVersionMatches: run.engine_version === STATS_ENGINE_VERSION };
}

async function statisticalSource(q: Queryable, ctx: CreateContext, source: StatisticalSaveSource): Promise<StatisticalAuthoringOrigin> {
  const origin = await computedStatisticalOrigin(q, ctx, source);
  if (source.basis.kind === 'worked_example') return origin;
  const scope = { tenantId: ctx.tenantId, programId: source.programId };
  origin.design = await verifiedStudyDesign(q, scope, source.basis, origin.computation.inputsSha256);
  origin.sizingRun = await verifiedSizingRun(q, { ...scope, studyRef: origin.design.studyRef }, source.basis, origin.computation);
  return origin;
}

/** The explicit workbench save reaches the existing atomic editor writer.
 * Public prose/results are never substituted for the server computation. */
export async function saveStatisticalDocumentToAuthoring(ctx: CreateContext, request: Record<string, unknown>,
  document: GovernedStatisticalDocument) {
  const basis = requestedBasis(request.basis);
  if (typeof request.expectedMarkdown !== 'string' || request.expectedMarkdown !== document.content) {
    throw new StatisticalDocumentSaveError(409, 'STATISTICAL_PREVIEW_CHANGED', 'The calculation no longer matches the displayed document. Refresh the preview before saving.');
  }
  const [{ createDocumentFromDraft, parseDraftInput }, { workflowCopySectionContent }, { plainTextToHtml }] = await Promise.all([
    import('../authoring/authoring-from-draft'), import('../authoring/workflow-copy-content'),
    import('../../../shared/authoring/plain-text-html')]);
  const notice = basis.kind === 'worked_example'
    ? `Worked example: ${basis.label}. These calculations are illustrative assumptions, not results from this project's study.`
    : 'Statistical planning draft. The saved provenance records the study design and distinguishes the current calculation from any stored sizing run. Review assumptions before use.';
  const content = plainTextToHtml(notice) + workflowCopySectionContent(document.content);
  const title = basis.kind === 'worked_example' ? `${document.title} — worked example: ${basis.label}` : document.title;
  const parsed = parseDraftInput({ programId: request.programId, title, module: request.module, documentType: document.type,
    sections: [{ code: document.type, title, content }],
    provenance: { source: 'import', note: 'Server-computed statistical planning draft; deterministic template. Independent scientific review is required.' } });
  if (!parsed.ok) throw new StatisticalDocumentSaveError(400, 'STATISTICAL_SAVE_INVALID', parsed.error);
  const captured = globalThis.structuredClone(document);
  return createDocumentFromDraft(ctx, parsed.value, { statisticalSource: {
    reserve: q => statisticalSource(q, ctx, { programId: parsed.value.programId, basis, document: captured, content }),
  } });
}
