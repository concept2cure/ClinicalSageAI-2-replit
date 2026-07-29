/**
 * Safety Pharmacology tools — exposes the deterministic knowledge engines in
 * `server/services/safety-pharmacology/safety-pharmacology-knowledge` to AnA as
 * first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   design_core_battery                        — ICH S7A core battery design
 *   assess_cardiovascular_safety_pharmacology  — S7A/S7B CV + telemetry + hERG/QT
 *   assess_cns_safety_pharmacology             — S7A CNS (Irwin/FOB, seizure)
 *   assess_respiratory_safety_pharmacology     — S7A respiratory plethysmography
 *   design_followup_safety_study               — S7A follow-up/supplemental studies
 *   assess_abuse_liability                     — FDA 2017 abuse-potential assessment
 *
 * @module server/services/ana/safetyPharmacologyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. design_core_battery
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_CORE_BATTERY: AnaTool = {
  name: 'design_core_battery',
  description:
    'Design the ICH S7A core battery of safety pharmacology studies across the three ' +
    'vital organ systems (cardiovascular, central nervous, respiratory). Returns the ' +
    'required organ systems, recommended studies with preferred species, GLP status and ' +
    'timing relative to first-in-human (FIH), the hERG/in vivo QT integration point per ' +
    'ICH S7B and the ICH E14/S7B Q&A, GLP expectations, and applicable exclusions for ' +
    'locally applied or end-stage-oncology cytotoxic agents (ICH S7A 2.5). For biologics, ' +
    'applies ICH S6(R1) logic (endpoints integrated into toxicology vs. stand-alone ' +
    'studies). Returns regulatory citations (ICH S7A, ICH S7B, ICH S6(R1), ICH M3(R2)). ' +
    'Use when the user is planning the pre-FIH safety pharmacology package or asks which ' +
    'core-battery studies are needed for a given modality and route. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: {
        type: 'string',
        enum: [
          'small_molecule',
          'peptide',
          'monoclonal_antibody',
          'biologic_other',
          'oligonucleotide',
          'gene_therapy',
          'cell_therapy',
          'vaccine',
        ],
        description:
          'Investigational product modality. Drives ICH S7A (small molecule, stand-alone ' +
          'studies) vs. ICH S6(R1) (biologic, integrate endpoints into toxicology) logic.',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'intravenous',
          'subcutaneous',
          'intramuscular',
          'inhalation',
          'topical',
          'transdermal',
          'intrathecal',
          'ophthalmic',
          'other',
        ],
        description:
          'Clinical route of administration. Local routes (topical/ophthalmic/transdermal) ' +
          'with low systemic exposure may qualify for the ICH S7A 2.5 exclusion.',
      },
      phase: {
        type: 'string',
        enum: ['preclinical', 'fih_phase1', 'phase2', 'phase3', 'marketing_application'],
        description: 'Development phase the package supports (default fih_phase1).',
      },
      cnsActive: {
        type: 'boolean',
        description:
          'True if the agent is centrally active (crosses the blood-brain barrier). ' +
          'Flags an abuse-liability cross-reference and CNS follow-up considerations.',
      },
      locallyAppliedLowSystemic: {
        type: 'boolean',
        description:
          'True if the product is locally applied with demonstrably low systemic ' +
          'exposure (relevant to the ICH S7A 2.5 exclusion for topical/ocular agents).',
      },
      cytotoxicEndStageOncology: {
        type: 'boolean',
        description:
          'True if a cytotoxic agent for treatment of end-stage cancer (ICH S7A 2.5 ' +
          'exclusion may apply with documented rationale).',
      },
      pharmacologicallyRelevantToxSpeciesAvailable: {
        type: 'boolean',
        description:
          'True when a pharmacologically relevant repeat-dose toxicology species exists ' +
          'into which biologic safety-pharmacology endpoints can be integrated (ICH S6(R1)).',
      },
      hergAndInVivoQTAvailable: {
        type: 'boolean',
        description: 'True if in vitro hERG and in vivo QT data are already available.',
      },
    },
    required: ['modality', 'route'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. assess_cardiovascular_safety_pharmacology
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_CARDIOVASCULAR_SAFETY_PHARMACOLOGY: AnaTool = {
  name: 'assess_cardiovascular_safety_pharmacology',
  description:
    'Assess the cardiovascular safety pharmacology package per ICH S7A/S7B with the ' +
    'ICH E14/S7B Q&A (2022) integration point. Returns a telemetry study design ' +
    '(conscious large-animal radiotelemetry; preferred species; dose levels; GLP and ' +
    'timing), the CV endpoints (blood pressure, heart rate, ECG intervals incl. QT/QTc, ' +
    'contractility as a follow-up), and the QT integration analysis. When a hERG IC50 ' +
    'and the anticipated clinical free Cmax are supplied, it computes the hERG safety ' +
    'margin (IC50/Cmax) and interprets it against the conventional ≥30× / 10–30× / <10× ' +
    'bands. Flags missing positive controls and in vivo QT signals. Returns citations ' +
    '(ICH S7A, ICH S7B, ICH E14/S7B Q&A, ICH S6(R1) for biologics). Use when the user ' +
    'is designing or evaluating CV safety pharmacology, telemetry, or QT/hERG strategy. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: {
        type: 'string',
        enum: [
          'small_molecule',
          'peptide',
          'monoclonal_antibody',
          'biologic_other',
          'oligonucleotide',
          'gene_therapy',
          'cell_therapy',
          'vaccine',
        ],
        description: 'Investigational product modality.',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'intravenous',
          'subcutaneous',
          'intramuscular',
          'inhalation',
          'topical',
          'transdermal',
          'intrathecal',
          'ophthalmic',
          'other',
        ],
        description: 'Clinical route of administration.',
      },
      species: {
        type: 'string',
        enum: ['dog', 'cynomolgus_monkey', 'minipig', 'other'],
        description: 'Preferred large-animal telemetry species, if already chosen.',
      },
      hergAssayDone: {
        type: 'boolean',
        description: 'True if an in vitro hERG IKr assay has been performed.',
      },
      hergIC50_uM: {
        type: 'number',
        description:
          'In vitro hERG (IKr) IC50 in micromolar (µM). Combined with the clinical free ' +
          'Cmax to compute the proarrhythmia safety margin.',
      },
      clinicalFreeCmax_uM: {
        type: 'number',
        description:
          'Anticipated clinical free (unbound) maximum plasma concentration in µM, used ' +
          'as the denominator of the hERG safety margin (hERG IC50 / free Cmax).',
      },
      inVivoQTSignalObserved: {
        type: 'boolean',
        description: 'True if an in vivo QT/QTc prolongation signal was observed in telemetry.',
      },
      positiveControlIncluded: {
        type: 'boolean',
        description:
          'True if a positive control (e.g., moxifloxacin in vivo) was included to ' +
          'demonstrate assay sensitivity for the evidence-of-confidence QT package.',
      },
      seekingTQTWaiverViaQa: {
        type: 'boolean',
        description:
          'True if the program intends to use the ICH E14/S7B Q&A nonclinical pathway to ' +
          'reduce reliance on a dedicated clinical thorough-QT study.',
      },
    },
    required: ['modality', 'route'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_cns_safety_pharmacology
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_CNS_SAFETY_PHARMACOLOGY: AnaTool = {
  name: 'assess_cns_safety_pharmacology',
  description:
    'Assess the central nervous system (CNS) safety pharmacology package per ICH S7A. ' +
    'Returns the study design (conscious rodent functional observational battery (FOB) ' +
    'or modified Irwin screen plus automated locomotor activity; preferred species; GLP ' +
    'and timing), the core endpoints (FOB/Irwin, motor activity, behavior), follow-up ' +
    'endpoints (cognition, electrophysiology), a seizure-liability determination, the ' +
    'body-temperature endpoint, and an abuse-liability cross-reference when the agent is ' +
    'centrally active. Returns citations (ICH S7A, ICH S6(R1) for biologics, FDA 2017 ' +
    'abuse guidance when triggered). Use when the user is designing or evaluating CNS ' +
    'safety pharmacology, FOB/Irwin, seizure liability, or motor/behavioral effects. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: {
        type: 'string',
        enum: [
          'small_molecule',
          'peptide',
          'monoclonal_antibody',
          'biologic_other',
          'oligonucleotide',
          'gene_therapy',
          'cell_therapy',
          'vaccine',
        ],
        description: 'Investigational product modality.',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'intravenous',
          'subcutaneous',
          'intramuscular',
          'inhalation',
          'topical',
          'transdermal',
          'intrathecal',
          'ophthalmic',
          'other',
        ],
        description: 'Clinical route of administration.',
      },
      cnsActive: {
        type: 'boolean',
        description:
          'True if the agent crosses the blood-brain barrier / is centrally active. ' +
          'Influences seizure-liability and abuse-liability triggers.',
      },
      seizureLiabilitySuspected: {
        type: 'boolean',
        description:
          'True if known/expected pharmacology suggests pro-convulsant (seizure) liability.',
      },
      sedativeOrStimulantActivity: {
        type: 'boolean',
        description:
          'True if pharmacology suggests sedative or stimulant (abuse-relevant) CNS effects.',
      },
      cnsIndication: {
        type: 'boolean',
        description: 'True if the program targets a CNS indication.',
      },
      species: {
        type: 'string',
        enum: ['rat', 'mouse', 'other'],
        description: 'Preferred rodent species, if chosen (rat is the default preferred rodent).',
      },
    },
    required: ['modality', 'route'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_respiratory_safety_pharmacology
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_RESPIRATORY_SAFETY_PHARMACOLOGY: AnaTool = {
  name: 'assess_respiratory_safety_pharmacology',
  description:
    'Assess the respiratory safety pharmacology package per ICH S7A. Returns the study ' +
    'design (conscious, unrestrained whole-body plethysmography for rodents, or ' +
    'jacketed/head-out plethysmography for large animals; preferred species; GLP and ' +
    'timing), the core endpoints (respiratory rate, tidal volume, minute volume), ' +
    'follow-up endpoints (arterial blood gases / pulse oximetry, airway resistance and ' +
    'compliance), and a respiratory-depression risk determination (e.g., for opioids or ' +
    'CNS depressants). Returns citations (ICH S7A, ICH S6(R1) for biologics). Use when ' +
    'the user is designing or evaluating respiratory safety pharmacology, plethysmography, ' +
    'or respiratory-depressant liability. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: {
        type: 'string',
        enum: [
          'small_molecule',
          'peptide',
          'monoclonal_antibody',
          'biologic_other',
          'oligonucleotide',
          'gene_therapy',
          'cell_therapy',
          'vaccine',
        ],
        description: 'Investigational product modality.',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'intravenous',
          'subcutaneous',
          'intramuscular',
          'inhalation',
          'topical',
          'transdermal',
          'intrathecal',
          'ophthalmic',
          'other',
        ],
        description:
          'Clinical route of administration. Inhalation emphasizes respiratory endpoints.',
      },
      respiratoryDepressantActivity: {
        type: 'boolean',
        description:
          'True if pharmacology suggests respiratory-depressant liability (e.g., opioid ' +
          'or CNS depressant). Triggers a blood-gas/oximetry follow-up recommendation.',
      },
      species: {
        type: 'string',
        enum: ['rat', 'mouse', 'dog', 'other'],
        description: 'Preferred species, if chosen (rat is the default preferred rodent).',
      },
      bloodGasFollowupPlanned: {
        type: 'boolean',
        description: 'True if an arterial blood-gas / pulse-oximetry follow-up is already planned.',
      },
    },
    required: ['modality', 'route'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. design_followup_safety_study
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_FOLLOWUP_SAFETY_STUDY: AnaTool = {
  name: 'design_followup_safety_study',
  description:
    'Map core-battery, repeat-dose toxicology, class-effect, or clinical-signal triggers ' +
    'to ICH S7A follow-up (deeper cardiovascular/CNS/respiratory) and supplemental ' +
    '(renal, gastrointestinal, autonomic, immune, skeletal-muscle, endocrine) safety ' +
    'pharmacology studies. Returns, for each triggered system, a recommendation level ' +
    '(required when a clinical signal is the trigger, otherwise recommended), the study ' +
    'name, endpoints, preferred species, a trigger summary, and citations (ICH S7A 2.7.3, ' +
    'ICH M3(R2)). Returns no studies when no triggers map — follow-up and supplemental ' +
    'studies are conducted only on a cause for concern. Use when the user has a safety ' +
    'signal (renal/GI/autonomic, or a deeper CV/CNS/respiratory finding) and needs to ' +
    'know which supplemental study to run. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      triggers: {
        type: 'array',
        description:
          'List of triggers. Each maps an organ system to the source of concern and a ' +
          'short description. Systems with no trigger yield no recommended study.',
        items: {
          type: 'object',
          properties: {
            organSystem: {
              type: 'string',
              enum: [
                'cardiovascular',
                'central_nervous',
                'respiratory',
                'renal',
                'gastrointestinal',
                'autonomic',
                'immune',
                'skeletal_muscle',
                'endocrine',
              ],
              description:
                'Organ system the trigger concerns. CV/CNS/respiratory yield follow-up ' +
                'studies; the others yield supplemental studies.',
            },
            source: {
              type: 'string',
              enum: ['core_battery', 'repeat_dose_tox', 'class_effect', 'clinical_signal'],
              description:
                'Origin of the concern. A clinical_signal source escalates the ' +
                'recommendation to "required".',
            },
            description: {
              type: 'string',
              description: 'Short free-text description of the observed concern.',
            },
          },
          required: ['organSystem', 'source', 'description'],
        },
      },
      modality: {
        type: 'string',
        enum: [
          'small_molecule',
          'peptide',
          'monoclonal_antibody',
          'biologic_other',
          'oligonucleotide',
          'gene_therapy',
          'cell_therapy',
          'vaccine',
        ],
        description: 'Investigational product modality.',
      },
      cnsActive: {
        type: 'boolean',
        description:
          'True if the agent is centrally active. Adds proactive CNS/autonomic follow-up ' +
          'advisories even absent an explicit trigger.',
      },
    },
    required: ['triggers', 'modality'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_abuse_liability
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ABUSE_LIABILITY: AnaTool = {
  name: 'assess_abuse_liability',
  description:
    'Assess abuse potential per the FDA 2017 guidance "Assessment of Abuse Potential of ' +
    'Drugs". Determines whether an abuse-potential assessment is triggered (the drug is ' +
    'centrally active AND has abuse-relevant pharmacology — matched against built-in CNS ' +
    'abuse-trigger classes: opioids, GABA-A modulators, stimulants, cannabinoids, ' +
    'hallucinogens, GABA-B agonists). Returns the matched class, the required nonclinical ' +
    'studies (receptor binding, drug-discrimination, self-administration, physical-' +
    'dependence/withdrawal), the clinical studies (human abuse-potential study, clinical ' +
    'withdrawal assessment, AE signal review) with done/outstanding status, the complete ' +
    'CSA 8-factor analysis (Section 201(c), 21 U.S.C. 811(c)), and the Controlled ' +
    'Substances Act scheduling implication. Returns citations (FDA 2017 Abuse Potential ' +
    'Guidance). Use when the user has a centrally active drug and needs to plan the ' +
    'abuse-liability program or understand scheduling. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: {
        type: 'string',
        enum: [
          'small_molecule',
          'peptide',
          'monoclonal_antibody',
          'biologic_other',
          'oligonucleotide',
          'gene_therapy',
          'cell_therapy',
          'vaccine',
        ],
        description: 'Investigational product modality.',
      },
      crossesBloodBrainBarrier: {
        type: 'boolean',
        description:
          'True if the agent crosses the blood-brain barrier. A primary central-activity ' +
          'trigger for the abuse-potential assessment.',
      },
      pharmacologicalClass: {
        type: 'string',
        description:
          'Primary pharmacological target/class as free text (e.g., "mu-opioid agonist", ' +
          '"GABA-A positive modulator", "DAT inhibitor", "CB1 agonist", "5-HT2A agonist"). ' +
          'Matched case-insensitively against the built-in abuse-trigger class list.',
      },
      cnsEffectsObserved: {
        type: 'boolean',
        description:
          'True if CNS effects (euphoria, sedation, hallucination, stimulation) were observed.',
      },
      similarToKnownDrugOfAbuse: {
        type: 'boolean',
        description:
          'True if structurally or pharmacologically similar to a known drug of abuse.',
      },
      phase: {
        type: 'string',
        enum: ['preclinical', 'fih_phase1', 'phase2', 'phase3', 'marketing_application'],
        description:
          'Development phase (default phase2). Phase 3 / marketing application escalates ' +
          'the human abuse-potential study to "required".',
      },
      selfAdministrationDone: {
        type: 'boolean',
        description: 'True if a self-administration study has been completed.',
      },
      drugDiscriminationDone: {
        type: 'boolean',
        description: 'True if a drug-discrimination study has been completed.',
      },
      dependenceStudyDone: {
        type: 'boolean',
        description: 'True if a physical-dependence / withdrawal study has been completed.',
      },
    },
    required: ['modality'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Safety pharmacology tools, spread into ALL_ANA_TOOLS. */
export const SAFETY_PHARMACOLOGY_TOOLS: AnaTool[] = [
  DESIGN_CORE_BATTERY,
  ASSESS_CARDIOVASCULAR_SAFETY_PHARMACOLOGY,
  ASSESS_CNS_SAFETY_PHARMACOLOGY,
  ASSESS_RESPIRATORY_SAFETY_PHARMACOLOGY,
  DESIGN_FOLLOWUP_SAFETY_STUDY,
  ASSESS_ABUSE_LIABILITY,
];
