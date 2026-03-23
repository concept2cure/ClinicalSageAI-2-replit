/**
 * Biostats Signal Engine — Core Orchestrator
 *
 * Runs all deterministic evaluators, then wires results into:
 *   1. Contradiction Engine (ConflictDetectionService)
 *   2. Assumption Registry (ReadinessRules / ReadinessEvaluations)
 *   3. Resolution Orchestrator (workflow runs / resolution plans)
 *   4. Artifact Context (project-bound, CTD-aware)
 *
 * No LLM math. No separate dashboard. All outputs are project-bound,
 * artifact-aware, and audit-ready.
 *
 * @module server/services/biostats-signal-engine/engine
 */

import { v4 as uuidv4 } from 'uuid';
import type { Pool } from 'pg';
import type {
  BiostatSignal,
  BiostatEvaluationRequest,
  BiostatSignalResult,
  SignalProofReceipt,
  SignalSeverity,
  SignalAction,
} from './types';

import {
  evaluatePowerInadequacy,
  evaluateEndpointMisalignment,
  evaluateStatisticalUncertainty,
  evaluateSampleSizeDrift,
  evaluateMultiplicityGap,
  evaluateMissingDataRisk,
} from './evaluators';

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class BiostatSignalEngine {
  constructor(private pool: Pool) {}

  // ── Main Entry Point ─────────────────────────────────────────────────────

  /**
   * Evaluate a study/project for all biostatistics signals.
   * Returns signals, proof receipts, and a summary.
   * Automatically wires signals into contradiction engine, assumption registry,
   * and resolution orchestration.
   */
  async evaluate(request: BiostatEvaluationRequest): Promise<BiostatSignalResult> {
    const allSignals: BiostatSignal[] = [];
    const allReceipts: SignalProofReceipt[] = [];

    // Run all deterministic evaluators
    const evaluators = [
      evaluatePowerInadequacy,
      evaluateEndpointMisalignment,
      evaluateStatisticalUncertainty,
      evaluateSampleSizeDrift,
      evaluateMultiplicityGap,
      evaluateMissingDataRisk,
    ];

    for (const evaluator of evaluators) {
      const { signal, receipt } = evaluator(request);
      if (signal) {
        allSignals.push(signal);
      }
      if (receipt) {
        allReceipts.push(receipt);
      }
    }

    // Wire signals into downstream systems
    for (const signal of allSignals) {
      await this.wireSignalToContradictionEngine(signal);
      await this.wireSignalToAssumptionRegistry(signal, request);
      await this.wireSignalToResolutionOrchestrator(signal, request);
      await this.wireSignalToArtifactContext(signal, request);
    }

    // Persist signals and receipts
    await this.persistSignals(allSignals);
    await this.persistReceipts(allReceipts);

    // Build summary
    const summary = this.buildSummary(allSignals);

    return {
      signals: allSignals,
      proofReceipts: allReceipts,
      summary,
      evaluatedAt: new Date(),
    };
  }

  // ── Contradiction Engine Integration ─────────────────────────────────────

  /**
   * For each signal with a 'generate_contradiction' action,
   * create a formal contradiction record in the conflict detection system.
   */
  private async wireSignalToContradictionEngine(signal: BiostatSignal): Promise<void> {
    const contradictionActions = signal.actions.filter(
      a => a.actionType === 'generate_contradiction' && !a.executed
    );

    for (const action of contradictionActions) {
      try {
        const conflictId = uuidv4();

        // Map signal severity to conflict severity
        const conflictSeverity = signal.severity;

        // Map signal type to conflict type
        const conflictType = this.mapSignalToConflictType(signal);

        await this.pool.query(
          `INSERT INTO regulatory_conflicts (
            id, organization_id, project_id, conflict_type, severity,
            description, evidence, source_signal_id, source_signal_type,
            suggested_resolution, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', NOW())
          ON CONFLICT DO NOTHING`,
          [
            conflictId,
            signal.organizationId,
            signal.projectId,
            conflictType,
            conflictSeverity,
            signal.title,
            JSON.stringify({
              signalDescription: signal.description,
              computation: signal.computation,
              deterministicProof: signal.computation.deterministicProof,
            }),
            signal.signalId,
            signal.signalType,
            signal.severity === 'critical' ? 'manual_review' : 'merge_information',
          ]
        );

        signal.contradictionIds.push(conflictId);
        action.executed = true;
        action.executedAt = new Date();
        action.executionResult = `Contradiction ${conflictId} created`;
      } catch (err) {
        // Table may not exist yet — log but don't fail
        action.executionResult = `Skipped: ${(err as Error).message}`;
      }
    }
  }

  // ── Assumption Registry Integration ──────────────────────────────────────

  /**
   * For each signal with an 'update_assumption' action,
   * create or update an assumption finding in the readiness system.
   */
  private async wireSignalToAssumptionRegistry(
    signal: BiostatSignal,
    request: BiostatEvaluationRequest
  ): Promise<void> {
    const assumptionActions = signal.actions.filter(
      a => a.actionType === 'update_assumption' && !a.executed
    );

    for (const action of assumptionActions) {
      try {
        const findingId = uuidv4();
        const ruleCode = `BIOSTAT-${signal.signalType.toUpperCase().replace(/_/g, '-')}`;

        // Insert into readiness_evaluations as a biostat-originated finding
        const finding = {
          ruleId: findingId,
          ruleCode,
          findingType: signal.severity === 'critical' ? 'invalid' : 'warning',
          severity: signal.severity === 'critical' ? 'blocker' :
                    signal.severity === 'high' ? 'warning' : 'advisory',
          expectedItem: `Valid biostatistical assumption: ${signal.signalType}`,
          actualState: signal.computation.deterministicProof,
          evidenceClass: 'rules_based' as const,
          regulatoryReference: this.getSignalRegulatoryRef(signal),
          recommendation: action.reason,
          signalId: signal.signalId,
        };

        // Persist as a biostat assumption record
        await this.pool.query(
          `INSERT INTO biostat_assumption_findings (
            id, organization_id, project_id, study_id, rule_code,
            finding_type, severity, expected_item, actual_state,
            evidence_class, regulatory_reference, recommendation,
            signal_id, signal_type, computation_proof, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT DO NOTHING`,
          [
            finding.ruleId,
            signal.organizationId,
            signal.projectId,
            signal.studyId ?? null,
            finding.ruleCode,
            finding.findingType,
            finding.severity,
            finding.expectedItem,
            finding.actualState,
            finding.evidenceClass,
            finding.regulatoryReference,
            finding.recommendation,
            signal.signalId,
            signal.signalType,
            JSON.stringify(signal.computation),
          ]
        );

        action.executed = true;
        action.executedAt = new Date();
        action.executionResult = `Assumption finding ${findingId} created with code ${ruleCode}`;
      } catch (err) {
        action.executionResult = `Skipped: ${(err as Error).message}`;
      }
    }
  }

  // ── Resolution Orchestrator Integration ──────────────────────────────────

  /**
   * For signals requiring resolution plans (block_submission, flag_for_amendment,
   * require_human_review, escalate_to_biostat), create a resolution bundle.
   */
  private async wireSignalToResolutionOrchestrator(
    signal: BiostatSignal,
    request: BiostatEvaluationRequest
  ): Promise<void> {
    const resolutionActions = signal.actions.filter(
      a => ['block_submission', 'flag_for_amendment', 'require_human_review',
            'escalate_to_biostat', 'no_auto_execute'].includes(a.actionType)
        && a.targetSystem === 'resolution_orchestrator'
        && !a.executed
    );

    if (resolutionActions.length === 0) return;

    try {
      const planId = uuidv4();

      const resolutionPlan = {
        planId,
        signalId: signal.signalId,
        signalType: signal.signalType,
        severity: signal.severity,
        organizationId: signal.organizationId,
        projectId: signal.projectId,
        studyId: signal.studyId,
        title: `Resolution: ${signal.title}`,
        description: signal.description,
        requiredActions: resolutionActions.map(a => ({
          actionType: a.actionType,
          reason: a.reason,
          status: 'pending',
        })),
        computation: signal.computation,
        sourceArtifacts: signal.sourceArtifacts,
        blockingSubmission: resolutionActions.some(a => a.actionType === 'block_submission'),
        requiresHumanReview: resolutionActions.some(
          a => a.actionType === 'require_human_review' ||
               a.actionType === 'no_auto_execute' ||
               a.actionType === 'escalate_to_biostat'
        ),
      };

      await this.pool.query(
        `INSERT INTO biostat_resolution_plans (
          id, signal_id, signal_type, severity, organization_id, project_id,
          study_id, title, description, required_actions, computation_proof,
          source_artifacts, blocking_submission, requires_human_review,
          status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open', NOW())
        ON CONFLICT DO NOTHING`,
        [
          planId,
          signal.signalId,
          signal.signalType,
          signal.severity,
          signal.organizationId,
          signal.projectId,
          signal.studyId ?? null,
          resolutionPlan.title,
          resolutionPlan.description,
          JSON.stringify(resolutionPlan.requiredActions),
          JSON.stringify(signal.computation),
          JSON.stringify(signal.sourceArtifacts),
          resolutionPlan.blockingSubmission,
          resolutionPlan.requiresHumanReview,
        ]
      );

      signal.resolutionPlanId = planId;

      for (const action of resolutionActions) {
        action.executed = true;
        action.executedAt = new Date();
        action.executionResult = `Resolution plan ${planId} created`;
      }
    } catch (err) {
      for (const action of resolutionActions) {
        action.executionResult = `Skipped: ${(err as Error).message}`;
      }
    }
  }

  // ── Artifact Context Integration ─────────────────────────────────────────

  /**
   * Create a provenance event linking the signal to affected artifacts.
   */
  private async wireSignalToArtifactContext(
    signal: BiostatSignal,
    request: BiostatEvaluationRequest
  ): Promise<void> {
    if (signal.sourceArtifacts.length === 0) return;

    for (const artifact of signal.sourceArtifacts) {
      try {
        await this.pool.query(
          `INSERT INTO concept2cure_provenance_events (
            event_id, artifact_id, organization_id, event_type, event_action,
            details, source_description, created_at
          ) VALUES ($1, $2, $3, 'signal_detection', 'biostat_signal', $4, $5, NOW())
          ON CONFLICT DO NOTHING`,
          [
            uuidv4(),
            artifact.artifactId,
            signal.organizationId,
            JSON.stringify({
              signalId: signal.signalId,
              signalType: signal.signalType,
              severity: signal.severity,
              deterministicProof: signal.computation.deterministicProof,
              actions: signal.actions.map(a => a.actionType),
            }),
            `Biostat signal: ${signal.title}`,
          ]
        );
      } catch {
        // Artifact may not exist — non-fatal
      }
    }
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private async persistSignals(signals: BiostatSignal[]): Promise<void> {
    for (const signal of signals) {
      try {
        await this.pool.query(
          `INSERT INTO biostat_signals (
            id, signal_type, severity, title, description,
            organization_id, project_id, study_id,
            source_artifacts, affected_artifacts,
            computation, actions, contradiction_ids,
            resolution_plan_id, evidence_class, status, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            actions = EXCLUDED.actions,
            contradiction_ids = EXCLUDED.contradiction_ids,
            resolution_plan_id = EXCLUDED.resolution_plan_id`,
          [
            signal.signalId,
            signal.signalType,
            signal.severity,
            signal.title,
            signal.description,
            signal.organizationId,
            signal.projectId,
            signal.studyId ?? null,
            JSON.stringify(signal.sourceArtifacts),
            JSON.stringify(signal.affectedArtifacts),
            JSON.stringify(signal.computation),
            JSON.stringify(signal.actions),
            JSON.stringify(signal.contradictionIds),
            signal.resolutionPlanId ?? null,
            signal.evidenceClass,
            signal.status,
          ]
        );
      } catch {
        // Table may not exist — engine still returns in-memory results
      }
    }
  }

  private async persistReceipts(receipts: SignalProofReceipt[]): Promise<void> {
    for (const receipt of receipts) {
      try {
        await this.pool.query(
          `INSERT INTO biostat_signal_receipts (
            id, signal_id, signal_type, severity, project_id, organization_id,
            evaluation_context, computation, actions_triggered,
            contradictions_created, assumptions_updated, resolution_plans_created,
            source_artifacts, affected_artifacts, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
          ON CONFLICT DO NOTHING`,
          [
            receipt.receiptId,
            receipt.signalId,
            receipt.signalType,
            receipt.severity,
            receipt.projectId,
            receipt.organizationId,
            JSON.stringify(receipt.evaluationContext),
            JSON.stringify(receipt.computation),
            JSON.stringify(receipt.actionsTriggered),
            JSON.stringify(receipt.contradictionsCreated),
            JSON.stringify(receipt.assumptionsUpdated),
            JSON.stringify(receipt.resolutionPlansCreated),
            JSON.stringify(receipt.sourceArtifacts),
            JSON.stringify(receipt.affectedArtifacts),
          ]
        );
      } catch {
        // Non-fatal
      }
    }
  }

  // ── Query Interface ──────────────────────────────────────────────────────

  /**
   * Get all active signals for a project.
   */
  async getProjectSignals(organizationId: number, projectId: number): Promise<BiostatSignal[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM biostat_signals
         WHERE organization_id = $1 AND project_id = $2 AND status = 'active'
         ORDER BY created_at DESC`,
        [organizationId, projectId]
      );
      return result.rows.map(this.rowToSignal);
    } catch {
      return [];
    }
  }

  /**
   * Get proof receipts for a signal.
   */
  async getSignalReceipts(signalId: string): Promise<SignalProofReceipt[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM biostat_signal_receipts WHERE signal_id = $1`,
        [signalId]
      );
      return result.rows.map(this.rowToReceipt);
    } catch {
      return [];
    }
  }

  /**
   * Resolve a signal with notes.
   */
  async resolveSignal(signalId: string, resolvedBy: string, notes: string): Promise<void> {
    await this.pool.query(
      `UPDATE biostat_signals SET status = 'resolved', resolved_at = NOW(),
       resolved_by = $2, resolution_notes = $3 WHERE id = $1`,
      [signalId, resolvedBy, notes]
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private mapSignalToConflictType(signal: BiostatSignal): string {
    switch (signal.signalType) {
      case 'power_inadequacy': return 'factual_contradiction';
      case 'endpoint_document_misalignment': return 'factual_contradiction';
      case 'sample_size_drift': return 'temporal_inconsistency';
      case 'multiplicity_gap': return 'procedural_conflict';
      case 'missing_data_risk': return 'outcome_divergence';
      case 'statistical_uncertainty': return 'outcome_divergence';
      default: return 'factual_contradiction';
    }
  }

  private getSignalRegulatoryRef(signal: BiostatSignal): string {
    switch (signal.signalType) {
      case 'power_inadequacy': return 'ICH E9 Section 3.5 — Sample Size';
      case 'endpoint_document_misalignment': return 'ICH E9 Section 2.2 — Primary Variable';
      case 'statistical_uncertainty': return 'ICH E9(R1) — Estimands and Sensitivity Analysis';
      case 'sample_size_drift': return 'ICH E9 Section 3.5, FDA Guidance on Adaptive Designs';
      case 'multiplicity_gap': return 'ICH E9 Section 5.7 — Multiplicity';
      case 'missing_data_risk': return 'ICH E9(R1), NRC Panel on Missing Data in Clinical Trials';
      default: return 'ICH E9';
    }
  }

  private buildSummary(signals: BiostatSignal[]): BiostatSignalResult['summary'] {
    const bySeverity: Record<SignalSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byType: Partial<Record<string, number>> = {};
    let contradictions = 0;
    let assumptions = 0;
    let resolutions = 0;
    let blocked = 0;
    let humanReview = false;

    for (const s of signals) {
      bySeverity[s.severity]++;
      byType[s.signalType] = (byType[s.signalType] ?? 0) + 1;
      contradictions += s.contradictionIds.length;
      if (s.resolutionPlanId) resolutions++;
      for (const a of s.actions) {
        if (a.actionType === 'update_assumption' && a.executed) assumptions++;
        if (a.actionType === 'block_submission') blocked++;
        if (a.actionType === 'require_human_review' || a.actionType === 'no_auto_execute') humanReview = true;
      }
    }

    return {
      totalSignals: signals.length,
      bySeverity,
      byType: byType as any,
      contradictionsGenerated: contradictions,
      assumptionsUpdated: assumptions,
      resolutionPlansCreated: resolutions,
      blockedActions: blocked,
      requiresHumanReview: humanReview,
    };
  }

  private rowToSignal(row: any): BiostatSignal {
    return {
      signalId: row.id,
      signalType: row.signal_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      organizationId: row.organization_id,
      projectId: row.project_id,
      studyId: row.study_id,
      sourceArtifacts: row.source_artifacts ?? [],
      affectedArtifacts: row.affected_artifacts ?? [],
      computation: row.computation,
      actions: row.actions ?? [],
      contradictionIds: row.contradiction_ids ?? [],
      resolutionPlanId: row.resolution_plan_id,
      evidenceClass: row.evidence_class,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      resolutionNotes: row.resolution_notes,
      status: row.status,
    };
  }

  private rowToReceipt(row: any): SignalProofReceipt {
    return {
      receiptId: row.id,
      signalId: row.signal_id,
      signalType: row.signal_type,
      severity: row.severity,
      timestamp: row.created_at,
      projectId: row.project_id,
      organizationId: row.organization_id,
      evaluationContext: row.evaluation_context,
      computation: row.computation,
      actionsTriggered: row.actions_triggered,
      contradictionsCreated: row.contradictions_created ?? [],
      assumptionsUpdated: row.assumptions_updated ?? [],
      resolutionPlansCreated: row.resolution_plans_created ?? [],
      sourceArtifacts: row.source_artifacts ?? [],
      affectedArtifacts: row.affected_artifacts ?? [],
    };
  }
}
