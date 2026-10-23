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
import {
  askedAt,
  contextFor,
  fieldsAskedBy,
  isBlank,
  mentions,
  numVal,
  strVal,
  type CrossNodeContext,
  type MitigationState,
} from './cross-node-context.js';

/* Re-exported so every existing caller — and the gates — are unchanged. */
export { fieldsAskedBy };
export type { CrossNodeContext, MitigationState };
import { programmeFactsFrom } from './programme-facts.js';

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

  const asked = fieldsAskedBy(definition);
  /* A question the person has not reached is not a question they declined, and
     neither is one the card never DREW. The node must be completed AND the
     field's own `visibleWhen` must have held — a mitigating field hidden by its
     gate inside a completed node was indistinguishable from one left empty, so
     a CRITICAL finding asserted the absence of something never shown
     (2026-10-13 audit, F10). The gate is evaluated with the same shared
     evaluator the engine, the validator and the card all use. */
  const asksAt = askedAt(definition);
  const completed = new Set(state.completedNodes);
  const reached = (fieldId: string) => {
    const where = asksAt.get(fieldId);
    if (!where || !completed.has(where.node)) return false;
    return where.gate ? evaluatePredicate(where.gate, flat) : true;
  };
  for (const rule of CROSS_NODE_RULES) {
    if (existingIds.has(rule.id)) continue;
    if (rule.appliesTo && !rule.appliesTo.includes(definition.category)) continue;

    const issue = rule.check(flat, state, definition, contextFor(rule, flat, asked, reached));
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


/* ─── Cross-node rule definitions ────────────────────────────────────── */

interface CrossNodeRule {
  id: string;
  appliesTo?: string[];
  /** The answers that TRIGGER the finding. Declared so a gate can hold they are asked. */
  triggeredBy?: string[];
  /** The answers whose absence the finding asserts. Same reason. */
  mitigatedBy?: string[];
  /**
   * Mitigating fields where a NEGATIVE answer is an answer, not a refusal.
   *
   * "Did you run a clinical study?" — no, is the finding. "Is clinical data
   * REQUIRED to address the differences?" — no, is the normal and usually
   * correct 510(k) answer, and treating it as a refusal fired a CRITICAL
   * finding that nothing the sponsor could do would silence, because
   * answering no also skips the node holding the only other mitigating field
   * (2026-10-13 audit, F11). The difference is in the question, so the rule
   * names the fields rather than the engine guessing.
   */
  negativeIsAnswer?: string[];
  check: (
    flat: Record<string, unknown>,
    state: FlowState,
    definition: FlowDefinition,
    ctx: CrossNodeContext,
  ) => DetectedIssue | null;
}

/**
 * What each rule declares it needs, for the gate that holds a rule is either
 * reachable from a question some flow asks or named as one AnA does not ask
 * yet (`__tests__/cross-node-rules-can-fire.test.ts`). The checks themselves
 * are not exposed — only what they read.
 */
export function crossNodeRuleFields(): Array<{
  id: string;
  appliesTo?: string[];
  triggeredBy?: string[];
  mitigatedBy?: string[];
}> {
  return CROSS_NODE_RULES.map(r => ({
    id: r.id,
    appliesTo: r.appliesTo,
    triggeredBy: r.triggeredBy,
    mitigatedBy: r.mitigatedBy,
  }));
}



const CROSS_NODE_RULES: CrossNodeRule[] = [
  /* The two answers about the US cannot both be true. The agencies are read
     through the same fact reader every other rule uses, so this agrees with
     the routes the person was offered rather than re-reading the agency
     answers in a second vocabulary. */
  {
    id: 'xn_no_us_filing_while_naming_fda',
    appliesTo: ['project_setup'],
    /* Two answers that cannot both be true. It asserts no ABSENCE — both
       halves are things the person stated — so it declares no mitigation. */
    triggeredBy: ['device_class', 'primary_regulatory_agency', 'additional_agencies'],
    check(flat) {
      if (strVal(flat['device_class']) !== 'no_us_filing') return null;
      const regions = programmeFactsFrom(flat).regions ?? [];
      if (!regions.includes('US')) return null;
      return {
        checkId: 'xn_no_us_filing_while_naming_fda',
        severity: 'warning',
        title: 'You have named FDA and said no US filing is planned',
        message:
          'The classification question records no US filing, and FDA is among the agencies for this project. One of ' +
          'the two is out of date: either the US is in scope and the device has a class — AnA can work the ' +
          'classification regulation through with you — or it is not, and FDA should come off the list so she stops ' +
          'configuring the Module 1 backbone, the validation profile and the gateway for it.',
        reference: '21 CFR 860 (classification); 21 CFR 807, 814 (premarket submission)',
        questionId: '_cross_node',
        triggerValues: {
          device_class: flat['device_class'],
          primary_regulatory_agency: flat['primary_regulatory_agency'],
          additional_agencies: flat['additional_agencies'],
        },
      };
    },
  },
  {
    id: 'xn_pediatric_without_safety_monitoring',
    appliesTo: ['protocol_development', 'ind_submission'],
    /* `includes_vulnerable_populations` is protocol_development's own
       question, a multi_select offering 'pediatric'. The rule read
       `target_population`, which no applicable flow asks, so a CRITICAL
       paediatric-safety finding could never fire (2026-10-13 audit, F2). */
    triggeredBy: ['target_population', 'study_population', 'includes_vulnerable_populations'],
    /* `data_safety_monitoring` is the IND interview's own question, and it
       offers 'not_defined' — a sponsor saying there is no monitoring body,
       which is an answer and not a mitigation. */
    /* `dsmb_required` and its three companions are protocol_development's own
       DSMB node; `data_safety_monitoring` is the IND interview's question, and
       it offers 'not_defined' — a sponsor saying there is no monitoring body,
       which is an answer and not a mitigation.
       KNOWN VALUE GAP: `ind_submission`'s `study_population` offers only
       healthy_volunteers | patients | both, so the paediatric trigger cannot
       come from there. The rule is live in protocol_development, and in the
       IND only if that question gains a paediatric option (2026-10-13 audit,
       F2/F21; task #19). */
    mitigatedBy: [
      'has_dsmb',
      'dsmb',
      'data_monitoring',
      'data_safety_monitoring',
      'safety_monitoring_plan_detail',
      'dsmb_required',
      'dsmb_charter_available',
      'dsmb_membership',
    ],
    check(flat, _state, _definition, ctx) {
      const paediatric =
        mentions(flat['includes_vulnerable_populations'], 'pediatric', 'paediatric') ||
        mentions(flat['target_population'] ?? flat['study_population'], 'pediatric', 'paediatric', 'children');
      if (paediatric && ctx.mitigationAbsent()) {
        return {
          checkId: 'xn_pediatric_without_safety_monitoring',
          severity: 'critical',
          title: 'Pediatric Study Without Independent Safety Monitoring',
          message: 'Pediatric populations require enhanced safety monitoring. FDA and EMA guidance on data monitoring committees identifies studies in children as a setting where an independent Data Safety Monitoring Board (DSMB) should be considered, weighed alongside trial risk, endpoints and duration.',
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
    triggeredBy: ['study_phase', 'trial_phase', 'sample_size', 'target_enrollment'],
    mitigatedBy: ['interim_analysis', 'planned_interim'],
    check(flat, _state, _definition, ctx) {
      const phase = strVal(flat['study_phase'] ?? flat['trial_phase']);
      const interim = strVal(flat['interim_analysis'] ?? flat['planned_interim']);
      const enrollment = numVal(flat['sample_size'] ?? flat['target_enrollment']);
      if (phase.includes('3') && enrollment !== null && enrollment > 200 && !interim.includes('yes') && ctx.mitigationAbsent()) {
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
    triggeredBy: ['therapeutic_area', 'indication'],
    mitigatedBy: ['biomarker_strategy', 'companion_diagnostic', 'biomarker_enrichment'],
    check(flat, _state, _definition, ctx) {
      const area = strVal(flat['therapeutic_area'] ?? flat['indication']);
      const biomarker = strVal(flat['biomarker_strategy'] ?? flat['companion_diagnostic']);
      if (area.includes('oncology') && isBlank(biomarker) && ctx.mitigationAbsent()) {
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
    /* `accelerated_approval_basis` is the BLA interview's own question — the
       surrogate endpoint the accelerated claim rests on. The rule read two ids
       neither applicable flow asks, so a CRITICAL finding about the
       confirmatory trial FDORA §3210 requires could never fire (F1). */
    triggeredBy: ['regulatory_pathway', 'approval_pathway', 'accelerated_approval_basis'],
    /* The BLA interview asks both of the last two in its post-marketing plan. */
    mitigatedBy: [
      'confirmatory_trial',
      'post_marketing_commitment',
      'confirmatory_study_needed',
      'confirmatory_study_protocol',
    ],
    check(flat, _state, _definition, ctx) {
      /* Either the pathway answer names it (a multi_select in the one flow
         that asks it) or the BLA stated the basis the accelerated claim rests
         on. Both are the sponsor saying they are on that route. */
      const accelerated =
        mentions(flat['regulatory_pathway'] ?? flat['approval_pathway'], 'accelerated') ||
        strVal(flat['accelerated_approval_basis']) !== '';
      if (accelerated && ctx.mitigationAbsent()) {
        return {
          checkId: 'xn_accelerated_approval_no_confirmatory',
          severity: 'critical',
          title: 'Accelerated Approval Without Confirmatory Trial Plan',
          message: 'Accelerated approval requires a post-marketing confirmatory trial per FDORA §3210. FDA has increased enforcement of confirmatory study requirements and can initiate withdrawal proceedings if not met.',
          reference: 'FDORA §3210; 21 CFR 314.530 (NDAs) / 21 CFR 601.43 (BLAs); FDA Guidance \'Expedited Programs for Serious Conditions — Drugs and Biologics\' (2014); FDA draft guidance on accelerated approval of drugs and biologics (2024)',
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
    triggeredBy: ['expedited_designations', 'special_designations'],
    mitigatedBy: ['natural_history', 'disease_natural_history'],
    check(flat, _state, _definition, ctx) {
      const designations = strVal(flat['expedited_designations'] ?? flat['special_designations'] ?? '');
      if (designations.includes('orphan') && ctx.mitigationAbsent()) {
        return {
          checkId: 'xn_orphan_without_natural_history',
          severity: 'warning',
          title: 'Orphan Drug Without Natural History Data',
          message: 'Orphan drug applications benefit significantly from natural history data to contextualize clinical endpoints and establish external controls. FDA reviewers frequently request this.',
          reference: 'FDA Guidance: Rare Diseases: Natural History Studies for Drug Development (2019); FD&C Act §526 (orphan designation, added by the Orphan Drug Act)',
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
    triggeredBy: ['countries', 'target_countries'],
    mitigatedBy: ['ethnic_bridging', 'ethnicity_factors'],
    check(flat, _state, _definition, ctx) {
      const countries = flat['countries'] ?? flat['target_countries'];
      const ethnicBridging = strVal(flat['ethnic_bridging'] ?? flat['ethnicity_factors']);
      if (Array.isArray(countries) && countries.length > 3 && isBlank(ethnicBridging) && ctx.mitigationAbsent()) {
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
    triggeredBy: ['device_class', 'classification'],
    /* The last four are what the PMA and 510(k) interviews actually ask, in
       their own words. The rule was written against two ids neither of them
       has, so it fired at every Class III programme and never read the answer
       the sponsor had given (2026-10-13). */
    mitigatedBy: [
      'clinical_data_available',
      'clinical_evidence',
      'clinical_study_conducted',
      'clinical_no_study_justification',
      'clinical_data_required',
      'clinical_study_type',
    ],
    /* "Clinical Data Required to Address Differences" — no, is the normal
       510(k) answer: performance and bench testing establish substantial
       equivalence. It is also the answer that skips the clinical-evidence
       node, so treating it as a refusal left a CRITICAL finding nothing could
       silence. */
    negativeIsAnswer: ['clinical_data_required'],
    check(flat, _state, definition, ctx) {
      const deviceClass = strVal(flat['device_class'] ?? flat['classification']);
      if (deviceClass.includes('iii') && ctx.mitigationAbsent()) {
        return {
          checkId: 'xn_class_iii_device_no_clinical_data',
          severity: 'critical',
          title: 'Class III Device Without Clinical Evidence',
          message:
            definition.category === 'device_510k'
              ? 'A Class III device is a premarket approval route unless it is a preamendments type FDA has not yet called for PMA, so a 510(k) for one needs the basis for that first — and a Class III device needs valid scientific evidence of safety and effectiveness either way.'
              : 'Class III devices require valid scientific evidence of safety and effectiveness, which typically includes clinical data from well-controlled investigations.',
          /* The 814 citation is the PMA's. A 510(k) interview reaching this
             finding is being told something about its ROUTE first, so it is
             cited to the statute that decides the route (2026-10-13 audit). */
          reference:
            definition.category === 'device_510k'
              ? 'FD&C Act 515(b); 21 CFR 807.81(b); 21 CFR 814.20(b)(6)'
              : '21 CFR 814.20(b)(6); FDA PMA Guidance',
          questionId: '_cross_node',
          /* What the record says it judged: the class, and the clinical answer
             each device interview actually gives. */
          triggerValues: {
            device_class: flat['device_class'],
            clinical_study_conducted: flat['clinical_study_conducted'],
            clinical_data_required: flat['clinical_data_required'],
          },
        };
      }
      return null;
    },
  },
  {
    id: 'xn_biologic_no_immunogenicity',
    appliesTo: ['bla_submission', 'ind_submission'],
    triggeredBy: ['product_type', 'molecule_type'],
    /* `immunogenicity_assessment_planned` (IND) and
       `immunogenicity_risk_factors` (BLA) are the questions those interviews
       ask. The risk factors ARE the assessment FDA's 2019 guidance asks for —
       it is risk-based — so a sponsor who has enumerated them has answered. */
    mitigatedBy: [
      'immunogenicity_assessment',
      'immunogenicity_strategy',
      'immunogenicity_assessment_planned',
      'immunogenicity_risk_factors',
    ],
    check(flat, _state, _definition, ctx) {
      const productType = strVal(flat['product_type'] ?? flat['molecule_type']);
      const isBiologic = productType.includes('biologic') || productType.includes('antibod') ||
                         productType.includes('protein') || productType.includes('cell') ||
                         productType.includes('gene');
      if (isBiologic && ctx.mitigationAbsent()) {
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
    triggeredBy: ['rems_required', 'rems'],
    mitigatedBy: ['etasu', 'rems_elements'],
    check(flat, _state, _definition, ctx) {
      const hasRems = strVal(flat['rems_required'] ?? flat['rems']) === 'yes';
      if (hasRems && ctx.mitigationAbsent()) {
        return {
          checkId: 'xn_rems_without_etasu',
          severity: 'warning',
          title: 'REMS Required Without Its Elements Defined',
          message: 'If a REMS is required, confirm its elements are defined. A REMS may consist of a Medication Guide, a patient package insert and/or a communication plan; Elements to Assure Safe Use (ETASU) are required only where FDA determines they are necessary (FD&C Act 505-1(f)), and if included they must be clearly defined. Common ETASU include prescriber certification, pharmacy certification, patient registries, and restricted distribution.',
          reference: 'FD&C Act §505-1 (21 U.S.C. 355-1), added by FDAAA; FDA REMS Guidance (2022)',
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
    /* Both numbers are facts the finding RESTS on rather than facts whose
       absence it asserts: with either missing the arithmetic has no answer, so
       the rule already stays silent. */
    triggeredBy: ['proposed_shelf_life', 'shelf_life_months', 'long_term_data_months', 'stability_data_months'],
    check(flat) {
      const shelfLife = numVal(flat['proposed_shelf_life'] ?? flat['shelf_life_months']);
      const dataMonths = numVal(flat['long_term_data_months'] ?? flat['stability_data_months']);
      /* ICH Q1E's most favourable case: up to twice the long-term period, and
         no more than 12 months beyond it. Anything above that is past the
         limit in every case; less favourable data allow less still. */
      if (shelfLife !== null && dataMonths !== null && shelfLife > Math.min(dataMonths * 2, dataMonths + 12)) {
        return {
          checkId: 'xn_stability_insufficient_for_shelf_life',
          severity: 'critical',
          title: 'Proposed Shelf Life Exceeds Extrapolation Limits',
          message: `Proposed shelf life of ${shelfLife} months exceeds the most ICH Q1E allows from ${dataMonths} months of long-term stability data (${Math.min(dataMonths * 2, dataMonths + 12)} months). ICH Q1E allows extrapolation to at most twice the period covered by long-term data, and no more than 12 months beyond it, and only where the data support it. Less favourable cases (for example, refrigerated storage, or significant change at accelerated conditions) allow less.`,
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
    triggeredBy: ['risk_level', 'device_class'],
    mitigatedBy: ['human_factors_study', 'hfe_study'],
    check(flat, _state, _definition, ctx) {
      const riskLevel = strVal(flat['risk_level'] ?? flat['device_class']);
      const humanFactors = strVal(flat['human_factors_study'] ?? flat['hfe_study']);
      const isHighRisk = riskLevel.includes('iii') || riskLevel.includes('high') || riskLevel.includes('life-sustaining');
      const declined = humanFactors === 'no';
      if (isHighRisk && (declined || ctx.mitigationAbsent())) {
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
    triggeredBy: ['risk_management_process', 'rm_standard'],
    mitigatedBy: ['post_production_monitoring', 'post_market_surveillance'],
    check(flat, _state, _definition, ctx) {
      const rmProcess = strVal(flat['risk_management_process'] ?? flat['rm_standard']);
      if (rmProcess.includes('14971') && ctx.mitigationAbsent()) {
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
