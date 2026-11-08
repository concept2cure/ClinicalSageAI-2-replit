/**
 * AnA Biostats — Layer 7: Workflow + Project + Document Integration
 *
 * ENHANCED: Real DB persistence using existing Concept2Cure artifact system.
 * Wires biostatistics work into the full platform:
 * - Projects (concept2cure_artifacts)
 * - Artifact versioning (concept2cure_artifact_versions)
 * - Provenance events (concept2cure_provenance_events)
 * - Review threads (concept2cure_review_threads)
 * - Dossier/submission context (c2c_artifact_section_map)
 * - Review tasks (concept2cure_review_tasks)
 * - Document editing/drafting (editor handoff)
 */

import crypto from 'crypto';

import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('workflow-integrator');

// DB and schema imports — lazy loaded to avoid circular dependencies
// and allow the module to work in test environments without DB
let _db: any = null;
let _schema: any = null;

async function getDb() {
  if (!_db) {
    try {
      const dbModule = await import('../../db');
      _db = dbModule.db;
    } catch {
      _db = null;
    }
  }
  return _db;
}

async function getSchema() {
  if (!_schema) {
    try {
      _schema = await import('../../../shared/schema');
    } catch {
      try {
        _schema = await import('@shared/schema');
      } catch {
        _schema = null;
      }
    }
  }
  return _schema;
}

import type {
  GovernedStatisticalDocument,
  JudgmentResult,
  WorkflowAction,
  WorkflowActionResult,
  StatisticalDocumentType,
  StatisticalDocumentBasis,
  StatisticalAuthoringOrigin,
} from './types';
import type { CreateContext } from '../authoring/authoring-documents';
import type { Queryable } from '../authoring/authoring-evidence';

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

const calculateContentHash = (content: string): string => crypto.createHash('sha256').update(content).digest('hex');

export class WorkflowIntegrator {

  /**
   * Execute a set of workflow actions based on the judgment and document.
   * Returns results for each action attempted.
   */
  async executeWorkflowActions(
    document: GovernedStatisticalDocument,
    judgment: JudgmentResult,
    options: {
      autoAttachToDossier?: boolean;
      reviewRequired?: boolean;
      dossierSectionId?: number;
      submissionPackageId?: number;
    }
  ): Promise<WorkflowActionResult[]> {
    const results: WorkflowActionResult[] = [];

    // 1. Always create artifact
    const artifactResult = await this.createArtifact(document);
    results.push(artifactResult);

    // 2. Create review thread if needed
    if (options.reviewRequired || judgment.actionRecommendation === 'escalate' || judgment.actionRecommendation === 'revise') {
      const reviewResult = await this.createReviewThread(document, judgment, artifactResult.artifactId);
      results.push(reviewResult);
    }

    // 3. Attach to dossier if requested
    if (options.autoAttachToDossier && options.dossierSectionId && artifactResult.artifactId) {
      const dossierResult = await this.attachToDossier(
        artifactResult.artifactId,
        options.dossierSectionId,
        document.organizationId,
        document.createdBy
      );
      results.push(dossierResult);
    }

    // 4. Open in editor
    const editorResult = this.prepareEditorHandoff(document, artifactResult.artifactId);
    results.push(editorResult);

    // 5. Escalation task if needed
    if (judgment.actionRecommendation === 'escalate' && artifactResult.artifactId) {
      const escalationResult = await this.createEscalationTask(document, judgment, artifactResult.artifactId);
      results.push(escalationResult);
    }

    return results;
  }

