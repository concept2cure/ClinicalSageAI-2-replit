/**
 * Clinical Pharmacology tools — exposes deterministic knowledge engines for
 * drug-drug interaction risk, QTc assessment, organ impairment study design,
 * CYP phenotype classification, bioanalytical method design, and food effect
 * assessment to AnA as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   classify_ddi_risk               — DDI risk classification per FDA 2020 DDI Guidance & ICH M12
 *   assess_qtc_risk                 — ICH E14/S7B integrated QTc risk assessment
 *   design_organ_impairment_study   — FDA guidance-compliant organ impairment study design
 *   classify_cyp_phenotype          — CYP pharmacogenomics phenotype classification per CPIC
 *   design_bioanalytical_method     — ICH M10 bioanalytical method validation design
 *   assess_food_effect              — FDA food effect study design and BCS-based predictions
 *
 * @module server/services/ana/clinicalPharmacologyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a clinical pharmacology submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_ddi_risk
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_DDI_RISK: AnaTool = {
  name: 'classify_ddi_risk',
  description:
    'Classify drug-drug interaction risk based on in vitro CYP inhibition/induction data ' +
    'and transporter inhibition data per FDA 2020 DDI Guidance and ICH M12. Returns a risk ' +
    'classification (no risk, low, moderate, high) for each CYP and transporter pathway, ' +
    'recommended clinical DDI study requirements, mechanistic static model (R1, R2, net ' +
    'effect) predictions, and regulatory citations. Use when the user needs to assess whether ' +
    'a perpetrator drug is likely to cause clinically relevant interactions with a victim drug ' +
    'or needs to determine which in vivo DDI studies are required for an IND/NDA. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      perpetratorDrug: {
        type: 'string',
        description:
          'Name of the perpetrator (interacting) drug — the drug whose inhibition or induction ' +
          'potential is being assessed against the victim drug metabolic pathways.',
      },
      inhibitionData: {
        type: 'object',
        description:
          'CYP enzyme inhibition data as Ki values in µM for each CYP isoform tested. ' +
          'Properties are CYP1A2, CYP2B6, CYP2C8, CYP2C9, CYP2C19, CYP2D6, CYP3A4. ' +
          'Lower Ki indicates stronger inhibition. Used to compute the R1 value ' +
          '(1 + [I]/Ki) per FDA 2020 DDI Guidance basic model.',
      },
      inductionData: {
        type: 'object',
        description:
          'CYP induction fold-change data from in vitro hepatocyte assays. Properties are ' +
          'CYP1A2, CYP2B6, CYP3A4 representing fold-change in mRNA at clinically relevant ' +
          'concentrations. Fold-change >= 2 relative to vehicle control typically triggers ' +
          'the need for a clinical induction study per FDA guidance.',
      },
      transporterInhibition: {
        type: 'object',
        description:
          'IC50 values in µM for key drug transporters. Properties include P-gp, BCRP, ' +
          'OATP1B1, OATP1B3, OAT1, OAT3, OCT2, MATE1, MATE2K. Used to assess transporter-' +
          'mediated DDI risk by comparing IC50 to clinically relevant systemic or portal ' +
          'concentrations per FDA and ICH M12 decision trees.',
      },
      perpetratorCmax_uM: {
        type: 'number',
        description:
          'Unbound (free) Cmax of the perpetrator drug at steady state in µM. This is the ' +
          'primary concentration used in the basic static DDI model (R value calculation). ' +
          'Must reflect protein-binding-adjusted free concentration, not total Cmax.',
      },
      perpetratorDose_mg: {
        type: 'number',
        description:
          'Single oral dose of the perpetrator drug in mg. Used to estimate gut (luminal) ' +
          'concentration ([I]gut = dose / 250 mL) for assessment of intestinal CYP3A4 and ' +
          'P-gp inhibition per FDA 2020 DDI Guidance.',
      },
      victimDrug: {
        type: 'string',
        description:
          'Name of the victim (affected) drug whose exposure may be altered by the perpetrator. ' +
          'Used in reporting and to cross-reference known metabolic pathways.',
      },
      victimFractionMetabolized: {
        type: 'object',
        description:
          'Fraction of the victim drug metabolized by each CYP enzyme (0 to 1). Properties ' +
          'correspond to CYP isoforms (e.g., CYP3A4: 0.8, CYP2D6: 0.15). The sum across all ' +
          'pathways should approximate the total fraction metabolized. Used to compute the net ' +
          'effect on victim AUC via the mechanistic static model.',
      },
      victimTherapeuticIndex: {
        type: 'string',
        enum: ['narrow', 'moderate', 'wide'],
        description:
          'Therapeutic index of the victim drug. Narrow therapeutic index (NTI) victims ' +
          '(e.g., warfarin, digoxin, phenytoin) require more conservative DDI risk thresholds ' +
          'and may mandate clinical DDI studies even when the basic model predicts low risk.',
      },
    },
    required: ['perpetratorCmax_uM', 'victimTherapeuticIndex'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. assess_qtc_risk
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_QTC_RISK: AnaTool = {
  name: 'assess_qtc_risk',
  description:
    'Perform an integrated QTc prolongation risk assessment following the ICH E14/S7B ' +
    'framework. Evaluates hERG safety margin, clinical ΔΔQTc data (if available), and ' +
    'multi-ion channel data to classify proarrhythmic risk and determine whether a thorough ' +
    'QT (TQT) study or concentration-QTc analysis is needed. Returns the hERG safety margin ' +
    'interpretation, risk category (low/intermediate/high), recommended nonclinical and ' +
    'clinical strategy, and regulatory citations (ICH E14 R3, ICH S7B, FDA E14 Q&A). Use ' +
    'when assessing cardiac safety liability of a new drug candidate or determining the ' +
    'regulatory path for QT evaluation. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      drugName: {
        type: 'string',
        description:
          'Name of the drug candidate being assessed for QTc prolongation risk.',
      },
      hergIC50_uM: {
        type: 'number',
        description:
          'IC50 for inhibition of the hERG (Kv11.1) potassium channel in µM, determined ' +
          'from in vitro patch-clamp studies. This is the primary nonclinical cardiac safety ' +
          'endpoint. Lower values indicate greater hERG liability.',
      },
      therapeuticCmax_uM: {
        type: 'number',
        description:
          'Unbound (free) Cmax at the highest proposed therapeutic dose in µM. Used to ' +
          'calculate the hERG safety margin (hERG IC50 / free Cmax). A margin < 30-fold ' +
          'is generally considered a risk signal per ICH S7B.',
      },
      safetyMarginMultiple: {
        type: 'number',
        description:
          'Pre-calculated hERG IC50 / free Cmax ratio, if available. If not provided, the ' +
          'engine computes it from hergIC50_uM and therapeuticCmax_uM. Values >= 30 are ' +
          'generally considered low risk.',
      },
      drugClass: {
        type: 'string',
        description:
          'Pharmacological class of the drug (e.g., "fluoroquinolone", "antipsychotic", ' +
          '"tyrosine kinase inhibitor"). Certain drug classes have known QT risk profiles ' +
          'that inform the risk assessment.',
      },
      hasClinicalQTcData: {
        type: 'boolean',
        description:
          'Whether clinical QTc data (from a TQT study or concentration-QTc analysis) ' +
          'are available. If true, clinicalDeltaQTc_ms should be provided.',
      },
      clinicalDeltaQTc_ms: {
        type: 'number',
        description:
          'Observed placebo-adjusted change from baseline QTcF (ΔΔQTc) at the highest ' +
          'clinically relevant exposure in milliseconds. The ICH E14 threshold of ' +
          'regulatory concern is an upper bound of the 90% CI > 10 ms.',
      },
      ionChannelData: {
        type: 'object',
        description:
          'IC50 values in µM for additional cardiac ion channels — Nav1.5 (sodium) and ' +
          'Cav1.2 (L-type calcium). Multi-ion channel data support a CiPA-style integrated ' +
          'risk assessment. Blockade of Nav1.5 or Cav1.2 may mitigate or exacerbate hERG-' +
          'mediated QT risk.',
      },
      isFirstInClass: {
        type: 'boolean',
        description:
          'Whether this drug represents a first-in-class mechanism of action. First-in-class ' +
          'compounds may lack class-level QT safety data, potentially requiring a more ' +
          'conservative nonclinical-to-clinical bridging strategy.',
      },
    },
    required: ['hergIC50_uM', 'therapeuticCmax_uM'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. design_organ_impairment_study
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_ORGAN_IMPAIRMENT_STUDY: AnaTool = {
  name: 'design_organ_impairment_study',
  description:
    'Design a regulatory-compliant organ impairment (hepatic or renal) pharmacokinetic study ' +
    'based on the drug elimination pathway, protein binding, and therapeutic index, following ' +
    'FDA Guidance for Pharmacokinetics in Patients with Impaired Renal/Hepatic Function. ' +
    'Returns the recommended study design (full vs. reduced), Child-Pugh or eGFR staging ' +
    'groups, sample size per group, PK sampling strategy, dose adjustment decision framework, ' +
    'dialysis study recommendations, and regulatory citations (FDA Renal Impairment Guidance ' +
    '2020, FDA Hepatic Impairment Guidance 2003, EMA Guideline on Renal/Hepatic Impairment). ' +
    'Use when planning organ impairment studies for an IND/NDA or determining whether dose ' +
    'adjustments are needed for special populations. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      eliminationPathway: {
        type: 'string',
        enum: ['renal', 'hepatic', 'mixed'],
        description:
          'Primary route of drug elimination. "renal" = predominantly excreted unchanged in ' +
          'urine (fe >= 0.5); "hepatic" = predominantly metabolized by liver enzymes; "mixed" = ' +
          'significant contribution from both pathways. Determines whether a renal impairment ' +
          'study, hepatic impairment study, or both are required.',
      },
      fractionExcretedUnchanged: {
        type: 'number',
        description:
          'Fraction of the administered dose excreted unchanged in urine (fe, 0 to 1). ' +
          'fe >= 0.3 generally triggers a renal impairment study per FDA guidance. ' +
          'fe >= 0.5 typically indicates renal elimination is the primary pathway.',
      },
      primaryMetabolicPathway: {
        type: 'string',
        description:
          'Primary hepatic metabolic pathway (e.g., "CYP3A4", "CYP2D6", "UGT1A1", "aldehyde ' +
          'oxidase"). Informs which Child-Pugh severity groups are most relevant and whether ' +
          'metabolic pathway-specific polymorphisms confound the hepatic impairment study design.',
      },
      proteinBinding_percent: {
        type: 'number',
        description:
          'Plasma protein binding as a percentage (0 to 100). Highly bound drugs (> 90%) ' +
          'may show disproportionate increases in unbound fraction in organ impairment ' +
          '(especially hepatic impairment with hypoalbuminemia), requiring unbound PK analysis.',
      },
      therapeuticIndex: {
        type: 'string',
        enum: ['narrow', 'moderate', 'wide'],
        description:
          'Therapeutic index of the drug. Narrow therapeutic index drugs require a full ' +
          'organ impairment study with all severity groups and more conservative dose ' +
          'adjustment thresholds. Wide therapeutic index drugs may qualify for a reduced study.',
      },
      drugName: {
        type: 'string',
        description:
          'Name of the drug for which the organ impairment study is being designed.',
      },
      halfLife_hours: {
        type: 'number',
        description:
          'Elimination half-life in hours. Informs PK sampling duration (minimum 3-5 ' +
          'half-lives) and washout period for crossover designs. Long half-life drugs ' +
          'may require parallel-group designs.',
      },
      isDialyzable: {
        type: 'boolean',
        description:
          'Whether the drug is expected to be removed by hemodialysis, based on molecular ' +
          'weight (< 500 Da), protein binding (< 80%), and volume of distribution. If true, ' +
          'a supplemental dialysis PK study is recommended per FDA guidance.',
      },
    },
    required: ['eliminationPathway', 'fractionExcretedUnchanged', 'therapeuticIndex'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. classify_cyp_phenotype
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_CYP_PHENOTYPE: AnaTool = {
  name: 'classify_cyp_phenotype',
  description:
    'Classify CYP enzyme metabolizer phenotype (poor, intermediate, normal/extensive, rapid, ' +
    'ultrarapid) based on diplotype or activity score per CPIC (Clinical Pharmacogenetics ' +
    'Implementation Consortium) guidelines. Returns the predicted phenotype, activity score, ' +
    'expected metabolic capacity relative to normal metabolizers, population frequency for the ' +
    'specified ethnicity, clinical implications for drug dosing, and CPIC guideline citations. ' +
    'Use when interpreting pharmacogenomic test results for CYP2D6, CYP2C19, CYP2C9, or ' +
    'CYP2B6 to guide individualized drug therapy. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      gene: {
        type: 'string',
        enum: ['CYP2D6', 'CYP2C19', 'CYP2C9', 'CYP2B6'],
        description:
          'CYP gene being classified. Each gene has its own activity score scale, allele ' +
          'functionality assignments, and phenotype thresholds defined by CPIC. CYP2D6 uses ' +
          'a continuous activity score system; CYP2C19 uses diplotype-based classification ' +
          'with gain-of-function (*17) and loss-of-function (*2, *3) alleles.',
      },
      diplotype: {
        type: 'string',
        description:
          'Star allele diplotype notation (e.g., "*1/*2", "*1/*17", "*2/*3", "*1xN/*2"). ' +
          'Each star allele maps to a defined functionality (normal, decreased, no function, ' +
          'increased) per CPIC gene-specific tables. Gene duplications are denoted with "xN" ' +
          '(e.g., "*1x2" for a CYP2D6 gene duplication).',
      },
      activityScore: {
        type: 'number',
        description:
          'Numerical activity score as an alternative to diplotype input. For CYP2D6, each ' +
          'allele contributes 0 (no function), 0.25 (decreased), 0.5 (decreased), or 1 ' +
          '(normal function) to the total score. Phenotype thresholds: 0 = PM, 0.25-1 = IM, ' +
          '1.25-2.25 = NM, > 2.25 = UM.',
      },
      ethnicity: {
        type: 'string',
        description:
          'Self-reported ethnicity or biogeographic ancestry group for population frequency ' +
          'context (e.g., "European", "African American", "East Asian", "South Asian", ' +
          '"Hispanic/Latino"). Allele and phenotype frequencies vary substantially across ' +
          'populations — e.g., CYP2D6 PM prevalence is ~5-10% in Europeans vs. ~1% in East Asians.',
      },
    },
    required: ['gene'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. design_bioanalytical_method
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_BIOANALYTICAL_METHOD: AnaTool = {
  name: 'design_bioanalytical_method',
  description:
    'Design and specify the validation parameters for a bioanalytical method following ICH M10 ' +
    '(Bioanalytical Method Validation and Study Sample Analysis, 2022) guidelines. Returns the ' +
    'recommended platform (LC-MS/MS, LBA, hybrid LBA-LC-MS/MS), calibration curve design, ' +
    'accuracy and precision acceptance criteria, selectivity/specificity requirements, stability ' +
    'testing plan, incurred sample reanalysis (ISR) requirements, and regulatory citations. ' +
    'Use when developing or validating a bioanalytical method for PK, immunogenicity, biomarker, ' +
    'or pharmacodynamic sample analysis in regulated studies. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      analyteType: {
        type: 'string',
        enum: ['small_molecule', 'peptide', 'large_molecule', 'biomarker', 'adc'],
        description:
          'Category of the analyte. "small_molecule" = MW < ~1000 Da, typically analyzed by ' +
          'LC-MS/MS; "peptide" = MW 1000-5000 Da, may use LC-MS/MS or LBA; "large_molecule" = ' +
          'therapeutic proteins/antibodies, typically analyzed by LBA (ELISA, ECL); "biomarker" = ' +
          'endogenous analyte requiring surrogate matrix/analyte approaches; "adc" = antibody-drug ' +
          'conjugate requiring multiple assays (total antibody, conjugated, unconjugated payload).',
      },
      analyteName: {
        type: 'string',
        description:
          'Name of the analyte (drug, metabolite, or biomarker) to be quantified. Used for ' +
          'reporting and to cross-reference known analytical challenges (e.g., instability, ' +
          'interconversion, protein binding interference).',
      },
      matrix: {
        type: 'string',
        enum: ['plasma', 'serum', 'urine', 'tissue', 'csf', 'dried_blood_spot'],
        description:
          'Biological matrix in which the analyte will be measured. Each matrix has specific ' +
          'sample processing, stability, and interference considerations per ICH M10. Dried ' +
          'blood spot (DBS) methods have additional hematocrit and spot homogeneity requirements.',
      },
      intendedUse: {
        type: 'string',
        enum: ['pk', 'immunogenicity', 'biomarker', 'pharmacodynamics'],
        description:
          'Purpose of the bioanalytical method. "pk" = pharmacokinetic quantitation requiring ' +
          'full validation with definitive accuracy criteria; "immunogenicity" = anti-drug ' +
          'antibody (ADA) detection following tiered approach (screening, confirmatory, titer); ' +
          '"biomarker" = fit-for-purpose validation with context-dependent acceptance criteria; ' +
          '"pharmacodynamics" = PD endpoint measurement.',
      },
      expectedConcentrationRange: {
        type: 'object',
        description:
          'Expected concentration range with LLOQ (lower limit of quantitation) and ULOQ ' +
          '(upper limit of quantitation) in ng/mL or appropriate units. Defines the calibration ' +
          'curve range. ICH M10 requires the range to cover the expected sample concentrations ' +
          'and the LLOQ to be the lowest standard with acceptable accuracy (within +/- 20%) ' +
          'and precision (CV <= 20%).',
      },
      isEndogenous: {
        type: 'boolean',
        description:
          'Whether the analyte is endogenous (naturally present in the matrix). Endogenous ' +
          'analytes require surrogate matrix or surrogate analyte approaches for calibration ' +
          'curve preparation since analyte-free matrix is not available. Adds complexity to ' +
          'selectivity and accuracy assessments per ICH M10.',
      },
      hasActivMetabolites: {
        type: 'boolean',
        description:
          'Whether the parent drug has pharmacologically active metabolites that should be ' +
          'quantified or whose interference with the parent assay must be assessed. May ' +
          'require separate validated methods for each active metabolite.',
      },
      molecularWeight_Da: {
        type: 'number',
        description:
          'Molecular weight of the analyte in Daltons. Informs platform selection: < 1000 Da ' +
          'typically LC-MS/MS; 1000-5000 Da may use either platform; > 5000 Da typically LBA. ' +
          'Also relevant for DBS hematocrit correction and extraction efficiency optimization.',
      },
    },
    required: ['analyteType', 'matrix', 'intendedUse'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_food_effect
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_FOOD_EFFECT: AnaTool = {
  name: 'assess_food_effect',
  description:
    'Assess food effect risk and design a food effect bioavailability study based on BCS ' +
    'classification, dosage form characteristics, and physicochemical properties per FDA ' +
    'Guidance for Industry on Food-Effect Bioavailability and Fed Bioequivalence Studies ' +
    '(2002) and BCS framework. Returns the predicted food effect risk (low/moderate/high), ' +
    'recommended study design (single-dose, crossover, fasting vs. high-fat meal), PK endpoints, ' +
    'labeling implications, and regulatory citations. Use when determining whether a food effect ' +
    'study is needed, designing the protocol, or predicting food effect magnitude from ' +
    'physicochemical properties. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      bcsClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description:
          'BCS classification (I-IV). BCS Class I drugs (high solubility, high permeability) ' +
          'have the lowest food effect risk. BCS Class II drugs (low solubility) often show ' +
          'positive food effects (increased absorption with food due to bile salt solubilization). ' +
          'BCS Class III drugs (low permeability) may show negative food effects (decreased ' +
          'absorption due to intestinal transporter saturation or GI transit changes).',
      },
      dosageForm: {
        type: 'string',
        enum: [
          'immediate_release_tablet',
          'immediate_release_capsule',
          'modified_release',
          'suspension',
          'solution',
        ],
        description:
          'Dosage form of the drug product. Modified-release products always require food effect ' +
          'studies due to potential for dose dumping. Solutions have the lowest food effect risk. ' +
          'Immediate-release solid dosage forms require food effect assessment based on BCS class ' +
          'and physicochemical properties.',
      },
      logP: {
        type: 'number',
        description:
          'Logarithm of the octanol-water partition coefficient (log P). Lipophilic drugs ' +
          '(log P > 2) are more likely to show positive food effects due to enhanced ' +
          'solubilization by bile salts and dietary lipids in the fed state.',
      },
      isSolubilitypHDependent: {
        type: 'boolean',
        description:
          'Whether the drug exhibits pH-dependent solubility. pH-dependent drugs may show ' +
          'food effects related to gastric pH changes in the fed state (gastric pH increases ' +
          'to 4-5 after a meal). Basic drugs with pH-dependent solubility may have decreased ' +
          'absorption with food.',
      },
      formulationType: {
        type: 'string',
        description:
          'Specific formulation technology used (e.g., "solid dispersion", "lipid-based", ' +
          '"nanoparticle", "enteric-coated", "osmotic controlled-release"). Certain formulation ' +
          'strategies (lipid-based, amorphous solid dispersions) may mitigate or exacerbate ' +
          'food effects depending on the drug properties.',
      },
      highestDoseStrength_mg: {
        type: 'number',
        description:
          'Highest proposed dose strength in mg. Higher doses relative to solubility increase ' +
          'the dose number and the likelihood of a clinically meaningful food effect, ' +
          'particularly for BCS Class II and IV drugs.',
      },
      drugName: {
        type: 'string',
        description:
          'Name of the drug substance. Used for reporting and cross-referencing known food ' +
          'effect data from the literature.',
      },
      isModifiedRelease: {
        type: 'boolean',
        description:
          'Whether the product is a modified-release (extended-release, delayed-release, or ' +
          'controlled-release) formulation. Modified-release products always require food effect ' +
          'studies per FDA guidance due to the risk of dose dumping — rapid, uncontrolled release ' +
          'of the drug in the presence of food, alcohol, or altered GI physiology.',
      },
    },
    required: ['bcsClass', 'dosageForm'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Clinical pharmacology tools, spread into ALL_ANA_TOOLS. */
export const CLINICAL_PHARMACOLOGY_TOOLS: AnaTool[] = [
  CLASSIFY_DDI_RISK,
  ASSESS_QTC_RISK,
  DESIGN_ORGAN_IMPAIRMENT_STUDY,
  CLASSIFY_CYP_PHENOTYPE,
  DESIGN_BIOANALYTICAL_METHOD,
  ASSESS_FOOD_EFFECT,
];
