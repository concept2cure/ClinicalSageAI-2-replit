/**
 * Respiratory / Pulmonary therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/respiratory
 */
import type { TherapeuticAreaProfile } from './types.js';

export const respiratoryProfile: TherapeuticAreaProfile = {
  "id": "respiratory",
  "displayName": "Respiratory / Pulmonary",
  "description": "Regulatory profile for drug and biologic development in asthma, COPD, idiopathic pulmonary fibrosis, cystic fibrosis, bronchiectasis, pulmonary arterial hypertension, and related airway/parenchymal/vascular lung disease. Emphasizes the tight coupling between the drug substance, the delivery device, and the clinical endpoint: for orally inhaled and nasal drug products (OINDP) the Module 3 device/CMC package, the Module 5 spirometry data, and the Module 2.7.4 safety narrative must all be internally consistent. FDA review sits primarily with the Division of Pulmonology, Allergy, and Critical Care (DPACC) in OND Office of Immunology and Inflammation; EMA review is governed by the CHMP asthma, COPD, and inhaled-product quality guidelines. Profiles the recurring review issues: unvalidated or non-ATS/ERS-conformant spirometry, in vitro/in vivo bioequivalence failures for inhaled generics and combination products, inadequate exacerbation adjudication, and unjustified handling of rescue-medication and treatment-discontinuation intercurrent events.",
  "contextRules": [
    {
      "id": "resp-device-drug-integration",
      "scope": "always",
      "instruction": "Whenever the product is an orally inhaled or nasal drug product (MDI, DPI, soft-mist inhaler, nebulizer solution), draft every module so that the drug-device combination is treated as a single product. Module 2.3.P and 3.2.P must describe delivered dose uniformity (DDU) over the labeled number of actuations and through-life, aerodynamic particle size distribution (APSD) by cascade impactor with a justified stage-grouping/EDA approach, spray pattern/plume geometry, priming and re-priming, and robustness to patient handling (drop, temperature cycling, orientation). Cross-reference the identical device configuration and lot(s) used in the pivotal Module 5 trials; if the commercial device differs from the clinical device, include a bridging strategy (in vitro comparability plus, where the difference could change lung deposition, a clinical or PK bridge) rather than a bare assertion of equivalence.",
      "severity": "critical",
      "appliesTo": "3.2.P / 2.3.P / 5.3.1",
      "triggerKeywords": [
        "inhaler",
        "MDI",
        "DPI",
        "nebulizer",
        "aerodynamic particle size",
        "delivered dose",
        "actuation",
        "spacer",
        "device"
      ],
      "guidanceRef": "FDA Guidance: Metered Dose Inhaler (MDI) and Dry Powder Inhaler (DPI) Products - Quality Considerations (2018 draft)"
    },
    {
      "id": "resp-spirometry-standardization",
      "scope": "section",
      "instruction": "In every pivotal efficacy study report, document that spirometry was performed to the current ATS/ERS technical standard: equipment specification and calibration/verification logs, acceptability and repeatability criteria, technician training and certification, bronchodilator and study-drug withholding periods before testing, time-of-day standardization, and use of a central over-reading facility with documented adjudication of unacceptable maneuvers. State the reference equations used for percent-predicted values (e.g. GLI global equations) and pre-specify them; do not switch reference equations post hoc. Report both the absolute change in FEV1 (mL) and, where relevant, trough versus peak timing, and define trough FEV1 unambiguously relative to last-dose timing.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "FEV1",
        "spirometry",
        "peak flow",
        "FVC",
        "bronchodilator",
        "percent predicted",
        "reversibility"
      ],
      "guidanceRef": "ATS/ERS Standardization of Spirometry (2019 update); FDA Guidance for Industry: Chronic Obstructive Pulmonary Disease - Developing Drugs for Treatment"
    },
    {
      "id": "resp-exacerbation-definition",
      "scope": "section",
      "instruction": "When an exacerbation endpoint (asthma exacerbation, COPD moderate/severe exacerbation, CF pulmonary exacerbation, bronchiectasis exacerbation) is used, the Clinical Overview must state a single protocol-prespecified, event-driven definition with objective anchors (systemic corticosteroid course of a stated minimum duration, antibiotic use, unscheduled healthcare encounter, hospitalization, death) and describe how events were captured, how contiguous events were separated by a defined event-free window, and whether a blinded independent adjudication committee reviewed events. Do not present pooled 'any exacerbation' rates that mix severity strata without also presenting the prespecified severity-stratified rates.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "exacerbation",
        "flare",
        "systemic corticosteroid",
        "hospitalization",
        "rescue antibiotic",
        "event rate"
      ],
      "guidanceRef": "FDA Guidance for Industry: Chronic Obstructive Pulmonary Disease - Developing Drugs for Treatment (2016 draft)"
    },
    {
      "id": "resp-inhaled-safety-class",
      "scope": "section",
      "instruction": "Structure the Summary of Clinical Safety around the recognized class risks for the modality: for inhaled corticosteroids, oropharyngeal candidiasis, dysphonia, pneumonia (particularly in COPD), hypothalamic-pituitary-adrenal axis suppression, bone mineral density, ocular effects (cataract, glaucoma), and growth velocity in pediatric subjects; for LABA/LAMA, cardiovascular events, arrhythmia, paradoxical bronchospasm, urinary retention and anticholinergic effects; for biologics, hypersensitivity/anaphylaxis, helminth infection, immunogenicity, and injection-site reactions. Present each as a prespecified adverse event of special interest with a search strategy (MedDRA SMQ or a documented custom query) rather than relying on investigator verbatim terms.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "inhaled corticosteroid",
        "pneumonia",
        "candidiasis",
        "HPA axis",
        "paradoxical bronchospasm",
        "growth velocity",
        "bone mineral density"
      ],
      "guidanceRef": "ICH E2E Pharmacovigilance Planning; FDA Guidance: Orally Inhaled and Intranasal Corticosteroids - Evaluation of the Effects on Growth in Children"
    },
    {
      "id": "resp-pediatric-growth",
      "scope": "module",
      "instruction": "For any orally inhaled or intranasal corticosteroid intended for pediatric use, include a dedicated growth study of at least 52 weeks in prepubertal children using stadiometry with duplicate/triplicate measurements by a trained and certified observer, standardized time of day, and a documented plan for handling growth-velocity outliers. The study must be designed to detect a clinically meaningful difference in growth velocity, and the resulting labeled statement must be traceable to that study. Do not substitute knemometry or short-term HPA-axis surrogates for the required growth study without a documented agreement from the Agency.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "pediatric",
        "growth velocity",
        "stadiometry",
        "prepubertal",
        "children",
        "adolescent"
      ],
      "guidanceRef": "FDA Guidance: Orally Inhaled and Intranasal Corticosteroids - Evaluation of the Effects on Growth in Children (2007)"
    },
    {
      "id": "resp-bioequivalence-generic",
      "scope": "section",
      "instruction": "For an ANDA or hybrid application referencing an inhaled product, present the weight-of-evidence bioequivalence package explicitly as its three components: (1) in vitro comparative performance (single-actuation content, APSD, and where applicable device resistance and priming) analyzed with population bioequivalence where the product-specific guidance requires it; (2) comparative PK bioequivalence, with charcoal block when systemic absorption is predominantly gastrointestinal, to address systemic exposure/safety; and (3) comparative clinical endpoint bioequivalence with a demonstrated assay-sensitivity design, unless waived under the applicable product-specific guidance. Address device sameness (external operating principle, dose counter, actuation force) separately from formulation sameness.",
      "severity": "critical",
      "appliesTo": "5.3.1.2",
      "triggerKeywords": [
        "bioequivalence",
        "ANDA",
        "generic",
        "charcoal block",
        "population bioequivalence",
        "device sameness",
        "product-specific guidance"
      ],
      "guidanceRef": "FDA Product-Specific Guidances for Generic Drug Development (inhalation route); EMA Guideline on the Requirements for Clinical Documentation for Orally Inhaled Products (CHMP/EWP/4151/00 Rev.1)"
    },
    {
      "id": "resp-nonclinical-inhalation-tox",
      "scope": "module",
      "instruction": "For inhaled products, Module 4 must present inhalation toxicology by the intended clinical route with achieved (analytically confirmed) chamber concentrations, particle size characterization of the test atmosphere within the respirable range, and exposure margins expressed on both a delivered-dose-to-lung and systemic-AUC basis. Include local respiratory tract histopathology across the full airway (nasal levels, larynx, trachea, bronchi, lung parenchyma) and address excipient and propellant toxicology separately from the active moiety, including any novel excipient that requires its own qualification.",
      "severity": "major",
      "appliesTo": "4",
      "triggerKeywords": [
        "inhalation toxicology",
        "nose-only",
        "chamber concentration",
        "larynx",
        "novel excipient",
        "propellant",
        "respirable fraction"
      ],
      "guidanceRef": "ICH M3(R2) Nonclinical Safety Studies for the Conduct of Human Clinical Trials"
    },
    {
      "id": "resp-pro-instrument-validation",
      "scope": "section",
      "instruction": "When a patient-reported outcome (SGRQ, CAT, ACQ, ACT, E-RS:COPD, K-BILD, L-PF) supports a labeling claim, provide the full COA evidence dossier: conceptual framework linked to the target concept of interest, evidence of content validity in the specific population and disease severity being studied, psychometric performance (reliability, construct validity, ability to detect change) in the trial dataset itself, the prespecified responder definition with its anchor-based derivation, and documentation of translations and electronic migration equivalence. Do not cite a historical minimal clinically important difference without demonstrating it applies to the study population.",
      "severity": "major",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "SGRQ",
        "CAT score",
        "ACQ",
        "E-RS",
        "patient reported outcome",
        "responder definition",
        "MCID",
        "quality of life"
      ],
      "guidanceRef": "FDA Patient-Focused Drug Development Guidance Series (Guidances 1-4)"
    },
    {
      "id": "resp-ipf-fvc-decline",
      "scope": "section",
      "instruction": "For idiopathic pulmonary fibrosis and progressive pulmonary fibrosis programs, justify the primary endpoint of annual rate of decline in forced vital capacity with a prespecified analysis model (typically a random-coefficient/mixed model on repeated measures over at least 52 weeks), state whether FVC is expressed in mL or percent predicted and why, and prespecify how death and lung transplant are handled within the estimand rather than treating them as ordinary missing data. Support the clinical meaningfulness of the FVC effect with prespecified secondary evidence (time to first acute exacerbation, respiratory hospitalization, all-cause mortality, and a validated symptom COA).",
      "severity": "major",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "idiopathic pulmonary fibrosis",
        "IPF",
        "forced vital capacity",
        "FVC decline",
        "progressive fibrosing",
        "lung transplant",
        "antifibrotic"
      ],
      "guidanceRef": "EMA Guideline on Clinical Investigation of Medicinal Products for the Treatment of Idiopathic Pulmonary Fibrosis (EMA/CHMP/1965/2013)"
    },
    {
      "id": "resp-rescue-medication-estimand",
      "scope": "section",
      "instruction": "Define rescue short-acting bronchodilator use as an explicit intercurrent event in the estimand, not merely as a secondary endpoint. State the chosen strategy (treatment policy, hypothetical, or composite) for rescue use, for addition of open-label controller therapy, and for treatment discontinuation, and confirm that the same strategy is applied consistently across the primary and key secondary endpoints. When a hypothetical strategy is used, describe the imputation model and demonstrate through sensitivity analyses that the conclusion does not depend on the untestable missing-at-random assumption.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "rescue medication",
        "albuterol use",
        "intercurrent event",
        "estimand",
        "treatment policy",
        "discontinuation",
        "open label rescue"
      ],
      "guidanceRef": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials"
    }
  ],
  "riskFactors": [
    "Device-clinical mismatch: pivotal efficacy data generated with a clinical-stage inhaler that differs from the to-be-marketed device in dose counter, mouthpiece geometry, resistance, or fill, with no adequate in vitro plus clinical bridge, forcing a Complete Response or a repeat trial.",
    "Aerodynamic particle size distribution and delivered dose uniformity specifications set from limited batch history and not statistically justified, producing a CMC deficiency that blocks approval even when clinical data are positive.",
    "Spirometry quality failure: non-ATS/ERS-conformant maneuvers, missing calibration records, inconsistent bronchodilator withholding, or site-level over-reading, undermining the primary endpoint at inspection.",
    "Exacerbation endpoint fragility: post hoc redefinition of what constitutes an exacerbation, uncounted contiguous events, or unblinded investigator determination without independent adjudication, leading the review division to discount the treatment effect.",
    "High and differential dropout in 52-week COPD and IPF trials, especially in the placebo arm, combined with a naive MMAR-based analysis that inflates the apparent treatment effect.",
    "Pneumonia signal with inhaled corticosteroids in COPD not characterized by radiographic confirmation, severity, or time-to-onset, leaving a benefit-risk gap that drives labeling restrictions.",
    "Pediatric growth and HPA-axis data absent or generated with an inadequate stadiometry protocol, resulting in a PREA deferral becoming a post-marketing requirement or a pediatric indication being denied.",
    "Leachables and extractables from the canister, valve, elastomeric components, or blister foil not qualified against a justified safety concern threshold for the inhalation route.",
    "Nonclinical inhalation toxicology conducted at particle sizes or achieved concentrations that do not bracket the clinical delivered dose, so exposure margins cannot be defended.",
    "Reliance on a single pivotal trial in a chronic non-life-threatening indication such as asthma or COPD without the confirmatory evidence structure FDA expects (a second adequate and well-controlled trial or a compelling internally replicated dataset).",
    "Immunogenicity assay for a respiratory biologic not validated for drug tolerance at trough concentrations, so anti-drug-antibody incidence and its relationship to exposure and efficacy loss cannot be interpreted.",
    "Environmental and regulatory exposure on propellants: transition from HFA-134a/227ea to low-global-warming-potential propellants requiring new stability, compatibility, and possibly clinical bridging data mid-program."
  ],
  "commonGaps": [
    {
      "ctdSection": "3.2.P.5.1",
      "patterns": [
        "missing delivered dose uniformity",
        "no aerodynamic particle size",
        "apsd specification not justified",
        "acceptance criteria not statistically",
        "insufficient batches to set specification",
        "spray pattern not characterized",
        "through-life dose not tested"
      ],
      "description": "Drug product specification for the inhaler omits, or under-specifies, the critical aerosol performance attributes - delivered dose uniformity through container life, aerodynamic particle size distribution with justified stage groupings, and where applicable spray pattern and plume geometry - or sets acceptance criteria from too few batches to be statistically defensible.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Metered Dose Inhaler and Dry Powder Inhaler Products - Quality Considerations"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "spirometry not standardized",
        "no ats/ers",
        "calibration records missing",
        "withholding period not specified",
        "reference equation changed",
        "no central over-reading",
        "acceptability criteria not stated"
      ],
      "description": "Spirometry procedures are not documented to the ATS/ERS standard: no calibration or verification log, no stated acceptability/repeatability criteria, no central over-reading, undocumented bronchodilator withholding, or reference equations selected after unblinding.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ATS/ERS Standardization of Spirometry (2019)"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "exacerbation definition not prespecified",
        "no adjudication committee",
        "event window not defined",
        "severity strata pooled",
        "post hoc exacerbation",
        "investigator determined exacerbation only"
      ],
      "description": "Exacerbation endpoint lacks a single prespecified objective definition, an event-free separation window, or independent blinded adjudication; severity strata are pooled or redefined after data review.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Chronic Obstructive Pulmonary Disease - Developing Drugs for Treatment"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "estimand not defined",
        "intercurrent events not specified",
        "rescue use not addressed",
        "inconsistent estimand strategy",
        "missing data assumption not tested",
        "no tipping point analysis"
      ],
      "description": "Estimand for the primary endpoint does not name rescue-medication use, addition of open-label controller therapy, or treatment discontinuation as intercurrent events, or applies inconsistent strategies across primary and key secondary endpoints.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "aesi not prespecified",
        "no smq search",
        "pneumonia not radiographically confirmed",
        "candidiasis not captured",
        "hpa axis not assessed",
        "paradoxical bronchospasm not analyzed",
        "cardiovascular events not adjudicated"
      ],
      "description": "Class-specific adverse events of special interest for the inhaled or biologic modality are not analyzed with prespecified standardized queries; pneumonia is reported on investigator term alone without radiographic confirmation or severity grading.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E2E"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "pro not validated",
        "no content validity",
        "mcid not derived",
        "responder definition post hoc",
        "psychometrics not reported",
        "translation equivalence missing",
        "epro migration not validated"
      ],
      "description": "Patient-reported outcome supporting a labeling claim lacks content validity evidence in the studied population, in-trial psychometric performance, or an anchor-based responder threshold; a historical MCID is cited without justification for the current population.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Patient-Focused Drug Development Guidance 3"
    },
    {
      "ctdSection": "3.2.P.2",
      "patterns": [
        "leachables not qualified",
        "no extractables study",
        "elastomer not evaluated",
        "safety concern threshold not applied",
        "no correlation extractables leachables",
        "container closure compatibility not shown"
      ],
      "description": "Extractables and leachables program for the container closure and device (canister coating, valve elastomers, actuator, blister foil, nebulizer components) is incomplete: no controlled extraction study, no correlation of extractables to observed leachables, or no safety qualification against an inhalation-route threshold.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Container Closure Systems for Packaging Human Drugs and Biologics"
    },
    {
      "ctdSection": "4.2.3",
      "patterns": [
        "route of administration differs",
        "chamber concentration not measured",
        "particle size of test atmosphere",
        "exposure margin not calculated",
        "excipient not qualified",
        "no respiratory tract histopathology"
      ],
      "description": "Inhalation toxicology does not use the clinical route or does not analytically confirm achieved chamber concentration and respirable particle size, so systemic and local exposure margins to the clinical dose cannot be calculated; novel excipients and propellants are not separately qualified.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH M3(R2)"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "no growth study",
        "stadiometry not performed",
        "pediatric device not evaluated",
        "extrapolation not justified",
        "no pediatric pk",
        "age group not studied",
        "spacer not evaluated in children"
      ],
      "description": "Pediatric development is deficient: no adequate 52-week stadiometry growth study for an inhaled or intranasal corticosteroid, no age-appropriate device usability data, or extrapolation of adult efficacy without the required PK/PD bridge and dose justification for the pediatric device configuration.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Orally Inhaled and Intranasal Corticosteroids - Evaluation of the Effects on Growth in Children"
    },
    {
      "ctdSection": "5.3.1.2",
      "patterns": [
        "no population bioequivalence",
        "charcoal block not performed",
        "assay sensitivity not demonstrated",
        "device not same",
        "dose scale not justified",
        "in vitro be not per psg"
      ],
      "description": "Bioequivalence package for a generic or hybrid inhaled product is incomplete: population bioequivalence not applied where required, no charcoal-block PK study, or a clinical endpoint study without demonstrated assay sensitivity (failure to separate active from placebo).",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA CHMP/EWP/4151/00 Rev.1; FDA product-specific guidances for inhalation products"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "systemic exposure not characterized",
        "no charcoal block",
        "inspiratory flow not evaluated",
        "hepatic impairment not studied",
        "renal impairment not studied",
        "no popk analysis"
      ],
      "description": "Systemic exposure characterization is inadequate for an inhaled product: no assessment of the lung versus gastrointestinal contribution to systemic exposure, no evaluation of the effect of inhalation technique or peak inspiratory flow rate on delivered dose, and no renal or hepatic impairment data where systemic exposure is meaningful.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH M12 Drug Interaction Studies; FDA Guidance: Pharmacokinetics in Patients with Impaired Hepatic Function"
    },
    {
      "ctdSection": "1.14.1",
      "patterns": [
        "no instructions for use",
        "human factors not performed",
        "use-related risk analysis missing",
        "dose counter not described",
        "priming instructions absent",
        "medication guide inconsistent"
      ],
      "description": "Proposed labeling does not reflect the device: no clear Instructions for Use validated by human factors testing, no dose counter description, no priming/cleaning instructions, or a Medication Guide inconsistent with the observed class risks.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Applying Human Factors and Usability Engineering to Medical Devices"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA Guidance for Industry - Chronic Obstructive Pulmonary Disease: Developing Drugs for Treatment",
      "authority": "FDA",
      "title": "Chronic Obstructive Pulmonary Disease: Developing Drugs for Treatment",
      "why": "Primary FDA reference for COPD trial design: acceptable primary endpoints (trough FEV1, exacerbation rate), definition and severity grading of exacerbations, trial duration expectations, and the evidentiary standard for a symptom or exacerbation claim. Used to justify the Module 2.5 endpoint strategy and to preempt division questions on exacerbation adjudication."
    },
    {
      "code": "FDA Guidance for Industry - Metered Dose Inhaler (MDI) and Dry Powder Inhaler (DPI) Products: Quality Considerations",
      "authority": "FDA",
      "title": "Metered Dose Inhaler (MDI) and Dry Powder Inhaler (DPI) Products - Quality Considerations",
      "why": "Governs the Module 3 aerosol quality package: delivered dose uniformity through container life, aerodynamic particle size distribution methodology, leak rate, priming and re-priming, robustness testing, and specification setting. Sponsors use it to build defensible drug product specifications and to structure device-related stability protocols."
    },
    {
      "code": "FDA Guidance for Industry - Orally Inhaled and Intranasal Corticosteroids: Evaluation of the Effects on Growth in Children",
      "authority": "FDA",
      "title": "Orally Inhaled and Intranasal Corticosteroids: Evaluation of the Effects on Growth in Children",
      "why": "Defines the required 52-week stadiometry growth study design, observer training, measurement standardization, and analysis for any inhaled or intranasal corticosteroid seeking pediatric use. Directly drives the pediatric section of Module 5 and the growth statement in labeling section 8.4."
    },
    {
      "code": "EMA CHMP/EWP/4151/00 Rev. 1",
      "authority": "EMA",
      "title": "Guideline on the Requirements for Clinical Documentation for Orally Inhaled Products (OIP) Including the Requirements for Demonstration of Therapeutic Equivalence Between Two Inhaled Products",
      "why": "The EU reference for demonstrating therapeutic equivalence of inhaled products, including the stepwise in vitro / pharmacokinetic / pharmacodynamic-clinical approach and assay-sensitivity requirements. Essential for hybrid applications and for any EU device or formulation change bridging strategy."
    },
    {
      "code": "EMA CHMP/EWP/2922/01 Rev. 1",
      "authority": "EMA",
      "title": "Guideline on the Clinical Investigation of Medicinal Products for the Treatment of Asthma",
      "why": "Sets CHMP expectations for asthma trial populations, run-in and stepwise-therapy background, acceptable primary endpoints (FEV1, exacerbations, ACQ), severity classification, and duration for maintenance claims. Used to align an EU-facing Module 2.5 with the US design and to justify any differences in the two dossiers."
    },
    {
      "code": "EMA CHMP/483572/2012 Rev.1",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for the Treatment of Chronic Obstructive Pulmonary Disease (COPD)",
      "why": "EU counterpart to the FDA COPD guidance; defines the COPD population by post-bronchodilator spirometric criteria, addresses combination-product contribution-of-components requirements, and specifies exacerbation endpoint conduct. Central to EU combination inhaler dossiers where the factorial design must justify each component."
    },
    {
      "code": "EMA/CHMP/1965/2013",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for the Treatment of Idiopathic Pulmonary Fibrosis",
      "why": "Defines the acceptable IPF population (multidisciplinary diagnosis per ATS/ERS/JRS/ALAT criteria), the FVC-decline primary endpoint and its analysis, handling of death and transplant, and the supportive endpoint hierarchy. Used to design and defend antifibrotic programs."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Addendum on Estimands and Sensitivity Analysis in Clinical Trials to the Guideline on Statistical Principles for Clinical Trials",
      "why": "Provides the framework for handling the respiratory-specific intercurrent events that dominate these trials - rescue bronchodilator use, addition of open-label controller, treatment discontinuation, death, transplant - and for the sensitivity analyses reviewers expect. Anchors the Module 5.3.5.3 statistical section."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Frames pediatric extrapolation, age-stratification, and formulation/device acceptability for asthma and cystic fibrosis programs where a large share of the population is pediatric. Used to construct the PSP/PIP and justify the pediatric device configuration."
    },
    {
      "code": "ICH M3(R2)",
      "authority": "ICH",
      "title": "Guidance on Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization for Pharmaceuticals",
      "why": "Sets the timing and scope of the nonclinical program that supports inhaled dosing, including the requirement to use the clinical route, calculate exposure margins, and qualify novel excipients. Governs the Module 4 narrative and the safety margins presented in Module 2.4."
    },
    {
      "code": "FDA Patient-Focused Drug Development Guidance Series (Guidances 1-4)",
      "authority": "FDA",
      "title": "Patient-Focused Drug Development: Collecting Comprehensive and Representative Input; Methods to Identify What Is Important to Patients; Selecting, Developing, or Modifying Fit-for-Purpose Clinical Outcome Assessments; Incorporating Clinical Outcome Assessments into Endpoints",
      "why": "Defines the evidence FDA requires before a respiratory COA (SGRQ, CAT, E-RS:COPD, ACQ, L-PF) can support a labeling claim, including content validity, responder-definition derivation, and the endpoint-positioning rationale. Used to build the COA dossier appended to Module 5."
    },
    {
      "code": "FDA Guidance for Industry and FDA Staff - Applying Human Factors and Usability Engineering to Medical Devices",
      "authority": "FDA",
      "title": "Applying Human Factors and Usability Engineering to Medical Devices",
      "why": "Drives the use-related risk analysis, formative and summative human factors validation, and Instructions for Use development for inhalers and nebulizers, including pediatric and elderly use scenarios. Supports the combination-product content in Module 1 labeling and 3.2.P."
    }
  ],
  "reviewerExpectations": [
    "The DPACC reviewer will check that the device used in the pivotal trials is the exact commercial configuration, and will ask for a bridging package (in vitro plus PK or clinical) for any change in mouthpiece, actuator, dose counter, resistance, or fill volume.",
    "The clinical reviewer expects trough FEV1 to be defined precisely relative to the last dose and to the prior rescue-medication withholding window, and will recompute the primary analysis from ADaM datasets to confirm the reported difference.",
    "The statistical reviewer will scrutinize the multiplicity hierarchy for a combination inhaler, expecting each component's contribution to be demonstrated (typically a factorial or component-comparison design) rather than inferred from the combination versus placebo comparison alone.",
    "Exacerbation endpoints are expected to be analyzed with a negative binomial or similar count model with an offset for time at risk, with prespecified handling of subjects who discontinue early and a sensitivity analysis that does not assume they experience the same rate after discontinuation.",
    "The safety reviewer looks specifically for the class effects: pneumonia rates in ICS-containing COPD arms with radiographic confirmation, HPA-axis and growth data for corticosteroids, cardiovascular events for beta-agonists and anticholinergics, and anaphylaxis and helminth infection for biologics.",
    "The product-quality reviewer expects specification acceptance criteria for delivered dose uniformity and APSD to be justified by batch data and by a demonstrated link to the batches used in the clinical trials, not set at compendial defaults.",
    "Pediatric reviewers expect age-appropriate device usability data (with and without spacer/valved holding chamber and face mask) and will not accept adult device data extrapolated to children under 6.",
    "In IPF and progressive pulmonary fibrosis, the reviewer expects an explicit statement of how death and lung transplantation are handled in the FVC estimand and will treat naive censoring of these events as a potential source of bias favoring the active arm.",
    "The clinical pharmacology reviewer expects characterization of the relative lung and gastrointestinal contribution to systemic exposure (typically via a charcoal-block study) and of the effect of inspiratory flow rate on delivered dose for DPIs.",
    "Reviewers expect confirmatory evidence consistent with FDA's substantial-evidence standard: for chronic, non-serious respiratory indications, two adequate and well-controlled trials or a single trial plus a rigorously justified confirmatory evidence package."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Applies to idiopathic pulmonary fibrosis, cystic fibrosis, primary ciliary dyskinesia, alpha-1 antitrypsin deficiency, pulmonary arterial hypertension, lymphangioleiomyomatosis, and non-CF bronchiectasis subsets that meet the US prevalence threshold or the EU orphan criteria.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Orphan designation does not lower the evidentiary standard for efficacy but supports a smaller, well-justified sample size, greater use of natural-history controls in the Clinical Overview, and reliance on registry data in 5.3.5.4. Sponsors should document the prevalence estimate and the scientific rationale for the orphan subset carefully, since a subset that is not medically plausible will be challenged and the designation withdrawn."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Relevant where preliminary clinical evidence shows substantial improvement over available therapy on a clinically significant endpoint in a serious condition such as IPF, cystic fibrosis, PAH, or severe uncontrolled asthma refractory to existing biologics.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Breakthrough designation typically converts CMC and device development into the critical path, because the clinical program accelerates faster than aerosol characterization, device human factors, and commercial-scale manufacturing. Plan early type B meetings on device bridging and specification setting; a rolling submission will be granted only if the Module 3 device package can keep pace."
    },
    {
      "pathway": "fast_track",
      "applicability": "Available for serious pulmonary conditions with unmet need, including severe asthma unresponsive to available biologics, refractory chronic cough, non-CF bronchiectasis with frequent exacerbations, and progressive fibrosing interstitial lung disease.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Fast track chiefly buys more frequent Agency interaction and rolling review. Use the additional meetings to lock the exacerbation adjudication charter and the COA responder definition before the pivotal trial, since these are the two items most often renegotiated late and most damaging when unresolved at filing."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Narrow in respiratory disease. Most plausible for rare progressive lung diseases where a biomarker or intermediate clinical measure (for example rate of FVC decline over a shortened interval, or lung clearance index in cystic fibrosis) is reasonably likely to predict clinical benefit; not appropriate for ordinary asthma or COPD maintenance claims.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.11"
      ],
      "reviewerNotes": "Under FDORA, the confirmatory trial must generally be underway at the time of accelerated approval. Sponsors must justify the surrogate's relationship to irreversible morbidity or mortality with an evidence dossier, and should expect the division to resist FEV1 or FVC as a surrogate in populations where it is already accepted as a direct clinical measure rather than a surrogate."
    },
    {
      "pathway": "priority_review",
      "applicability": "Appropriate where the product would provide a significant improvement in safety or effectiveness in a serious pulmonary condition - for example the first therapy for a fibrosing ILD subtype, a materially safer alternative in a class with known cardiovascular or pneumonia risk, or a first-in-class biologic for a severe asthma phenotype without existing options.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "The priority review request must be argued in the cover letter with a direct comparison to available therapy, supported by the Module 2.5 benefit-risk section. A six-month clock compresses the labeling and device human-factors negotiation, so the Instructions for Use and Medication Guide should be near-final at submission."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME is realistically available for rare severe pulmonary conditions with high unmet need, such as progressive fibrosing ILD without approved options in the EU, rare pulmonary vascular disease, or genetic lung disease with a mechanistically supported therapy.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "PRIME requires convincing early clinical (or, for SME/ATMP applicants, robust nonclinical plus tolerability) data on a clinically relevant endpoint. The appointed rapporteur will focus early scientific advice on the therapeutic-equivalence and device-bridging questions for inhaled products, which are a frequent source of EU-specific major objections."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "Applicable in the EU for seriously debilitating or life-threatening pulmonary disease where comprehensive data are not yet available - typically rare interstitial or pulmonary vascular disease - and the benefit of immediate availability outweighs the residual uncertainty.",
      "impactedSections": [
        "2.5",
        "1.8.2",
        "5.3.5.1"
      ],
      "reviewerNotes": "CMA requires specific obligations with binding milestones, an unmet-need justification, and an RMP that converts residual uncertainty into concrete pharmacovigilance activity. The annual renewal review will test whether the confirmatory trial is recruiting on schedule, so feasibility must be evidenced, not asserted."
    }
  ],
  "statisticalConsiderations": [
    "Specify the estimand in full ICH E9(R1) terms for each primary and key secondary endpoint, naming the treatment condition, population, variable, intercurrent-event strategies (rescue medication, open-label controller addition, discontinuation, death, transplant), and population-level summary measure; verify that the strategy chosen is the same one the analysis model actually implements.",
    "Analyze continuous lung-function endpoints (trough FEV1, FVC) with a mixed model for repeated measures including baseline, stratification factors, visit, and treatment-by-visit interaction, with an unstructured covariance matrix as the primary specification and a prespecified fallback covariance structure for non-convergence.",
    "Analyze exacerbation rates with a negative binomial model with log time-at-risk offset to accommodate overdispersion and variable follow-up; prespecify how subjects who discontinue are treated, and provide a sensitivity analysis in which post-discontinuation event rates in the active arm are assumed to revert toward control (jump-to-reference or a delta-adjusted approach).",
    "Control the family-wise type I error across the primary and all label-supporting secondary endpoints with a prespecified sequential or graphical (Bretz/Maurer-Bretz) testing strategy; for combination inhalers the hierarchy must include the component-comparison tests that establish each component's contribution, not only the versus-placebo comparisons.",
    "Prespecify handling of missing data rather than relying on last-observation-carried-forward; the primary approach is typically a likelihood-based analysis under MAR, supported by multiple-imputation-based sensitivity analyses and a tipping-point analysis identifying how extreme the departure from MAR would have to be to overturn the conclusion.",
    "Justify non-inferiority margins for comparative respiratory trials with both a statistical derivation from historical placebo-controlled data (preserving a stated fraction of the active-control effect) and a clinical argument; for FEV1 the margin must be defended as clinically non-meaningful, and constancy of the historical effect must be discussed.",
    "Define interim analyses in the protocol and SAP with an alpha-spending function, prespecified stopping boundaries for efficacy and futility, a DMC charter with firewall procedures, and a plan for the bias in the treatment effect estimate if the trial stops early for benefit.",
    "Prespecify subgroup analyses (blood eosinophil count, smoking status, baseline severity, exacerbation history, reversibility, age, sex, race, region) as hypothesis-generating with interaction tests, and avoid presenting a post hoc eosinophil or biomarker cut-point as if it were a prespecified enrichment.",
    "Where a randomized withdrawal or enrichment design is used, prespecify the run-in response criterion, report the full screened-to-randomized attrition, and discuss the limits this places on generalizability of the estimated effect to the unenriched population.",
    "For crossover or PK-bioequivalence work in inhaled products, address period and carryover effects with an adequate washout justified by the pharmacodynamic duration of the class, and apply the reference-scaled or population-bioequivalence approach specified in the applicable product-specific guidance rather than a default average-bioequivalence test."
  ],
  "endpointConsiderations": [
    "Trough (pre-dose, pre-rescue-bronchodilator) FEV1 change from baseline is the standard bronchodilator efficacy endpoint for COPD and maintenance asthma; it requires precise timing relative to the last dose, standardized withholding of short-acting agents, and is generally supported over at least 12 weeks (24 weeks for many EU claims).",
    "FEV1 area under the curve over a dosing interval (for example FEV1 AUC0-12h or AUC0-24h) supports onset and duration-of-action claims but should complement, not replace, trough FEV1; it requires serial spirometry days with a documented schedule and a defined method for handling missing serial time points.",
    "Annualized rate of moderate-to-severe COPD exacerbations, and annualized rate of asthma exacerbations requiring systemic corticosteroids, are the accepted event-driven efficacy endpoints; both require a prespecified objective definition, an event-separation window, and typically 52 weeks of exposure to capture seasonality.",
    "Rate of decline in forced vital capacity (mL/year) over at least 52 weeks is the accepted primary endpoint in IPF and progressive pulmonary fibrosis; its caveat is that death and lung transplant are informative events that must be handled inside the estimand and not treated as ordinary dropout.",
    "Lung clearance index (LCI2.5) by multiple-breath washout is accepted in cystic fibrosis, particularly in younger patients with preserved FEV1, but requires strict equipment and gas-analysis standardization, central over-reading, and acknowledgment that its relationship to long-term outcomes is less established than ppFEV1.",
    "Sweat chloride is a validated pharmacodynamic biomarker for CFTR modulators and supports mechanistic and dose-selection arguments, but by itself it does not establish clinical benefit; it must be paired with ppFEV1, exacerbation, and nutritional or symptom endpoints.",
    "Six-minute walk distance and pulmonary vascular hemodynamics are conventional in pulmonary arterial hypertension, but current expectations favor time to first clinical worsening (a composite of death, hospitalization for PAH, lung transplant, atrial septostomy, and disease progression) as the primary endpoint, with the composite's components prespecified and adjudicated.",
    "St George's Respiratory Questionnaire (SGRQ), COPD Assessment Test (CAT), and Evaluating Respiratory Symptoms in COPD (E-RS:COPD) are the principal health-status and symptom instruments in COPD; SGRQ's conventional 4-point responder threshold must be justified for the specific population rather than assumed.",
    "Asthma Control Questionnaire (ACQ-5/ACQ-7) and Asthma Control Test (ACT) support control claims, with responder thresholds of approximately 0.5 (ACQ) and 3 points (ACT) requiring anchor-based confirmation in the trial dataset; rescue-medication use and symptom-free days are supportive rather than standalone.",
    "Oral corticosteroid dose reduction (percentage reduction from baseline maintenance dose while maintaining asthma control) is an accepted endpoint for severe eosinophilic asthma biologics, requiring a rigorously prespecified tapering algorithm applied identically across arms and blinded control assessment.",
    "Time to first severe exacerbation or to hospitalization is used as a key secondary in most chronic respiratory programs; it requires competing-risk consideration (death) and should be reported with cumulative incidence rather than naive Kaplan-Meier where mortality is non-trivial.",
    "Chronic cough programs use 24-hour objective cough frequency measured by a validated ambulatory acoustic monitor as the primary endpoint, supported by a validated cough-severity or cough-specific quality-of-life PRO; device analysis algorithms and their validation must be documented in the CSR."
  ],
  "retrievalKeywords": [
    "fev1",
    "trough fev1",
    "spirometry",
    "forced vital capacity",
    "copd exacerbation",
    "asthma exacerbation",
    "inhaled corticosteroid",
    "laba",
    "lama",
    "metered dose inhaler",
    "dry powder inhaler",
    "nebulizer",
    "aerodynamic particle size distribution",
    "delivered dose uniformity",
    "cascade impactor",
    "charcoal block",
    "idiopathic pulmonary fibrosis",
    "antifibrotic",
    "cystic fibrosis",
    "cftr modulator",
    "sweat chloride",
    "lung clearance index",
    "bronchiectasis",
    "pulmonary arterial hypertension",
    "six-minute walk distance",
    "clinical worsening",
    "sgrq",
    "cat score",
    "acq",
    "e-rs copd",
    "blood eosinophil",
    "type 2 inflammation",
    "biologic severe asthma",
    "oral corticosteroid sparing",
    "paradoxical bronchospasm",
    "hpa axis suppression",
    "growth velocity stadiometry",
    "pneumonia risk ics",
    "therapeutic equivalence inhaled",
    "population bioequivalence",
    "device human factors",
    "instructions for use inhaler",
    "peak inspiratory flow",
    "chronic cough frequency",
    "dpacc",
    "ats ers standardization",
    "gli reference equations",
    "valved holding chamber",
    "propellant hfa",
    "extractables leachables inhalation"
  ]
};

export default respiratoryProfile;
