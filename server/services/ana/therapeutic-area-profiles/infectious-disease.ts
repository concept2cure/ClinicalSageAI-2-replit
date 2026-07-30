/**
 * Infectious Disease (Antibacterial, Antifungal, Antiviral) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/infectious-disease
 */
import type { TherapeuticAreaProfile } from './types.js';

export const infectiousDiseaseProfile: TherapeuticAreaProfile = {
  "id": "infectious-disease",
  "displayName": "Infectious Disease (Antibacterial, Antifungal, Antiviral)",
  "description": "Regulatory profile for anti-infective drug development covering antibacterials (including complicated and uncomplicated indications, LPAD/limited-population pathway), antifungals, and antivirals (HIV, HBV, HCV, influenza, COVID-19, herpesviruses). Emphasizes pathogen-directed development, non-inferiority trial design with justified margins, PK/PD target attainment, in vitro susceptibility and breakpoint setting, resistance monitoring/genotypic-phenotypic analysis, and microbiological outcome definitions. FDA review sits primarily with CDER's Division of Anti-Infectives and Division of Antivirals; EMA review is guided by CHMP's antibacterial and antiviral efficacy guidelines. Development almost always requires an integrated microbiology summary and dedicated non-clinical microbiology package alongside the standard nonclinical/clinical CTD content.",
  "contextRules": [
    {
      "id": "id-nonclinical-micro-summary",
      "scope": "section",
      "instruction": "Include a dedicated non-clinical microbiology narrative in the Pharmacology Written Summary: mechanism of action, spectrum of activity with MIC50/MIC90 by species against a contemporary, geographically diverse clinical isolate set, bactericidal/fungicidal vs static activity (time-kill, MBC/MIC ratio), effect of inoculum, pH, serum and matrix on MIC, mechanism(s) of resistance, spontaneous resistance frequency, serial-passage resistance selection, cross-resistance with in-class and out-of-class agents, and in vivo efficacy in neutropenic thigh/lung and other established infection models. Cross-reference the Integrated Summary of Microbiology submitted per FDA's Microbiological Data for Systemic Antibacterial Drugs guidance.",
      "severity": "critical",
      "appliesTo": "2.6.2",
      "triggerKeywords": [
        "MIC",
        "MIC90",
        "mechanism of action",
        "resistance",
        "time-kill",
        "neutropenic thigh",
        "spectrum",
        "bactericidal",
        "susceptibility"
      ],
      "guidanceRef": "FDA-2017-D-6136"
    },
    {
      "id": "id-pkpd-target-attainment",
      "scope": "section",
      "instruction": "Present the PK/PD rationale explicitly: identify the PK/PD index driving efficacy (fAUC/MIC, fCmax/MIC, or %fT>MIC), the magnitude of the index associated with stasis and 1-log/2-log kill in animal models, protein binding measured in each relevant species and in humans, and Monte Carlo simulation of probability of target attainment (PTA) across the MIC distribution for the target pathogens. Justify the proposed dose, dosing interval and infusion duration from PTA and from clinical exposure-response, including renal and hepatic impairment and augmented renal clearance subgroups, and for site-of-infection penetration (ELF, CSF, bone, urine, intracellular) where the indication requires it.",
      "severity": "critical",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "PK/PD",
        "fAUC/MIC",
        "%fT>MIC",
        "Monte Carlo",
        "probability of target attainment",
        "protein binding",
        "epithelial lining fluid",
        "augmented renal clearance"
      ],
      "guidanceRef": "EMA/CHMP/594085/2015"
    },
    {
      "id": "id-noninferiority-margin",
      "scope": "section",
      "instruction": "For any non-inferiority design, pre-specify and justify the NI margin in the Clinical Overview using the fixed-margin (95%-95%) or synthesis approach: summarize the historical evidence of treatment effect versus placebo or inadequate therapy (constancy assumption discussion), the M1 estimate, the fraction of M1 preserved to obtain M2, and the sensitivity of the design to assay sensitivity. State the primary analysis population (typically ITT/mITT and the microbiologically evaluable population co-primary or supportive per indication) and confirm alignment with the indication-specific FDA guidance margin (e.g., 10% for cIAI/cUTI/ABSSSI/CABP as applicable) and EMA expectations.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "non-inferiority",
        "NI margin",
        "M1",
        "M2",
        "constancy",
        "assay sensitivity",
        "fixed margin",
        "95-95"
      ],
      "guidanceRef": "FDA-2010-D-0075"
    },
    {
      "id": "id-breakpoints-and-devices",
      "scope": "section",
      "instruction": "Provide the susceptibility test interpretive criteria (breakpoint) proposal with the three-pillar justification: MIC distribution and epidemiological cutoff (ECOFF/ECV) for wild-type populations, PK/PD target attainment at the proposed dose, and clinical/microbiological outcome by MIC from the Phase 3 program. Describe the antimicrobial susceptibility testing (AST) device development plan and the quality control ranges, and reference FDA's STIC recognition process and EUCAST/CLSI interactions. Include the AST device co-development timeline so breakpoints are available at approval.",
      "severity": "major",
      "appliesTo": "5.3.5.4",
      "triggerKeywords": [
        "breakpoint",
        "interpretive criteria",
        "ECOFF",
        "ECV",
        "susceptibility testing",
        "CLSI",
        "EUCAST",
        "quality control range",
        "AST device"
      ],
      "guidanceRef": "FDA-2020-D-1136"
    },
    {
      "id": "id-resistance-surveillance",
      "scope": "section",
      "instruction": "In the integrated efficacy analyses, report baseline and post-baseline isolate characterization: MIC to the investigational agent and comparators, resistance genotype (e.g., beta-lactamase content by class, efflux/porin changes, target-site mutations, for antivirals resistance-associated substitutions in the target gene), emergence of on-treatment resistance with paired isolate analysis, and clinical outcome stratified by baseline MIC and by resistance mechanism. Include a table of subjects with >=4-fold MIC increase and their outcomes.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "resistance-associated substitution",
        "emergent resistance",
        "paired isolates",
        "beta-lactamase",
        "genotype",
        "phenotype",
        "fold-change",
        "treatment-emergent"
      ],
      "guidanceRef": "FDA-2018-D-3906"
    },
    {
      "id": "id-outcome-definitions",
      "scope": "section",
      "instruction": "Define clinical and microbiological outcomes precisely and consistently across studies: clinical cure/failure/indeterminate at the protocol-defined test-of-cure visit, early clinical response at 48-72 hours where the indication requires it, microbiological eradication/presumed eradication/persistence, and handling of indeterminate and missing responses (counted as failure in the primary analysis unless justified). State the treatment window, the definition of the microbiological ITT population, and the rules for concomitant/rescue antibacterial use that constitute failure.",
      "severity": "major",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "test of cure",
        "early clinical response",
        "clinical cure",
        "microbiological eradication",
        "indeterminate",
        "rescue therapy",
        "micro-ITT"
      ],
      "guidanceRef": "FDA-2013-D-0091"
    },
    {
      "id": "id-pediatric-and-juvenile",
      "scope": "module",
      "instruction": "Address the pediatric development plan (PSP/PIP) in the clinical module: extrapolation of efficacy from adults where disease and exposure-response are similar, population PK-based dose selection to match adult exposure targets, age-appropriate formulation, and juvenile animal toxicology triggers (e.g., cartilage toxicity for fluoroquinolones, bone/teeth for tetracyclines). Document any deferral or waiver rationale and the neonatal strategy where the indication includes neonatal sepsis.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "pediatric",
        "PSP",
        "PIP",
        "juvenile toxicity",
        "neonate",
        "extrapolation",
        "age-appropriate formulation"
      ],
      "guidanceRef": "ICH E11(R1)"
    },
    {
      "id": "id-antimicrobial-stewardship-labeling",
      "scope": "section",
      "instruction": "Support labeling content required for anti-infectives: the 'to reduce the development of drug-resistant bacteria' usage statement, culture and susceptibility statement, and safety topics of special interest for the class (C. difficile-associated diarrhea, QT prolongation, hepatotoxicity, hypersensitivity/anaphylaxis, tendinopathy and CNS effects for quinolones, nephrotoxicity/ototoxicity for aminoglycosides and polymyxins). Provide integrated analyses of these events with exposure adjustment and comparator context.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "C. difficile",
        "QT prolongation",
        "hepatotoxicity",
        "hypersensitivity",
        "nephrotoxicity",
        "stewardship",
        "drug-resistant bacteria"
      ],
      "guidanceRef": "ICH E14"
    },
    {
      "id": "id-always-pathogen-specificity",
      "scope": "always",
      "instruction": "Keep pathogen nomenclature, MIC units (mcg/mL), susceptibility interpretive categories (S/I/SDD/R), and indication phrasing identical across Modules 2, 4 and 5 and the proposed labeling. Every organism claimed in the indications section must be supported by an adequate number of clinically and microbiologically evaluable subjects from adequate and well-controlled trials, and organisms with insufficient clinical experience should be placed in the 'activity in vitro but clinical significance unknown' section rather than the indication.",
      "severity": "major",
      "triggerKeywords": [
        "indicated organisms",
        "in vitro activity",
        "clinical significance unknown",
        "susceptible",
        "intermediate",
        "resistant"
      ]
    }
  ],
  "riskFactors": [
    "Non-inferiority margin not agreed with the Agency before Phase 3 start, or historical-evidence basis for M1 that is weak or outdated, leading to a design the division will not accept at review.",
    "Too few clinically and microbiologically evaluable subjects for one or more organisms named in the proposed indication, forcing removal of pathogens from labeling.",
    "Breakpoint package that relies on PK/PD simulation alone without a supportive MIC distribution from contemporary isolates or without clinical outcome-by-MIC data, delaying interpretive criteria and AST device availability.",
    "Emergence of on-treatment resistance or cross-resistance with widely used agents that is under-characterized, especially absent paired baseline/post-baseline isolate sequencing.",
    "Insufficient site-of-infection penetration data (ELF, CSF, bone, biliary, urinary) for the indication sought, undermining the dose rationale.",
    "Class safety liabilities surfacing late: QT prolongation without an adequate thorough QT or concentration-QTc analysis, hepatotoxicity signals with inadequate Hy's law adjudication, or nephrotoxicity without prospective renal biomarker collection.",
    "Antiviral programs with inadequate resistance barrier characterization or missing drug-drug interaction data for the anticipated combination regimen and background therapy.",
    "Chronic antiviral programs (HBV, HIV) with insufficient long-term durability data or missing data at the primary timepoint compromising the snapshot analysis.",
    "Reliance on a limited-population (LPAD) or unmet-need pathway without a prospectively defined, verifiable population and without a plan for post-marketing evidence generation.",
    "Manufacturing/CMC issues typical of the class (e.g., beta-lactam segregation and cross-contamination controls, sterile injectable particulate and endotoxin control, lyophilized product reconstitution stability) that are not addressed in Module 3 and become approvability issues."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.6.2",
      "patterns": [
        "missing integrated summary of microbiology",
        "no resistance mechanism",
        "spontaneous resistance frequency not",
        "cross-resistance not evaluated",
        "no time-kill",
        "in vivo model data absent"
      ],
      "description": "Integrated Summary of Microbiology is absent or does not cover the required elements (mechanism of action, resistance mechanisms, spontaneous resistance frequency, serial passage, cross-resistance, in vivo model efficacy) in a single consolidated document.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-2017-D-6136"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "no pk/pd target",
        "probability of target attainment not",
        "protein binding not measured",
        "monte carlo simulation missing",
        "dose rationale unsupported",
        "augmented renal clearance not"
      ],
      "description": "Dose justification not tied to a PK/PD index and probability of target attainment; protein binding not measured in the relevant species or matrix; special populations (renal impairment, augmented renal clearance, obesity, critically ill) not simulated.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/594085/2015"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "ni margin not justified",
        "no historical evidence for margin",
        "constancy assumption not addressed",
        "assay sensitivity not discussed",
        "m1 not estimated"
      ],
      "description": "Non-inferiority margin asserted without a documented derivation from historical placebo-controlled or untreated-control evidence, and without addressing constancy and assay sensitivity.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-2010-D-0075"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "breakpoint not justified",
        "no ecoff",
        "no mic distribution",
        "ast device not developed",
        "quality control range missing",
        "clsi eucast not consulted"
      ],
      "description": "Breakpoint proposal lacks one or more of the three pillars, or the AST device/quality-control range work is not co-developed, so interpretive criteria cannot be finalized at approval.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-2020-D-1136"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "outcome by mic not presented",
        "paired isolates not sequenced",
        "insufficient evaluable subjects per pathogen",
        "per-pathogen efficacy not",
        "emergent resistance not characterized"
      ],
      "description": "Outcome-by-baseline-MIC analysis, paired isolate resistance analysis, and per-pathogen efficacy tables are missing or too sparse to support the proposed indicated organisms.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-2018-D-3906"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "endpoint definition inconsistent",
        "indeterminate not counted as failure",
        "test of cure window varied",
        "micro-itt definition unclear",
        "rescue therapy not counted"
      ],
      "description": "Inconsistent or post hoc endpoint definitions across studies (clinical cure timing, indeterminate handling, micro-ITT definition), or rescue-therapy rules that do not classify subsequent antibacterial use as failure.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-2013-D-0091"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "c. difficile not analyzed",
        "hy's law cases not adjudicated",
        "qtc analysis missing",
        "hypersensitivity not characterized",
        "nephrotoxicity not assessed",
        "exposure-adjusted rates not provided"
      ],
      "description": "Class-specific safety topics of special interest not analyzed as integrated, exposure-adjusted analyses with comparator context (C. difficile infection, hepatotoxicity/Hy's law, QTc, hypersensitivity, nephrotoxicity, neurotoxicity).",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E14"
    },
    {
      "ctdSection": "5.3.3.4",
      "patterns": [
        "renal impairment study not conducted",
        "hepatic impairment missing",
        "no elf penetration",
        "csf penetration not measured",
        "population pk model not qualified"
      ],
      "description": "Missing or inadequate special-population and site-of-infection PK: renal/hepatic impairment, obesity, pediatric popPK bridging, and penetration studies (ELF, CSF, bone) required for the claimed indication.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-2020-D-2126"
    },
    {
      "ctdSection": "3.2.P",
      "patterns": [
        "beta-lactam segregation not described",
        "container closure integrity not",
        "in-use stability missing",
        "reconstitution stability not supported",
        "nitrosamine risk assessment absent",
        "endotoxin limit not justified"
      ],
      "description": "CMC deficiencies typical of anti-infectives: inadequate beta-lactam cross-contamination controls, insufficient sterility assurance/container-closure integrity for injectables, unjustified in-use and reconstitution stability, or nitrosamine/elemental impurity assessments not provided.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH Q3D(R2)"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-2017-D-6136",
      "authority": "FDA",
      "title": "Microbiological Data for Systemic Antibacterial Drug Products — Development, Analysis, and Presentation (Guidance for Industry)",
      "why": "Defines the content and format of the Integrated Summary of Microbiology and the nonclinical microbiology data expected in Module 2.6.2 and Module 4, including resistance and in vivo model requirements."
    },
    {
      "code": "FDA-2020-D-1136",
      "authority": "FDA",
      "title": "Antibacterial Susceptibility Test Interpretive Criteria (Guidance for Industry and FDA Staff)",
      "why": "Governs how sponsors propose and support breakpoints, the STIC recognition process, and coordination of antimicrobial susceptibility test device availability at approval."
    },
    {
      "code": "FDA-2010-D-0075",
      "authority": "FDA",
      "title": "Non-Inferiority Clinical Trials to Establish Effectiveness (Guidance for Industry)",
      "why": "Provides the fixed-margin and synthesis methodology sponsors must use to derive and defend the NI margin that underpins nearly all antibacterial Phase 3 designs."
    },
    {
      "code": "FDA-2018-D-3906",
      "authority": "FDA",
      "title": "Human Immunodeficiency Virus-1 Infection: Developing Antiretroviral Drugs for Treatment (Guidance for Industry)",
      "why": "Sets the template for antiviral efficacy endpoints (FDA snapshot algorithm), resistance analysis of treatment-emergent substitutions, and trial populations for chronic viral infection programs."
    },
    {
      "code": "FDA-2013-D-0091",
      "authority": "FDA",
      "title": "Acute Bacterial Skin and Skin Structure Infections: Developing Drugs for Treatment (Guidance for Industry)",
      "why": "Representative indication-specific guidance defining early clinical response, test-of-cure timing, evaluable populations and the acceptable non-inferiority margin; parallel guidances exist for CABP, cIAI, cUTI, HABP/VABP."
    },
    {
      "code": "EMA/CHMP/594085/2015",
      "authority": "EMA",
      "title": "Guideline on the Use of Pharmacokinetics and Pharmacodynamics in the Development of Antibacterial Medicinal Products",
      "why": "EMA expectation for PK/PD index selection, target attainment analysis, protein binding, site-of-infection exposure and dose justification, and how PK/PD supports breakpoints."
    },
    {
      "code": "EMA/844951/2018",
      "authority": "EMA",
      "title": "Guideline on the Evaluation of Medicinal Products Indicated for Treatment of Bacterial Infections (Rev. 3)",
      "why": "Core EU efficacy guideline covering indication wording, trial designs (including for limited-population and pathogen-specific claims), evaluable populations and resistance data expectations."
    },
    {
      "code": "ICH E14",
      "authority": "ICH",
      "title": "The Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs (with Q&A R3)",
      "why": "Determines whether a thorough QT study or a concentration-QTc analysis from early-phase data suffices; several anti-infective classes carry QT liability requiring this assessment."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Framework for pediatric extrapolation, age-appropriate formulations and PK-based dosing that underpins the PSP/PIP for anti-infective programs."
    },
    {
      "code": "ICH M4E(R2)",
      "authority": "ICH",
      "title": "Common Technical Document for the Registration of Pharmaceuticals for Human Use — Efficacy (Revision of M4E)",
      "why": "Defines the structure and expected content of Modules 2.5 and 2.7, including benefit-risk framing that reviewers apply to anti-infective submissions."
    }
  ],
  "reviewerExpectations": [
    "A single, well-organized Integrated Summary of Microbiology that a microbiology reviewer can use to independently reconstruct spectrum, resistance and in vivo activity conclusions.",
    "Clear traceability from the animal PK/PD target, through protein-binding-corrected exposures and Monte Carlo target attainment, to the exact dose and infusion duration proposed in labeling — including for renal impairment and augmented renal clearance.",
    "Per-pathogen efficacy tables with enough clinically and microbiologically evaluable subjects to justify each organism named in the indication; the division will delete organisms that lack adequate clinical experience.",
    "Prospectively agreed non-inferiority margin with a documented derivation and a demonstration that the trial retained assay sensitivity (e.g., expected event rates, comparator performance consistent with history).",
    "Baseline and treatment-emergent resistance characterization with paired isolates, including genotype-outcome correlation and any evidence of cross-resistance to agents that would be used after failure.",
    "A breakpoint package that ties MIC distribution, PK/PD target attainment and clinical outcome-by-MIC together, plus a credible plan for AST device and QC range availability at launch.",
    "Consistent, protocol-specified endpoint definitions across all pivotal studies with conservative handling of indeterminate and missing outcomes, and rescue antibacterial use counted as failure.",
    "Integrated, exposure-adjusted safety analyses for class-specific risks with comparator context, and a clear position on whether a REMS or a limited-population labeling statement is warranted.",
    "For antivirals, a defensible virologic endpoint definition (e.g., snapshot algorithm) with pre-specified handling of discontinuations and missing data, plus resistance monitoring through the durability period.",
    "Alignment between Module 3 controls (sterility, endotoxin, in-use stability, cross-contamination) and the clinical administration described in labeling."
  ],
  "pathwayHints": [
    {
      "pathway": "fast_track",
      "applicability": "Available for drugs treating serious infections, including any product designated as a Qualified Infectious Disease Product (QIDP) under the GAIN provisions, which confers automatic fast track eligibility and five years of additional exclusivity.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Sponsors should document the QIDP designation and qualifying pathogen list in Module 1 and reflect the serious-condition and unmet-need argument in the Clinical Overview; fast track increases meeting frequency and enables rolling review but does not lower the evidentiary standard."
    },
    {
      "pathway": "priority_review",
      "applicability": "Granted where the product would provide a significant improvement in safety or effectiveness for a serious infection; QIDP designation confers priority review eligibility.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "Priority review compresses the review clock, so the microbiology, breakpoint and AST device packages must be complete and internally consistent at submission — mid-cycle information requests are far harder to absorb."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Appropriate where preliminary clinical evidence shows substantial improvement over available therapy for a serious infection — most often for multidrug-resistant pathogens with few or no treatment options, or for curative antiviral regimens.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect intensive Agency engagement on trial design and on whether a smaller, externally-informed dataset can support approval; the resistance and PK/PD packages carry more weight when the clinical dataset is small."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Used where an intermediate or surrogate endpoint reasonably likely to predict clinical benefit is available — for example sustained virologic response in hepatitis C historically, or virologic suppression endpoints in chronic viral infection; rarely used for acute bacterial indications.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "Requires an agreed confirmatory trial that is underway or promptly initiated; sponsors must address the surrogate's validation basis and the withdrawal procedures now codified for accelerated approval."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Relevant for rare infections and rare pathogen-specific indications (e.g., certain invasive mycoses, nontuberculous mycobacterial disease, rare viral infections) where the US prevalence is under 200,000.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Orphan designation supports smaller programs and may justify greater reliance on PK/PD and natural-history or external control data, but the sponsor still needs a prospectively defined population and adequate microbiological documentation."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand explicitly per ICH E9(R1): population (ITT, mITT, micro-ITT), variable (clinical cure at test of cure or early clinical response), intercurrent-event strategy for rescue antibacterial use, discontinuation and death (composite or treatment-policy), and the population-level summary (risk difference with two-sided 95% CI).",
    "Derive the non-inferiority margin by the fixed-margin (95%-95%) approach where the historical evidence supports it; pre-specify whether the primary inference is on the risk difference and whether a synthesis method is a sensitivity analysis, and pre-specify the analysis populations that must both meet the margin.",
    "Control type I error across multiple co-primary populations, multiple indications, multiple doses and secondary endpoints with a pre-specified hierarchical or graphical testing procedure; note that co-primary populations (ITT and evaluable) impose an intersection requirement rather than a multiplicity penalty.",
    "Handle missing outcomes conservatively — indeterminate and missing responses counted as failures in the primary analysis — and pre-specify tipping-point or multiple-imputation sensitivity analyses to show the conclusion is robust to less conservative assumptions.",
    "For antivirals, pre-specify the snapshot algorithm (or equivalent), including the analysis window, the classification of discontinuations for reasons other than virologic failure, and the resistance-testing triggers.",
    "Pre-specify subgroup and per-pathogen analyses (descriptive, with confidence intervals, not hypothesis-testing) and state in advance which subgroups will inform labeling; avoid post hoc pathogen subsets that create the appearance of data-driven indication selection.",
    "Justify interim analyses and any adaptive elements (sample size re-estimation, dose selection) with a documented type I error control strategy and firewalled access to unblinded data; blinded sample-size re-estimation based on the pooled event rate is generally preferred for NI trials.",
    "Pre-specify the exposure-response modeling plan (population PK, PTA simulation, logistic exposure-response for efficacy and safety) including model qualification criteria, and treat model-based dose recommendations as confirmatory only where prospectively agreed.",
    "Address multiplicity and pooling rules for integrated safety analyses (exposure-adjusted incidence rates, appropriate pooling of studies with similar comparators) and pre-specify the adjudication process for events of special interest."
  ],
  "endpointConsiderations": [
    "Acute bacterial skin and skin structure infection (ABSSSI): early clinical response at 48-72 hours defined as >=20% reduction in lesion area with no rescue antibacterial, plus investigator-assessed clinical response at post-therapy evaluation as a key secondary.",
    "Community-acquired bacterial pneumonia (CABP): early clinical response at 72-120 hours based on improvement in defined symptoms without worsening, with clinical outcome at test of cure and all-cause mortality as key secondary endpoints.",
    "Hospital-acquired/ventilator-associated bacterial pneumonia (HABP/VABP): all-cause mortality at day 28 as the primary endpoint, with clinical response and microbiological outcome as secondary; the mortality endpoint drives large sample sizes and demands careful NI margin justification.",
    "Complicated urinary tract infection (cUTI): a composite of clinical response and microbiological eradication (<10^3 CFU/mL) at test of cure — the composite is the FDA-preferred primary and is sensitive to the microbiological component and to reinfection versus persistence adjudication.",
    "Complicated intra-abdominal infection (cIAI): clinical response at test of cure in the microbiological ITT population, with adequate source control documented; failures include unplanned surgical intervention and rescue antibacterial use.",
    "Invasive fungal disease: all-cause mortality at week 6 (or global response combining clinical, radiologic and mycologic response) with independent adjudication of proven/probable/possible disease per EORTC/MSGERC consensus definitions; possible cases are typically excluded from the primary analysis population.",
    "HIV-1: proportion with HIV-1 RNA <50 copies/mL at week 48 by the FDA snapshot algorithm, with week 96 durability; CD4 change and treatment-emergent resistance are supportive.",
    "Chronic hepatitis B: composite virologic and biochemical endpoints (HBV DNA below assay LLOQ, ALT normalization, HBeAg/HBsAg loss or seroconversion) at week 48, with functional cure (sustained HBsAg loss off treatment) as the emerging endpoint for novel agents.",
    "Influenza and other acute respiratory viral infections: time to alleviation of symptoms using a validated patient-reported instrument as primary, with viral load change as supportive; complications and hospitalization endpoints for high-risk populations.",
    "Microbiological endpoints generally: eradication versus presumed eradication must be pre-defined, and presumed outcomes should not dominate the eradication rate; sponsors should report the proportion of presumed outcomes transparently."
  ],
  "retrievalKeywords": [
    "antibacterial",
    "antifungal",
    "antiviral",
    "minimum inhibitory concentration",
    "mic90",
    "breakpoint",
    "interpretive criteria",
    "susceptibility testing",
    "eucast",
    "clsi",
    "pk/pd target attainment",
    "fauc/mic",
    "%ft>mic",
    "monte carlo simulation",
    "non-inferiority margin",
    "test of cure",
    "early clinical response",
    "microbiological eradication",
    "micro-itt",
    "resistance-associated substitution",
    "beta-lactamase",
    "carbapenem-resistant",
    "multidrug-resistant",
    "qidp",
    "gain act",
    "lpad limited population",
    "snapshot algorithm",
    "hiv-1 rna",
    "hbsag loss",
    "epithelial lining fluid",
    "neutropenic thigh model",
    "eortc msgerc",
    "c. difficile",
    "antimicrobial stewardship",
    "integrated summary of microbiology"
  ]
};

export default infectiousDiseaseProfile;
