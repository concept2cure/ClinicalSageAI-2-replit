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
 * - Escalation tasks (unified_tasks, the one task board; see createEscalationTask)
 * - Document editing/drafting (editor handoff)
 */

import crypto from 'crypto';

import { createScopedLogger } from '../../utils/logger.js';
import type { UnifiedTaskInput } from '../unifiedTaskService';

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
} from './types';

/** The content hash the integrator and the statistical document save both record. */
export const calculateContentHash = (content: string): string => crypto.createHash('sha256').update(content).digest('hex');

/**
 * The escalation's row on the one task board: the bridge's `action:escalate` shape
 * (biostatistics-bridge/task-blueprint.ts), a Biostatistics review task keyed to its source.
 */
function escalationTaskInput(
  document: GovernedStatisticalDocument,
  judgment: JudgmentResult,
  task: {
    title: string;
    priority: 'critical' | 'high';
    source: { type: string; id: string };
    stored: boolean;
  },
): UnifiedTaskInput {
  const reasons = judgment.escalationReasons.join('; ') || judgment.roleExplanations?.regulatory || 'none recorded';
  return {
    moduleType: 'Biostatistics',
    title: task.title,
    description: `Statistical review found ${judgment.overallRisk} risk. Escalation reasons: ${reasons}`
      + (task.stored ? '' : ' The document itself was not stored; the finding stands without it.'),
    category: 'review',
    taskType: 'review',
    priority: task.priority,
    organizationId: document.organizationId,
    // A document on no project (the orchestrator passes 0) is filed on none.
    projectId: document.projectId > 0 ? document.projectId : undefined,
    sourceEntityType: task.source.type,
    sourceEntityId: task.source.id,
    tags: ['biostatistics', 'Action: escalate'],
    metadata: {
      blueprintKey: 'action:escalate',
      trigger: 'Action: escalate',
      riskLevel: judgment.overallRisk,
      verdict: judgment.overallVerdict,
      escalationReasons: judgment.escalationReasons,
      documentType: document.type,
      raisedBy: 'ana-biostats-workflow',
    },
    createdById: document.createdBy ?? undefined,
  };
}

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

    /* 5. Escalation task if needed. It is about the FINDING, so it does not wait on the document
       having been stored. Until 2026-11-12 it ran only when the artifact had an id: a critical
       finding whose document failed to save raised nothing and said nothing. */
    if (judgment.actionRecommendation === 'escalate') {
      results.push(await this.createEscalationTask(document, judgment, artifactResult.artifactId ?? null));
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
        /* The store's own message stays in the log. It was returned to the caller, and for a failed
           insert that is the whole statement with its parameters: the document's text among them. */
        message: `The document was not stored: the artifact store could not be written. "${document.title}" exists only in this answer.`,
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
        /* Nothing was stored, so this is not a success, and there is no id to
           hand out — the same repair the artifact branch above carries. It
           used to return `success: true` with `Date.now()` as the thread id,
           which every caller then presented as a stored review thread
           (CLAUDE.md: fail closed, never fabricate). */
        return {
          action: 'create_review_thread',
          success: false,
          message: `No review thread was created: this deployment has no database. ${reason}`,
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
        message: 'No review thread was opened: the review store could not be written.',
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
        message: `The document was not attached to dossier section ${dossierSectionId}: the mapping could not be written.`,
      };
    }
  }

  /**
   * Say where the stored document can be found.
   *
   * Until 2026-11-12 this answered "Document ready for editing" with
   * `/concept2cure/editor?artifactId=…`, always a success. No such route exists (the editor it
   * named was removed), nothing reads the URL, and it said so even when the document had not been
   * stored (`artifactId=new`). A stored statistical document is listed on the Biostatistics work
   * area, under the project's statistical documents; that is the address given. Writing it into
   * the one editor is the person's act there ("Save as a working document"), not this step's.
   */
  private prepareEditorHandoff(
    document: GovernedStatisticalDocument,
    artifactId?: number
  ): WorkflowActionResult {
    if (!artifactId) {
      return {
        action: 'open_in_editor',
        success: false,
        message: `"${document.title}" was not stored, so there is nothing to open.`,
      };
    }
    return {
      action: 'open_in_editor',
      success: true,
      artifactId,
      editorUrl: '/concept2cure/biostatistics',
      message: `"${document.title}" is stored and listed under the project's statistical documents in Biostatistics. Save it as a working document there to edit it.`,
    };
  }

  /**
   * Raise the escalation of a critical statistical finding on the one task board, with its
   * task.create row.
   *
   * Until 2026-11-12 this inserted into `concept2cure_review_tasks`, the review workflow's own
   * store, naming none of its four required columns (task_id, org_id, project_id,
   * created_by_name) and three it does not have (organizationId, priority, metadata). The insert
   * could not succeed: every escalation was answered "Escalation task creation failed" and reached
   * nobody. The same escalation already had a canonical shape — the bridge's `action:escalate`
   * task (biostatistics-bridge/task-blueprint.ts), a Biostatistics task on `unified_tasks` — so
   * this raises that, through the same creator and the same ledger call, on one transaction: the
   * task and its row, or neither. The review workflow's store is its own (server/routes/c2c/
   * reviews.ts) and is not written here.
   *
   * One escalation per document: a second run for the same artifact — or, when the document was
   * not stored, for the same text — answers with the task that is already on the board.
   */
  private async createEscalationTask(
    document: GovernedStatisticalDocument,
    judgment: JudgmentResult,
    artifactDbId: number | null
  ): Promise<WorkflowActionResult> {
    const notRaised = (why: string): WorkflowActionResult => ({
      action: 'create_follow_up_task',
      success: false,
      message: `No escalation task was raised: ${why} ${judgment.overallRisk} risk on "${document.title}" is unrecorded.`,
    });
    try {
      const db = await getDb();
      if (!db) {
        /* This escalation is raised when statistical review finds CRITICAL
           risk. Reporting it prepared when no row exists is how a critical
           finding gets recorded as handled and lives nowhere. */
        return {
          action: 'create_follow_up_task',
          success: false,
          message: `No escalation task was created: this deployment has no database. `
            + `${judgment.overallRisk} risk on "${document.title}" is unrecorded.`,
        };
      }
      const [{ default: unifiedTaskService }, { auditTaskActionInTx }, { unifiedTasks }, { and, eq, isNull }] = await Promise.all([
        import('../unifiedTaskService'),
        import('../tasking/task-audit'),
        import('../../../shared/schema'),
        import('drizzle-orm'),
      ]);

      const title = `Escalate "${document.title}" to the lead biostatistician`;
      /* Keyed to the stored document when there is one. When the document was not stored, to its
         content: the same finding on the same text is the same escalation, raised once. */
      const stored = typeof artifactDbId === 'number' && artifactDbId > 0;
      const source = stored
        ? { type: 'statistical_artifact', id: String(artifactDbId) }
        : { type: 'statistical_document', id: calculateContentHash(document.content) };
      const [existing] = await db
        .select({ taskId: unifiedTasks.taskId, title: unifiedTasks.title })
        .from(unifiedTasks)
        .where(and(
          eq(unifiedTasks.organizationId, document.organizationId),
          eq(unifiedTasks.sourceEntityType, source.type),
          eq(unifiedTasks.sourceEntityId, source.id),
          isNull(unifiedTasks.deletedAt),
        ))
        .limit(1);
      if (existing) {
        return {
          action: 'create_follow_up_task',
          success: true,
          message: `Escalation already on the task board: ${existing.title} (${existing.taskId})`,
        };
      }

      const priority = judgment.overallRisk === 'critical' ? 'critical' as const : 'high' as const;
      let taskId = '';
      await db.transaction(async (tx: any) => {
        const task = await unifiedTaskService.createUnifiedTask(
          escalationTaskInput(document, judgment, { title, priority, source, stored }), tx);
        await auditTaskActionInTx(tx, {
          orgId: document.organizationId,
          userId: document.createdBy ?? null,
          command: 'task.create',
          taskId: task.taskId,
          payload: {
            moduleType: 'Biostatistics',
            title,
            priority,
            status: 'pending',
            sourceEntityType: source.type,
            sourceEntityId: source.id,
            blueprintKey: 'action:escalate',
          },
          summary: `Raised by the statistical review of "${document.title}" (${judgment.overallRisk} risk)`,
        });
        taskId = task.taskId;
      });

      return {
        action: 'create_follow_up_task',
        success: true,
        message: `Escalation raised on the task board: ${title} (${taskId})`,
      };
    } catch (error: any) {
      // The store's own words stay in the log; the answer says what did not happen.
      logger.error('Escalation task creation failed', { err: error instanceof Error ? error.message : String(error) });
      return notRaised(error?.name === 'TaskAuditNotRecordedError'
        ? 'its record could not be written, so the task was not written either.'
        : 'the task board could not be written.');
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
