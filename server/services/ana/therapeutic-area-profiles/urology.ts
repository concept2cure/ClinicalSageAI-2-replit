/**
 * Urology therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/urology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const urologyProfile: TherapeuticAreaProfile = {
  "id": "urology",
  "displayName": "Urology",
  "description": "Regulatory profile for non-oncologic urology: overactive bladder and urgency urinary incontinence, stress urinary incontinence, neurogenic detrusor overactivity, benign prostatic hyperplasia with lower urinary tract symptoms, nocturia and nocturnal polyuria, interstitial cystitis/bladder pain syndrome, erectile dysfunction and other male sexual dysfunctions, Peyronie's disease, urinary tract infection (uncomplicated and complicated), nephrolithiasis and hyperoxaluria, and overlapping male hypogonadism. Reviewed at FDA principally by the Division of Urology, Obstetrics and Gynecology (Office of Rare Diseases, Pediatrics, Urologic and Reproductive Medicine), with anti-infective UTI programs going to the Division of Anti-Infectives. The defining features are symptom-based, diary-derived primary endpoints requiring formal PRO validation, very large and variable placebo responses, an elderly and polypharmacy-exposed target population, and cardiovascular and cognitive safety issues that dominate labeling negotiations.",
  "contextRules": [
    {
      "id": "uro-ctx-diary-endpoints",
      "scope": "section",
      "instruction": "Derive micturition, incontinence-episode, urgency-episode and nocturic-void endpoints from a protocol-defined bladder diary of stated duration (3-day or 7-day) completed immediately before each visit; report diary completeness by arm and visit, the rule for handling incomplete diary days (a minimum number of valid days for a visit to be evaluable), and the derivation from raw diary entries to the analysis variable. Present the co-primary endpoints for overactive bladder as change from baseline in mean number of micturitions per 24 hours and mean number of urgency incontinence episodes per 24 hours at the primary timepoint, with responder analyses (including 100 percent reduction, the dry rate) as pre-specified secondaries.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "bladder diary",
        "micturition frequency",
        "incontinence episodes",
        "urgency episodes",
        "voiding diary",
        "dry rate",
        "diary compliance"
      ],
      "guidanceRef": "FDA-UI-2019"
    },
    {
      "id": "uro-ctx-pro-validation",
      "scope": "section",
      "instruction": "File a complete PRO dossier for every instrument supporting a labeling claim - the bladder diary itself, the International Prostate Symptom Score, the IIEF erectile function domain with SEP-2 and SEP-3 diary items, the OAB-q, the O'Leary-Sant ICSI/ICPI, and the Patient Global Impression of Improvement. Include the conceptual framework, qualitative content-validity work in the target population and age range, psychometric properties, an anchor-based responder or meaningful-within-patient-change threshold, recall period, and documentation of equivalence when the instrument was migrated to an electronic platform. Do not modify a licensed instrument's items, response options or recall period without re-validation.",
      "severity": "critical",
      "appliesTo": "5.3.5.4",
      "triggerKeywords": [
        "patient reported outcome",
        "ipss",
        "iief",
        "sep-2",
        "sep-3",
        "oab-q",
        "pgi-i",
        "content validity",
        "meaningful change"
      ],
      "guidanceRef": "FDA-PRO-2009"
    },
    {
      "id": "uro-ctx-cardiovascular",
      "scope": "section",
      "instruction": "For any mechanism with a plausible pressor or chronotropic effect (beta-3 adrenergic agonists in particular) or a plausible hypotensive effect (alpha-1 blockers, phosphodiesterase-5 inhibitors), present 24-hour ambulatory blood pressure monitoring data from a dedicated study, together with clinic blood pressure and heart rate shift tables, the incidence of hypertension-related adverse events, and orthostatic hypotension and syncope rates in the elderly. Present the interaction with nitrates and with alpha-blockers for PDE5 inhibitors, and address the thorough QT assessment per ICH E14/S7B.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "ambulatory blood pressure",
        "abpm",
        "pressor effect",
        "beta-3 agonist",
        "orthostatic hypotension",
        "syncope",
        "qt prolongation",
        "nitrate interaction"
      ],
      "guidanceRef": "FDA-PRESSOR-2022"
    },
    {
      "id": "uro-ctx-anticholinergic-cns",
      "scope": "section",
      "instruction": "For antimuscarinic agents, characterize central nervous system safety explicitly: report CNS adverse events (somnolence, dizziness, confusion, memory impairment, hallucination) with exposure-adjusted rates in subjects aged 65 and over and 75 and over, describe CNS penetration (molecular properties, P-glycoprotein substrate status, any CSF or PET occupancy data), and where the population includes cognitively vulnerable patients present a prospective cognitive assessment battery. Address cumulative anticholinergic burden with concomitant medications in the drug-interaction and labeling discussion.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "antimuscarinic",
        "anticholinergic burden",
        "cognitive",
        "cns adverse events",
        "elderly",
        "p-glycoprotein",
        "blood-brain barrier"
      ],
      "guidanceRef": "ICH-E7"
    },
    {
      "id": "uro-ctx-geriatric",
      "scope": "section",
      "instruction": "Enroll and report an adequate geriatric population per ICH E7 - report the number and percentage of subjects aged 65 and over and 75 and over, present efficacy and safety subgroup analyses by these age strata, and provide renal and hepatic impairment pharmacokinetic data with the resulting dose adjustments. Characterize drug-drug interactions with the medications this population actually takes, including strong CYP3A4 and CYP2D6 inhibitors and inducers, P-glycoprotein modulators, anticoagulants and antihypertensives, and carry the interaction conclusions into 2.7.2 and the proposed labeling.",
      "severity": "major",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "geriatric",
        "age 75 and over",
        "renal impairment",
        "cyp3a4",
        "cyp2d6",
        "polypharmacy",
        "drug interaction"
      ],
      "guidanceRef": "ICH-E7"
    },
    {
      "id": "uro-ctx-placebo-response",
      "scope": "section",
      "instruction": "Design and describe explicit controls for the large placebo response characteristic of this area: a single-blind placebo run-in of defined duration with pre-specified exclusion criteria for placebo responders and for diary non-compliers, standardized instructions on fluid intake and behavioural measures applied identically across arms, and a pre-specified assessment of the adequacy of blinding where a mechanism produces a recognizable adverse effect (dry mouth with antimuscarinics, flushing with PDE5 inhibitors). Report the placebo-arm change from baseline by region and by site to expose heterogeneity.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "placebo run-in",
        "placebo response",
        "functional unblinding",
        "behavioural therapy",
        "fluid intake",
        "regional heterogeneity"
      ]
    },
    {
      "id": "uro-ctx-bph-longterm",
      "scope": "section",
      "instruction": "For benign prostatic hyperplasia programs, distinguish the short-term symptomatic claim (change from baseline in total IPSS and in peak urinary flow rate at 12 weeks) from any disease-progression claim (reduction in acute urinary retention and BPH-related surgery), which requires a trial of at least two years with prospectively adjudicated events. State whether a prostate-specific antigen effect is expected, how PSA will be interpreted for prostate cancer surveillance during and after treatment, and what labeling language will convey the adjustment factor and the residual uncertainty about high-grade disease detection.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "benign prostatic hyperplasia",
        "ipss",
        "peak urinary flow",
        "qmax",
        "acute urinary retention",
        "psa",
        "prostate cancer surveillance",
        "5-alpha reductase"
      ],
      "guidanceRef": "EMA-BPH-2016"
    },
    {
      "id": "uro-ctx-ed-endpoints",
      "scope": "section",
      "instruction": "For erectile dysfunction, present the conventional three co-primary endpoints together: the IIEF erectile function domain score and the per-subject proportions of positive responses to Sexual Encounter Profile question 2 (penetration) and question 3 (successful intercourse to satisfaction), all derived from a subject event log. Report the aetiologic subgroups defined at entry (diabetic, post-radical-prostatectomy, cardiovascular, psychogenic) and, where a claim is intended in a subgroup, power the study for it rather than presenting a post-hoc analysis.",
      "severity": "major",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "erectile dysfunction",
        "iief",
        "sep-2",
        "sep-3",
        "sexual encounter profile",
        "radical prostatectomy",
        "diabetic erectile"
      ]
    },
    {
      "id": "uro-ctx-uti-microbiology",
      "scope": "section",
      "instruction": "For urinary tract infection programs, define the composite responder endpoint (resolution of the pre-specified baseline symptoms without new symptoms, plus microbiological eradication to below the defined CFU/mL threshold) at the protocol-specified test-of-cure visit, and pre-specify the microbiological modified intent-to-treat analysis population. State the non-inferiority margin with its justification derived from historical evidence of sensitivity to drug effects, describe central microbiology with organism identification and susceptibility testing to a recognized standard, and provide the resistance-emergence analysis on paired baseline and post-baseline isolates.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "urinary tract infection",
        "test of cure",
        "microbiological eradication",
        "micro-mitt",
        "non-inferiority margin",
        "susceptibility testing",
        "resistance emergence"
      ],
      "guidanceRef": "FDA-cUTI-2018"
    },
    {
      "id": "uro-ctx-fdc-contribution",
      "scope": "module",
      "instruction": "For any fixed-dose combination (for example an alpha-1 blocker with a 5-alpha reductase inhibitor, or an antimuscarinic with a beta-3 agonist), provide the factorial or add-on design that demonstrates each component contributes to the claimed effect, consistent with the combination-product regulation at 21 CFR 300.50; a superiority comparison against one component alone is not sufficient unless the other component's contribution is separately established. Document the dose selection for each component and the pharmacokinetic interaction between them.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "fixed-dose combination",
        "factorial design",
        "contribution of elements",
        "add-on therapy",
        "combination rule"
      ]
    },
    {
      "id": "uro-ctx-nonclinical-bladder",
      "scope": "module",
      "instruction": "Where rodent carcinogenicity studies show urinary bladder tumours or urothelial hyperplasia, provide the mechanistic investigation - urinary pH, calculus and microcrystal formation, cytotoxicity and regenerative hyperplasia - sufficient to argue a rodent-specific, threshold-based mechanism not relevant to humans; include urinalysis, urine sediment microscopy and bladder histopathology from the chronic studies. Reconcile the nonclinical finding with clinical haematuria, cytology and any imaging surveillance in 2.6.7 and 2.7.4.",
      "severity": "major",
      "appliesTo": "4",
      "triggerKeywords": [
        "bladder tumour",
        "urothelial hyperplasia",
        "carcinogenicity",
        "urinary calculi",
        "microcrystal",
        "urinary ph"
      ],
      "guidanceRef": "ICH-S1B-R1"
    },
    {
      "id": "uro-ctx-always-alignment",
      "scope": "always",
      "instruction": "Ensure the diary-derived endpoint definitions, the evaluable-diary rules, the analysis populations and the responder thresholds are identical in the protocol, the SAP, 2.7.3, 2.5 and the proposed labeling, and that every efficacy figure quoted in the Clinical Overview traces to a numbered table in the study report. In this area reviewers routinely rebuild the diary-derived variables from the raw SDTM domains, so any undocumented derivation rule becomes an information request.",
      "severity": "major",
      "triggerKeywords": [
        "endpoint derivation",
        "sdtm",
        "analysis population",
        "labeling claim",
        "traceability"
      ]
    }
  ],
  "riskFactors": [
    "Primary endpoints are subjective and diary-derived, so the entire efficacy case rests on instrument validation, diary compliance and derivation rules that reviewers can and do reconstruct from raw data.",
    "Placebo and behavioural-therapy response in overactive bladder, benign prostatic hyperplasia and interstitial cystitis is large, variable across regions, and often continues to improve over the trial, producing effect sizes that are statistically significant but of contested clinical meaningfulness.",
    "The target population is elderly and polypharmacy-exposed, so cardiovascular safety (blood pressure elevation with beta-3 agonists, orthostatic hypotension with alpha-1 blockers), cognitive safety (anticholinergic burden), falls and fracture risk, and drug-drug interactions dominate the labeling negotiation.",
    "Mechanisms affecting prostate-specific antigen (notably 5-alpha reductase inhibition) create a prostate-cancer-detection confound and a high-grade-disease labeling issue that must be addressed prospectively with a surveillance and biopsy plan.",
    "Chronic symptomatic indications trigger ICH E1 long-term exposure expectations and require an open-label extension of at least 12 months, which sponsors frequently under-plan.",
    "Fixed-dose combinations, which are commercially attractive in BPH and OAB, require factorial evidence that each component contributes; failure to design for this at phase 2 is not recoverable later.",
    "Urinary tract infection programs face non-inferiority margin justification, resistance-emergence analysis and central microbiology logistics that differ fundamentally from the symptom-based rest of the area and are reviewed by a different division.",
    "Rodent urinary bladder tumours are a recurrent nonclinical finding for compounds concentrated in urine, and an inadequate mechanistic package can force restrictive labeling or a surveillance requirement.",
    "Sexual-function and pelvic-symptom endpoints carry culturally variable reporting behaviour, so multiregional trials can show substantial regional heterogeneity in both placebo and active response."
  ],
  "commonGaps": [
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "instrument not validated",
        "no content validity",
        "instrument modified",
        "recall period changed",
        "ediary equivalence not demonstrated",
        "responder threshold not anchored",
        "translation not linguistically validated"
      ],
      "description": "A symptom instrument or diary supporting the primary endpoint or a labeling claim lacks content-validity evidence in the enrolled population, has been altered from its validated form, or was migrated to an electronic platform without equivalence testing and linguistic validation.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-PRO-2009"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "diary compliance not reported",
        "incomplete diary days",
        "evaluable visit rule undefined",
        "derivation from diary not described",
        "missing diary days imputed"
      ],
      "description": "Diary completeness is not reported by arm and visit, the rule defining an evaluable diary period is undefined, or missing diary days are silently imputed, making the derived micturition and incontinence endpoints unverifiable.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no ambulatory blood pressure",
        "abpm not conducted",
        "pressor effect not characterized",
        "clinic bp only",
        "heart rate increase not quantified"
      ],
      "description": "A mechanism with a plausible pressor or chronotropic effect is supported only by clinic blood pressure measurements, with no dedicated 24-hour ambulatory blood pressure monitoring study to characterize the magnitude and duration of the effect.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-PRESSOR-2022"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "cognitive safety not assessed",
        "cns adverse events not analysed by age",
        "anticholinergic burden not discussed",
        "no elderly subgroup safety",
        "confusion hallucination not tabulated"
      ],
      "description": "Antimuscarinic central nervous system safety in the elderly is not characterized - no age-stratified CNS adverse event analysis, no discussion of CNS penetration or cumulative anticholinergic burden, and no cognitive assessment in a vulnerable population.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E7"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "geriatric representation inadequate",
        "few subjects over 75",
        "renal impairment not studied",
        "hepatic impairment not studied",
        "drug interaction not characterized",
        "cyp3a4 inhibitor not evaluated"
      ],
      "description": "Insufficient enrollment of subjects aged 75 and over, or absent renal and hepatic impairment and drug-drug interaction studies, leaving dosing in the actual treated population unsupported and Section 8.5 of labeling weak.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E7"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "clinical meaningfulness not established",
        "effect size small",
        "no anchor-based analysis",
        "cumulative distribution function not provided",
        "responder analysis absent"
      ],
      "description": "A statistically significant but numerically small mean change (for example under one micturition per 24 hours, or under a 3-point IPSS difference from placebo) presented without anchor-based responder analyses or cumulative distribution function plots to establish clinical meaningfulness.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "long-term safety insufficient",
        "no 12-month exposure",
        "open-label extension not conducted",
        "ich e1 not satisfied",
        "chronic use safety limited"
      ],
      "description": "Chronic-use symptomatic indication supported only by 12-week controlled data, without the 6- and 12-month exposure cohorts expected under ICH E1 for long-term treatment of a non-life-threatening condition.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "psa effect not addressed",
        "prostate cancer surveillance absent",
        "high-grade cancer not discussed",
        "psa adjustment factor not provided",
        "biopsy plan missing"
      ],
      "description": "A mechanism that lowers serum prostate-specific antigen is submitted without a PSA interpretation adjustment, a prostate-cancer surveillance and biopsy plan, or an analysis of high-grade disease incidence, all of which reviewers require for labeling.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "contribution of components not shown",
        "no factorial design",
        "combination tested against one component",
        "monotherapy arm missing",
        "21 cfr 300.50"
      ],
      "description": "A fixed-dose combination supported only by a comparison against a single component or against placebo, without factorial or add-on evidence that each component contributes to the claimed effect as required for combination drugs.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "non-inferiority margin not justified",
        "no historical evidence of sensitivity",
        "micro-mitt population undefined",
        "test of cure timing",
        "resistance emergence not analysed",
        "central laboratory not used"
      ],
      "description": "In urinary tract infection trials, the non-inferiority margin lacks a historical-evidence justification, the microbiological analysis population or test-of-cure timing is undefined, or paired-isolate resistance-emergence analysis and central susceptibility testing are missing.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-cUTI-2018"
    },
    {
      "ctdSection": "2.6.7",
      "patterns": [
        "bladder tumour mechanism not investigated",
        "urothelial hyperplasia unexplained",
        "urinary calculi not evaluated",
        "human relevance not argued",
        "urinalysis not performed"
      ],
      "description": "Rodent urinary bladder tumours or urothelial hyperplasia reported without the mechanistic investigation (urinary pH, crystal and calculus formation, cytotoxicity and regenerative proliferation) needed to argue rodent specificity and human irrelevance.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-S1B-R1"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "multiplicity not controlled",
        "co-primary alpha not split",
        "secondary endpoints unadjusted",
        "no testing hierarchy",
        "multiple doses unadjusted"
      ],
      "description": "Co-primary and key secondary endpoints intended for labeling are tested without a pre-specified hierarchical or graphical multiplicity procedure, or multiple dose arms are each compared to placebo at the nominal level.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-MULTIPLICITY-2022"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-UI-2019",
      "authority": "FDA",
      "title": "Urinary Incontinence: Developing Drugs for Treatment (Draft Guidance for Industry)",
      "why": "FDA's current thinking on trial populations, diary-based endpoints for stress and urgency urinary incontinence, responder and dry-rate analyses, trial duration and long-term safety expectations; the anchor for the endpoint and design justification in 2.5 and the SAP."
    },
    {
      "code": "FDA-UI-1997",
      "authority": "FDA",
      "title": "Clinical Development Programs for Drugs, Devices, and Biological Products for the Treatment of Urinary Incontinence (Guidance for Industry)",
      "why": "The long-standing reference for urodynamic characterization, diary methodology and pad-weight testing that many legacy urology programs were built on and that still informs comparability with historical trials."
    },
    {
      "code": "FDA-PRO-2009",
      "authority": "FDA",
      "title": "Patient-Reported Outcome Measures: Use in Medical Product Development to Support Labeling Claims (Guidance for Industry)",
      "why": "The evidentiary standard for the bladder diary, IPSS, IIEF/SEP, OAB-q and other instruments on which every urology efficacy claim depends; determines the content of the PRO dossier in 5.3.5.4 and the wording available in Section 14 of labeling."
    },
    {
      "code": "FDA-PFDD3-2022",
      "authority": "FDA",
      "title": "Patient-Focused Drug Development: Selecting, Developing, or Modifying Fit-for-Purpose Clinical Outcome Assessments (Guidance for Industry, Guidance 3 of 4)",
      "why": "Operationalizes how to select or modify a clinical outcome assessment, define a meaningful within-patient change threshold, and document fit-for-purpose status; used to defend the responder definition applied to diary and symptom-score endpoints."
    },
    {
      "code": "FDA-PRESSOR-2022",
      "authority": "FDA",
      "title": "Assessment of Pressor Effects of Drugs (Draft Guidance for Industry)",
      "why": "Describes when and how to characterize a drug's effect on blood pressure, including ambulatory blood pressure monitoring design and analysis; directly applicable to beta-3 adrenergic agonists and other urology mechanisms with a pressor signal."
    },
    {
      "code": "FDA-cUTI-2018",
      "authority": "FDA",
      "title": "Complicated Urinary Tract Infections: Developing Drugs for Treatment (Guidance for Industry)",
      "why": "Defines the composite clinical and microbiological responder endpoint, the microbiological modified intent-to-treat population, the test-of-cure timing and the non-inferiority margin justification for cUTI and acute pyelonephritis programs."
    },
    {
      "code": "FDA-uUTI-2019",
      "authority": "FDA",
      "title": "Uncomplicated Urinary Tract Infections: Developing Drugs for Treatment (Draft Guidance for Industry)",
      "why": "Sets the symptom-plus-microbiology composite responder endpoint, the acceptable baseline symptom assessment, and the trial design for uncomplicated UTI including comparator selection; used for the oral agent development strategy."
    },
    {
      "code": "FDA-MULTIPLICITY-2022",
      "authority": "FDA",
      "title": "Multiple Endpoints in Clinical Trials (Guidance for Industry)",
      "why": "Governs the co-primary endpoint construct universal in this area and the hierarchical or graphical testing of the secondary endpoints intended for labeling; the reference cited in the SAP multiplicity section."
    },
    {
      "code": "FDA-DDI-2020",
      "authority": "FDA",
      "title": "Clinical Drug Interaction Studies - Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions (Guidance for Industry)",
      "why": "Defines the in vitro and clinical drug-interaction evaluation needed for a polypharmacy-exposed elderly population, particularly CYP3A4, CYP2D6 and P-glycoprotein interactions for antimuscarinics, alpha-blockers and PDE5 inhibitors; drives 2.7.2 and Section 7 of labeling."
    },
    {
      "code": "EMA-UI-2007",
      "authority": "EMA",
      "title": "Guideline on the Clinical Investigation of Medicinal Products for the Treatment of Urinary Incontinence (CHMP/EWP/18563/2006)",
      "why": "EMA's expectations on population definition, urodynamic assessment, diary-based primary endpoints, duration of efficacy and long-term safety for urinary incontinence; reconciled with the FDA construct to support a single global program."
    },
    {
      "code": "EMA-BPH-2016",
      "authority": "EMA",
      "title": "Note for Guidance on Clinical Investigation of Medicinal Products for the Treatment of Benign Prostatic Hyperplasia (CPMP/EWP/238/95 Rev. 1)",
      "why": "EMA's design requirements for BPH trials including IPSS and peak urinary flow rate as co-primary measures, minimum trial duration, comparator choice, and the long-term outcome endpoints of acute urinary retention and BPH-related surgery."
    },
    {
      "code": "EMA-ABX-2022",
      "authority": "EMA",
      "title": "Guideline on the Evaluation of Medicinal Products Indicated for Treatment of Bacterial Infections (CPMP/EWP/558/95 Rev. 3)",
      "why": "EMA's counterpart for UTI programs, covering indication wording, non-inferiority and superiority designs, PK/PD target attainment and susceptibility breakpoint setting; needed for EU alignment of the cUTI and uUTI package."
    },
    {
      "code": "ICH-E7",
      "authority": "ICH",
      "title": "ICH E7 Studies in Support of Special Populations: Geriatrics (and the associated Questions and Answers)",
      "why": "Requires adequate geriatric representation, age-stratified efficacy and safety analyses and characterization of age-related pharmacokinetic differences - fundamental in an area where the majority of the treated population is over 65."
    },
    {
      "code": "ICH-E1",
      "authority": "ICH",
      "title": "ICH E1 The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the 1500 total, 300-600 six-month and 100 twelve-month exposure expectations that size the safety database for chronic overactive bladder and BPH therapies; the basis for planning the open-label extension."
    },
    {
      "code": "ICH-E14",
      "authority": "ICH",
      "title": "ICH E14 The Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs (with Q&As) and ICH S7B",
      "why": "Governs the thorough QT study or concentration-QTc analysis required for antimuscarinics, beta-3 agonists and PDE5 inhibitors, several of which have shown exposure-dependent QTc effects; supports 2.7.4 and Section 5 of labeling."
    },
    {
      "code": "ICH-E9R1",
      "authority": "ICH",
      "title": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials",
      "why": "Frames the handling of rescue behavioural therapy, catheterization, surgery and discontinuation as intercurrent events in symptom-based urology trials, and requires a pre-specified sensitivity-analysis strategy for the substantial missing diary data."
    },
    {
      "code": "ICH-S1B-R1",
      "authority": "ICH",
      "title": "ICH S1B(R1) Testing for Carcinogenicity of Pharmaceuticals",
      "why": "Provides the weight-of-evidence framework used to interpret rodent urinary bladder tumours and urothelial hyperplasia and to argue human irrelevance, and to justify the carcinogenicity testing strategy for chronically administered urology drugs."
    }
  ],
  "reviewerExpectations": [
    "The reviewer will rebuild the micturition and incontinence-episode endpoints from the raw diary data in the SDTM domains and will expect the derivation rules, evaluable-day thresholds and handling of partial diaries to be documented precisely and applied identically across arms.",
    "The reviewer expects clinical meaningfulness to be demonstrated, not asserted: cumulative distribution function plots of the change from baseline, anchor-based responder analyses tied to the Patient Global Impression of Improvement, and the dry rate, because a mean difference of well under one micturition per 24 hours is routinely challenged.",
    "The clinical pharmacology and safety reviewers will look for 24-hour ambulatory blood pressure data for any beta-3 agonist or other mechanism with a pressor signal, and for orthostatic vital signs and syncope events for alpha-1 blockers and PDE5 inhibitors.",
    "For antimuscarinics, the reviewer will specifically examine central nervous system adverse events in subjects aged 75 and over, the drug's propensity to cross the blood-brain barrier, and the cumulative anticholinergic burden argument, and will expect these to be addressed in Warnings and Precautions and in the geriatric use section.",
    "The reviewer expects the safety database to include enough elderly subjects to characterize the drug in the population that will actually receive it, with efficacy and safety displayed by age stratum and no unexplained attenuation of effect in the oldest group.",
    "For BPH programs, the reviewer will assess whether the IPSS improvement versus placebo reaches a clinically meaningful magnitude, whether the peak urinary flow rate improvement is supported by adequate uroflowmetry quality control (minimum voided volume, standardized conditions), and how PSA suppression will be communicated for prostate cancer surveillance.",
    "For fixed-dose combinations, the reviewer will require factorial or add-on evidence for the contribution of each component and will not accept a superiority comparison against a single component alone.",
    "In UTI programs the reviewer expects central microbiology, a pre-specified microbiological modified intent-to-treat population, a justified non-inferiority margin traceable to historical evidence of sensitivity to drug effects, and a paired-isolate resistance-emergence analysis.",
    "Reviewers will examine regional heterogeneity in both placebo and active response, and will ask whether the multiregional trial supports the US population specifically when a large fraction of enrollment came from a single region."
  ],
  "pathwayHints": [
    {
      "pathway": "fast_track",
      "applicability": "Realistic for serious conditions with unmet need within urology - multidrug-resistant complicated urinary tract infection and pyelonephritis, neurogenic detrusor overactivity with upper-tract deterioration in spinal cord injury or spina bifida, and refractory interstitial cystitis/bladder pain syndrome. It is not generally available for uncomplicated overactive bladder, erectile dysfunction or symptomatic BPH, which are not considered serious conditions.",
      "impactedSections": [
        "1.12",
        "2.5",
        "1.14.1"
      ],
      "reviewerNotes": "The seriousness argument must be made explicitly on morbidity and irreversible consequences (renal deterioration, sepsis, resistance), not on symptom burden alone; reviewers reject designation requests that rest on quality-of-life impairment in a non-serious condition."
    },
    {
      "pathway": "priority_review",
      "applicability": "Applies chiefly to anti-infectives for resistant urinary tract infections, where Qualified Infectious Disease Product designation under the GAIN provisions confers priority review and a five-year exclusivity extension, and to first therapies for a serious urologic condition with no approved alternative.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4",
        "5.3.5.1"
      ],
      "reviewerNotes": "The compressed review clock requires that central microbiology laboratories, susceptibility testing methods and clinical sites be identified in Module 1 at filing so that BIMO and pre-approval inspections can be scheduled; breakpoint discussions with the agency should already be well advanced."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Applies to rare urologic and stone-forming conditions such as primary hyperoxaluria, cystinuria, congenital neurogenic bladder in spina bifida, and rare paediatric urologic disorders; it does not apply to overactive bladder, BPH, erectile dysfunction or common UTI.",
      "impactedSections": [
        "1.5",
        "1.7",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "In these small populations reviewers accept biomarker-based endpoints (for example urinary oxalate excretion in primary hyperoxaluria) with a confirmatory requirement on kidney-stone events and renal function, provided the biomarker-outcome relationship is supported by natural-history data."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Rare in urology and essentially limited to serious conditions - a first effective therapy for a rare urologic disease, or an anti-infective with a substantial advantage over available therapy against resistant uropathogens in a life-threatening infection.",
      "impactedSections": [
        "1.12",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Sponsors should not pursue designation for symptomatic indications; where granted, the benefit is early agreement on the endpoint, the microbiological analysis population and the size of the safety database."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Uncommon in this area because symptom endpoints are already clinical rather than surrogate. It is realistic only in rare urologic conditions where a biomarker such as urinary oxalate excretion or a renal-function surrogate is reasonably likely to predict clinical benefit.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "1.14.1",
        "5.3.5.1"
      ],
      "reviewerNotes": "Reviewers will require the confirmatory trial on hard outcomes (stone events, renal function decline, dialysis or transplantation) to be underway at approval, with the surrogate-outcome relationship supported by prospective natural-history data rather than cross-sectional correlation."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU route available for seriously debilitating rare urologic conditions and for antibacterials addressing resistant uropathogens where comprehensive clinical data cannot yet be generated.",
      "impactedSections": [
        "1.8.2",
        "2.5",
        "2.7.4",
        "5.3.5.1"
      ],
      "reviewerNotes": "CHMP will impose specific obligations covering the confirmatory study and, for antibacterials, resistance surveillance and stewardship measures in the Risk Management Plan; the indication wording will be narrowed to the resistant population actually studied."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME support is plausible for a therapy addressing a rare urologic disease with major unmet need or a novel antibacterial for resistant urinary pathogens, given compelling early clinical proof of concept.",
      "impactedSections": [
        "1.12",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "PRIME is not available for symptomatic benign urologic conditions; where granted, sponsors are expected to bring the endpoint strategy, the paediatric investigation plan and the resistance-monitoring plan to the enhanced scientific advice."
    }
  ],
  "statisticalConsiderations": [
    "Both co-primary endpoints in overactive bladder (change from baseline in mean micturitions per 24 hours and in mean urgency incontinence episodes per 24 hours) must each be met at the full two-sided 0.05 level; do not split alpha between them, and pre-specify a hierarchical or graphical procedure for the ordered secondary endpoints intended for labeling, including the dry rate, volume voided per micturition, the OAB-q health-related quality of life score and the PGI-I.",
    "Analyze count-type diary endpoints with a mixed model for repeated measures on the change from baseline, adjusting for baseline value, stratification factors and region, with an unstructured covariance matrix and a pre-specified reduction strategy if it fails to converge; where the distribution is markedly skewed or zero-inflated, pre-specify a negative binomial or rank-based sensitivity analysis rather than switching after seeing the data.",
    "Declare an ICH E9(R1) estimand naming the intercurrent events specific to this area - initiation of rescue behavioural therapy, clean intermittent catheterization, surgical intervention, botulinum toxin injection, or use of a prohibited concomitant medication - and state whether each is handled by a composite (non-responder), hypothetical or treatment-policy strategy; silent censoring of subjects who escalate to another therapy overstates the effect.",
    "Handle missing diary data explicitly: report the missingness pattern by arm and visit, use a primary approach appropriate to the assumed mechanism (MMRM under MAR for continuous endpoints, non-responder imputation for binary responder endpoints), and provide control-based multiple imputation and tipping-point analyses to test robustness against a missing-not-at-random mechanism driven by lack of efficacy.",
    "Establish clinical meaningfulness with pre-specified anchor-based analyses: derive the responder threshold from the Patient Global Impression of Improvement or a comparable anchor in an independent or blinded dataset, present the full cumulative distribution function of change from baseline for each arm, and report the number needed to treat for the responder definition.",
    "Design for the placebo response: include a single-blind placebo run-in with pre-specified exclusion of placebo responders and diary non-compliers, and pre-specify the analysis of the placebo-arm trajectory by region and site, because regional heterogeneity in the placebo response is a common cause of a failed multiregional trial in this area.",
    "For non-inferiority designs in urinary tract infection, justify the margin from historical evidence of sensitivity to drug effects with a documented derivation (typically a fraction of the historical treatment effect preserved), pre-specify both the microbiological modified intent-to-treat and the clinically evaluable populations, and treat the analysis as confirmatory only if both populations support the conclusion.",
    "For fixed-dose combinations, pre-specify the factorial contrasts and the multiplicity adjustment across the pairwise comparisons needed to establish each component's contribution, and power the study for the smaller of the two contrasts rather than for the combination-versus-placebo comparison.",
    "Pre-specify the geriatric subgroup analyses (65 and over, 75 and over) as part of the analysis plan with a formal treatment-by-age interaction test, and present them in forest plots alongside sex, race, region, baseline severity and renal function, so that reviewers do not have to construct them and find an inconsistency."
  ],
  "endpointConsiderations": [
    "Overactive bladder with urgency urinary incontinence - co-primary change from baseline to week 12 in the mean number of micturitions per 24 hours and the mean number of urgency incontinence episodes per 24 hours, derived from a 3-day or 7-day diary. Caveat: the placebo-adjusted effect for approved agents is typically under one micturition and around one incontinence episode per 24 hours, so responder and dry-rate analyses and cumulative distribution function plots are essential to support the labeling claim.",
    "Overactive bladder supportive endpoints - mean volume voided per micturition, number of urgency episodes graded by a validated urgency severity scale, number of incontinence pads used, the OAB-q symptom bother and health-related quality of life scores, and the Patient Global Impression of Improvement. Caveat: urgency-severity scales differ between programs and are not interchangeable; only a validated instrument with an established responder threshold can support a claim.",
    "Stress urinary incontinence - incontinence episode frequency per week from a diary, supported by a standardized pad-weight test (one-hour or 24-hour) and the Incontinence Quality of Life instrument. Caveat: pad tests are highly variable and require rigorous standardization of bladder volume and activity protocol; behavioural and pelvic floor training must be standardized or prohibited across arms.",
    "Neurogenic detrusor overactivity - urinary incontinence episodes per week as the primary clinical endpoint, with urodynamic measures (maximum cystometric capacity, maximum detrusor pressure during the first involuntary detrusor contraction, reflex volume) as key supportive endpoints. Caveat: urodynamics require a standardized protocol and central review; catheterization frequency and volume must be captured as they are both an outcome and an intercurrent event.",
    "Benign prostatic hyperplasia with lower urinary tract symptoms - co-primary change from baseline in total International Prostate Symptom Score and in peak urinary flow rate (Qmax) at 12 weeks. Caveat: a placebo-adjusted IPSS difference of roughly 2 points is typical for approved agents while the minimally important difference is commonly cited as about 3 points, so meaningfulness must be argued with responder analyses; Qmax requires a minimum voided volume (usually 125-150 mL) and standardized conditions or the measurement is uninterpretable.",
    "Benign prostatic hyperplasia disease progression - reduction in the incidence of acute urinary retention and of BPH-related surgery over two to four years, with prospectively adjudicated events. Caveat: this is a separate, much larger and longer trial than the symptomatic program, and the claim cannot be extrapolated from short-term symptom improvement.",
    "Nocturia due to nocturnal polyuria - change from baseline in the mean number of nocturic voids per night, supported by the duration of the first undisturbed sleep period and by nocturnal urine volume. Caveat: hyponatraemia is the defining safety issue for vasopressin-analogue mechanisms and requires protocolized serum sodium monitoring with age- and sex-specific dosing, which usually becomes a Boxed Warning or equivalent labeling restriction.",
    "Erectile dysfunction - the three conventional co-primary endpoints: the IIEF erectile function domain score, and the per-subject proportion of successful penetration (SEP question 2) and successful intercourse (SEP question 3) responses from an event log; the global assessment question is supportive. Caveat: partner and situational factors, and the requirement for a minimum number of attempts, introduce substantial variability; efficacy in the diabetic and post-radical-prostatectomy subgroups is systematically lower and must be studied rather than extrapolated.",
    "Interstitial cystitis/bladder pain syndrome - bladder pain intensity on a validated numeric rating scale as the primary endpoint, with the O'Leary-Sant Interstitial Cystitis Symptom and Problem Indices, micturition frequency and a global response assessment as key secondaries. Caveat: the population is heterogeneous (Hunner-lesion versus non-lesion phenotype), placebo response is very large, and no instrument has universally accepted regulatory status, so early agency alignment on the endpoint is essential.",
    "Uncomplicated urinary tract infection - a composite responder endpoint combining resolution of the pre-specified baseline urinary symptoms without new symptoms and microbiological eradication (typically below 10^3 CFU/mL) at the test-of-cure visit, in the microbiological modified intent-to-treat population. Caveat: symptom assessment must use a documented, patient-completed instrument, and the composite is driven by the microbiological component, so the timing of the test-of-cure visit materially changes the result.",
    "Complicated urinary tract infection and acute pyelonephritis - the composite of clinical response and microbiological eradication at the fixed test-of-cure timepoint, with a justified non-inferiority margin. Caveat: enrolment of patients who have received prior effective antibacterial therapy dilutes the treatment effect and is constrained by protocol; resistance-emergence analysis on paired isolates is expected.",
    "Primary hyperoxaluria and stone disease - percentage change from baseline in 24-hour urinary oxalate excretion, or plasma oxalate in advanced renal impairment, as the biomarker endpoint, with kidney stone event rate, nephrocalcinosis and estimated glomerular filtration rate slope as the clinical outcomes. Caveat: the biomarker supports accelerated approval only where natural-history data link it to stone events and renal decline, and 24-hour urine collection completeness (verified by creatinine excretion) must be documented for every sample."
  ],
  "retrievalKeywords": [
    "overactive bladder",
    "urgency urinary incontinence",
    "micturition frequency",
    "bladder diary",
    "dry rate responder",
    "stress urinary incontinence",
    "pad weight test",
    "neurogenic detrusor overactivity",
    "urodynamics maximum cystometric capacity",
    "benign prostatic hyperplasia",
    "international prostate symptom score",
    "ipss minimally important difference",
    "peak urinary flow rate qmax",
    "acute urinary retention",
    "prostate-specific antigen suppression",
    "5-alpha reductase inhibitor",
    "alpha-1 blocker orthostatic hypotension",
    "beta-3 adrenergic agonist",
    "ambulatory blood pressure monitoring",
    "antimuscarinic anticholinergic burden",
    "cognitive safety elderly",
    "nocturia nocturnal polyuria",
    "hyponatraemia desmopressin",
    "erectile dysfunction iief",
    "sexual encounter profile sep-3",
    "interstitial cystitis bladder pain syndrome",
    "o'leary-sant icsi icpi",
    "uncomplicated urinary tract infection",
    "complicated urinary tract infection",
    "test of cure microbiological eradication",
    "non-inferiority margin justification",
    "resistance emergence paired isolates",
    "primary hyperoxaluria urinary oxalate",
    "nephrolithiasis stone event rate",
    "fixed-dose combination factorial design",
    "placebo run-in placebo response",
    "geriatric ich e7",
    "rodent bladder tumour carcinogenicity",
    "cumulative distribution function responder",
    "patient global impression of improvement"
  ]
};

export default urologyProfile;
