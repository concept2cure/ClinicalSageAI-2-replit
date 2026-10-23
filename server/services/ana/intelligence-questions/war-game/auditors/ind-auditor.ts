/**
 * IND (Investigational New Drug) War Game Auditor.
 *
 * Simulates FDA CDER reviewer scrutiny of an IND submission per
 * 21 CFR 312, ICH M3/S6/S9, and relevant FDA guidance documents.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/ind-auditor
 */

import { consentElementsFor } from '../../../../../../shared/regulatory/informed-consent-elements.js';

/** The 50.25(a) elements, in order, from the one record. */
const FDA_REQUIRED_CONSENT = consentElementsFor('fda')
  .filter((e) => e.applicability === 'required')
  .map((e) => `${e.label.toLowerCase()} (${e.cfr50})`)
  .join('; ');
import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

const rid = (suffix: string) => 'ind_' + suffix;

/* ─── Helper utilities ────────────────────────────────────────────────── */

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Phases of the interview's `first_study_phase` for which it asks `dose_escalation_plan`. */
const DOSE_ESCALATION_PHASES = ['phase_1_fih', 'phase_1', 'phase_1b'];
/** Oral solid forms of the interview's `dosage_form` options. */
const ORAL_DOSAGE_FORMS = ['tablet', 'capsule'];
/** Injectable forms of the interview's `dosage_form` options. */
const INJECTABLE_DOSAGE_FORMS = ['lyophilized'];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'yes' || v === 'true') return true;
    if (v === 'no' || v === 'false') return false;
  }
  return null;
}

function finding(
  id: string,
  dimension: AuditDimension,
  severity: WarGameFinding['severity'],
  title: string,
  question: string,
  observation: string,
  requirement: string,
  reference: string,
  recommendation: string,
  relatedFields: string[],
): WarGameFinding {
  return { id, dimension, severity, title, question, observation, requirement, reference, recommendation, relatedFields };
}

/* ─── Audit rules ─────────────────────────────────────────────────────── */

