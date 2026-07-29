/**
 * Issue detection for the AnA Intelligence Question Engine.
 *
 * After each answer, runs the node's issue checks and cross-node
 * cumulative risk analysis. Issues range from informational to
 * critical regulatory red flags. The cross-node detector identifies
 * compound risks that only emerge from the combination of answers
 * across multiple questions.
 *
 * @module server/services/ana/intelligence-questions/issue-detector
 */

import type { QuestionNode, DetectedIssue, FlowState, FlowDefinition } from './types.js';
import { evaluatePredicate } from './engine.js';

/**
 * Evaluate all issue checks on a question node against the provided answers.
 * Returns an array of detected issues (empty = no issues).
 */
export function runIssueChecks(
  node: QuestionNode,
  answers: Record<string, unknown>,
): DetectedIssue[] {
  if (!node.issueChecks || node.issueChecks.length === 0) return [];

  const issues: DetectedIssue[] = [];

  for (const check of node.issueChecks) {
    if (evaluatePredicate(check.condition, answers)) {
      issues.push({
        checkId: check.id,
        severity: check.severity,
        title: check.title,
        message: check.message,
        reference: check.reference,
        questionId: node.id,
        triggerValues: extractTriggerValues(check.condition.field, answers),
      });
    }
  }

  return issues;
}

/**
 * Run cross-node cumulative risk analysis across all collected answers.
 * Detects compound issues that only emerge when looking at the full picture.
 */
export function runCrossNodeAnalysis(
  state: FlowState,
  definition: FlowDefinition,
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const flat = flattenAnswers(state.answers);
  const existingIds = new Set(state.issues.map(i => i.checkId));

  for (const rule of CROSS_NODE_RULES) {
    if (existingIds.has(rule.id)) continue;
    if (rule.appliesTo && !rule.appliesTo.includes(definition.category)) continue;

    const issue = rule.check(flat, state, definition);
    if (issue && !existingIds.has(issue.checkId)) {
      issues.push(issue);
    }
  }

  return issues;
}

/**
 * Compute a cumulative regulatory risk score (0-100) from all detected issues.
 * Higher = more risk. Used for flow-level risk assessment display.
 */
export function computeRiskScore(issues: DetectedIssue[]): {
  score: number;
  level: 'low' | 'moderate' | 'high' | 'critical';
  breakdown: { critical: number; warning: number; info: number };
} {
  const critical = issues.filter(i => i.severity === 'critical').length;
  const warning = issues.filter(i => i.severity === 'warning').length;
  const info = issues.filter(i => i.severity === 'info').length;

  const score = Math.min(100, critical * 25 + warning * 10 + info * 3);

  const level: 'low' | 'moderate' | 'high' | 'critical' =
    score >= 75 ? 'critical' :
    score >= 50 ? 'high' :
    score >= 25 ? 'moderate' :
    'low';

  return { score, level, breakdown: { critical, warning, info } };
}

/* ─── Internal helpers ───────────────────────────────────────────────── */

function extractTriggerValues(
  fieldId: string,
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (fieldId in answers) {
    result[fieldId] = answers[fieldId];
  }
  return result;
}

function flattenAnswers(answers: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const nodeAnswers of Object.values(answers)) {
    Object.assign(flat, nodeAnswers);
  }
  return flat;
}

