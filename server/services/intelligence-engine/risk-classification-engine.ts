/**
 * Module 5 — Risk Classification Engine
 *
 * Maps intelligence findings to a regulatory deficiency taxonomy.
 * Deterministic classification: finding → category + severity + remediation.
 */

import type {
  DeficiencyCategory,
  DeficiencySeverity,
  RiskClassification,
  RiskReport,
  ClaimEvidenceReport,
  ConsistencyReport,
  DefensibilityScore,
} from './types';

// ─── Deficiency Taxonomy ─────────────────────────────────────────────────────

interface DeficiencyRule {
  condition: (ctx: ClassificationContext) => boolean;
  category: DeficiencyCategory;
  severity: DeficiencySeverity;
  finding: string | ((ctx: ClassificationContext) => string);
  regulatoryBasis: string;
  remediation: string;
}

interface ClassificationContext {
  claimEvidence: ClaimEvidenceReport;
  consistency: ConsistencyReport;
  defensibility: DefensibilityScore;
  content: string;
}

/**
 * Rule-based deficiency detection. Order matters — more severe rules first.
 */
const DEFICIENCY_RULES: DeficiencyRule[] = [
  // ── Clinical Data Gaps ────────────────────────────────────────────────────
  {
    condition: (ctx) => ctx.claimEvidence.unsupportedCount >= 3,
    category: 'clinical_data_gap',
    severity: 'critical',
    finding: (ctx) =>
      `${ctx.claimEvidence.unsupportedCount} efficacy/safety claims lack any detectable evidence reference`,
    regulatoryBasis: 'ICH E9(R1): Statistical Principles for Clinical Trials; FDA Guidance on Providing Clinical Evidence of Effectiveness',
    remediation: 'Add specific study references, statistical results, and data tables for each unsupported claim',
  },
  {
    condition: (ctx) => ctx.claimEvidence.unsupportedCount >= 1 && ctx.claimEvidence.unsupportedCount < 3,
    category: 'clinical_data_gap',
    severity: 'major',
    finding: (ctx) =>
      `${ctx.claimEvidence.unsupportedCount} claim(s) without evidence backing detected`,
    regulatoryBasis: 'ICH E9(R1); 21 CFR 314.50(d)(5)',
    remediation: 'Provide data references or moderate claim language to match available evidence',
  },

  // ── Statistical Weakness ──────────────────────────────────────────────────
  {
    condition: (ctx) => {
      const noQuantitative = ctx.claimEvidence.alignments.filter(
        a => a.claimStrength === 'strong' && a.evidenceStrength === 'none'
      ).length;
      return noQuantitative >= 2;
    },
    category: 'statistical_weakness',
    severity: 'major',
    finding: 'Strong efficacy claims made without quantitative statistical support (no p-values, CIs, or effect sizes)',
    regulatoryBasis: 'ICH E9: Statistical analysis of primary endpoints must include point estimates and CIs',
    remediation: 'Add statistical analysis results including p-values, confidence intervals, and effect size estimates',
  },

  // ── Safety Signal Gaps ────────────────────────────────────────────────────
  {
    condition: (ctx) => {
      const hasSafety = /\b(adverse\s+event|safety\s+profile|tolerab)/i.test(ctx.content);
      const hasDetailedSafety = /\b(serious\s+adverse|grade\s+[3-5]|discontinuation\s+due\s+to)/i.test(ctx.content);
      return hasSafety && !hasDetailedSafety;
    },
    category: 'safety_signal_gap',
    severity: 'major',
    finding: 'Safety section lacks detailed adverse event characterization (severity grading, SAEs, discontinuations)',
    regulatoryBasis: 'ICH E3 Section 12: Safety analysis must include SAEs, AE severity, and discontinuation data',
    remediation: 'Expand safety narrative with SAE listings, severity grading (CTCAE), and discontinuation rates',
  },
  {
    condition: (ctx) => {
      return !/\b(adverse|safety|tolerab)/i.test(ctx.content);
    },
    category: 'safety_signal_gap',
    severity: 'critical',
    finding: 'No safety data or adverse event discussion detected in document',
    regulatoryBasis: 'ICH E3; 21 CFR 312.32; EU MDR Article 87',
    remediation: 'Add comprehensive safety analysis section including AE incidence, severity, relatedness, and SAEs',
  },

  // ── Regulatory Non-Compliance ─────────────────────────────────────────────
  {
    condition: (ctx) => ctx.defensibility.breakdown.completeness < 10,
    category: 'regulatory_non_compliance',
    severity: 'critical',
    finding: 'Document is missing multiple required structural elements for regulatory submission',
    regulatoryBasis: 'ICH M4(E): Common Technical Document structure requirements',
    remediation: 'Review CTD/ICH structural requirements and add missing sections',
  },

  // ── Documentation Deficiency ──────────────────────────────────────────────
  {
    condition: (ctx) => ctx.consistency.inconsistencies.filter(i => i.severity === 'high').length >= 2,
    category: 'documentation_deficiency',
    severity: 'major',
    finding: (ctx) => {
      const count = ctx.consistency.inconsistencies.filter(i => i.severity === 'high').length;
      return `${count} high-severity cross-section inconsistencies detected (contradictory data or claims)`;
    },
    regulatoryBasis: 'ICH E3 Section 11.4: Consistency of data presentation across document sections',
    remediation: 'Reconcile contradictory statements across sections and ensure single source of truth for all data points',
  },
  {
    condition: (ctx) => ctx.consistency.consistencyScore < 70,
    category: 'documentation_deficiency',
    severity: 'minor',
    finding: (ctx) =>
      `Cross-section consistency score is ${ctx.consistency.consistencyScore}/100, indicating moderate inconsistencies`,
    regulatoryBasis: 'ICH E3: Internal consistency of the clinical study report',
    remediation: 'Review and harmonize data references across sections',
  },

  // ── Claim Overstatement ───────────────────────────────────────────────────
  {
    condition: (ctx) => ctx.claimEvidence.overstatedCount >= 3,
    category: 'labeling_issue',
    severity: 'major',
    finding: (ctx) =>
      `${ctx.claimEvidence.overstatedCount} claims use language exceeding the evidence level, which may constitute misleading labeling`,
    regulatoryBasis: '21 CFR 201.56: Labeling must be consistent with evidence; EU MDR Article 7: No misleading claims',
    remediation: 'Moderate claim language to match evidence strength (e.g., "demonstrates" → "suggests" where evidence is partial)',
  },
  {
    condition: (ctx) => ctx.claimEvidence.overstatedCount >= 1 && ctx.claimEvidence.overstatedCount < 3,
    category: 'labeling_issue',
    severity: 'minor',
    finding: (ctx) =>
      `${ctx.claimEvidence.overstatedCount} claim(s) may overstate the available evidence`,
    regulatoryBasis: '21 CFR 201.56; FDCA Section 502(a)',
    remediation: 'Review flagged claims and consider softening language where evidence is limited',
  },

  // ── Low Defensibility ─────────────────────────────────────────────────────
  {
    condition: (ctx) => ctx.defensibility.score < 30,
    category: 'regulatory_non_compliance',
    severity: 'critical',
    finding: (ctx) =>
      `Overall defensibility score is critically low (${ctx.defensibility.score}/100)`,
    regulatoryBasis: 'General regulatory expectation: submissions must withstand expert scrutiny',
    remediation: 'Comprehensive revision needed: strengthen evidence, align claims, complete missing sections',
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Classify all detected risks using the deterministic rule set.
 */
export function classifyRisks(
  claimEvidence: ClaimEvidenceReport,
  consistency: ConsistencyReport,
  defensibility: DefensibilityScore,
  content: string
): RiskReport {
  const ctx: ClassificationContext = { claimEvidence, consistency, defensibility, content };
  const classifications: RiskClassification[] = [];

  for (const rule of DEFICIENCY_RULES) {
    if (rule.condition(ctx)) {
      classifications.push({
        category: rule.category,
        severity: rule.severity,
        finding: typeof rule.finding === 'function' ? rule.finding(ctx) : rule.finding,
        regulatoryBasis: rule.regulatoryBasis,
        remediationGuidance: rule.remediation,
      });
    }
  }

  const criticalCount = classifications.filter(c => c.severity === 'critical').length;
  const majorCount = classifications.filter(c => c.severity === 'major').length;
  const minorCount = classifications.filter(c => c.severity === 'minor').length;

  let overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  if (criticalCount >= 2) overallRisk = 'critical';
  else if (criticalCount >= 1 || majorCount >= 3) overallRisk = 'high';
  else if (majorCount >= 1) overallRisk = 'moderate';
  else overallRisk = 'low';

  return {
    classifications,
    criticalCount,
    majorCount,
    minorCount,
    overallRisk,
  };
}
