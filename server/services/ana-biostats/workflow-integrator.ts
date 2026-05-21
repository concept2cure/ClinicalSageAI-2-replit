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
        _schema = await import('../../shared/schema' as any);
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

function calculateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
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
        return {
          action: 'create_artifact',
          success: true,
          artifactId: Date.now(), // Fallback for environments without DB
          message: `Artifact prepared (no DB): ${document.title}`,
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
   * Attach an artifact to a dossier section via c2c_artifact_section_map.
   */
  private async attachToDossier(
    artifactDbId: number,
    dossierSectionId: number,
    organizationId: number,
    userId: number
  ): Promise<WorkflowActionResult> {
    try {
      const db = await getDb();
      const schema = await getSchema();
      if (!db || !schema) {
        return {
          action: 'attach_to_dossier',
          success: true,
          dossierSectionId,
          message: `Dossier attachment prepared (no DB) for section ${dossierSectionId}`,
        };
      }

      const [mapping] = await db
        .insert(schema.c2cArtifactSectionMap)
        .values({
          orgId: organizationId,
          artifactId: artifactDbId,
          sectionDbId: dossierSectionId,
          documentFamily: 'statistical_summary',
          ownerUserId: userId,
          ownerFunction: 'biostatistics',
          ownershipType: 'sponsor',
        } as any)
        .returning();

      return {
        action: 'attach_to_dossier',
        success: !!mapping,
        dossierSectionId,
        message: `Artifact attached to dossier section ${dossierSectionId}`,
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
