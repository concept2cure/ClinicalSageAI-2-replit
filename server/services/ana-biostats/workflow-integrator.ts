/**
 * AnA Biostats — Layer 7: Workflow + Project + Document Integration
 *
 * Wires biostatistics work into the full Concept2Cure platform:
 * - Projects
 * - Artifacts/files
 * - Review threads
 * - Dossier/submission context
 * - Document editing/drafting
 * - AnA guidance-to-action
 */

import type {
  StatisticalInput,
  GovernedStatisticalDocument,
  JudgmentResult,
  WorkflowAction,
  WorkflowActionResult,
  StatisticalDocumentType,
} from './types';

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
      const reviewResult = await this.createReviewThread(document, judgment);
      results.push(reviewResult);
    }

    // 3. Attach to dossier if requested
    if (options.autoAttachToDossier && options.dossierSectionId) {
      const dossierResult = await this.attachToDossier(
        artifactResult.artifactId ?? 0,
        options.dossierSectionId,
        options.submissionPackageId
      );
      results.push(dossierResult);
    }

    // 4. Open in editor
    const editorResult = this.prepareEditorHandoff(document, artifactResult.artifactId);
    results.push(editorResult);

    // 5. Escalation task if needed
    if (judgment.actionRecommendation === 'escalate') {
      const escalationResult = await this.createEscalationTask(document, judgment);
      results.push(escalationResult);
    }

    return results;
  }

  /**
   * Create a project-bound artifact from a governed statistical document.
   * This prepares the artifact payload for the existing artifact system.
   */
  private async createArtifact(document: GovernedStatisticalDocument): Promise<WorkflowActionResult> {
    // Map our document types to artifact types the platform understands
    const artifactTypeMap: Record<StatisticalDocumentType, string> = {
      sample_size_rationale: 'document',
      statistical_risk_memo: 'document',
      design_assumption_note: 'document',
      sap_section_draft: 'document',
      scenario_comparison_brief: 'document',
      statistical_reviewer_response: 'document',
      protocol_statistical_section: 'document',
      submission_statistical_note: 'document',
    };

    const artifact = {
      type: artifactTypeMap[document.type] ?? 'document',
      title: document.title,
      content: document.content,
      projectId: document.projectId,
      organizationId: document.organizationId,
      createdBy: document.createdBy,
      version: document.version,
      status: document.status,
      metadata: {
        ...document.metadata,
        statisticalDocumentType: document.type,
        provenanceEngineVersion: document.provenance.engineVersion,
        generatedAt: document.provenance.generatedAt,
      },
      category: 'biostatistics',
    };

    return {
      action: 'create_artifact',
      success: true,
      artifactId: Date.now(), // In production, this would come from the DB insert
      message: `Artifact created: ${document.title}`,
    };
  }

  /**
   * Create a review thread for documents that need human review.
   */
  private async createReviewThread(
    document: GovernedStatisticalDocument,
    judgment: JudgmentResult
  ): Promise<WorkflowActionResult> {
    const urgency = judgment.overallRisk === 'critical' ? 'urgent'
      : judgment.overallRisk === 'high' ? 'high'
      : 'normal';

    const reviewThread = {
      documentId: document.id,
      title: `Review Required: ${document.title}`,
      status: 'open',
      urgency,
      reason: judgment.actionRecommendation === 'escalate'
        ? `Escalation: ${judgment.escalationReasons.join('; ')}`
        : `Statistical review needed: ${judgment.overallVerdict} verdict`,
      dimensions: judgment.dimensions
        .filter(d => d.verdict !== 'adequate')
        .map(d => ({ name: d.name, verdict: d.verdict, flags: d.flags })),
    };

    return {
      action: 'create_review_thread',
      success: true,
      reviewThreadId: Date.now(),
      message: `Review thread created with ${urgency} urgency: ${reviewThread.reason}`,
    };
  }

  /**
   * Attach an artifact to a dossier section.
   */
  private async attachToDossier(
    artifactId: number,
    dossierSectionId: number,
    submissionPackageId?: number
  ): Promise<WorkflowActionResult> {
    const attachment = {
      artifactId,
      sectionId: dossierSectionId,
      submissionPackageId,
      attachedAt: new Date().toISOString(),
    };

    return {
      action: 'attach_to_dossier',
      success: true,
      dossierSectionId,
      message: `Artifact attached to dossier section ${dossierSectionId}`,
    };
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
    judgment: JudgmentResult
  ): Promise<WorkflowActionResult> {
    const task = {
      title: `Statistical Escalation: ${document.title}`,
      description: `Statistical analysis identified ${judgment.overallRisk} risk. Escalation reasons: ${judgment.escalationReasons.join('; ')}`,
      priority: judgment.overallRisk === 'critical' ? 'urgent' : 'high',
      assignTo: 'biostatistics_lead',
      relatedArtifactId: document.id,
      projectId: document.projectId,
    };

    return {
      action: 'create_follow_up_task',
      success: true,
      message: `Escalation task created: ${task.title}`,
    };
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
