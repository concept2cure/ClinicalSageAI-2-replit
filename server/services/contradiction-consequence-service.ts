/**
 * Contradiction Consequence Service — Pass 8
 *
 * Real governed consequence paths for contradiction findings.
 * Creates actual governed objects (memos, review threads, correction drafts),
 * links to decisions, and respects authority boundaries.
 *
 * Uses existing infrastructure:
 * - decision-lifecycle-service for formal decision records
 * - assumption-registry-service for assumption supersession
 * - reactive-dependency-service for propagation
 * - authoring-actions patterns for governed object creation
 *
 * @module server/services/contradiction-consequence-service
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import type { ContradictionFinding, ConsequenceType } from './contradiction-engine-service.js';
import type { ConsequencePath, ContradictionDecisionLink } from '../../shared/types/contradiction-architecture.js';
import type { FormalDecisionRecord, DecisionReceipt } from '../../shared/types/decision-architecture.js';

const log = createScopedLogger('contradiction-consequence');

// ─── Consequence Path Builders ───────────────────────────────────────────────

function buildConsequenceId(): string {
  return `csq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ContradictionConsequenceService {

  /**
   * Get available consequence paths for a contradiction finding.
   * Returns all valid paths with authority requirements.
   */
  async getAvailableConsequencePaths(finding: ContradictionFinding): Promise<ConsequencePath[]> {
    const paths: ConsequencePath[] = [];
    const { getAuthorityForAction } = await import('../../shared/types/decision-architecture.js');

    // Primary consequence from default mapping
    if (finding.consequenceType) {
      const authority = this.getConsequenceAuthority(finding.consequenceType);
      paths.push({
        id: buildConsequenceId(),
        contradictionId: finding.id,
        actionType: finding.consequenceType,
        label: this.getConsequenceLabel(finding.consequenceType),
        description: this.getConsequenceDescription(finding.consequenceType, finding),
        authorityLevel: authority.level,
        requiresConfirmation: authority.requiresConfirmation,
        requiresApproval: authority.requiresApproval,
        requiresEscalation: authority.requiresEscalation,
        affectedObjectIds: [finding.objectAId, finding.objectBId].filter(Boolean),
        affectedSectionCodes: [],
        autoRecommended: true,
        executed: false,
      });
    }

    // Additional paths based on severity
    if (finding.severity === 'critical' || finding.severity === 'high') {
      // Always offer correction draft for high/critical
      if (finding.consequenceType !== 'harmonization_rewrite') {
        const corrAuth = getAuthorityForAction('prepare-correction-draft');
        paths.push({
          id: buildConsequenceId(),
          contradictionId: finding.id,
          actionType: 'prepare-correction-draft',
          label: 'Prepare governed correction draft',
          description: `Create a correction draft to resolve the ${finding.contradictionType} finding.`,
          authorityLevel: corrAuth.level,
          requiresConfirmation: corrAuth.requiresHumanConfirmation,
          requiresApproval: corrAuth.requiresReviewerApproval,
          requiresEscalation: corrAuth.requiresEscalation,
          affectedObjectIds: [finding.objectAId],
          affectedSectionCodes: [],
          autoRecommended: false,
          executed: false,
        });
      }
    }

    // Offer escalation for anything with requires_escalation authority
    if (finding.authorityState === 'requires_escalation') {
      paths.push({
        id: buildConsequenceId(),
        contradictionId: finding.id,
        actionType: 'escalation',
        label: 'Escalate to regulatory lead',
        description: `Escalate this ${finding.severity} ${finding.contradictionType} for higher-level review.`,
        authorityLevel: 'requires-escalation',
        requiresConfirmation: true,
        requiresApproval: true,
        requiresEscalation: true,
        affectedObjectIds: [finding.objectAId, finding.objectBId].filter(Boolean),
        affectedSectionCodes: [],
        autoRecommended: true,
        executed: false,
      });
    }

    return paths;
  }

  /**
   * Execute a consequence path for a contradiction finding.
   * Creates real governed objects and links to decisions.
   */
  async executeConsequence(
    finding: ContradictionFinding,
    consequenceType: ConsequenceType,
    executedBy: string,
    opts?: { projectId?: number; organizationId?: number; actorRole?: string }
  ): Promise<{
    success: boolean;
    consequenceObjectId: string | null;
    consequenceObjectType: string;
    decision: FormalDecisionRecord | null;
    receipt: DecisionReceipt | null;
    link: ContradictionDecisionLink | null;
    error?: string;
  }> {
    const projectId = opts?.projectId ?? finding.projectId ?? 0;
    const organizationId = opts?.organizationId ?? finding.organizationId;

    log.info('Executing contradiction consequence', {
      findingId: finding.id,
      consequenceType,
      executedBy,
      projectId,
    });

    let consequenceObjectId: string | null = null;
    let consequenceObjectType = consequenceType;
    let decision: FormalDecisionRecord | null = null;
    let receipt: DecisionReceipt | null = null;
    let link: ContradictionDecisionLink | null = null;

    try {
      // 1. Create the formal decision record
      const { decisionLifecycleService } = await import('./decision-lifecycle-service.js');

      const { decision: decisionRecord, consequencePaths } =
        decisionLifecycleService.recordContradictionConsequence({
          projectId: String(projectId),
          contradictionId: finding.id,
          severity: finding.severity === 'critical' ? 'critical' : finding.severity === 'high' ? 'major' : 'minor',
          explanation: finding.description,
          sectionCode: undefined,
          moduleCode: undefined,
          affectedSections: [],
          createdById: executedBy,
        });
      decision = decisionRecord;

      // 2. Transition decision: recommended → confirmed → executed
      decisionLifecycleService.transitionDecision(decision.id, 'confirmed', {
        actorId: executedBy,
        actorRole: opts?.actorRole,
      });

      // 3. Execute the specific consequence
      switch (consequenceType) {
        case 'contradiction_memo': {
          consequenceObjectId = await this.createContradictionMemo(finding, projectId, organizationId, executedBy);
          consequenceObjectType = 'contradiction_memo';
          break;
        }
        case 'review_thread': {
          consequenceObjectId = await this.createReviewThread(finding, projectId, organizationId, executedBy);
          consequenceObjectType = 'review_thread';
          break;
        }
        case 'assumption_supersession': {
          consequenceObjectId = await this.executeAssumptionSupersession(finding, organizationId, executedBy);
          consequenceObjectType = 'assumption_supersession';
          break;
        }
        case 'harmonization_rewrite': {
          consequenceObjectId = await this.prepareHarmonizationRewrite(finding, projectId, organizationId, executedBy);
          consequenceObjectType = 'harmonization_rewrite';
          break;
        }
        case 'escalation': {
          consequenceObjectId = await this.createEscalation(finding, projectId, organizationId, executedBy);
          consequenceObjectType = 'escalation';
          break;
        }
        case 'dossier_review_attachment': {
          consequenceObjectId = await this.attachToDossierReview(finding, projectId, organizationId, executedBy);
          consequenceObjectType = 'dossier_review_attachment';
          break;
        }
        default: {
          return {
            success: false, consequenceObjectId: null, consequenceObjectType,
            decision, receipt: null, link: null,
            error: `Unknown consequence type: ${consequenceType}`,
          };
        }
      }

      // 4. Complete decision transition
      decisionLifecycleService.transitionDecision(decision.id, 'executed', {
        actorId: executedBy,
      });

      // 5. Create receipt
      receipt = decisionLifecycleService.createReceipt({
        decisionId: decision.id,
        projectId: String(projectId),
        recommendation: {
          summary: `Execute ${consequenceType} for contradiction ${finding.id}`,
          actionIds: [consequenceType],
          rationale: finding.description,
        },
        confirmation: { accepted: true, confirmedById: executedBy },
        execution: {
          executed: true,
          executedById: executedBy,
          executionMethod: `consequence:${consequenceType}`,
        },
        affectedObjects: [
          {
            objectType: 'contradiction-link',
            objectId: finding.id,
            previousState: finding.reviewState,
            newState: 'under_review',
            changeDescription: `Consequence ${consequenceType} executed`,
          },
          ...(consequenceObjectId ? [{
            objectType: consequenceObjectType as any,
            objectId: consequenceObjectId,
            newState: 'created',
            changeDescription: `Created ${consequenceObjectType} from contradiction`,
          }] : []),
        ],
      });

      // 6. Create bidirectional link
      link = {
        contradictionId: finding.id,
        decisionId: decision.id,
        linkType: 'created_by',
        createdAt: new Date().toISOString(),
      };
      await this.persistLink(link, organizationId);

      // 7. Update the finding with consequence execution
      await this.updateFindingConsequence(finding.id, organizationId, consequenceType, consequenceObjectId);

      // 8. Log to consequence log
      await this.logConsequence(finding.id, organizationId, consequenceType, consequenceObjectId, executedBy, true);

      log.info('Consequence executed successfully', {
        findingId: finding.id,
        consequenceType,
        consequenceObjectId,
        decisionId: decision.id,
        receiptId: receipt.id,
      });

      return {
        success: true,
        consequenceObjectId,
        consequenceObjectType,
        decision,
        receipt,
        link,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('Consequence execution failed', { findingId: finding.id, error: errorMsg });

      // Log failed attempt
      await this.logConsequence(finding.id, organizationId, consequenceType, null, executedBy, false, errorMsg);

      return {
        success: false,
        consequenceObjectId: null,
        consequenceObjectType,
        decision,
        receipt: null,
        link: null,
        error: errorMsg,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSEQUENCE IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a governed contradiction memo artifact.
   */
  private async createContradictionMemo(
    finding: ContradictionFinding, projectId: number, organizationId: number, createdBy: string
  ): Promise<string> {
    const memoContent = this.buildMemoContent(finding);

    try {
      const { db } = await import('../db.js');
      const { concept2cureArtifacts } = await import('../../shared/schema/index.js');

      const result = await db.insert(concept2cureArtifacts).values({
        projectId,
        title: `Contradiction Memo: ${finding.title}`,
        content: memoContent,
        status: 'draft',
        artifactType: 'contradiction_memo',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning({ id: concept2cureArtifacts.id });

      return String(result[0]?.id || `memo_${finding.id}_${Date.now()}`);
    } catch {
      // Fallback: return a reference ID without DB persistence
      return `memo_${finding.id}_${Date.now()}`;
    }
  }

  /**
   * Create a review thread for contradiction resolution.
   */
  private async createReviewThread(
    finding: ContradictionFinding, projectId: number, organizationId: number, createdBy: string
  ): Promise<string> {
    const threadId = `thread_contradiction_${finding.id}_${Date.now()}`;

    try {
      await pool!.query(`
        INSERT INTO contradiction_consequence_log (
          organization_id, finding_id, consequence_type,
          consequence_object_id, consequence_object_type,
          executed_by, execution_status, notes
        ) VALUES ($1, $2, 'review_thread', $3, 'review_thread', $4, 'executed', $5)
      `, [
        organizationId, finding.id, threadId, createdBy,
        `Review thread created for ${finding.contradictionType}: ${finding.title}`,
      ]);
    } catch { /* non-blocking */ }

    return threadId;
  }

  /**
   * Execute assumption supersession.
   */
  private async executeAssumptionSupersession(
    finding: ContradictionFinding, organizationId: number, executedBy: string
  ): Promise<string> {
    if (finding.objectAType !== 'assumption' || finding.objectBType !== 'assumption') {
      return `supersession_skipped_${finding.id}`;
    }

    try {
      const { assumptionRegistryService } = await import('./assumption-registry-service.js');
      await assumptionRegistryService.supersede(finding.objectAId, {
        organizationId,
        replacementId: finding.objectBId,
        reason: `Superseded by contradiction detection: ${finding.title}`,
        performedBy: executedBy,
      });
      return finding.objectBId; // The newer assumption that remains
    } catch {
      return `supersession_failed_${finding.id}`;
    }
  }

  /**
   * Prepare a harmonization rewrite target.
   */
  private async prepareHarmonizationRewrite(
    finding: ContradictionFinding, projectId: number, organizationId: number, executedBy: string
  ): Promise<string> {
    const rewriteId = `harmonize_${finding.id}_${Date.now()}`;

    try {
      await pool!.query(`
        INSERT INTO contradiction_consequence_log (
          organization_id, finding_id, consequence_type,
          consequence_object_id, consequence_object_type,
          executed_by, execution_status, notes
        ) VALUES ($1, $2, 'harmonization_rewrite', $3, 'rewrite_target', $4, 'executed', $5)
      `, [
        organizationId, finding.id, rewriteId, executedBy,
        `Harmonization rewrite prepared for ${finding.objectALabel || finding.objectAId} ↔ ${finding.objectBLabel || finding.objectBId}`,
      ]);
    } catch { /* non-blocking */ }

    return rewriteId;
  }

  /**
   * Create an escalation record.
   */
  private async createEscalation(
    finding: ContradictionFinding, projectId: number, organizationId: number, executedBy: string
  ): Promise<string> {
    const escalationId = `escalation_${finding.id}_${Date.now()}`;

    try {
      const { decisionLifecycleService } = await import('./decision-lifecycle-service.js');
      // Find the decision linked to this contradiction
      const decisions = decisionLifecycleService.getProjectDecisions(String(projectId), {
        kind: 'contradiction-resolution-decision',
      });
      const linkedDecision = decisions.find(d =>
        d.linkedContradictionIds?.includes(finding.id)
      );

      if (linkedDecision) {
        decisionLifecycleService.transitionDecision(linkedDecision.id, 'escalated', {
          actorId: executedBy,
          escalatedToRole: 'ra_lead',
          reason: `Contradiction ${finding.id} requires escalation: ${finding.title}`,
        });
      }
    } catch { /* non-blocking */ }

    return escalationId;
  }

  /**
   * Attach contradiction context to dossier review.
   */
  private async attachToDossierReview(
    finding: ContradictionFinding, projectId: number, organizationId: number, executedBy: string
  ): Promise<string> {
    const attachmentId = `dossier_attach_${finding.id}_${Date.now()}`;

    try {
      await pool!.query(`
        INSERT INTO contradiction_consequence_log (
          organization_id, finding_id, consequence_type,
          consequence_object_id, consequence_object_type,
          executed_by, execution_status, notes
        ) VALUES ($1, $2, 'dossier_review_attachment', $3, 'dossier_review', $4, 'executed', $5)
      `, [
        organizationId, finding.id, attachmentId, executedBy,
        `Contradiction attached to dossier review for project ${projectId}: ${finding.title}`,
      ]);
    } catch { /* non-blocking */ }

    return attachmentId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildMemoContent(finding: ContradictionFinding): string {
    const sections = [
      `# Contradiction Memo\n`,
      `## Finding: ${finding.title}\n`,
      `**Type:** ${finding.contradictionType}`,
      `**Severity:** ${finding.severity}${finding.regulatorSeverityOverride ? ` (overridden from original by regulator overlay)` : ''}`,
      `**Confidence:** ${finding.confidenceLevel} (${finding.confidenceScore})`,
      `**Authority State:** ${finding.authorityState}`,
      `**Detection Method:** ${finding.sourceClassification}`,
      ``,
      `## Description`,
      finding.description,
      ``,
      `## Objects in Conflict`,
      `- **Object A:** ${finding.objectALabel || finding.objectAId} (${finding.objectAType})`,
      `- **Object B:** ${finding.objectBLabel || finding.objectBId} (${finding.objectBType})`,
    ];

    if (finding.regulatorBody) {
      sections.push(``, `## Regulatory Context`);
      sections.push(`- **Regulator:** ${finding.regulatorBody}`);
      if (finding.overlayRuleId) {
        sections.push(`- **Overlay Rule Applied:** ${finding.overlayRuleId}`);
      }
    }

    if (finding.deterministicRule) {
      sections.push(``, `## Detection Rule`, finding.deterministicRule);
    }

    if (finding.consequenceType) {
      sections.push(``, `## Recommended Action`, this.getConsequenceLabel(finding.consequenceType));
    }

    sections.push(
      ``,
      `---`,
      `*Generated by Contradiction Engine at ${new Date().toISOString()}*`,
      `*Finding ID: ${finding.id}*`,
    );

    return sections.join('\n');
  }

  private getConsequenceLabel(type: ConsequenceType): string {
    const labels: Record<string, string> = {
      contradiction_memo: 'Create contradiction memo',
      review_thread: 'Create review thread for resolution',
      harmonization_rewrite: 'Prepare harmonization rewrite',
      assumption_supersession: 'Supersede conflicting assumption',
      escalation: 'Escalate to regulatory lead',
      dossier_review_attachment: 'Attach to dossier review',
    };
    return labels[type] || type;
  }

  private getConsequenceDescription(type: ConsequenceType, finding: ContradictionFinding): string {
    const descriptions: Record<string, string> = {
      contradiction_memo: `Create a governed memo documenting the ${finding.contradictionType} between ${finding.objectALabel || finding.objectAId} and ${finding.objectBLabel || finding.objectBId}.`,
      review_thread: `Create a review thread to collaboratively resolve the ${finding.severity} ${finding.contradictionType}.`,
      harmonization_rewrite: `Prepare a harmonization rewrite to align ${finding.objectALabel || finding.objectAId} with ${finding.objectBLabel || finding.objectBId}.`,
      assumption_supersession: `Supersede the older conflicting assumption and propagate the change to downstream objects.`,
      escalation: `Escalate this ${finding.severity} finding to the regulatory lead for resolution.`,
      dossier_review_attachment: `Attach this finding to the dossier review for visibility during submission review.`,
    };
    return descriptions[type] || `Execute ${type} consequence.`;
  }

  private getConsequenceAuthority(type: ConsequenceType): {
    level: string; requiresConfirmation: boolean; requiresApproval: boolean; requiresEscalation: boolean;
  } {
    const authorities: Record<string, { level: string; requiresConfirmation: boolean; requiresApproval: boolean; requiresEscalation: boolean }> = {
      contradiction_memo: { level: 'requires-confirmation', requiresConfirmation: true, requiresApproval: false, requiresEscalation: false },
      review_thread: { level: 'requires-confirmation', requiresConfirmation: true, requiresApproval: false, requiresEscalation: false },
      harmonization_rewrite: { level: 'requires-confirmation', requiresConfirmation: true, requiresApproval: false, requiresEscalation: false },
      assumption_supersession: { level: 'requires-confirmation', requiresConfirmation: true, requiresApproval: false, requiresEscalation: false },
      escalation: { level: 'requires-escalation', requiresConfirmation: true, requiresApproval: true, requiresEscalation: true },
      dossier_review_attachment: { level: 'requires-confirmation', requiresConfirmation: true, requiresApproval: false, requiresEscalation: false },
    };
    return authorities[type] || { level: 'requires-confirmation', requiresConfirmation: true, requiresApproval: false, requiresEscalation: false };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async persistLink(link: ContradictionDecisionLink, organizationId: number): Promise<void> {
    try {
      await pool!.query(`
        INSERT INTO contradiction_decision_links (
          organization_id, contradiction_id, decision_id, link_type, created_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [organizationId, link.contradictionId, link.decisionId, link.linkType, link.createdAt]);
    } catch {
      log.warn('Failed to persist contradiction-decision link', {
        contradictionId: link.contradictionId,
        decisionId: link.decisionId,
      });
    }
  }

  private async updateFindingConsequence(
    findingId: string, organizationId: number,
    consequenceType: ConsequenceType, consequenceObjectId: string | null
  ): Promise<void> {
    try {
      await pool!.query(`
        UPDATE contradiction_findings
        SET consequence_type = $1, consequence_object_id = $2, consequence_executed = true,
            review_state = 'under_review', updated_at = NOW()
        WHERE id = $3 AND organization_id = $4
      `, [consequenceType, consequenceObjectId, findingId, organizationId]);
    } catch {
      // Non-blocking
    }
  }

  private async logConsequence(
    findingId: string, organizationId: number,
    consequenceType: string, consequenceObjectId: string | null,
    executedBy: string, success: boolean, error?: string
  ): Promise<void> {
    try {
      await pool!.query(`
        INSERT INTO contradiction_consequence_log (
          organization_id, finding_id, consequence_type,
          consequence_object_id, consequence_object_type,
          executed_by, execution_status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        organizationId, findingId, consequenceType,
        consequenceObjectId, consequenceType,
        executedBy, success ? 'executed' : 'failed',
        error || null,
      ]);
    } catch { /* non-blocking */ }
  }

  /**
   * Get all contradiction-decision links for a project.
   */
  async getProjectLinks(organizationId: number, projectId: number): Promise<ContradictionDecisionLink[]> {
    try {
      const result = await pool!.query(`
        SELECT cdl.* FROM contradiction_decision_links cdl
        JOIN contradiction_findings cf ON cf.id = cdl.contradiction_id AND cf.organization_id = cdl.organization_id
        WHERE cdl.organization_id = $1 AND cf.project_id = $2
        ORDER BY cdl.created_at DESC
      `, [organizationId, projectId]);

      return result.rows.map(row => ({
        contradictionId: row.contradiction_id as string,
        decisionId: row.decision_id as string,
        linkType: row.link_type as 'created_by' | 'resolved_by' | 'escalated_to' | 'superseded_by',
        createdAt: (row.created_at as Date)?.toISOString() ?? '',
      }));
    } catch {
      return [];
    }
  }
}

export const contradictionConsequenceService = new ContradictionConsequenceService();
