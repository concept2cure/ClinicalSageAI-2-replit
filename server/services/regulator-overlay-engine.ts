/**
 * Regulator Overlay Engine — Pass 8
 *
 * Formalized overlay rules that adapt contradiction severity, authority,
 * and consequence by regulator/body context. Not scattered across prompts.
 *
 * Seed overlay rules represent real regulatory differences:
 * - FDA vs EMA severity differences for the same contradiction type
 * - Jurisdiction-specific authority escalation
 * - Body-specific consequence paths
 *
 * Uses the existing OverlayRule type from contradiction-engine-service.
 * Persists to contradiction_overlay_rules table.
 *
 * @module server/services/regulator-overlay-engine
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import type { OverlayRule, ContradictionFinding, Severity, AuthorityState, ConsequenceType } from './contradiction-engine-service.js';
import type { SeedOverlayRule, OverlayConsequence } from '../../shared/types/contradiction-architecture.js';

const log = createScopedLogger('regulator-overlay');

// ─── Seed Overlay Rules ──────────────────────────────────────────────────────
// These represent real regulatory differences between bodies.

const SEED_OVERLAY_RULES: SeedOverlayRule[] = [
  // ── FDA: Dosage conflicts are always critical ──
  {
    ruleCode: 'FDA-DOS-001',
    ruleName: 'FDA dosage conflict escalation',
    regulatorBody: 'FDA',
    contradictionType: 'dosage_conflict',
    applicableDomains: ['clinical', 'pharmacology', 'safety'],
    applicableProgramTypes: ['IND', 'NDA', 'BLA'],
    severityOverride: 'critical',
    authorityOverride: 'blocks_promotion',
    consequenceOverride: 'dossier_review_attachment',
    description: 'FDA treats dosage inconsistencies as potential safety signals requiring immediate resolution before submission.',
    regulatoryReference: '21 CFR 312.23(a)(3) — IND content requirements',
    rationale: 'FDA requires consistent dosing across all submission modules. Inconsistency suggests inadequate dose justification.',
    priority: 10,
  },

  // ── EMA: Parameter mismatch in CMC is critical ──
  {
    ruleCode: 'EMA-CMC-001',
    ruleName: 'EMA CMC parameter escalation',
    regulatorBody: 'EMA',
    contradictionType: 'parameter_mismatch',
    applicableDomains: ['cmc'],
    applicableProgramTypes: ['MAA', 'CTA'],
    severityOverride: 'critical',
    authorityOverride: 'blocks_promotion',
    consequenceOverride: 'escalation',
    description: 'EMA treats CMC parameter inconsistencies as potential quality deficiencies requiring rapporteur attention.',
    regulatoryReference: 'EMA/CHMP/QWP guideline on process validation',
    rationale: 'EMA places particular emphasis on CMC consistency. Parameter mismatches can trigger a Major Objection.',
    priority: 10,
  },

  // ── FDA: Regulatory discrepancy requires approval, not just review ──
  {
    ruleCode: 'FDA-REG-001',
    ruleName: 'FDA regulatory discrepancy authority escalation',
    regulatorBody: 'FDA',
    contradictionType: 'regulatory_discrepancy',
    applicableDomains: [],
    applicableProgramTypes: ['NDA', 'BLA', '510K', 'PMA'],
    severityOverride: 'high',
    authorityOverride: 'requires_approval',
    consequenceOverride: 'escalation',
    description: 'For FDA marketing applications, regulatory discrepancies require RA lead approval before resolution.',
    regulatoryReference: '21 CFR 314.50 — NDA content and format',
    rationale: 'Marketing applications have higher regulatory stakes. Discrepancies need RA lead sign-off.',
    priority: 20,
  },

  // ── EMA: Cross-jurisdictional divergence for dual filings ──
  {
    ruleCode: 'EMA-XJD-001',
    ruleName: 'EMA cross-jurisdictional divergence escalation',
    regulatorBody: 'EMA',
    contradictionType: 'cross_jurisdictional_divergence',
    applicableDomains: [],
    applicableProgramTypes: ['MAA', 'CTA'],
    severityOverride: 'high',
    authorityOverride: 'requires_review',
    consequenceOverride: 'review_thread',
    description: 'For EMA submissions, cross-jurisdictional divergences must be reviewed to ensure EU-specific requirements are met.',
    regulatoryReference: 'Module 1.2 — Regional administrative information',
    rationale: 'EMA has specific regional requirements that may differ from FDA. Cross-jurisdictional divergence needs explicit review.',
    priority: 15,
  },

  // ── FDA: Assumption drift in clinical domain blocks promotion ──
  {
    ruleCode: 'FDA-AD-001',
    ruleName: 'FDA clinical assumption drift escalation',
    regulatorBody: 'FDA',
    contradictionType: 'assumption_drift',
    applicableDomains: ['clinical', 'biostatistics'],
    applicableProgramTypes: ['IND', 'NDA', 'BLA'],
    severityOverride: 'high',
    authorityOverride: 'requires_approval',
    consequenceOverride: 'review_thread',
    description: 'Clinical assumption drift in FDA submissions requires RA review before proceeding.',
    regulatoryReference: '21 CFR 312.30 — Protocol amendments',
    rationale: 'Clinical assumption changes in FDA submissions may constitute protocol amendments requiring FDA notification.',
    priority: 20,
  },

  // ── PMDA: Summary/body tension requires escalation ──
  {
    ruleCode: 'PMDA-SB-001',
    ruleName: 'PMDA summary-body escalation',
    regulatorBody: 'PMDA',
    contradictionType: 'summary_body_tension',
    applicableDomains: [],
    applicableProgramTypes: [],
    severityOverride: 'high',
    authorityOverride: 'requires_escalation',
    consequenceOverride: 'escalation',
    description: 'PMDA reviews are particularly thorough on summary-body consistency. Inconsistencies require escalation.',
    regulatoryReference: 'PMDA CTD-Q&A',
    rationale: 'PMDA reviewers frequently flag summary/body inconsistencies. Pre-emptive escalation prevents review delays.',
    priority: 15,
  },

  // ── FDA: Protocol-SAP inconsistency is high severity ──
  {
    ruleCode: 'FDA-PS-001',
    ruleName: 'FDA protocol-SAP inconsistency',
    regulatorBody: 'FDA',
    contradictionType: 'protocol_sap_inconsistency',
    applicableDomains: ['clinical', 'biostatistics'],
    applicableProgramTypes: ['IND', 'NDA', 'BLA'],
    severityOverride: 'high',
    authorityOverride: 'blocks_promotion',
    consequenceOverride: 'review_thread',
    description: 'Protocol-SAP inconsistencies must be resolved before FDA submission modules can be promoted.',
    regulatoryReference: 'ICH E9(R1) — Estimands and sensitivity analysis',
    rationale: 'FDA requires alignment between protocol and SAP. Inconsistency suggests incomplete statistical planning.',
    priority: 10,
  },

  // ── EMA: Status conflict requires reapproval ──
  {
    ruleCode: 'EMA-SC-001',
    ruleName: 'EMA status conflict reapproval',
    regulatorBody: 'EMA',
    contradictionType: 'status_conflict',
    applicableDomains: [],
    applicableProgramTypes: ['MAA'],
    severityOverride: 'high',
    authorityOverride: 'requires_escalation',
    consequenceOverride: 'escalation',
    description: 'For EMA MAA submissions, status conflicts require reapproval by submission lead.',
    rationale: 'MAA submissions have strict version control requirements. Status conflicts indicate version management failure.',
    priority: 15,
  },
];

// ─── Service ─────────────────────────────────────────────────────────────────

class RegulatorOverlayEngine {

  /**
   * Ensure seed overlay rules are present in the database.
   * Idempotent — skips rules that already exist by ruleCode.
   */
  async ensureSeedRules(organizationId: number): Promise<{ seeded: number; skipped: number }> {
    let seeded = 0;
    let skipped = 0;

    for (const rule of SEED_OVERLAY_RULES) {
      try {
        // Check if rule already exists
        const existing = await pool!.query(
          'SELECT id FROM contradiction_overlay_rules WHERE organization_id = $1 AND rule_code = $2 LIMIT 1',
          [organizationId, rule.ruleCode]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        await pool!.query(`
          INSERT INTO contradiction_overlay_rules (
            organization_id, rule_code, rule_name, regulator_body, jurisdiction,
            contradiction_type, applicable_domains, applicable_program_types,
            severity_override, authority_override, consequence_override,
            description, regulatory_reference, rationale, priority, active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        `, [
          organizationId, rule.ruleCode, rule.ruleName, rule.regulatorBody,
          rule.jurisdiction ?? null, rule.contradictionType, rule.applicableDomains,
          rule.applicableProgramTypes, rule.severityOverride, rule.authorityOverride,
          rule.consequenceOverride, rule.description, rule.regulatoryReference ?? null,
          rule.rationale, rule.priority, true,
        ]);

        seeded++;
      } catch (err) {
        log.warn('Failed to seed overlay rule', {
          ruleCode: rule.ruleCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info('Overlay rules seeded', { seeded, skipped, total: SEED_OVERLAY_RULES.length });
    return { seeded, skipped };
  }

  /**
   * Apply all matching overlay rules to a contradiction finding.
   * Returns the modified finding and the overlay consequence record.
   */
  async applyOverlays(
    finding: ContradictionFinding,
    opts?: { domain?: string; programType?: string }
  ): Promise<{
    finding: ContradictionFinding;
    overlayApplied: boolean;
    overlayConsequence: OverlayConsequence | null;
  }> {
    if (!finding.regulatorBody) {
      return { finding, overlayApplied: false, overlayConsequence: null };
    }

    try {
      const rules = await this.getMatchingRules(
        finding.organizationId,
        finding.contradictionType,
        finding.regulatorBody,
        opts?.domain,
        opts?.programType
      );

      if (rules.length === 0) {
        return { finding, overlayApplied: false, overlayConsequence: null };
      }

      // First matching rule wins (sorted by priority)
      const rule = rules[0];
      const originalSeverity = finding.severity;
      const originalAuthority = finding.authorityState;
      const originalConsequence = finding.consequenceType;

      if (rule.severityOverride) {
        finding.regulatorSeverityOverride = rule.severityOverride as Severity;
        finding.severity = rule.severityOverride as Severity;
      }
      if (rule.authorityOverride) {
        finding.authorityState = rule.authorityOverride as AuthorityState;
      }
      if (rule.consequenceOverride) {
        finding.consequenceType = rule.consequenceOverride as ConsequenceType;
      }
      finding.overlayRuleId = rule.id;

      const overlayConsequence: OverlayConsequence = {
        overlayRuleId: rule.id,
        overlayRuleCode: rule.ruleCode,
        originalSeverity,
        originalAuthorityState: originalAuthority,
        originalConsequenceType: originalConsequence,
        overriddenSeverity: finding.severity,
        overriddenAuthorityState: finding.authorityState,
        overriddenConsequenceType: finding.consequenceType,
        regulatorBody: rule.regulatorBody,
        jurisdiction: rule.jurisdiction ?? undefined,
        rationale: rule.rationale || rule.description,
        regulatoryReference: rule.regulatoryReference ?? undefined,
      };

      // Persist overlay changes
      try {
        await pool!.query(`
          UPDATE contradiction_findings
          SET severity = $1, authority_state = $2, consequence_type = $3,
              overlay_rule_id = $4, regulator_severity_override = $5,
              source_classification = 'overlay_rule_conflict', updated_at = NOW()
          WHERE id = $6 AND organization_id = $7
        `, [
          finding.severity, finding.authorityState, finding.consequenceType,
          finding.overlayRuleId, finding.regulatorSeverityOverride,
          finding.id, finding.organizationId,
        ]);
      } catch {
        // Persistence failure — finding still modified in memory
      }

      log.info('Overlay applied', {
        findingId: finding.id,
        ruleCode: rule.ruleCode,
        severityChange: originalSeverity !== finding.severity
          ? `${originalSeverity} → ${finding.severity}` : 'unchanged',
        authorityChange: originalAuthority !== finding.authorityState
          ? `${originalAuthority} → ${finding.authorityState}` : 'unchanged',
      });

      return { finding, overlayApplied: true, overlayConsequence };
    } catch (err) {
      log.warn('Overlay application failed', {
        findingId: finding.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return { finding, overlayApplied: false, overlayConsequence: null };
    }
  }

  /**
   * Apply overlays to all findings in a scan result.
   */
  async applyOverlaysToFindings(
    findings: ContradictionFinding[],
    opts?: { domain?: string; programType?: string }
  ): Promise<{
    findings: ContradictionFinding[];
    overlayCount: number;
    overlayConsequences: OverlayConsequence[];
  }> {
    const consequences: OverlayConsequence[] = [];
    let overlayCount = 0;

    for (const finding of findings) {
      if (!finding.regulatorBody) continue;
      const result = await this.applyOverlays(finding, opts);
      if (result.overlayApplied) {
        overlayCount++;
        if (result.overlayConsequence) {
          consequences.push(result.overlayConsequence);
        }
      }
    }

    return { findings, overlayCount, overlayConsequences: consequences };
  }

  /**
   * Get matching overlay rules for a contradiction type + regulator body.
   */
  private async getMatchingRules(
    organizationId: number,
    contradictionType: string,
    regulatorBody: string,
    domain?: string,
    programType?: string
  ): Promise<OverlayRule[]> {
    try {
      const result = await pool!.query(`
        SELECT * FROM contradiction_overlay_rules
        WHERE organization_id = $1 AND contradiction_type = $2
          AND regulator_body = $3 AND active = true
        ORDER BY priority ASC
      `, [organizationId, contradictionType, regulatorBody]);

      return result.rows
        .map(this.mapRule)
        .filter(rule => {
          // Filter by domain if specified
          if (domain && rule.applicableDomains.length > 0
            && !rule.applicableDomains.includes(domain)) return false;
          // Filter by program type if specified
          if (programType && rule.applicableProgramTypes.length > 0
            && !rule.applicableProgramTypes.includes(programType)) return false;
          return true;
        });
    } catch {
      return [];
    }
  }

  /**
   * Get all active overlay rules for an organization, grouped by regulator.
   */
  async getActiveRulesByRegulator(organizationId: number): Promise<Record<string, OverlayRule[]>> {
    try {
      const result = await pool!.query(`
        SELECT * FROM contradiction_overlay_rules
        WHERE organization_id = $1 AND active = true
        ORDER BY regulator_body, priority ASC
      `, [organizationId]);

      const grouped: Record<string, OverlayRule[]> = {};
      for (const row of result.rows) {
        const rule = this.mapRule(row);
        if (!grouped[rule.regulatorBody]) grouped[rule.regulatorBody] = [];
        grouped[rule.regulatorBody].push(rule);
      }
      return grouped;
    } catch {
      return {};
    }
  }

  /**
   * Get the seed rules (for reference, not DB-dependent).
   */
  getSeedRules(): SeedOverlayRule[] {
    return [...SEED_OVERLAY_RULES];
  }

  private mapRule(row: Record<string, unknown>): OverlayRule {
    return {
      id: row.id as string,
      organizationId: row.organization_id as number,
      ruleCode: row.rule_code as string,
      ruleName: row.rule_name as string,
      regulatorBody: row.regulator_body as string,
      jurisdiction: row.jurisdiction as string | null,
      contradictionType: row.contradiction_type as string,
      applicableDomains: (row.applicable_domains as string[]) ?? [],
      applicableProgramTypes: (row.applicable_program_types as string[]) ?? [],
      severityOverride: row.severity_override as Severity | null,
      authorityOverride: row.authority_override as AuthorityState | null,
      consequenceOverride: row.consequence_override as ConsequenceType | null,
      description: row.description as string,
      regulatoryReference: row.regulatory_reference as string | null,
      rationale: row.rationale as string | null,
      priority: (row.priority as number) ?? 100,
      active: (row.active as boolean) ?? true,
    };
  }
}

export const regulatorOverlayEngine = new RegulatorOverlayEngine();