  /**
   * Create a project-bound artifact using the real Concept2Cure artifact system.
   * Persists to concept2cure_artifacts, concept2cure_artifact_versions, and concept2cure_provenance_events.
   */
  private async createArtifact(document: GovernedStatisticalDocument): Promise<WorkflowActionResult> {
    try {
      const artifactId = `artifact_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const contentHash = calculateContentHash(document.content);
      const provenanceEventId = `prov_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      const db = await getDb();
      const schema = await getSchema();
      if (!db || !schema) {
        // Nothing was stored, so this is not a success, and there is no id to
        // hand out: it used to report success with Date.now() as the artifact
        // id, which every caller then presented as a stored document.
        return {
          action: 'create_artifact',
          success: false,
          message: `Not stored: no database is available to this process (${document.title}).`,
        };
      }

      // Insert into concept2cure_artifacts
      const [newArtifact] = await db
        .insert(schema.concept2cureArtifacts)
        .values({
          organizationId: document.organizationId,
          projectId: document.projectId,
          artifactId,
          type: 'statistical_summary',
          category: 'document',
          title: document.title,
          content: document.content,
          contentHash,
          version: document.version,
          status: document.status,
          createdById: document.createdBy,
          metadata: {
            statisticalDocumentType: document.type,
            clientTrack: document.metadata.clientTrack,
            regulatoryBody: document.metadata.regulatoryBody,
            studyType: document.metadata.studyType,
            indication: document.metadata.indication,
            phase: document.metadata.phase,
            provenanceEngineVersion: document.provenance.engineVersion,
            generatedAt: document.provenance.generatedAt,
            tags: document.metadata.tags,
          },
        } as any)
        .returning();

      if (!newArtifact) {
        return {
          action: 'create_artifact',
          success: false,
          message: 'Failed to insert artifact into database',
        };
      }

      // Insert version record (immutable)
      await db.insert(schema.concept2cureArtifactVersions).values({
        organizationId: document.organizationId,
        artifactId: newArtifact.id,
        version: 1,
        content: document.content,
        contentHash,
        changeDescription: `Initial creation: ${document.type}`,
        createdById: document.createdBy,
      } as any);

      // Log provenance event
      await db.insert(schema.concept2cureProvenanceEvents).values({
        eventId: provenanceEventId,
        artifactId: newArtifact.id,
        organizationId: document.organizationId,
        eventType: 'generation',
        eventAction: 'ai_generate',
        actorId: document.createdBy,
        actorName: 'AnA Biostats Engine',
        details: {
          documentType: document.type,
          title: document.title,
          contentLength: document.content.length,
          contentHash,
          engineVersion: document.provenance.engineVersion,
          computationMethod: document.provenance.computationResults?.method,
          judgmentVerdict: document.provenance.judgmentResults?.overallVerdict,
          confidenceLevel: document.provenance.judgmentResults?.confidence?.level,
          domainTrack: document.provenance.domainAdaptation?.track,
          regulatoryBody: document.provenance.regulatoryCustomization?.body,
        },
        sourceDescription: `Generated by AnA Biostats v${document.provenance.engineVersion}: ${document.type}`,
        backendRoute: 'POST /api/ana-biostats/workflow',
        backendService: 'ana-biostats',
      } as any);

      return {
        action: 'create_artifact',
        success: true,
        artifactId: newArtifact.id,
        message: `Statistical document persisted: ${document.title} (ID: ${newArtifact.id})`,
      };
    } catch (error: any) {
      logger.error('Artifact creation failed', { err: error instanceof Error ? error.message : String(error) });
      return {
        action: 'create_artifact',
        success: false,
        message: `Artifact creation failed: ${error.message}`,
      };
    }
  }

  /**
   * Create a review thread linked to the artifact.
   */
  private async createReviewThread(
    document: GovernedStatisticalDocument,
    judgment: JudgmentResult,
    artifactDbId?: number
  ): Promise<WorkflowActionResult> {
    try {
      if (!artifactDbId) {
        return {
          action: 'create_review_thread',
          success: false,
          message: 'Cannot create review thread without artifact ID',
        };
      }

      const urgency = judgment.overallRisk === 'critical' ? 'urgent'
        : judgment.overallRisk === 'high' ? 'high'
        : 'normal';

      const reason = judgment.actionRecommendation === 'escalate'
        ? `Escalation: ${judgment.escalationReasons.join('; ')}`
        : `Statistical review needed: ${judgment.overallVerdict} verdict`;

      const flaggedDimensions = judgment.dimensions
        .filter(d => d.verdict !== 'adequate')
        .map(d => `${d.name}: ${d.verdict} — ${d.flags.join('; ')}`);

      const db = await getDb();
      const schema = await getSchema();
      if (!db || !schema) {
        return {
          action: 'create_review_thread',
          success: true,
          reviewThreadId: Date.now(),
          message: `Review thread prepared (no DB): ${reason}`,
        };
      }

      const [thread] = await db
        .insert(schema.concept2cureReviewThreads)
        .values({
          organizationId: document.organizationId,
          artifactId: artifactDbId,
          title: `Statistical Review: ${document.title}`,
          status: 'open',
          priority: urgency,
          anchorType: 'general',
          metadata: {
            reviewType: 'biostatistics',
            judgmentVerdict: judgment.overallVerdict,
            riskLevel: judgment.overallRisk,
            reason,
            flaggedDimensions,
            confidenceLevel: judgment.confidence.level,
            confidenceScore: judgment.confidence.score,
          },
          createdById: document.createdBy,
        } as any)
        .returning();

      return {
        action: 'create_review_thread',
        success: !!thread,
        reviewThreadId: thread?.id,
        message: `Review thread created with ${urgency} priority: ${reason}`,
      };
    } catch (error: any) {
      logger.error('Review thread creation failed', { err: error instanceof Error ? error.message : String(error) });
      return {
        action: 'create_review_thread',
        success: false,
        message: `Review thread creation failed: ${error.message}`,
      };
    }
  }