const rules: AuditRule[] = [
  /* ── 1. Drug substance identification ── (completeness) ───────────────── */
  {
    id: rid('drug_substance'),
    dimension: 'completeness',
    title: 'Drug substance not identified',
    question:
      'The IND application must identify the drug substance per 21 CFR 312.23(a)(7). ' +
      'What is the active pharmaceutical ingredient, and where is its characterization data?',
    check(answers) {
      if (isBlank(answers.drug_substance)) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No drug substance has been specified in the submission.',
          '21 CFR 312.23(a)(7) requires full identification of the drug substance including its physical, chemical, and biological characteristics.',
          '21 CFR 312.23(a)(7)(i); ICH Q6A/Q6B',
          'Provide the drug substance identity, including structural formula (or biological characterization for biologics), molecular weight, physicochemical properties, and specification limits.',
          ['drug_substance', 'drug_name'],
        );
      }
      return null;
    },
  },

  /* ── 2. Formulation / route consistency ── (consistency) ──────────────── */
  {
    id: rid('formulation_route'),
    dimension: 'consistency',
    title: 'Formulation-route mismatch or missing data',
    question:
      'Per 21 CFR 312.23(a)(7)(iv)(b), the composition, manufacture, and control of the drug product must be described. ' +
      'Is the formulation type consistent with the proposed route of administration?',
    check(answers) {
      // `dosage_form` and `route_of_administration` are selects; they store option values.
      const formulation = asString(answers.dosage_form);
      const route = asString(answers.route_of_administration);
      if (isBlank(answers.dosage_form) || isBlank(answers.route_of_administration)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'Formulation type or route of administration has not been specified.',
          'The IND must describe the drug product composition and intended route of administration.',
          '21 CFR 312.23(a)(7)(iv)(b)',
          'Specify both the dosage form/formulation type and the route of administration, and ensure they are pharmacologically compatible.',
          ['dosage_form', 'route_of_administration'],
        );
      }
      // Detect obvious mismatches. 'solution', 'suspension' and 'powder' can be
      // oral or parenteral, so they are not judged.
      const isOralForm = ORAL_DOSAGE_FORMS.includes(formulation);
      const isInjectableForm = INJECTABLE_DOSAGE_FORMS.includes(formulation);
      if (isOralForm && route === 'iv') {
        return finding(
          this.id, this.dimension, 'critical', 'Formulation-route mismatch detected', this.question,
          `Oral dosage form "${formulation}" is inconsistent with intravenous route of administration.`,
          'The drug product formulation must be appropriate for the intended route per 21 CFR 312.23(a)(7).',
          '21 CFR 312.23(a)(7)(iv)(b); FDA Guidance for Industry: Sterile Drug Products Produced by Aseptic Processing',
          'Reconcile the formulation type with the proposed route. An IV route requires a sterile injectable formulation.',
          ['dosage_form', 'route_of_administration'],
        );
      }
      if (isInjectableForm && route === 'oral') {
        return finding(
          this.id, this.dimension, 'critical', 'Formulation-route mismatch detected', this.question,
          `Injectable formulation "${formulation}" is inconsistent with oral route of administration.`,
          'The drug product formulation must be appropriate for the intended route.',
          '21 CFR 312.23(a)(7)(iv)(b)',
          'Reconcile the formulation type with the proposed route. An oral route requires an orally bioavailable dosage form.',
          ['dosage_form', 'route_of_administration'],
        );
      }
      return null;
    },
  },

  /* ── 3. Nonclinical studies completeness ── (regulatory_alignment) ────── */
  {
    id: rid('nonclinical_complete'),
    dimension: 'regulatory_alignment',
    title: 'Nonclinical safety package incomplete',
    question:
      'ICH M3(R2) requires that nonclinical safety studies be completed before first-in-human dosing. ' +
      'Have the nonclinical pharmacology and toxicology studies been completed per the applicable ICH guidance?',
    check(answers) {
      const complete = asBool(answers.nonclinical_studies_complete);
      if (complete === false) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'The sponsor indicates that nonclinical studies have not been completed.',
          'Per ICH M3(R2) and 21 CFR 312.23(a)(8), adequate pharmacology and toxicology data must support the safety of the proposed clinical investigation.',
          'ICH M3(R2) (nonclinical safety studies supporting the conduct of human clinical trials); 21 CFR 312.23(a)(8); FDA Guidance: Content and Format of INDs for Phase 1 Studies',
          'Complete all required nonclinical studies before proceeding. For Phase 1, this typically includes single- and repeat-dose toxicity, safety pharmacology (core battery), and genotoxicity studies.',
          ['nonclinical_studies_complete', 'toxicology_species', 'genotoxicity_studies'],
        );
      }
      if (complete === null) {
        return finding(
          this.id, this.dimension, 'warning', 'Nonclinical study status not specified', this.question,
          'The submission does not confirm whether nonclinical studies have been completed.',
          'The IND must include a summary of nonclinical study status.',
          'ICH M3(R2); 21 CFR 312.23(a)(8)',
          'Confirm the status of all nonclinical studies and provide a cross-reference table mapping each ICH M3(R2) requirement to the corresponding study report.',
          ['nonclinical_studies_complete'],
        );
      }
      return null;
    },
  },

  /* ── 4. Toxicology species selection ── (scientific_rigor) ────────────── */
  {
    id: rid('tox_species'),
    dimension: 'scientific_rigor',
    title: 'Toxicology species selection not justified',
    question:
      'ICH S6(R1) and ICH M3(R2) require toxicology studies in pharmacologically relevant species. ' +
      'What species were used in the pivotal toxicology studies, and what is the scientific justification for their selection?',
    check(answers) {
      // `species_used` (multi_select) lists every species of the nonclinical program;
      // when it is empty, no toxicology species has been identified either.
      if (isBlank(answers.species_used)) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No toxicology species have been identified. The reviewer cannot assess whether the nonclinical safety package uses pharmacologically relevant species.',
          'Toxicology studies must be conducted in species that are pharmacologically responsive to the drug candidate. For small molecules, one rodent and one non-rodent species are typically required. For biologics, ICH S6(R1) mandates relevant species.',
          'ICH M3(R2) (General Principles; Repeated-Dose Toxicity Studies); ICH S6(R1) (species selection); 21 CFR 312.23(a)(8)',
          'Identify the toxicology species used and provide a scientific rationale (e.g., target homology data, in vitro cross-reactivity results) demonstrating pharmacological relevance.',
          ['species_used', 'mechanism_of_action', 'glp_tox_completed'],
        );
      }
      return null;
    },
  },

  /* ── 5. Genotoxicity studies ── (regulatory_alignment) ────────────────── */
  {
    id: rid('genotoxicity'),
    dimension: 'regulatory_alignment',
    title: 'Genotoxicity studies not addressed',
    question:
      'Under ICH M3(R2), a gene mutation (Ames) assay supports single-dose first-in-human trials, an assessment of chromosomal damage in a mammalian system is added before multiple-dose trials, and the complete ICH S2(R1) standard battery is completed before Phase 2. ' +
      'Has the sponsor conducted the Ames test, an in vitro chromosomal aberration assay, and an in vivo micronucleus study?',
    check(answers) {
      // `genetic_tox_completed` is yes_no. Unanswered is "not addressed"; a "no" is
      // the interview's own critical issue check (genetic_tox_required).
      if (asBool(answers.genetic_tox_completed) === null) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'The submission does not address genotoxicity study status. FDA reviewers will expect the ICH S2(R1) standard battery to be completed or a justified deviation.',
          'Under ICH M3(R2), a bacterial reverse mutation (Ames) assay is completed before single-dose first-in-human trials and a mammalian chromosomal damage assessment before multiple-dose trials. The complete ICH S2(R1) standard battery (Option 1: Ames, an in vitro mammalian cell assay and an in vivo assay; or Option 2: Ames and an in vivo assessment in two tissues) is completed before Phase 2.',
          'ICH S2(R1); ICH M3(R2) Section 9; 21 CFR 312.23(a)(8)',
          'Describe the genotoxicity battery conducted (or planned), including assay type, test article concentration ranges, and study outcomes. If any study is deferred, provide the scientific rationale.',
          ['genetic_tox_completed', 'glp_tox_completed'],
        );
      }
      return null;
    },
  },

  /* ── 6. Carcinogenicity assessment ── (risk_identification) ───────────── */
  {
    id: rid('carcinogenicity'),
    dimension: 'risk_identification',
    title: 'Carcinogenicity risk assessment absent',
    question:
      'Per ICH S1A, a carcinogenicity assessment is required for drugs intended for chronic use (> 6 months) or drugs with cause for concern. ' +
      'Has the sponsor addressed whether carcinogenicity studies are required, and if so, what is the plan?',
    check(answers) {
      // `carcinogenicity_needed` is a select (not_yet | completed | waived), always shown.
      if (isBlank(answers.carcinogenicity_needed)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'The sponsor has not addressed whether carcinogenicity studies are required. This will raise questions during FDA review of the nonclinical safety package.',
          'ICH S1A requires sponsors to determine the need for carcinogenicity studies based on treatment duration, patient population, and mechanism of action.',
          'ICH S1A; ICH S1B(R1); 21 CFR 312.23(a)(8)',
          'Provide a carcinogenicity risk assessment addressing ICH S1A criteria. If studies are not required for the initial phase, document the rationale and planned timeline.',
          ['carcinogenicity_needed', 'first_study_phase', 'proposed_indication'],
        );
      }
      return null;
    },
  },

  /* ── 7. Starting dose rationale ── (scientific_rigor) ─────────────────── */
  {
    id: rid('starting_dose'),
    dimension: 'scientific_rigor',
    title: 'Starting dose rationale insufficient',
    question:
      'FDA Guidance for Industry: Estimating the Maximum Safe Starting Dose requires a systematic approach ' +
      'using NOAEL-based HED calculations. What is the basis for the proposed starting dose, and how was the human equivalent dose derived?',
    check(answers) {
      // The interview asks the starting-dose justification (its `starting_dose_justification`
      // node, whose narrative is `dose_calculation_narrative`) only when the first study is
      // first-in-human. For any other phase it is not asked, so its absence is not a gap.
      if (asString(answers.first_study_phase) === 'phase_1_fih' && isBlank(answers.dose_calculation_narrative)) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No starting dose rationale has been provided. This is a critical deficiency that will likely result in a clinical hold under 21 CFR 312.42(b)(1)(iv).',
          'The starting dose must be justified based on NOAEL from the most sensitive relevant species, converted to human equivalent dose (HED) using appropriate body surface area scaling, and incorporating a safety margin (typically 1/10 HED for small molecules).',
          'FDA Guidance: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers (2005); ICH S9 (for oncology); 21 CFR 312.23(a)(8)',
          'Provide a complete starting dose justification including: (1) NOAEL from pivotal toxicology studies, (2) species and study duration, (3) HED calculation with body surface area conversion factors, (4) safety margin applied, (5) rationale for safety margin selection. For oncology, ICH S9 allows alternative approaches such as HNSTD-based calculations.',
          ['dose_calculation_narrative', 'dose_derivation_method', 'first_study_phase'],
        );
      }
      return null;
    },
  },

  /* ── 8. Dose escalation scheme ── (practical_feasibility) ─────────────── */
  {
    id: rid('dose_escalation'),
    dimension: 'practical_feasibility',
    title: 'Dose escalation scheme not defined',
    question:
      'For Phase 1 dose-escalation studies, what scheme will be used (e.g., modified Fibonacci, 3+3, accelerated titration, BOIN)? ' +
      'How are dose-limiting toxicities defined, and what are the stopping rules?',
    check(answers) {
      // `dose_escalation_plan` is shown only for the Phase 1 values of `first_study_phase`;
      // for any other (or no) phase it is hidden, and blank by design.
      const phase = asString(answers.first_study_phase);
      if (DOSE_ESCALATION_PHASES.includes(phase) && isBlank(answers.dose_escalation_plan)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No dose escalation scheme has been specified for what appears to be a Phase 1 study. FDA reviewers will require a clear escalation methodology to assess subject safety.',
          'A dose escalation design with pre-specified DLT definitions and stopping rules is expected for first-in-human studies.',
          'FDA Guidance: Estimating the Maximum Safe Starting Dose (2005); FDA Guidance for Industry: Adaptive Design Clinical Trials (2019)',
          'Define the dose escalation scheme, including: (1) escalation methodology, (2) DLT definitions with grading criteria per CTCAE, (3) DLT evaluation window, (4) dose increment rationale, (5) stopping rules for safety.',
          ['dose_escalation_plan', 'proposed_starting_dose', 'first_study_phase'],
        );
      }
      return null;
    },
  },

  /* ── 9. GMP compliance ── (regulatory_alignment) ──────────────────────── */
  {
    id: rid('gmp_compliance'),
    dimension: 'regulatory_alignment',
    title: 'GMP compliance status unclear',
    question:
      'Clinical trial material must be manufactured under CGMP (FD&C Act 501(a)(2)(B)); 21 CFR 211 applies from Phase 2 onward, and most Phase 1 investigational drugs are exempt from it under 21 CFR 210.2(c). ' +
      'Is the manufacturing site operating under current Good Manufacturing Practice regulations?',
    check(answers) {
      const gmp = asBool(answers.gmp_compliance);
      if (gmp === false) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'The sponsor indicates the manufacturing site is NOT GMP-compliant. This is a fundamental deficiency that will prevent IND acceptance.',
          'Drug products for use in clinical investigations must be manufactured under CGMP (FD&C Act section 501(a)(2)(B)). Most Phase 1 investigational drugs are exempt from 21 CFR 211 under 21 CFR 210.2(c) and follow FDA\'s 2008 guidance on CGMP for Phase 1 Investigational Drugs; 21 CFR 211 applies from Phase 2 onward. Drug product manufacturing information is described in the IND under 21 CFR 312.23(a)(7)(iv)(b).',
          'FD&C Act 501(a)(2)(B); 21 CFR 210.2(c); 21 CFR 211 (Phase 2 onward); FDA Guidance: CGMP for Phase 1 Investigational Drugs (2008)',
          'The manufacturing site must achieve GMP compliance before the drug product can be used in clinical trials. For Phase 1, FDA Guidance on CGMP for Phase 1 Investigational Drugs provides a risk-based framework with some flexibility, but fundamental GMP elements must be in place.',
          ['gmp_compliance', 'manufacturing_site'],
        );
      }
      if (gmp === null) {
        return finding(
          this.id, this.dimension, 'warning', 'GMP compliance not confirmed', this.question,
          'GMP compliance status has not been confirmed in the submission.',
          'CGMP is required for clinical trial material (FD&C Act 501(a)(2)(B)); 21 CFR 211 applies from Phase 2 onward, while most Phase 1 investigational drugs are exempt from it under 21 CFR 210.2(c).',
          'FD&C Act 501(a)(2)(B); 21 CFR 210.2(c); 21 CFR 211',
          'Confirm GMP compliance status and provide the manufacturing site address, most recent inspection date, and any outstanding FDA observations (Form 483 items).',
          ['gmp_compliance', 'manufacturing_site'],
        );
      }
      return null;
    },
  },

  /* ── 10. Manufacturing site identification ── (documentation) ─────────── */
  {
    id: rid('manufacturing_site'),
    dimension: 'documentation',
    title: 'Manufacturing site not identified',
    question:
      '21 CFR 312.23(a)(7) requires the IND to identify the manufacturing facility. ' +
      'Where is the drug product manufactured, and has the site been inspected by FDA?',
    check(answers) {
      if (isBlank(answers.manufacturing_site)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No manufacturing site has been identified. The IND must include the name and address of the manufacturer.',
          '21 CFR 312.23(a)(7) requires identification of the manufacturing establishment and the name of the manufacturer.',
          '21 CFR 312.23(a)(7)',
          'Provide the full name and address of each manufacturing facility involved in drug substance and drug product manufacturing, testing, and packaging.',
          ['manufacturing_site', 'gmp_compliance'],
        );
      }
      return null;
    },
  },

  /* ── 11. Stability data ── (scientific_rigor) ─────────────────────────── */
  {
    id: rid('stability_data'),
    dimension: 'scientific_rigor',
    title: 'Stability data not available',
    question:
      'ICH Q1A(R2) establishes the requirements for stability testing. What stability data support the proposed ' +
      'shelf life and storage conditions for the investigational drug product?',
    check(answers) {
      // The interview asks availability per condition: `long_term_stability_data` and
      // `accelerated_stability_data` are selects whose 'none' option means no data.
      // Data are available when either holds a duration; unavailable when both are
      // 'none'; otherwise availability has not been addressed.
      const longTerm = asString(answers.long_term_stability_data);
      const accelerated = asString(answers.accelerated_stability_data);
      const available: boolean | null =
        (longTerm !== '' && longTerm !== 'none') || (accelerated !== '' && accelerated !== 'none') ? true
          : longTerm === 'none' && accelerated === 'none' ? false
            : null;
      if (available === false) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'The sponsor indicates no stability data are available. Without stability data, there is no assurance that the investigational product retains identity, strength, quality, and purity throughout the clinical study.',
          'Sufficient stability data must be submitted to support the proposed storage conditions and retest/expiry dating per ICH Q1A(R2) and 21 CFR 312.23(a)(7).',
          'ICH Q1A(R2); ICH Q5C (for biologics); 21 CFR 312.23(a)(7)(iv)(b); FDA Guidance: INDs for Phase 1 Studies of Drugs',
          'Initiate stability studies under ICH conditions (25C/60% RH long-term; 40C/75% RH accelerated). For Phase 1 INDs, a minimum of 1-month accelerated and available real-time data may suffice, but a commitment to ongoing stability testing must be included.',
          ['long_term_stability_data', 'accelerated_stability_data', 'proposed_shelf_life'],
        );
      }
      if (available === null) {
        return finding(
          this.id, this.dimension, 'warning', 'Stability data status not addressed', this.question,
          'The submission does not address whether stability data are available for the investigational product.',
          'Stability data are required to support the clinical use period.',
          'ICH Q1A(R2); 21 CFR 312.23(a)(7)',
          'Confirm availability of stability data, including conditions tested, time points, and results summary.',
          ['long_term_stability_data', 'accelerated_stability_data'],
        );
      }
      return null;
    },
  },

  /* ── 12. Impurity profile ── (scientific_rigor) ───────────────────────── */
  {
    id: rid('impurity_profile'),
    dimension: 'scientific_rigor',
    title: 'Impurity profile not characterized',
    question:
      'ICH Q3A(R2) and Q3B(R2) require identification, qualification, and control of impurities. ' +
      'Has a comprehensive impurity profile been established for both drug substance and drug product?',
    check(answers) {
      if (isBlank(answers.impurity_profile)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No impurity profile information has been provided. FDA CMC reviewers will scrutinize the absence of impurity characterization data.',
          'ICH Q3A(R2) (drug substance) and Q3B(R2) (drug product) require reporting, identification, and qualification of impurities above specified thresholds.',
          'ICH Q3A(R2); ICH Q3B(R2); ICH Q3D (elemental impurities); ICH M7 (mutagenic impurities); 21 CFR 312.23(a)(7)',
          'Provide an impurity profile including: (1) process-related impurities, (2) degradation products, (3) residual solvents (ICH Q3C), (4) elemental impurities (ICH Q3D), and (5) mutagenic impurity assessment per ICH M7. Include specification limits and analytical methods.',
          ['impurity_profile', 'drug_substance', 'drug_product_description'],
        );
      }
      return null;
    },
  },

  /* ── 13. Sponsor identification ── (documentation) ────────────────────── */
  {
    id: rid('sponsor_name'),
    dimension: 'documentation',
    title: 'Sponsor not identified',
    question:
      'Form FDA 1571 requires identification of the sponsor. Who is the sponsor of this IND, and is the sponsor a US entity or does it have a US agent?',
    check(answers) {
      if (isBlank(answers.sponsor_name)) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'No sponsor name has been provided. The IND cannot be filed without a sponsor per 21 CFR 312.23(a)(1).',
          'The sponsor must be identified on Form FDA 1571, including name, address, and telephone number. Foreign sponsors must designate a US agent per 21 CFR 312.23(a)(1)(ix).',
          '21 CFR 312.23(a)(1); FDA Form 1571',
          'Provide the sponsor name, address, and contact information. If the sponsor is a foreign entity, identify the US agent.',
          ['sponsor_name', 'previous_ind_number'],
        );
      }
      return null;
    },
  },

  /* ── 14. Investigator qualifications ── (regulatory_alignment) ────────── */
  {
    id: rid('investigator_quals'),
    dimension: 'regulatory_alignment',
    title: 'Investigator qualifications not documented',
    question:
      '21 CFR 312.53 requires Form FDA 1572 with a signed statement from each investigator. ' +
      'Are investigator qualifications (CV, training, experience) documented and does the principal investigator meet 21 CFR 312.53 requirements?',
    check(answers) {
      if (isBlank(answers.pi_qualifications_summary)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'Investigator qualifications have not been described. Form FDA 1572 and supporting CVs are required for each participating investigator.',
          'Per 21 CFR 312.53(a), the sponsor must select only investigators qualified by training and experience as appropriate experts to investigate the drug. Before an investigator may begin, 312.53(c)(1) requires a signed Form FDA 1572 and 312.53(c)(2) a curriculum vitae or other statement of qualifications — the CV is obtained alongside the 1572, not a field of it. (312.53(c)(4) is the separate financial-disclosure item feeding 21 CFR Part 54.)',
          '21 CFR 312.53; 21 CFR 312.23(a)(6)(iii)(b); FDA Form 1572',
          'Provide investigator qualifications including relevant therapeutic area experience, GCP training certification, and clinical trial experience. Ensure Form 1572 is completed for each site.',
          ['pi_qualifications_summary', 'fda_1572_status', 'irb_status'],
        );
      }
      return null;
    },
  },

  /* ── 15. IRB approval status ── (regulatory_alignment) ────────────────── */
  {
    id: rid('irb_approval'),
    dimension: 'regulatory_alignment',
    title: 'IRB approval status not confirmed',
    question:
      '21 CFR 312.23(a)(1)(iv) requires a commitment that an IRB complying with 21 CFR Part 56 will be responsible for the initial and continuing review and approval of each study. ' +
      'What is the current status of IRB review and approval at each proposed clinical site?',
    check(answers) {
      // `irb_status` is a select (approved | pending | not_submitted). It has no
      // denied/rejected option, so the interview cannot report a denial; that branch
      // was removed rather than kept as a check that can never fire.
      if (isBlank(answers.irb_status)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'IRB approval status has not been specified. While IRB approval is not required at IND submission, the FDA must be informed of the IRB status before subjects are enrolled.',
          '21 CFR 56 requires IRB review and approval before initiation of research involving human subjects. 21 CFR 312.23(a)(1)(iv) requires a commitment that an IRB complying with 21 CFR Part 56 will be responsible for the initial and continuing review and approval of each study in the proposed clinical investigation.',
          '21 CFR 312.23(a)(1)(iv); 21 CFR 56; 21 CFR 312.66',
          'Specify IRB approval status (pending, submitted, approved) and identify the reviewing IRB. If using a central IRB, confirm the arrangement. Include the IRB name, address, and FWA number.',
          ['irb_status', 'central_irb_used', 'pi_qualifications_summary'],
        );
      }
      return null;
    },
  },

  /* ── 16. Informed consent ── (documentation) ──────────────────────────── */
  {
    id: rid('informed_consent'),
    dimension: 'documentation',
    title: 'Informed consent draft not provided',
    question:
      'Per 21 CFR 50, informed consent must include all elements described in 21 CFR 50.25. ' +
      'Has a draft informed consent form been prepared, and does it include the eight required basic elements?',
    check(answers) {
      // `informed_consent_status` is a select (finalized | draft | not_started), always shown.
      // 'not_started' is "not prepared"; unanswered is "not provided".
      if (asString(answers.informed_consent_status) === 'not_started' || isBlank(answers.informed_consent_status)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'An informed consent draft has not been provided or has not been prepared. While not required for IND submission, the informed consent form is a critical study document that must comply with 21 CFR 50.25.',
          '21 CFR 50.25(a) specifies eight basic elements, 50.25(b) six additional elements to include when appropriate, and 50.25(c) the ClinicalTrials.gov statement for an applicable clinical trial (citations recall).',
          '21 CFR 50.25; 21 CFR 50.27; FDA Guidance: Informed Consent (final guidance; date to confirm — 2014 was the draft)',
          `Prepare a draft informed consent form that includes every 21 CFR 50.25(a) basic element — ${FDA_REQUIRED_CONSENT} — and, for an applicable clinical trial, the 21 CFR 50.25(c) ClinicalTrials.gov statement.`,
          ['informed_consent_status', 'irb_status'],
        );
      }
      return null;
    },
  },

  /* ── 17. Clinical hold history ── (risk_identification) ───────────────── */
  {
    id: rid('clinical_hold_history'),
    dimension: 'risk_identification',
    title: 'Clinical hold history not disclosed',
    question:
      'Per 21 CFR 312.42, FDA may impose a clinical hold for safety concerns or protocol deficiencies. ' +
      'Has this drug or related compounds been subject to a prior clinical hold, and if so, have all hold conditions been resolved?',
    check(answers) {
      // `clinical_hold_history` is yes_no: it stores a boolean, so a text match on it never fired.
      const history = asBool(answers.clinical_hold_history);
      if (history === null) {
        return finding(
          this.id, this.dimension, 'info', this.title, this.question,
          'Clinical hold history has not been addressed. Full transparency regarding any prior clinical holds on this IND or related INDs is expected.',
          'Sponsors should disclose any prior clinical holds and their resolution in the IND submission.',
          '21 CFR 312.42; 21 CFR 312.23(a)(9)',
          'State whether the drug, related compounds, or the sponsor has been subject to any prior clinical holds. If yes, provide the hold date, basis, and documentation of resolution.',
          ['clinical_hold_history', 'ib_prior_human_experience'],
        );
      }
      if (history === true) {
        return finding(
          this.id, this.dimension, 'warning', 'Prior clinical hold identified', this.question,
          'The submission indicates a prior clinical hold exists. FDA will closely scrutinize whether all hold conditions have been satisfactorily addressed.',
          'All clinical hold conditions must be resolved before the study may proceed per 21 CFR 312.42(e).',
          '21 CFR 312.42(e); FDA Guidance: Clinical Holds (1998)',
          'Provide complete documentation of the prior clinical hold including: (1) hold date and basis, (2) sponsor response, (3) FDA feedback and resolution date, (4) any modifications made to address the hold conditions.',
          ['clinical_hold_history', 'related_inds'],
        );
      }
      return null;
    },
  },

  /* ── 18. Mechanism of action ── (scientific_rigor) ────────────────────── */
  {
    id: rid('mechanism_of_action'),
    dimension: 'scientific_rigor',
    title: 'Mechanism of action not described',
    question:
      'What is the proposed mechanism of action, and how does the pharmacology support the intended indication? ' +
      'Is there a clear molecular or biological rationale connecting the drug target to the disease pathophysiology?',
    check(answers) {
      if (isBlank(answers.mechanism_of_action)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No mechanism of action has been described. The scientific rationale for the proposed clinical investigation depends on a clear understanding of how the drug is expected to produce its therapeutic effect.',
          '21 CFR 312.23(a)(8) requires a section describing the pharmacological effects and mechanism of action of the drug in animals.',
          '21 CFR 312.23(a)(8); ICH M3(R2)',
          'Describe the mechanism of action including: (1) molecular target, (2) target validation data, (3) relationship between target modulation and disease pathophysiology, (4) any biomarker strategy for confirming target engagement in clinical studies.',
          ['mechanism_of_action', 'proposed_indication', 'therapeutic_class'],
        );
      }
      return null;
    },
  },

  /* ── 19. Pharmacology summary ── (completeness) ──────────────────────── */
  {
    id: rid('pharmacology_summary'),
    dimension: 'completeness',
    title: 'Pharmacology summary incomplete or missing',
    question:
      '21 CFR 312.23(a)(8) requires an integrated summary of the pharmacological effects and mechanism of action. ' +
      'Has the sponsor provided a pharmacology summary including primary and secondary pharmacodynamics and safety pharmacology?',
    check(answers) {
      if (isBlank(answers.pharmacology_summary)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No pharmacology summary has been provided. Section 312.23(a)(8) requires an adequate summary of pharmacological effects.',
          'An integrated summary covering primary pharmacology, secondary pharmacology, and safety pharmacology (ICH S7A core battery: cardiovascular, respiratory, CNS) is expected.',
          '21 CFR 312.23(a)(8); ICH S7A; ICH S7B (QT/hERG)',
          'Provide a pharmacology summary including: (1) primary pharmacodynamics (in vitro and in vivo efficacy), (2) secondary pharmacodynamics (off-target activity screening), (3) safety pharmacology per ICH S7A core battery, (4) hERG/QT assessment per ICH S7B if applicable.',
          ['pharmacology_summary', 'mechanism_of_action', 'nonclinical_studies_complete'],
        );
      }
      return null;
    },
  },

  /* ── 20. Drug product description ── (completeness) ───────────────────── */
  {
    id: rid('drug_product_description'),
    dimension: 'completeness',
    title: 'Drug product description inadequate',
    question:
      '21 CFR 312.23(a)(7)(iv)(b) requires a description of the drug product including its components, composition, and specifications. ' +
      'Has a complete drug product description been provided?',
    check(answers) {
      if (isBlank(answers.drug_product_description)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No drug product description has been provided. FDA CMC reviewers require a clear description of the finished dosage form.',
          '21 CFR 312.23(a)(7)(iv)(b) requires the composition of the drug product, including identity and quantity of each ingredient.',
          '21 CFR 312.23(a)(7)(iv)(b)',
          'Provide a drug product description including: (1) dosage form, (2) unit dose composition (active and inactive ingredients with quantities), (3) container closure system, (4) release specifications, (5) description of manufacturing process.',
          ['drug_product_description', 'formulation_type', 'drug_substance'],
        );
      }
      return null;
    },
  },

  /* ── 21. Previous human experience ── (risk_identification) ───────────── */
  {
    id: rid('previous_human_experience'),
    dimension: 'risk_identification',
    title: 'Previous human experience not summarized',
    question:
      '21 CFR 312.23(a)(9) requires information from previous human experience with the investigational drug. ' +
      'Has the drug or related compounds been administered to humans previously, and if so, what safety and efficacy signals were observed?',
    check(answers) {
      // `ib_prior_human_experience` is a select (no_prior | included | pending_inclusion);
      // 'no_prior' is the explicit first-in-human statement this rule asks for.
      if (isBlank(answers.ib_prior_human_experience)) {
        return finding(
          this.id, this.dimension, 'info', this.title, this.question,
          'No information on previous human experience has been provided. If this is a first-in-human study, an explicit statement to that effect is expected.',
          '21 CFR 312.23(a)(9) requires a summary of previous human experience with the investigational drug, including prior clinical investigations, foreign marketing experience, and any adverse events.',
          '21 CFR 312.23(a)(9)',
          'If prior human experience exists (e.g., foreign clinical studies, compassionate use), summarize the safety and efficacy data. If this is first-in-human, state so explicitly and cross-reference the nonclinical data supporting safety.',
          ['ib_prior_human_experience', 'first_study_phase', 'clinical_hold_history'],
        );
      }
      return null;
    },
  },

  /* ── 22. Safety database size ── (practical_feasibility) ──────────────── */
  {
    id: rid('safety_database'),
    dimension: 'practical_feasibility',
    title: 'Safety database size not specified',
    question:
      'For INDs with prior human experience, what is the size of the existing safety database? ' +
      'Is the safety database adequate to support the proposed phase of development?',
    check(answers) {
      // Prior human experience is referenced when the IB includes it or it exists but is
      // pending inclusion. The interview does not ask the safety database size.
      const prior = asString(answers.ib_prior_human_experience);
      if ((prior === 'included' || prior === 'pending_inclusion') && isBlank(answers.safety_database_size)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'Prior human experience is referenced but the safety database size is not quantified. Reviewers need to assess whether the existing safety data are sufficient.',
          'ICH E1 sets the expected extent of population exposure in the safety database at marketing application for drugs intended for long-term treatment of non-life-threatening conditions; it does not define safety database size for each phase of clinical development.',
          '21 CFR 312.23(a)(9) (previous human experience); ICH E1 (exposure expected at marketing application)',
          'Quantify the safety database: number of subjects exposed, dose ranges, duration of exposure, and a summary of adverse events by system organ class and severity.',
          ['safety_database_size', 'ib_prior_human_experience'],
        );
      }
      return null;
    },
  },

  /* ── 23. Phase specification ── (consistency) ─────────────────────────── */
  {
    id: rid('phase_specified'),
    dimension: 'consistency',
    title: 'Phase of clinical investigation not specified',
    question:
      '21 CFR 312.23(a)(1)(ii) requires identification of the phase of the proposed clinical investigation. ' +
      'What phase is this IND application supporting, and is the nonclinical and CMC data package appropriate for that phase?',
    check(answers) {
      if (isBlank(answers.first_study_phase)) {
        return finding(
          this.id, this.dimension, 'critical', this.title, this.question,
          'The phase of clinical investigation has not been specified. This is required information for Form FDA 1571 and determines the regulatory expectations for the supporting data package.',
          '21 CFR 312.23(a)(1)(ii) and Form 1571 require identification of the phase of clinical study.',
          '21 CFR 312.23(a)(1)(ii); FDA Form 1571 Item 8',
          'Specify the phase (Phase 1, Phase 1/2, Phase 2, Phase 3) and ensure that the CMC, nonclinical, and clinical sections are consistent with phase-appropriate regulatory expectations per ICH M3(R2) Table 1.',
          ['first_study_phase', 'glp_tox_completed', 'gmp_compliance'],
        );
      }
      return null;
    },
  },

  /* ── 24. Indication ── (completeness) ─────────────────────────────────── */
  {
    id: rid('indication'),
    dimension: 'completeness',
    title: 'Indication not defined',
    question:
      'What is the proposed indication for the investigational drug? Is there a clear unmet medical need, and how does this molecule fit within the existing therapeutic landscape?',
    check(answers) {
      if (isBlank(answers.proposed_indication)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No indication has been specified. While FDA does not formally "approve" indications at the IND stage, a clearly defined target indication is essential for assessing the adequacy of the nonclinical and clinical plans.',
          '21 CFR 312.23(a)(3)(i) requires an introductory statement describing the broad objectives and planned duration of the proposed clinical investigation.',
          '21 CFR 312.23(a)(3)(i)',
          'Define the specific indication, including the target patient population and disease stage. Provide context on the unmet medical need and the current standard of care.',
          ['proposed_indication', 'therapeutic_class', 'mechanism_of_action'],
        );
      }
      return null;
    },
  },

  /* ── 25. Drug name identification ── (documentation) ──────────────────── */
  {
    id: rid('drug_name'),
    dimension: 'documentation',
    title: 'Drug name not provided',
    question:
      'Form FDA 1571 Item 5 requires the name of the investigational drug. ' +
      'Has the sponsor provided the drug name (proprietary and/or code name) and the established/USAN name if available?',
    check(answers) {
      // The interview asks the name as `drug_name_generic` and the code designation as
      // `drug_code_number`; either identifies the drug, so the finding needs both blank.
      if (isBlank(answers.drug_name_generic) && isBlank(answers.drug_code_number)) {
        return finding(
          this.id, this.dimension, 'warning', this.title, this.question,
          'No drug name has been provided. The IND filing requires identification of the drug by name.',
          'Form 1571 requires the drug name, including any proprietary name, code designation, and chemical name.',
          'FDA Form 1571 Item 5; 21 CFR 312.23(a)(7)',
          'Provide the drug name including: (1) sponsor code designation, (2) USAN/INN name if assigned, (3) chemical name, and (4) any proprietary name if applicable.',
          ['drug_name_generic', 'drug_code_number'],
        );
      }
      return null;
    },
  },

  /* ── 26. IND number ── (documentation) ────────────────────────────────── */
  {
    id: rid('ind_number'),
    dimension: 'documentation',
    title: 'IND number not assigned or missing',
    question:
      'Has an IND number been assigned by FDA, and is this an original IND, a protocol amendment, or an IND amendment? ' +
      'Cross-reference any prior IND submissions for this compound.',
    check(answers) {
      // `previous_ind_number` is shown only when `ind_application_type` is 'amendment'.
      // For an original IND it is hidden: FDA has not assigned a number yet.
      if (asString(answers.ind_application_type) === 'amendment' && isBlank(answers.previous_ind_number)) {
        return finding(
          this.id, this.dimension, 'info', this.title, this.question,
          'No IND number has been provided. For an original IND submission this is expected (FDA assigns the number upon receipt). For amendments, the existing IND number must be referenced.',
          'For original INDs, an IND number will be assigned by FDA. For subsequent submissions, the assigned IND number must be referenced.',
          '21 CFR 312.23(a)(1); FDA Form 1571 Item 6',
          'If this is an original IND, indicate "To Be Assigned." If an IND number has been previously assigned, include it on all correspondence and submissions.',
          ['previous_ind_number', 'ind_application_type'],
        );
      }
      return null;
    },
  },
];

/* ─── Factory ─────────────────────────────────────────────────────────── */

export function createIndAuditor(): WarGameAuditor {
  return {
    category: 'ind',
    name: 'FDA CDER IND Reviewer',
    description:
      'Simulates an FDA CDER reviewer scrutinizing an Investigational New Drug (IND) application ' +
      'per 21 CFR 312, ICH M3/S6/S9, and FDA guidance documents. Evaluates CMC adequacy, ' +
      'nonclinical safety package, starting dose justification, investigator qualifications, ' +
      'IRB oversight, and clinical hold risk factors.',
    rules,
  };
}
