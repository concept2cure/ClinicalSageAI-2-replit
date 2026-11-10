/**
 * The cross-node rules: compound regulatory risks that only emerge from the
 * combination of answers across several questions.
 *
 * Split out of issue-detector.ts on 2026-11-02 (S4) when that file crossed its
 * 500-line limit, as RULE 6 asks ("split, don't add"): the table moved, nothing
 * was added beside it. issue-detector.ts still runs the rules and re-exports
 * what it exported, so engine.ts and every gate are unchanged.
 *
 * `evaluatePredicate` is imported from the shared evaluator directly rather
 * than through engine.ts, which re-exports the same function: engine.ts imports
 * issue-detector.ts, so going through it here would add an import cycle.
 *
 * @module server/services/ana/intelligence-questions/cross-node-rules
 */

import type { DetectedIssue, FlowState, FlowDefinition } from './types.js';
import { evaluatePredicate } from '../../../../shared/ana/question-predicate.js';
import {
  EAST_ASIAN_COUNTRY_WORDS,
  naturalHistoryBearsOnDesign,
  statesOrphanDesignation,
  mentions,
  numVal,
  strVal,
  type CrossNodeContext,
} from './cross-node-context.js';
import { programmeFactsFrom } from './programme-facts.js';
import { STABILITY_SHELF_LIFE_RULE } from './cross-node-rules-stability.js';
import { USER_FEE_EXEMPTION_RULE } from './cross-node-rules-user-fee.js';

/* ─── Cross-node rule definitions ────────────────────────────────────── */