  /**
   * Attach an artifact to a dossier section.
   *
   * Goes through the canonical governed mapping operation
   * (services/ectd/package-content-change#mapArtifactToSection), which is what
   * the HTTP mapping route uses. This method used to insert the
   * c2c_artifact_section_map row itself: no audit row for a regulated mapping,
   * no tenant check on the section, no content-revision bump and no
   * stale-bundle clear, so a package could ship a zip that predated the very
   * document the platform had attached to it.
   */
  private async attachToDossier(
    artifactDbId: number,
    dossierSectionId: number,
    organizationId: number,
    userId: number
  ): Promise<WorkflowActionResult> {
    try {
      // Imported lazily, like getDb/getSchema above: the canonical module pulls
      // the pool and the governed-action ledger, and this file is built to load
      // in environments that have neither.
      const { mapArtifactToSection } = await import('../ectd/package-content-change');
      const outcome = await mapArtifactToSection({
        orgId: organizationId,
        artifactDbId,
        sectionDbId: dossierSectionId,
        actorUserId: userId,
        reason: `Statistical summary attached to dossier section ${dossierSectionId} by the biostatistics workflow`,
        documentFamily: 'statistical_summary',
        ownerUserId: userId,
        ownerFunction: 'biostatistics',
        ownershipType: 'sponsor',
        surface: 'ana-biostats-workflow',
      });

      if (!outcome.ok) {
        return {
          action: 'attach_to_dossier',
          success: false,
          dossierSectionId,
          message: `Dossier attachment refused: ${outcome.message}`,
        };
      }

      // A bundle assembled before this attachment no longer reflects the
      // package; the operator is told rather than left to find out at transmit.
      const notes = [
        outcome.duplicate ? 'already attached' : null,
        outcome.staleBundleCleared ? 'a previously assembled bundle was cleared and must be assembled again' : null,
        outcome.ledgerWriteFailed ? 'its governed-action ledger entry could not be written' : null,
      ].filter(Boolean);

      return {
        action: 'attach_to_dossier',
        success: true,
        dossierSectionId,
        message:
          `Artifact attached to dossier section ${dossierSectionId}` +
          (notes.length > 0 ? ` (${notes.join('; ')})` : ''),
      };
    } catch (error: any) {
      logger.error('Dossier attachment failed', { err: error instanceof Error ? error.message : String(error) });
      return {
        action: 'attach_to_dossier',
        success: false,
        dossierSectionId,
        message: `Dossier attachment failed: ${error.message}`,
      };
    }
  }

  /**
   * Prepare the document for handoff to the UnifiedDocumentEditor.
   */
  private prepareEditorHandoff(
    document: GovernedStatisticalDocument,
    artifactId?: number
  ): WorkflowActionResult {
    return {
      action: 'open_in_editor',
      success: true,
      artifactId,
      editorUrl: `/concept2cure/editor?artifactId=${artifactId ?? 'new'}&type=${document.type}`,
      message: `Document ready for editing: ${document.title}`,
    };
  }

  /**
   * Create an escalation task when statistical review identifies critical issues.
   */
  private async createEscalationTask(
    document: GovernedStatisticalDocument,
    judgment: JudgmentResult,
    artifactDbId: number
  ): Promise<WorkflowActionResult> {
    try {
      const db = await getDb();
      const schema = await getSchema();
      if (!db || !schema) {
        return {
          action: 'create_follow_up_task',
          success: true,
          message: `Escalation task prepared (no DB): ${document.title}`,
        };
      }

      const [task] = await db
        .insert(schema.concept2cureReviewTasks)
        .values({
          organizationId: document.organizationId,
          artifactId: artifactDbId,
          title: `Statistical Escalation: ${document.title}`,
          description: `Statistical analysis identified ${judgment.overallRisk} risk. Escalation reasons: ${judgment.escalationReasons.join('; ')}`,
          taskType: 'review_task',
          status: 'open',
          priority: judgment.overallRisk === 'critical' ? 'critical' : 'high',
          metadata: {
            escalationType: 'biostatistics',
            riskLevel: judgment.overallRisk,
            escalationReasons: judgment.escalationReasons,
            verdict: judgment.overallVerdict,
            assignTo: 'biostatistics_lead',
          },
          createdById: document.createdBy,
        } as any)
        .returning();

      return {
        action: 'create_follow_up_task',
        success: !!task,
        message: `Escalation task created: Statistical Escalation — ${document.title} (ID: ${task?.id})`,
      };
    } catch (error: any) {
      logger.error('Escalation task creation failed', { err: error instanceof Error ? error.message : String(error) });
      return {
        action: 'create_follow_up_task',
        success: false,
        message: `Escalation task creation failed: ${error.message}`,
      };
    }
  }

  /**
   * Determine which workflow actions are appropriate for a given judgment result.
   */
  suggestWorkflowActions(
    judgment: JudgmentResult,
    documentType: StatisticalDocumentType
  ): WorkflowAction[] {
    const actions: WorkflowAction[] = ['create_artifact', 'open_in_editor'];

    if (judgment.actionRecommendation === 'escalate') {
      actions.push('create_review_thread', 'create_follow_up_task');
    } else if (judgment.actionRecommendation === 'revise') {
      actions.push('create_review_thread');
    }

    // Submission-related documents should offer dossier attachment
    if (['sap_section_draft', 'protocol_statistical_section', 'submission_statistical_note'].includes(documentType)) {
      actions.push('attach_to_dossier');
    }

    return actions;
  }
}

export const workflowIntegrator = new WorkflowIntegrator();