function isBlank(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function numVal(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function strVal(val: unknown): string {
  return typeof val === 'string' ? val.toLowerCase().trim() : '';
}

/* ─── Cross-node rule definitions ────────────────────────────────────── */

interface CrossNodeRule {
  id: string;
  appliesTo?: string[];
  check: (
    flat: Record<string, unknown>,
    state: FlowState,
    definition: FlowDefinition,
  ) => DetectedIssue | null;
}

const CROSS_NODE_RULES: CrossNodeRule[] = [
  {
    id: 'xn_pediatric_without_safety_monitoring',
    appliesTo: ['protocol_development', 'ind_submission'],
    check(flat) {
      const pop = strVal(flat['target_population'] ?? flat['study_population']);
      const hasDSMB = strVal(flat['has_dsmb'] ?? flat['dsmb']) === 'yes' ||
                      strVal(flat['data_monitoring']) === 'yes';
      if ((pop.includes('pediatric') || pop.includes('paediatric') || pop.includes('children')) && !hasDSMB) {
        return {
          checkId: 'xn_pediatric_without_safety_monitoring',
          severity: 'critical',
          title: 'Pediatric Study Without Independent Safety Monitoring',
          message: 'Pediatric populations require enhanced safety monitoring. FDA and EMA both expect an independent Data Safety Monitoring Board (DSMB) for studies involving children.',
          reference: 'ICH E11(R1); FDA Guidance on Pediatric Study Plans (2020)',
          questionId: '_cross_node',
          triggerValues: { target_population: flat['target_population'], has_dsmb: flat['has_dsmb'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_phase3_no_interim',
    appliesTo: ['protocol_development'],
    check(flat) {
      const phase = strVal(flat['study_phase'] ?? flat['trial_phase']);
      const interim = strVal(flat['interim_analysis'] ?? flat['planned_interim']);
      const enrollment = numVal(flat['sample_size'] ?? flat['target_enrollment']);
      if (phase.includes('3') && enrollment !== null && enrollment > 200 && !interim.includes('yes') && isBlank(flat['interim_analysis'])) {
        return {
          checkId: 'xn_phase3_no_interim',
          severity: 'warning',
          title: 'Large Phase 3 Without Interim Analysis',
          message: `A Phase 3 trial with ${enrollment} subjects and no planned interim analysis may expose patients to unnecessary risk. Consider adding a futility or efficacy interim analysis.`,
          reference: 'ICH E9(R1); FDA Guidance on Adaptive Designs (2019)',
          questionId: '_cross_node',
          triggerValues: { study_phase: flat['study_phase'], sample_size: flat['sample_size'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_oncology_no_biomarker_strategy',
    appliesTo: ['protocol_development', 'ind_submission', 'nda_submission'],
    check(flat) {
      const area = strVal(flat['therapeutic_area'] ?? flat['indication']);
      const biomarker = strVal(flat['biomarker_strategy'] ?? flat['companion_diagnostic']);
      if (area.includes('oncology') && isBlank(biomarker) && isBlank(flat['biomarker_enrichment'])) {
        return {
          checkId: 'xn_oncology_no_biomarker_strategy',
          severity: 'warning',
          title: 'Oncology Program Without Biomarker Strategy',
          message: 'Modern oncology submissions increasingly require biomarker-driven patient selection. FDA\'s Project Optimus initiative emphasizes biomarker-guided dose optimization.',
          reference: 'FDA Project Optimus; ICH E16; FDA Enrichment Strategies Guidance (2019)',
          questionId: '_cross_node',
          triggerValues: { therapeutic_area: flat['therapeutic_area'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_accelerated_approval_no_confirmatory',
    appliesTo: ['nda_submission', 'bla_submission'],
    check(flat) {
      const pathway = strVal(flat['regulatory_pathway'] ?? flat['approval_pathway']);
      const confirmatory = strVal(flat['confirmatory_trial'] ?? flat['post_marketing_commitment']);
      if (pathway.includes('accelerated') && isBlank(confirmatory)) {
        return {
          checkId: 'xn_accelerated_approval_no_confirmatory',
          severity: 'critical',
          title: 'Accelerated Approval Without Confirmatory Trial Plan',
          message: 'Accelerated approval requires a post-marketing confirmatory trial per FDORA §3210. FDA has increased enforcement of confirmatory study requirements and can initiate withdrawal proceedings if not met.',
          reference: 'FDORA §3210; 21 CFR 314.530; FDA Guidance on Expedited Programs (2014, updated 2023)',
          questionId: '_cross_node',
          triggerValues: { regulatory_pathway: flat['regulatory_pathway'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_orphan_without_natural_history',
    appliesTo: ['protocol_development', 'ind_submission', 'nda_submission', 'bla_submission'],
    check(flat) {
      const designations = strVal(flat['expedited_designations'] ?? flat['special_designations'] ?? '');
      const naturalHistory = strVal(flat['natural_history'] ?? flat['disease_natural_history']);
      if (designations.includes('orphan') && isBlank(naturalHistory)) {
        return {
          checkId: 'xn_orphan_without_natural_history',
          severity: 'warning',
          title: 'Orphan Drug Without Natural History Data',
          message: 'Orphan drug applications benefit significantly from natural history data to contextualize clinical endpoints and establish external controls. FDA reviewers frequently request this.',
          reference: 'FDA Guidance on Rare Disease Drug Development (2019); Orphan Drug Act §526',
          questionId: '_cross_node',
          triggerValues: { expedited_designations: flat['expedited_designations'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_global_trial_no_ethnic_bridging',
    appliesTo: ['protocol_development', 'ind_submission'],
    check(flat) {
      const countries = flat['countries'] ?? flat['target_countries'];
      const ethnicBridging = strVal(flat['ethnic_bridging'] ?? flat['ethnicity_factors']);
      if (Array.isArray(countries) && countries.length > 3 && isBlank(ethnicBridging)) {
        const hasAsian = countries.some((c: unknown) => {
          const s = strVal(c);
          return s.includes('japan') || s.includes('china') || s.includes('korea') || s.includes('taiwan');
        });
        if (hasAsian) {
          return {
            checkId: 'xn_global_trial_no_ethnic_bridging',
            severity: 'warning',
            title: 'Multi-Regional Trial Missing Ethnic Bridging Considerations',
            message: 'Trials including East Asian populations require consideration of ethnic factors in PK/PD and dosing. PMDA/NMPA may require bridging studies or ethnic subgroup analyses.',
            reference: 'ICH E5(R1); ICH E17; PMDA Guidance on Global Clinical Trials',
            questionId: '_cross_node',
            triggerValues: { countries },
          };
        }
      }
      return null;
    },
  },
  {
    id: 'xn_class_iii_device_no_clinical_data',
    appliesTo: ['device_pma', 'device_510k'],
    check(flat) {
      const deviceClass = strVal(flat['device_class'] ?? flat['classification']);
      const clinicalData = strVal(flat['clinical_data_available'] ?? flat['clinical_evidence']);
      if (deviceClass.includes('iii') && (isBlank(clinicalData) || clinicalData === 'no' || clinicalData === 'none')) {
        return {
          checkId: 'xn_class_iii_device_no_clinical_data',
          severity: 'critical',
          title: 'Class III Device Without Clinical Evidence',
          message: 'Class III devices require valid scientific evidence of safety and effectiveness, which typically includes clinical data from well-controlled investigations.',
          reference: '21 CFR 814.20(b)(6); FDA PMA Guidance',
          questionId: '_cross_node',
          triggerValues: { device_class: flat['device_class'], clinical_data_available: flat['clinical_data_available'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_biologic_no_immunogenicity',
    appliesTo: ['bla_submission', 'ind_submission'],
    check(flat) {
      const productType = strVal(flat['product_type'] ?? flat['molecule_type']);
      const immunogenicity = strVal(flat['immunogenicity_assessment'] ?? flat['immunogenicity_strategy']);
      const isBiologic = productType.includes('biologic') || productType.includes('antibod') ||
                         productType.includes('protein') || productType.includes('cell') ||
                         productType.includes('gene');
      if (isBiologic && isBlank(immunogenicity)) {
        return {
          checkId: 'xn_biologic_no_immunogenicity',
          severity: 'critical',
          title: 'Biologic Product Without Immunogenicity Assessment',
          message: 'All biologic products require a risk-based immunogenicity assessment strategy. FDA expects anti-drug antibody (ADA) testing and neutralizing antibody assays.',
          reference: 'FDA Immunogenicity Guidance (2019); ICH S6(R1); 21 CFR 601.2',
          questionId: '_cross_node',
          triggerValues: { product_type: flat['product_type'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_rems_without_etasu',
    appliesTo: ['nda_submission', 'bla_submission', 'labeling'],
    check(flat) {
      const hasRems = strVal(flat['rems_required'] ?? flat['rems']) === 'yes';
      const etasu = strVal(flat['etasu'] ?? flat['rems_elements']);
      if (hasRems && isBlank(etasu)) {
        return {
          checkId: 'xn_rems_without_etasu',
          severity: 'warning',
          title: 'REMS Required Without ETASU Elements Defined',
          message: 'If a REMS is required, the Elements to Assure Safe Use (ETASU) must be clearly defined. Common ETASU include prescriber certification, pharmacy certification, patient registries, and restricted distribution.',
          reference: 'FDAAA §505-1; FDA REMS Guidance (2022)',
          questionId: '_cross_node',
          triggerValues: { rems_required: flat['rems_required'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_stability_insufficient_for_shelf_life',
    appliesTo: ['stability_study', 'cmc_specification', 'nda_submission', 'bla_submission'],
    check(flat) {
      const shelfLife = numVal(flat['proposed_shelf_life'] ?? flat['shelf_life_months']);
      const dataMonths = numVal(flat['long_term_data_months'] ?? flat['stability_data_months']);
      if (shelfLife !== null && dataMonths !== null && shelfLife > dataMonths * 2) {
        return {
          checkId: 'xn_stability_insufficient_for_shelf_life',
          severity: 'critical',
          title: 'Proposed Shelf Life Exceeds Extrapolation Limits',
          message: `Proposed shelf life of ${shelfLife} months exceeds 2x the available long-term stability data (${dataMonths} months). ICH Q1E limits extrapolation to 2x the period covered by long-term data.`,
          reference: 'ICH Q1E; FDA Guidance on Stability Data (2004)',
          questionId: '_cross_node',
          triggerValues: { proposed_shelf_life: flat['proposed_shelf_life'], long_term_data_months: flat['long_term_data_months'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_high_risk_device_no_human_factors',
    appliesTo: ['device_510k', 'device_pma'],
    check(flat) {
      const riskLevel = strVal(flat['risk_level'] ?? flat['device_class']);
      const humanFactors = strVal(flat['human_factors_study'] ?? flat['hfe_study']);
      const isHighRisk = riskLevel.includes('iii') || riskLevel.includes('high') || riskLevel.includes('life-sustaining');
      if (isHighRisk && (isBlank(humanFactors) || humanFactors === 'no')) {
        return {
          checkId: 'xn_high_risk_device_no_human_factors',
          severity: 'warning',
          title: 'High-Risk Device Without Human Factors Validation',
          message: 'FDA expects human factors validation testing for high-risk and life-sustaining devices to ensure safe and effective use by intended users.',
          reference: 'FDA Human Factors Guidance (2016); IEC 62366-1',
          questionId: '_cross_node',
          triggerValues: { risk_level: flat['risk_level'], human_factors_study: flat['human_factors_study'] },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_cumulative_critical_overload',
    check(flat, state) {
      const criticalCount = state.issues.filter(i => i.severity === 'critical').length;
      if (criticalCount >= 5) {
        return {
          checkId: 'xn_cumulative_critical_overload',
          severity: 'critical',
          title: 'Cumulative Regulatory Risk: Multiple Critical Issues',
          message: `${criticalCount} critical regulatory issues have been identified across this submission. This volume of critical findings would very likely trigger an FDA Refuse-to-File or Complete Response Letter. Recommend pausing to address critical issues before proceeding.`,
          reference: '21 CFR 314.101 (Refuse-to-File); FDA Guidance on Refuse-to-File/Refuse-to-Receive',
          questionId: '_cross_node',
          triggerValues: { critical_issue_count: criticalCount },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_iso_14971_no_post_production',
    appliesTo: ['risk_management', 'device_510k', 'device_pma'],
    check(flat) {
      const rmProcess = strVal(flat['risk_management_process'] ?? flat['rm_standard']);
      const postProd = strVal(flat['post_production_monitoring'] ?? flat['post_market_surveillance']);
      if (rmProcess.includes('14971') && isBlank(postProd)) {
        return {
          checkId: 'xn_iso_14971_no_post_production',
          severity: 'warning',
          title: 'ISO 14971 Risk Management Without Post-Production Monitoring',
          message: 'ISO 14971:2019 §10 requires post-production monitoring as an integral part of risk management. The risk management process is incomplete without information collection and review during the production and post-production phases.',
          reference: 'ISO 14971:2019 §10; MDR Article 83',
          questionId: '_cross_node',
          triggerValues: { risk_management_process: flat['risk_management_process'] },
        };
      }
      return null;
    },
  },
];