export interface CrossNodeRule {
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



export const CROSS_NODE_RULES: CrossNodeRule[] = [
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
    /* 2026-11-02 (S4): `phase` and `planned_enrollment` are the flow's own
       questions. The old ids (study_phase, trial_phase, sample_size,
       target_enrollment) were never fields — `sample_size` is a node id — so the
       rule could not trigger. */
    triggeredBy: ['phase', 'planned_enrollment'],
    /* `interim_analysis` is asked in stats_approach for non-adaptive
       confirmatory designs; `interim_analysis_planned` is the adaptive branch's
       own. Their gates are disjoint. No negativeIsAnswer: 'none', 'not_defined'
       and a false yes_no ARE the finding. */
    mitigatedBy: ['interim_analysis', 'interim_analysis_planned'],
    check(flat, _state, _definition, ctx) {
      const confirmatory = ['phase_2b_3', 'phase_3', 'phase_3b_4'].includes(strVal(flat['phase']));
      const enrollment = numVal(flat['planned_enrollment']);
      /* 200 is a heuristic for "large", never a regulatory figure. */
      if (!confirmatory || enrollment === null || enrollment <= 200 || !ctx.mitigationAbsent()) return null;
      return {
        checkId: 'xn_phase3_no_interim',
        severity: 'warning',
        title: 'Large confirmatory trial with no interim analysis',
        message:
          `This confirmatory protocol plans ${enrollment} participants and no interim analysis, so it runs to completion ` +
          'whatever the accumulating data show. ICH E9 Section 4.5 does not require an interim analysis; it asks that ' +
          'any that is planned be described in the protocol in advance. Consider a futility or efficacy interim overseen ' +
          'by an independent DMC, or record in the protocol why a fixed design is preferred.',
        reference:
          'ICH E9 (1998) Section 4.5; FDA Guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019); FDA Guidance: Establishment and Operation of Clinical Trial Data Monitoring Committees (2006)',
        questionId: '_cross_node',
        triggerValues: {
          phase: flat['phase'],
          planned_enrollment: flat['planned_enrollment'],
          interim_analysis: flat['interim_analysis'],
          interim_analysis_planned: flat['interim_analysis_planned'],
        },
      };
    },
  },
  {
    id: 'xn_oncology_no_biomarker_strategy',
    appliesTo: ['protocol_development', 'ind_submission', 'nda_submission'],
    /* 2026-11-02 (S4): `is_oncology` as each interview asks it. In the IND
       neither therapeutic_area nor indication is asked, so the rule could not
       trigger there; elsewhere a haematologic malignancy or a CAR-T filed under
       another therapeutic area never contained 'oncology'. */
    triggeredBy: ['therapeutic_area', 'indication', 'is_oncology'],
    /* The protocol and the IND ask biomarker_strategy; the NDA asks how the
       indicated population is identified. `biomarker_enrichment` and
       `companion_diagnostic` were no flow's question. companion_diagnostic_required
       is deliberately not one: 'any reached' would read it blank before
       biomarker_strategy is even shown. */
    mitigatedBy: ['biomarker_strategy', 'companion_diagnostic_position'],
    /* No negativeIsAnswer: 'not_defined' must stay a refusal, or the finding can never fire. */
    check(flat, _state, definition, ctx) {
      const oncology =
        strVal(flat['therapeutic_area'] ?? flat['indication']).includes('oncology') ||
        evaluatePredicate({ field: 'is_oncology', operator: 'eq', value: true }, flat);
      if (!oncology || !ctx.mitigationAbsent()) return null;
      const atFiling = definition.category === 'nda_submission';
      return {
        checkId: 'xn_oncology_no_biomarker_strategy',
        severity: 'warning',
        title: atFiling
          ? 'Oncology application: how the indicated population is identified is not determined'
          : 'Oncology programme: patient-selection strategy not decided',
        message: atFiling
          ? 'The application does not yet say whether the indication is biomarker-defined. That decides whether the label must name an FDA-approved or cleared test, which device route that test takes, and whether it must be approved contemporaneously with this NDA. FDA generally will not approve a drug whose labeling requires a companion diagnostic that is not itself approved or cleared, save for the exceptions its guidance describes.'
          : 'This oncology programme has not decided how its population is defined with respect to a predictive biomarker: selected, stratified or unselected. That decision sets whether the assay that selects or assigns patients is an investigational device study under 21 CFR 812 (such an assay is generally not exempt under 812.2(c)(3), and a significant-risk study needs an IDE), whether a companion diagnostic must be co-developed, and what population the label can carry. FDA does not require biomarker selection; an unselected population is a position to state and justify.',
        reference: atFiling
          ? 'FDA Guidance: In Vitro Companion Diagnostic Devices (2014); 21 CFR Part 814; FDA Guidance: Enrichment Strategies for Clinical Trials to Support Determination of Effectiveness of Human Drugs and Biological Products (2019)'
          : 'FDA Guidance: Enrichment Strategies for Clinical Trials to Support Determination of Effectiveness of Human Drugs and Biological Products (2019); FDA Guidance: In Vitro Companion Diagnostic Devices (2014); 21 CFR 812.2(c)(3), 812.3(m), 812.20',
        questionId: '_cross_node',
        triggerValues: {
          therapeutic_area: flat['therapeutic_area'],
          is_oncology: flat['is_oncology'],
          biomarker_strategy: flat['biomarker_strategy'],
          companion_diagnostic_position: flat['companion_diagnostic_position'],
        },
      };
    },
  },
  {
    id: 'xn_accelerated_approval_no_confirmatory',
    appliesTo: ['nda_submission', 'bla_submission'],
    /* 2026-11-02 (S4): both interviews ask `accelerated_pathway` (a
       multi_select offering 'accelerated_approval') on their first node, and
       the BLA also asks the basis of the accelerated claim. The rule read
       `regulatory_pathway` / `approval_pathway`, which neither applicable flow
       asks, so in the NDA it could never trigger. */
    triggeredBy: ['accelerated_pathway', 'accelerated_approval_basis'],
    /* NDA: confirmatory_study_planned / _design (pmc_pme). BLA:
       confirmatory_study_needed / _protocol (post_marketing_plan). A "no" is the
       finding, never an answer, so none is in negativeIsAnswer.
       This rule REPLACES the node checks `accelerated_approval_no_confirmatory`
       (NDA pmc_pme) and `accelerated_no_confirmatory` (BLA post_marketing_plan),
       deleted 2026-11-02: as field predicates they could not test the pathway,
       so each fired a CRITICAL at every traditional-approval programme that
       answered no. */
    mitigatedBy: [
      'confirmatory_study_planned',
      'confirmatory_study_design',
      'confirmatory_study_needed',
      'confirmatory_study_protocol',
    ],
    check(flat, _state, _definition, ctx) {
      const accelerated =
        mentions(flat['accelerated_pathway'], 'accelerated_approval') || strVal(flat['accelerated_approval_basis']) !== '';
      if (!accelerated || !ctx.mitigationAbsent()) return null;
      return {
        checkId: 'xn_accelerated_approval_no_confirmatory',
        severity: 'critical',
        title: 'Accelerated Approval Without Confirmatory Trial Plan',
        message:
          'This application seeks accelerated approval, and the interview records no planned confirmatory trial: the ' +
          'question was answered no or left unanswered. Accelerated approval is subject to the requirement to study the ' +
          'product further, with due diligence, to verify and describe its clinical benefit (21 CFR 314.510 for NDAs; ' +
          '21 CFR 601.41 for BLAs; FD&C Act 506(c)). Since FDORA (2022), FDA may require the confirmatory trial to be ' +
          'underway before approval, and may withdraw approval through expedited procedures if the trial is not ' +
          'conducted with due diligence or does not verify clinical benefit.',
        reference:
          "21 CFR 314.510 (NDAs) / 21 CFR 601.41 (BLAs); FD&C Act 506(c), as amended by FDORA (Consolidated Appropriations Act, 2023, Div. FF) §3210; withdrawal: 21 CFR 314.530 / 21 CFR 601.43; FDA Guidance 'Expedited Programs for Serious Conditions — Drugs and Biologics' (May 2014)",
        questionId: '_cross_node',
        triggerValues: {
          accelerated_pathway: flat['accelerated_pathway'],
          accelerated_approval_basis: flat['accelerated_approval_basis'],
        },
      };
    },
  },
  {
    id: 'xn_orphan_without_natural_history',
    appliesTo: ['protocol_development', 'ind_submission', 'nda_submission', 'bla_submission'],
    /* 2026-11-02 (S4): the designation as each interview asks it. The rule
       triggered on `expedited_designations` / `special_designations`, which
       none of these four flows asks, and its mitigation was asked by none
       either: dead on both sides in every flow it named. Then (S4, #7) the
       designation's one question per regulator; the protocol alone asks the
       EU one. */
    triggeredBy: ['orphan_designation', 'eu_orphan_designation'],
    mitigatedBy: ['natural_history'],
    /* No negativeIsAnswer: 'none' IS the finding. */
    check(flat, _state, definition, ctx) {
      if (!statesOrphanDesignation(flat) || !naturalHistoryBearsOnDesign(flat, definition.category)) return null;
      if (!ctx.mitigationAbsent()) return null;
      return {
        checkId: 'xn_orphan_without_natural_history',
        severity: 'warning',
        title: 'Orphan Programme Without Natural-History Data',
        message:
          'This orphan programme states no natural-history data for the disease. In a rare disease, the characterised ' +
          'course of the untreated disease is what endpoint selection, assessment timing and any single-arm or external ' +
          'comparison are judged against. Without it, those choices rest on assumption. Name the source (a prospective ' +
          'study, a registry or retrospective data, or published literature) or plan one.',
        reference:
          'FDA draft guidance: Rare Diseases: Natural History Studies for Drug Development (March 2019); ICH E10 (2000) §2.5; 21 CFR 314.126(b)(2)(v); FD&C Act §526 (21 USC 360bb); for an EU orphan designation, Regulation (EC) No 141/2000',
        questionId: '_cross_node',
        triggerValues: {
          orphan_designation: flat['orphan_designation'],
          eu_orphan_designation: flat['eu_orphan_designation'],
          natural_history: flat['natural_history'],
        },
      };
    },
  },
  {
    id: 'xn_global_trial_no_ethnic_bridging',
    /* 2026-11-02 (S4): the IND interview asks no enrolment geography, so the
       trigger was absent there and the pair is gone. The multi-regional design
       is asked in protocol_development. */
    appliesTo: ['protocol_development'],
    triggeredBy: ['countries'],
    mitigatedBy: ['ethnicity_factors'],
    /* No negativeIsAnswer: 'not_defined' must stay a refusal. Every other
       listed position, and an own position, is an answer. */
    check(flat, _state, _definition, ctx) {
      /* `countries` is free text; mentions() reads a string or an array. The
         old check required an array of more than three entries, which free text
         never is, so the rule could not fire. No count now: the question is
         asked wherever an East Asian country is named, so its refusal is
         reported on exactly that condition — and a single-region trial relying
         on foreign data is the E5 bridging case itself. */
      if (!mentions(flat['countries'], ...EAST_ASIAN_COUNTRY_WORDS) || !ctx.mitigationAbsent()) return null;
      return {
        checkId: 'xn_global_trial_no_ethnic_bridging',
        severity: 'warning',
        title: 'East Asian Enrolment Without an Ethnic-Factors Position',
        message:
          'This trial enrols in East Asian countries, and the interview holds no position on ethnic factors in exposure ' +
          "and dosing. Under ICH E5(R1), whether bridging or regional data are needed is judged from the medicine's " +
          'sensitivity to ethnic factors and from how far the regions differ. The regulator in that region may ask for ' +
          'regional data or a bridging study.',
        reference:
          'ICH E5(R1) Ethnic Factors in the Acceptability of Foreign Clinical Data (1998); ICH E17 General Principles for Planning and Design of Multi-Regional Clinical Trials (2017)',
        questionId: '_cross_node',
        triggerValues: { countries: flat['countries'] },
      };
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
    /* 2026-11-02 (S4): the BLA asks the product's modality as `product_class`
       (node app_type, on both routes) and asks neither product_type nor
       molecule_type, so in the BLA this rule could never trigger. */
    triggeredBy: ['product_type', 'molecule_type', 'product_class'],
    /* IND: immunogenicity_assessment_planned. BLA 351(a): ada_assay_strategy
       (required) and immunogenicity_risk_factors. BLA 351(k):
       immunogenicity_comparison (required) — the immunogenicity element of
       42 USC 262(k)(2)(A)(i)(I)(cc).
       Removed: `immunogenicity_assessment`, a NODE id, which never reaches the
       flattened answers, and `immunogenicity_strategy`, asked nowhere. The risk
       factors are not the BLA's only mitigation: they are optional and offer no
       'none', so an empty list would fire a CRITICAL at a sponsor who answered
       the required ADA strategy. */
    mitigatedBy: [
      'immunogenicity_assessment_planned',
      'immunogenicity_risk_factors',
      'ada_assay_strategy',
      'immunogenicity_comparison',
    ],
    check(flat, _state, definition, ctx) {
      const productType = strVal(flat['product_type'] ?? flat['molecule_type'] ?? flat['product_class']);
      /* Codes with no class word in them: 'adc' and 'biosimilar' (exact), and
         'enzyme_replacement' (a therapeutic protein). 'vaccine',
         'blood_product' and '__other__' stay silent on purpose. */
      const isBiologic =
        ['biologic', 'antibod', 'protein', 'cell', 'gene', 'enzyme'].some(w => productType.includes(w)) ||
        productType === 'adc' ||
        productType === 'biosimilar';
      if (!isBiologic || !ctx.mitigationAbsent()) return null;
      const biosimilar = definition.category === 'bla_submission' && flat['bla_pathway'] === '351k_biosimilar';
      const ind = definition.category === 'ind_submission';
      return {
        checkId: 'xn_biologic_no_immunogenicity',
        severity: 'critical',
        title: 'Biologic Product Without Immunogenicity Assessment',
        message: biosimilar
          ? "A biosimilar application's clinical data include an assessment of immunogenicity, unless FDA determines it " +
            'unnecessary (42 USC 262(k)(2)(A)(i)(I)(cc) and (k)(2)(A)(ii)). This is generally a comparative assessment of ' +
            'ADA and neutralizing antibody incidence, and their impact, against the reference product. None is recorded.'
          : 'This product type calls for an immunogenicity assessment, and none is recorded. For a therapeutic protein, ' +
            'FDA guidance describes a risk-based assessment and a multi-tiered anti-drug antibody (ADA) testing strategy: ' +
            'screening, confirmatory, titer and, generally, neutralizing antibody assays. For a cell or gene therapy, the ' +
            'immune responses to assess include those to the vector, the transgene product or the construct.',
        reference: biosimilar
          ? '42 USC 262(k)(2)(A)(i)(I)(cc); FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015)'
          : ind
            ? 'FDA Guidance: Immunogenicity Assessment for Therapeutic Protein Products (2014); FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibody Detection (2019); ICH S6(R1)'
            : 'FDA Guidance: Immunogenicity Assessment for Therapeutic Protein Products (2014); FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibody Detection (2019); 21 CFR 601.2',
        questionId: '_cross_node',
        triggerValues: {
          product_type: flat['product_type'],
          product_class: flat['product_class'],
          bla_pathway: flat['bla_pathway'],
        },
      };
    },
  },
  {
    id: 'xn_rems_without_etasu',
    appliesTo: ['nda_submission', 'bla_submission', 'labeling'],
    triggeredBy: ['rems_required', 'rems'],
    mitigatedBy: ['etasu', 'rems_elements'],
    check(flat, _state, _definition, ctx) {
      const remsAnswer = flat['rems_required'] ?? flat['rems'];
      /* A yes_no is 'yes' from the card and may be a boolean from the tool
         surface; the NDA and BLA store the select value 'yes'. 'likely' does
         not trigger. (2026-11-02, S4: a boolean `true` used to read as no REMS.) */
      const hasRems = remsAnswer === true || strVal(remsAnswer) === 'yes';
      const elements = flat['rems_elements'];
      /* "Not yet agreed with FDA" is an answer that names no element. The
         refusal set cannot see it, because it arrives inside an array. */
      const onlyUndetermined =
        Array.isArray(elements) && elements.length > 0 && elements.every(v => strVal(v) === 'under_fda_discussion');
      if (hasRems && (ctx.mitigationAbsent() || onlyUndetermined)) {
        return {
          checkId: 'xn_rems_without_etasu',
          severity: 'warning',
          title: 'REMS Required Without Its Elements Defined',
          message: 'If a REMS is required, confirm its elements are defined. A REMS may consist of a Medication Guide, a patient package insert, a communication plan and/or packaging or disposal requirements; Elements to Assure Safe Use (ETASU) are required only where FDA determines they are necessary (FD&C Act 505-1(f)), and if included they must be clearly defined. Common ETASU include prescriber certification, pharmacy certification, patient registries, and restricted distribution.',
          reference:
            "FD&C Act §505-1(e)-(f) (21 U.S.C. 355-1), added by FDAAA §901 (2007); FDA guidance 'REMS: FDA's Application of Statutory Factors in Determining When a REMS Is Necessary' (2019)",
          questionId: '_cross_node',
          triggerValues: { rems_required: flat['rems_required'], rems_elements: elements },
        };
      }
      return null;
    },
  },
  STABILITY_SHELF_LIFE_RULE,
  USER_FEE_EXEMPTION_RULE,
  {
    id: 'xn_high_risk_device_no_human_factors',
    appliesTo: ['device_510k', 'device_pma'],
    /* 2026-11-02 (S4): `device_class` is the only trigger any applicable flow
       asks. `risk_level` was asked by no flow, and its substrings 'high' and
       'life-sustaining' matched no device_class value, so the rule was dead on
       both sides. Exact equality, because 'class_ii_pma' contains no 'iii'. */
    triggeredBy: ['device_class'],
    /* The same fact under each flow's own id — "Summative (HFE Validation)
       Testing Completed": device-510k's usability_human_factors node and
       device-pma's human_factors_engineering node. `human_factors_study` and
       `hfe_study` were asked by no flow. */
    mitigatedBy: ['summative_testing_completed', 'summative_testing'],
    /* No negativeIsAnswer: 'no' to "summative testing completed" IS the finding. */
    check(flat, state, _definition, ctx) {
      const deviceClass = strVal(flat['device_class']);
      /* class_ii_pma is the PMA flow's 520(l) transitional device, deemed Class III. */
      if (deviceClass !== 'class_iii' && deviceClass !== 'class_ii_pma') return null;
      /* One fact, one finding. Each flow's own node check already reports a 'no'
         on this field, and runCrossNodeAnalysis dedupes only by rule id, so this
         rule speaking too would count the fact twice in the risk score. It
         speaks only where the node check could not read the answer: a refusal
         that is not a boolean ('none', 'na', 'not_applicable'), or a blank. */
      if (state.issues.some(i => i.checkId === 'no_usability_patient_use_check' || i.checkId === 'no_summative_testing_check')) {
        return null;
      }
      const id = ctx.asks('summative_testing_completed') ? 'summative_testing_completed' : 'summative_testing';
      /* The node checks' own predicate, so 'no', 'n', '0' and false agree. */
      const declined = evaluatePredicate({ field: id, operator: 'eq', value: false }, flat);
      if (!declined && !ctx.mitigationAbsent()) return null;
      return {
        checkId: 'xn_high_risk_device_no_human_factors',
        severity: 'warning',
        title: 'Class III Device Without Human Factors Validation Testing',
        message:
          'This is a Class III device, and summative (human factors validation) testing is not recorded as completed. ' +
          "FDA's 2016 guidance recommends human factors validation testing where the use-related risk analysis identifies " +
          'critical tasks, meaning tasks where a use error could cause serious harm. The guidance ties it to those tasks, ' +
          'not to device class. If the analysis found no critical tasks, record that and why; otherwise plan the ' +
          'validation test with representative users, the critical tasks and the intended use environment.',
        reference:
          'FDA guidance: Applying Human Factors and Usability Engineering to Medical Devices (February 2016); IEC 62366-1:2015+AMD1:2020',
        questionId: '_cross_node',
        triggerValues: { device_class: flat['device_class'], [id]: flat[id] },
      };
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
    /* 2026-11-02 (S4): dead in all three flows it named. No flow asked its
       triggers (`risk_management_process`, `rm_standard`), and its two
       mitigations were NODE ids, which never reach the flattened answers.
       risk_management is no longer listed: that flow's own node check
       no_post_production makes this finding at CRITICAL on the same field and
       clause, and the field is required, so this rule could never fire there. */
    appliesTo: ['device_510k', 'device_pma'],
    triggeredBy: ['iso_14971_applied'],
    /* Alternatives: the system is absent only when neither a surveillance plan
       nor complaint handling — the main channel for user-generated
       post-production information (ISO 14971:2019 10.2) — is in place. The
       510(k)'s ids, then the PMA's; contextFor uses only those the flow asks. */
    mitigatedBy: [
      'post_market_surveillance_plan',
      'complaint_handling_process',
      'post_market_plan_developed',
      'complaint_handling_system',
    ],
    /* No negativeIsAnswer: a 'no' to both IS the finding, and both are required. */
    check(flat, _state, _definition, ctx) {
      const applied = evaluatePredicate({ field: 'iso_14971_applied', operator: 'eq', value: true }, flat);
      if (!applied || !ctx.mitigationAbsent()) return null;
      return {
        checkId: 'xn_iso_14971_no_post_production',
        severity: 'warning',
        title: 'ISO 14971 Applied Without a Post-Production Information System',
        message:
          'ISO 14971 is applied, but no post-market surveillance plan has been developed and no complaint handling ' +
          'process is established, so nothing is in place to collect production and post-production information. ' +
          'ISO 14971:2019 clause 10.1 requires the manufacturer to establish, document and maintain a system to ' +
          'actively collect and review information relevant to the device in the production and post-production ' +
          'phases, and ISO 13485:2016 clauses 8.2.1 and 8.2.2, as incorporated by 21 CFR 820.10 (QMSR), require the ' +
          'feedback and complaint-handling processes that feed it, with feedback as an input to risk management.',
        reference: 'ISO 14971:2019 clause 10; ISO 13485:2016 clauses 8.2.1 and 8.2.2, as incorporated by 21 CFR 820.10 (QMSR)',
        questionId: '_cross_node',
        triggerValues: {
          iso_14971_applied: flat['iso_14971_applied'],
          ...(ctx.asks('post_market_surveillance_plan')
            ? {
                post_market_surveillance_plan: flat['post_market_surveillance_plan'],
                complaint_handling_process: flat['complaint_handling_process'],
              }
            : {
                post_market_plan_developed: flat['post_market_plan_developed'],
                complaint_handling_system: flat['complaint_handling_system'],
              }),
        },
      };
    },
  },
];
