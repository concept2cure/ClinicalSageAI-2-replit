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
  /* A question the person has not reached is not a question they declined. The
     node that asks it must be among the completed ones. */
  const nodeOf = nodeOfField(definition);
  const completed = new Set(state.completedNodes);
  const reached = (fieldId: string) => completed.has(nodeOf.get(fieldId) ?? '');
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

/**
 * What a cross-node rule needs the FLOW to have asked.
 *
 * ── The defect this exists for ────────────────────────────────────────
 * Every rule here has the shape "the programme says X, and the mitigating fact
 * is blank". `isBlank(undefined)` is TRUE, so a rule whose mitigating field no
 * flow ASKS fired on the trigger alone — telling a sponsor they have no
 * biomarker strategy, no confirmatory trial plan, no clinical evidence, no
 * immunogenicity assessment, because AnA never asked. A sweep on 2026-10-13
 * found thirty-five field ids read here that no flow asks, across eleven of the
 * twelve rules.
 *
 * One of them, `xn_class_iii_device_no_clinical_data`, is severity CRITICAL and
 * fired at every Class III device programme. The review had already caught this
 * shape once — "that check landed on a sponsor who had been made to invent the
 * data" — and this is the same shape eleven more times.
 *
 * So a rule now DECLARES the fields it triggers on and the fields whose absence
 * it asserts, and the mitigation state answers only where the flow asked:
 *
 *   present   one of them was answered        → the rule must not fire
 *   blank     asked, REACHED, and left empty  → the rule MAY fire
 *   pending   asked, and the person has not reached that question yet → the
 *             rule MUST NOT fire; telling someone they have no immunogenicity
 *             assessment the moment they say "biologic", three nodes before
 *             being asked, is the same insult in a smaller form
 *   unasked   this flow asks none of them     → the rule MUST NOT fire, because
 *             nothing was ever established about it
 *
 * `unasked` is not a silence to be fixed by firing anyway: it is a question AnA
 * does not ask yet, and `__tests__/cross-node-rules-can-fire.test.ts` keeps the
 * written list of them, so the gap is visible to us instead of asserted at a
 * sponsor.
 */
export type MitigationState = 'present' | 'blank' | 'pending' | 'unasked';

export interface CrossNodeContext {
  /** Whether the running flow asks this field at all. */
  asks: (fieldId: string) => boolean;
  /** True only where the flow ASKED and the answer is empty. */
  mitigationAbsent: () => boolean;
  /** The same decision, reported, for a rule that wants to name what it saw. */
  mitigation: () => MitigationState;
}

interface CrossNodeRule {
  id: string;
  appliesTo?: string[];
  /** The answers that TRIGGER the finding. Declared so a gate can hold they are asked. */
  triggeredBy?: string[];
  /** The answers whose absence the finding asserts. Same reason. */
  mitigatedBy?: string[];
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

/** Every field id a flow definition asks, for the asked/blank/unasked decision. */
export function fieldsAskedBy(definition: FlowDefinition): Set<string> {
  const out = new Set<string>();
  for (const node of definition.nodes) for (const field of node.fields) out.add(field.id);
  return out;
}

/**
 * An answer that says the mitigating thing was NOT done. It is an answer, so
 * it is not an absence — and it is not a mitigation either, so the finding
 * stands. `not_defined` is here because the IND interview's safety-monitoring
 * question offers it by name, which is a sponsor telling AnA there is no
 * monitoring body rather than leaving the question alone.
 */
const REFUSALS = new Set(['no', 'none', 'false', 'not_defined', 'not_applicable', 'na']);
const isRefusal = (value: unknown): boolean =>
  /* A yes_no answer reaches here as a real boolean from the card and as a
     string from the tool surface (shared/ana/question-predicate.ts says the
     same of its own coercion), and `false` is not a blank. */
  value === false || REFUSALS.has(strVal(value));

/** Which node asks each field, so "have they been asked yet" has an answer. */
function nodeOfField(definition: FlowDefinition): Map<string, string> {
  const out = new Map<string, string>();
  for (const node of definition.nodes) for (const field of node.fields) out.set(field.id, node.id);
  return out;
}

function contextFor(
  rule: CrossNodeRule,
  flat: Record<string, unknown>,
  asked: Set<string>,
  reached: (fieldId: string) => boolean,
): CrossNodeContext {
  const mitigation = (): MitigationState => {
    const ids = (rule.mitigatedBy ?? []).filter(id => asked.has(id));
    if (ids.length === 0) return 'unasked';
    if (ids.some(id => !isBlank(flat[id]) && !isRefusal(flat[id]))) return 'present';
    return ids.some(reached) ? 'blank' : 'pending';
  };
  return { asks: id => asked.has(id), mitigation, mitigationAbsent: () => mitigation() === 'blank' };
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
    triggeredBy: ['target_population', 'study_population'],
    /* `data_safety_monitoring` is the IND interview's own question, and it
       offers 'not_defined' — a sponsor saying there is no monitoring body,
       which is an answer and not a mitigation. */
    mitigatedBy: ['has_dsmb', 'dsmb', 'data_monitoring', 'data_safety_monitoring', 'safety_monitoring_plan_detail'],
    check(flat, _state, _definition, ctx) {
      const pop = strVal(flat['target_population'] ?? flat['study_population']);
      const paediatric = pop.includes('pediatric') || pop.includes('paediatric') || pop.includes('children');
      if (paediatric && ctx.mitigationAbsent()) {
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
    triggeredBy: ['regulatory_pathway', 'approval_pathway'],
    /* The BLA interview asks both of the last two in its post-marketing plan. */
    mitigatedBy: [
      'confirmatory_trial',
      'post_marketing_commitment',
      'confirmatory_study_needed',
      'confirmatory_study_protocol',
    ],
    check(flat, _state, _definition, ctx) {
      const pathway = strVal(flat['regulatory_pathway'] ?? flat['approval_pathway']);
      if (pathway.includes('accelerated') && ctx.mitigationAbsent()) {
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
    check(flat, _state, _definition, ctx) {
      const deviceClass = strVal(flat['device_class'] ?? flat['classification']);
      if (deviceClass.includes('iii') && ctx.mitigationAbsent()) {
        return {
          checkId: 'xn_class_iii_device_no_clinical_data',
          severity: 'critical',
          title: 'Class III Device Without Clinical Evidence',
          message: 'Class III devices require valid scientific evidence of safety and effectiveness, which typically includes clinical data from well-controlled investigations.',
          reference: '21 CFR 814.20(b)(6); FDA PMA Guidance',
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
    /* Both numbers are facts the finding RESTS on rather than facts whose
       absence it asserts: with either missing the arithmetic has no answer, so
       the rule already stays silent. */
    triggeredBy: ['proposed_shelf_life', 'shelf_life_months', 'long_term_data_months', 'stability_data_months'],
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
