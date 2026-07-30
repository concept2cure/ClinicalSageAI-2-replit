/**
 * Psychiatry & Central Nervous System (Psychiatric Disorders) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/psychiatry
 */
import type { TherapeuticAreaProfile } from './types.js';

export const psychiatryProfile: TherapeuticAreaProfile = {
  "id": "psychiatry",
  "displayName": "Psychiatry & Central Nervous System (Psychiatric Disorders)",
  "description": "Regulatory profile for CNS/psychiatric indications including major depressive disorder (MDD), treatment-resistant depression, schizophrenia and schizoaffective disorder, bipolar I/II disorder, generalized anxiety disorder, PTSD, ADHD, OCD, and agitation associated with dementia. Programs are reviewed by FDA CDER Division of Psychiatry (Office of Neuroscience, OND) and by EMA's CHMP with input from the Psychiatry Working Party heritage guidelines. The area is defined by subjective, rater-administered efficacy endpoints (HAM-D, MADRS, PANSS, YMRS, CAPS-5, ADHD-RS-5), high and variable placebo response, mandatory prospective suicidal ideation and behavior monitoring, abuse-potential and controlled-substance scheduling assessment for CNS-active molecules, and a long-standing regulatory requirement for two adequate and well-controlled trials for most new psychiatric indications. Chronic dosing safety databases must meet ICH E1 exposure minimums, and QT, weight/metabolic, extrapyramidal, hepatic, sexual dysfunction, and withdrawal/discontinuation liabilities receive focused review.",
  "contextRules": [
    {
      "id": "psych-m25-efficacy-narrative",
      "scope": "section",
      "instruction": "In the Clinical Overview, state the psychiatric indication using the exact DSM-5-TR (or ICD-11) diagnostic construct used for enrollment, and justify the primary endpoint scale (e.g. MADRS total, PANSS total, ADHD-RS-5 total) as an accepted measure of the core disease construct. Present the substantial-evidence argument explicitly: identify which trials are the two adequate and well-controlled studies, or if relying on one trial plus confirmatory evidence, cite FDA's 2019 draft guidance on Demonstrating Substantial Evidence of Effectiveness and articulate what the confirmatory evidence is. Quantify the drug-placebo treatment difference on the original scale units alongside the standardized effect size, and address clinical meaningfulness using anchor-based responder definitions (e.g. CGI-I 1-2, >=50% symptom reduction) rather than statistical significance alone.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "clinical overview",
        "substantial evidence",
        "MADRS",
        "PANSS",
        "effect size",
        "two adequate and well-controlled"
      ],
      "guidanceRef": "FDA Substantial Evidence of Effectiveness (Dec 2019 draft)"
    },
    {
      "id": "psych-suicidality-2743",
      "scope": "section",
      "instruction": "Include a dedicated suicidal ideation and behavior (SIB) section in the Summary of Clinical Safety presenting prospectively collected C-SSRS (or equivalent validated instrument) data for every trial in which any CNS-active drug was administered, summarized by treatment arm, by C-SSRS category (ideation 1-5, behavior, self-injurious behavior without suicidal intent), by emergence versus worsening relative to baseline, and by age stratum with a specific <25-year subgroup analysis. Provide exposure-adjusted event rates and narratives for all completed suicides, attempts, and preparatory acts. State whether any events were adjudicated and by whom. Do not fold SIB data into general psychiatric adverse events; a stand-alone integrated analysis is expected.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "C-SSRS",
        "suicidal ideation",
        "suicidality",
        "self-harm",
        "suicide"
      ],
      "guidanceRef": "FDA Suicidal Ideation and Behavior: Prospective Assessment in Clinical Trials (2012 draft)"
    },
    {
      "id": "psych-abuse-potential-m5",
      "scope": "module",
      "instruction": "For any CNS-active investigational drug, include a complete abuse-potential assessment package in Module 5.3.5.4 and cross-reference the nonclinical package in Module 4: animal self-administration and drug-discrimination studies, physical dependence/withdrawal studies, a human abuse potential (HAP) study in recreational drug users with a validated positive control and Drug Liking VAS Emax as the primary endpoint (unless waived after discussion with the Controlled Substance Staff), and a systematic review of abuse-related adverse events (euphoria, dissociation, diversion, drug-seeking) across all Phase 2/3 studies. Provide the integrated 8-factor analysis supporting the proposed scheduling recommendation, or a scientifically justified request for no scheduling.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "abuse potential",
        "drug liking",
        "self-administration",
        "scheduling",
        "CSA",
        "dependence",
        "withdrawal"
      ],
      "guidanceRef": "FDA Assessment of Abuse Potential of Drugs (Jan 2017)"
    },
    {
      "id": "psych-placebo-response-5353",
      "scope": "section",
      "instruction": "In the integrated efficacy analysis, characterize placebo response explicitly: report mean placebo change from baseline per study, by geographic region, and by site enrollment volume; describe the enrichment or placebo-mitigation strategies used (centralized/independent remote raters, rater certification and calibration, eligibility duplicate checks, screening/baseline score consistency windows, single-blind lead-in, minimal-visit designs, Sequential Parallel Comparison Design if used). Where the design used SPCD or a two-stage sequential enrichment, present the pre-specified weighting of stage 1 and stage 2 test statistics and a sensitivity analysis using stage 1 alone.",
      "severity": "major",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "placebo response",
        "SPCD",
        "rater",
        "enrichment",
        "professional subject",
        "site effects"
      ],
      "guidanceRef": "EMA Guideline on Clinical Investigation of Medicinal Products in the Treatment of Depression (EMA/CHMP/185423/2010 Rev.2)"
    },
    {
      "id": "psych-long-term-safety-exposure",
      "scope": "section",
      "instruction": "Demonstrate ICH E1 compliance for chronically administered psychiatric drugs explicitly and in tabular form: at least 1,500 subjects exposed overall, at least 300-600 exposed for 6 months, and at least 100 exposed for 12 months at the intended clinical dose range. If the target population is pediatric, adolescent, or geriatric, provide the exposure breakdown by age stratum. Where exposure falls short, state the shortfall, the reason, and the proposed post-marketing commitment to remedy it rather than omitting the comparison.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "ICH E1",
        "long-term exposure",
        "safety database",
        "12 months",
        "300 patients"
      ],
      "guidanceRef": "ICH E1"
    },
    {
      "id": "psych-metabolic-eps-monitoring",
      "scope": "section",
      "instruction": "For antipsychotics and any drug with dopaminergic, serotonergic-2C, histaminergic, or muscarinic activity, present dedicated safety analyses for: weight change (mean change, categorical >=7% gain/loss shift tables), fasting glucose/HbA1c and lipid panel shift tables, prolactin, treatment-emergent extrapyramidal symptoms using SAS/BARS/AIMS with categorical treatment-emergent criteria, tardive dyskinesia incidence in long-term exposure, neuroleptic malignant syndrome narratives, orthostatic hypotension, and anticholinergic burden. Present each as a stand-alone subsection, not merely within the overall adverse event table.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "extrapyramidal",
        "akathisia",
        "AIMS",
        "tardive dyskinesia",
        "weight gain",
        "prolactin",
        "metabolic"
      ],
      "guidanceRef": "EMA Guideline on Clinical Investigation of Medicinal Products in the Treatment of Schizophrenia (EMA/CHMP/40072/2010 Rev.1)"
    },
    {
      "id": "psych-qt-thorough",
      "scope": "section",
      "instruction": "Include a thorough QT/QTc study conducted per ICH E14 with a positive control (typically moxifloxacin 400 mg), or a scientifically justified concentration-QTc (C-QTc) modeling substitute using Phase 1 data at supratherapeutic exposures. State the upper bound of the two-sided 90% CI for the largest placebo-adjusted, baseline-corrected QTcF change and whether it exceeds 10 ms. Cover exposures achieved with the worst-case intrinsic/extrinsic factor combination (e.g. strong CYP inhibitor plus hepatic impairment) and cross-reference Module 5.3.3.4.",
      "severity": "major",
      "appliesTo": "5.3.4.1",
      "triggerKeywords": [
        "QT",
        "QTc",
        "thorough QT",
        "moxifloxacin",
        "E14",
        "concentration-QTc"
      ],
      "guidanceRef": "ICH E14 / E14-S7B Q&A"
    },
    {
      "id": "psych-discontinuation-withdrawal",
      "scope": "section",
      "instruction": "Provide a discrete analysis of discontinuation-emergent signs and symptoms (DESS or equivalent) covering abrupt withdrawal after chronic dosing, including timing of onset, duration, severity, and whether tapering mitigated events. Distinguish withdrawal phenomena from relapse of the underlying psychiatric condition using pre-specified criteria, and state the labeling-relevant tapering recommendation that follows from these data.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "discontinuation",
        "withdrawal",
        "DESS",
        "rebound",
        "taper"
      ]
    },
    {
      "id": "psych-pediatric-plan",
      "scope": "section",
      "instruction": "Address PREA and the EU Paediatric Regulation explicitly: state the initial Pediatric Study Plan (iPSP) agreement or deferral/waiver basis for FDA and the agreed PIP or PIP waiver for EMA. For psychiatric indications, justify any extrapolation of adult efficacy to adolescents with reference to disease-course and exposure-response similarity, and state the pediatric suicidality monitoring plan and the growth/sexual-maturation (Tanner staging) assessments included in long-term pediatric studies.",
      "severity": "major",
      "appliesTo": "1.9",
      "triggerKeywords": [
        "pediatric",
        "PREA",
        "PIP",
        "iPSP",
        "adolescent",
        "extrapolation"
      ],
      "guidanceRef": "FDA PREA / EU Regulation (EC) No 1901/2006"
    },
    {
      "id": "psych-rater-training-m5-protocols",
      "scope": "module",
      "instruction": "In the study protocols and reports, document the rater qualification program: rater credentials and experience minimums, standardized training and certification for each instrument, inter-rater reliability metrics with pre-specified acceptance thresholds, ongoing surveillance and remediation of outlier raters, use of independent/centralized raters or dual scoring, and site-level analysis of score inflation at screening versus baseline. Reviewers routinely question effect estimates from programs without documented rater quality control.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "rater training",
        "inter-rater reliability",
        "centralized rater",
        "calibration",
        "scoring"
      ]
    },
    {
      "id": "psych-always-terminology",
      "scope": "always",
      "instruction": "Use current DSM-5-TR / ICD-11 diagnostic terminology consistently across all modules; never mix legacy terms (e.g. 'manic depression', 'dementia praecox') with current nomenclature. Report symptom scale results with the direction of benefit stated unambiguously (lower score = improvement for MADRS/HAM-D/PANSS/YMRS) and always accompany p-values with point estimates and two-sided 95% confidence intervals.",
      "severity": "minor",
      "triggerKeywords": [
        "DSM",
        "ICD-11",
        "diagnostic criteria",
        "terminology"
      ]
    }
  ],
  "riskFactors": [
    "High and rising placebo response in depression, anxiety, and schizophrenia trials, which is the single most common cause of failed pivotal studies and of one-positive/one-failed trial packages that cannot support approval",
    "Subjective, rater-dependent primary endpoints vulnerable to rater drift, score inflation at screening, professional/duplicate subjects, and site-level fraud, each of which can trigger a Bioresearch Monitoring inspection and data exclusion",
    "Suicidal ideation and behavior signal, including the class boxed warning for antidepressants in patients under 25, requiring prospective C-SSRS collection in every trial and a defensible integrated analysis",
    "Abuse potential and Controlled Substances Act scheduling exposure for any CNS-penetrant molecule, with the Controlled Substance Staff acting as a parallel gatekeeper that can delay launch even after approval action",
    "Metabolic burden (weight gain, dyslipidemia, dysglycemia), extrapyramidal symptoms and tardive dyskinesia, hyperprolactinemia, and QT prolongation, which drive risk-benefit conclusions and REMS considerations for antipsychotics",
    "High trial dropout (commonly 30-50% in MDD and schizophrenia trials), producing large amounts of missing outcome data that make LOCF-based or naive MMRM conclusions vulnerable to sensitivity-analysis challenge",
    "Polypharmacy and CYP-mediated drug-drug interactions (CYP2D6, CYP3A4, CYP1A2 with smoking status) plus poor-metabolizer phenotype exposure differences that complicate dose selection and labeling",
    "Long-term exposure shortfalls against ICH E1 minimums, especially for orphan or rapid-development psychiatric programs",
    "Dependence on foreign (non-US/EU) clinical trial sites where diagnostic practice, standard of care, and placebo response differ, raising applicability and ICH E17/E5 questions",
    "Comorbid substance use, suicidality exclusion criteria, and severity thresholds that narrow the trial population so far that the enrolled sample no longer represents the labeled population"
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no c-ssrs",
        "suicidal ideation not",
        "missing suicidality analysis",
        "suicide risk not assessed",
        "no prospective suicidality",
        "suicidality subgroup"
      ],
      "description": "Suicidal ideation and behavior data are not presented as an integrated, prospectively collected C-SSRS analysis with a <25-year subgroup; SIB events are buried in general adverse-event tables or reported only as investigator-coded MedDRA terms.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Suicidal Ideation and Behavior (2012 draft)"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "single trial",
        "only one positive",
        "failed study not discussed",
        "negative trial omitted",
        "substantial evidence not established",
        "confirmatory evidence"
      ],
      "description": "The substantial-evidence argument rests on a single positive trial without identifying qualifying confirmatory evidence, or fails to disclose and discuss failed/negative pivotal trials in the same program.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Substantial Evidence of Effectiveness (2019 draft)"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "locf",
        "last observation carried forward",
        "complete case",
        "missing data assumption",
        "no sensitivity analysis",
        "mnar not addressed",
        "dropout rate high"
      ],
      "description": "Missing-data handling relies on LOCF or complete-case analysis, or the primary MMRM assumes MAR without pre-specified tipping-point or control-based multiple-imputation sensitivity analyses despite 30%+ dropout.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "estimand not defined",
        "intercurrent event",
        "no estimand",
        "itt only",
        "population strategy not specified"
      ],
      "description": "No estimand is defined per ICH E9(R1); intercurrent events such as rescue medication, treatment discontinuation for lack of efficacy, hospitalization, and suicide attempt are not assigned a handling strategy, so the reported treatment effect has no clear clinical interpretation.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "abuse potential not",
        "no human abuse",
        "drug liking not measured",
        "self-administration missing",
        "scheduling recommendation unsupported",
        "8-factor"
      ],
      "description": "Abuse-potential package is incomplete: no human abuse potential study, no animal self-administration/drug-discrimination data, or no systematic collection and adjudication of abuse-related adverse events across Phase 2/3, leaving the 8-factor analysis unsupported.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Assessment of Abuse Potential of Drugs (2017)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "ich e1",
        "exposure less than",
        "insufficient long-term",
        "6-month exposure",
        "12-month exposure",
        "safety database size"
      ],
      "description": "Long-term safety exposure falls below ICH E1 thresholds (1500 total / 300-600 at 6 months / 100 at 12 months) or the exposure tables do not present duration-stratified counts at the intended clinical dose.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E1"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "rater training not",
        "inter-rater reliability",
        "no rater certification",
        "scoring inconsistency",
        "site outlier",
        "score inflation"
      ],
      "description": "Rater qualification, certification, inter-rater reliability, and centralized/independent rating procedures are not documented, and no site-level or rater-level outlier analysis is provided despite subjective primary endpoints.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "weight gain not",
        "metabolic parameters",
        "no shift table",
        "eps not assessed",
        "akathisia",
        "tardive dyskinesia",
        "prolactin not"
      ],
      "description": "Metabolic and neurologic class effects (weight, glucose, lipids, prolactin, EPS/akathisia, tardive dyskinesia) lack dedicated shift-table and categorical treatment-emergent analyses for an antipsychotic or metabolically active agent.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA Schizophrenia Guideline EMA/CHMP/40072/2010 Rev.1"
    },
    {
      "ctdSection": "5.3.4.1",
      "patterns": [
        "thorough qt",
        "no qt study",
        "qtc not evaluated",
        "e14",
        "supratherapeutic exposure not"
      ],
      "description": "No thorough QT study and no adequately justified concentration-QTc alternative, or the QT assessment does not cover supratherapeutic exposures reached under CYP inhibition or organ impairment.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E14"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "clinically meaningful not",
        "no responder analysis",
        "effect size small",
        "cgi not reported",
        "cumulative distribution"
      ],
      "description": "Clinical meaningfulness of the treatment difference is asserted from statistical significance alone, with no responder analysis, no anchor-based interpretation (e.g. CGI-I), and no cumulative distribution function of change from baseline.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "5.3.3.4",
      "patterns": [
        "hepatic impairment",
        "renal impairment",
        "cyp2d6",
        "poor metabolizer",
        "smoking status",
        "dose adjustment not supported"
      ],
      "description": "Intrinsic/extrinsic factor characterization is incomplete: no dedicated hepatic or renal impairment study, no CYP2D6 poor-metabolizer exposure data, or no smoking-status effect for CYP1A2 substrates, leaving dose adjustment recommendations unsupported.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Clinical Pharmacology Considerations / ICH M12"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "discontinuation symptoms",
        "withdrawal not assessed",
        "dess",
        "rebound not",
        "taper recommendation"
      ],
      "description": "No discontinuation/withdrawal assessment after chronic dosing, so labeling cannot distinguish discontinuation-emergent symptoms from relapse and cannot support a taper recommendation.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "1.9",
      "patterns": [
        "pediatric plan",
        "prea",
        "pip not",
        "adolescent data",
        "tanner staging",
        "growth monitoring"
      ],
      "description": "Pediatric plan is absent or unagreed: no iPSP/PIP status, no justification for extrapolation to adolescents, and no growth or sexual-maturation monitoring in long-term pediatric exposure.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "multiplicity not controlled",
        "no alpha adjustment",
        "hierarchical testing",
        "multiple doses tested",
        "secondary endpoint claim"
      ],
      "description": "Multiplicity across co-primary and key secondary endpoints, multiple doses, and interim looks is not controlled by a pre-specified hierarchical or graphical testing procedure, so secondary claims cannot be labeled.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Multiple Endpoints in Clinical Trials (2022)"
    },
    {
      "ctdSection": "2.7.1",
      "patterns": [
        "formulation bridge",
        "to-be-marketed formulation",
        "bioequivalence not",
        "commercial formulation differs"
      ],
      "description": "Bioanalytical or PK bridging between the Phase 3 formulation and the to-be-marketed formulation is missing or unaccompanied by a BE study, undermining the applicability of pivotal efficacy data to the commercial product.",
      "severity": "minor",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-2018-D-1893 (Major Depressive Disorder: Developing Drugs for Treatment, draft June 2018)",
      "authority": "FDA",
      "title": "Major Depressive Disorder: Developing Drugs for Treatment",
      "why": "Defines FDA's expectations for MDD trial population, acceptable primary endpoints (HAM-D-17, MADRS), trial duration, maintenance/randomized-withdrawal design for durability claims, and treatment-resistant depression definitions; sponsors use it to justify endpoint and design choices in Module 2.5 and 5.3.5.1."
    },
    {
      "code": "FDA Guidance: Suicidal Ideation and Behavior: Prospective Assessment of Occurrence in Clinical Trials (revised draft, Aug 2012)",
      "authority": "FDA",
      "title": "Suicidal Ideation and Behavior: Prospective Assessment of Occurrence in Clinical Trials",
      "why": "Establishes the requirement for prospective C-SSRS-type suicidality assessment in all CNS drug trials and prescribes the classification and integrated presentation format used in Module 2.7.4 and the ISS."
    },
    {
      "code": "FDA Guidance: Assessment of Abuse Potential of Drugs (final, Jan 2017)",
      "authority": "FDA",
      "title": "Assessment of Abuse Potential of Drugs",
      "why": "Prescribes the nonclinical and human abuse potential study package, abuse-related adverse event collection, and the 8-factor analysis supporting a CSA scheduling recommendation; drives Module 4 and 5.3.5.4 content for CNS-active molecules."
    },
    {
      "code": "ICH E1",
      "authority": "ICH",
      "title": "The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the 1500 total / 300-600 six-month / 100 twelve-month exposure minimums that psychiatric chronic-use programs must meet and document in Module 2.7.4 exposure tables."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Statistical Principles for Clinical Trials - Addendum on Estimands and Sensitivity Analysis",
      "why": "Required framework for defining the estimand and handling intercurrent events (rescue medication, discontinuation for lack of efficacy, hospitalization) that are pervasive in psychiatric trials with high dropout."
    },
    {
      "code": "ICH E14 and E14/S7B Q&As",
      "authority": "ICH",
      "title": "Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs",
      "why": "Governs the thorough QT study or concentration-QTc alternative required for CNS agents, many of which have hERG liability; supports the cardiac safety section of Module 2.7.4."
    },
    {
      "code": "EMA/CHMP/185423/2010 Rev. 2",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products in the Treatment of Depression",
      "why": "EMA's controlling document for antidepressant development, including short-term efficacy design, relapse-prevention randomized-withdrawal requirements, active-comparator/assay-sensitivity expectations, and special populations; used to align the EU dossier with CHMP expectations."
    },
    {
      "code": "EMA/CHMP/40072/2010 Rev. 1",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products, Including Depot Preparations, in the Treatment of Schizophrenia",
      "why": "Defines acceptable PANSS/BPRS-based endpoints, acute versus maintenance trial design, relapse definitions, depot-formulation requirements, and safety monitoring for EPS and metabolic effects in EU schizophrenia submissions."
    },
    {
      "code": "EMA/CHMP/EWP/305595/2010 (Guideline on clinical investigation of medicinal products for the treatment of bipolar disorder)",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for the Treatment of Bipolar Disorder",
      "why": "Sets EU expectations for separate demonstration of acute mania, acute bipolar depression, and maintenance/prophylaxis claims, including YMRS/MADRS endpoints and switch-to-mania monitoring."
    },
    {
      "code": "FDA Guidance: Demonstrating Substantial Evidence of Effectiveness for Human Drug and Biological Products (draft, Dec 2019)",
      "authority": "FDA",
      "title": "Demonstrating Substantial Evidence of Effectiveness for Human Drug and Biological Products",
      "why": "Frames when one adequate and well-controlled trial plus confirmatory evidence can suffice, a recurring question in psychiatry where replicate positive trials are difficult; supports the evidentiary argument in Module 2.5."
    },
    {
      "code": "FDA Guidance: Multiple Endpoints in Clinical Trials (final, Oct 2022)",
      "authority": "FDA",
      "title": "Multiple Endpoints in Clinical Trials",
      "why": "Governs the hierarchical/graphical multiplicity strategy needed when psychiatric programs test multiple doses plus key secondary endpoints (e.g. CGI-S, functional outcomes) intended for labeling."
    },
    {
      "code": "ICH E5(R1) and ICH E17",
      "authority": "ICH",
      "title": "Ethnic Factors in the Acceptability of Foreign Clinical Data / General Principles for Planning and Design of Multiregional Clinical Trials",
      "why": "Supports the applicability argument when a large share of psychiatric pivotal data comes from ex-US/ex-EU regions with different placebo response and standard of care; underpins regional consistency analyses in Module 5.3.5.3."
    },
    {
      "code": "FDA Guidance: Patient-Focused Drug Development series (Guidances 1-4, 2020-2023)",
      "authority": "FDA",
      "title": "Patient-Focused Drug Development: Collecting, Selecting, Developing, and Incorporating Clinical Outcome Assessments",
      "why": "Provides the COA validation and content-validity evidence FDA expects for any psychiatric scale used as a primary or key secondary endpoint, and for interpreting within-patient meaningful change."
    },
    {
      "code": "FDA Guidance: Attention Deficit Hyperactivity Disorder: Developing Stimulant Drugs for Treatment (draft, 2019)",
      "authority": "FDA",
      "title": "Attention Deficit Hyperactivity Disorder: Developing Stimulant Drugs for Treatment",
      "why": "Specifies ADHD-RS-5 endpoints, classroom/laboratory school design, onset and duration of effect requirements, and abuse-deterrence considerations for stimulant programs."
    }
  ],
  "reviewerExpectations": [
    "Division of Psychiatry reviewers expect two independent, adequately powered, placebo-controlled trials that each achieve statistical significance on the pre-specified primary endpoint; a program with one positive and one failed trial must present a compelling, pre-specified rationale rather than a post hoc explanation of the failure.",
    "Reviewers scrutinize whether the treatment difference is clinically meaningful, not merely significant, and expect a responder analysis, CGI-I concordance, and a cumulative distribution function of change from baseline to demonstrate that the benefit is not driven by a narrow tail of the distribution.",
    "Reviewers examine site-level and rater-level data for anomalous effect sizes, implausibly low variability, screening-to-baseline score deflation, and duplicate subject enrollment, and will exclude implicated sites in sensitivity analyses; sponsors should pre-empt this with their own site-level analyses.",
    "Prospective C-SSRS data are expected from every trial, with a stand-alone integrated suicidality analysis including an age <25 subgroup; the absence of prospective collection is treated as an uncorrectable deficiency, not a presentation issue.",
    "For any CNS-penetrant molecule, the Controlled Substance Staff review runs in parallel and expects a complete abuse-potential package well before the NDA; sponsors should have an agreed abuse-potential assessment plan from End-of-Phase-2 onward.",
    "Reviewers expect ICH E1-compliant long-term exposure, presented as duration-stratified tables at the intended commercial dose, plus adverse events of special interest tracked over the full exposure period rather than only the double-blind phase.",
    "Reviewers require a pre-specified estimand with explicit intercurrent-event strategies and will run their own tipping-point analyses; missing-data handling that assumes MAR without MNAR stress-testing routinely draws an information request.",
    "For antipsychotics, reviewers expect dedicated metabolic (weight, glucose, lipids), EPS (SAS/BARS/AIMS), prolactin, and cardiac subsections with categorical shift analyses, plus tardive dyskinesia surveillance in the long-term database.",
    "EMA rapporteurs additionally expect a maintenance-of-effect or randomized-withdrawal study for chronic psychiatric indications and often question the absence of an active comparator arm for assay sensitivity."
  ],
  "pathwayHints": [
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Available where preliminary clinical evidence shows substantial improvement over available therapy on a clinically significant endpoint in a serious psychiatric condition - realistically treatment-resistant depression, MDD with acute suicidal ideation, postpartum depression, and treatment-refractory schizophrenia rather than uncomplicated first-line indications.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Requires a controlled comparison against available therapy or a compelling placebo-controlled effect on a serious manifestation; FDA will expect early alignment on the pivotal endpoint and on whether a randomized-withdrawal maintenance study is still needed. Intensive guidance and rolling review do not relax the two-trial expectation unless substantial evidence is separately argued."
    },
    {
      "pathway": "fast_track",
      "applicability": "Applies to psychiatric conditions that are serious and where the drug addresses an unmet need - e.g. treatment-resistant depression, PTSD with inadequate response to SSRIs, agitation in Alzheimer's dementia, negative symptoms of schizophrenia for which no approved therapy exists.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "Chiefly procedural: enables rolling NDA submission and more frequent meetings. Reviewers still expect the complete ICH E1 safety database and full suicidality and abuse-potential packages at the time of the final rolling component."
    },
    {
      "pathway": "priority_review",
      "applicability": "Granted where the product would provide a significant improvement in safety or effectiveness for a serious condition; in psychiatry this most often follows from a novel mechanism addressing treatment resistance, rapid onset of antidepressant effect, or elimination of a class safety liability (e.g. no metabolic burden, no EPS).",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4",
        "2.7.3"
      ],
      "reviewerNotes": "The improvement claim must be supported by direct or well-reasoned indirect comparison in Module 2.5 and 2.7.3; unsupported superiority framing invites rejection of the priority request and can spill over into labeling negotiations."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Relevant to rare psychiatric and neuropsychiatric conditions with US prevalence under 200,000 - e.g. Rett syndrome behavioral manifestations, Prader-Willi hyperphagia-associated behavior, 22q11.2-associated psychosis, narcolepsy-related psychiatric comorbidity; not applicable to MDD, schizophrenia, or GAD.",
      "impactedSections": [
        "1.7",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Designation does not lower the evidentiary bar but permits smaller databases with a documented ICH E1 shortfall justification and greater reliance on natural-history-informed endpoints; sponsors should still pre-specify a single primary endpoint and rigorous multiplicity control."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME is realistic for psychiatric products addressing a seriously debilitating condition with no satisfactory treatment and compelling early clinical (or in exceptional cases robust nonclinical plus tolerability) data - e.g. novel mechanisms for treatment-resistant depression or negative symptoms of schizophrenia.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "CHMP expects a designated rapporteur-guided development plan; PRIME status increases scrutiny of the maintenance-of-effect package and of the plan for post-authorisation effectiveness data rather than reducing it."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "Available in the EU for seriously debilitating psychiatric conditions with unmet need where comprehensive data are not yet available but the benefit of immediate availability outweighs the residual uncertainty - narrow in psychiatry, most plausible for treatment-refractory populations.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.4",
        "1.8.2"
      ],
      "reviewerNotes": "CHMP will impose specific obligations - typically a confirmatory maintenance study and long-term safety registry - and expects the RMP in Module 1.8.2 to carry suicidality, abuse/misuse, and long-term neurologic risks as important identified or potential risks with concrete additional pharmacovigilance."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand per ICH E9(R1) before locking the SAP: population (e.g. adults with moderate-to-severe MDD meeting a MADRS entry threshold), variable (change from baseline in MADRS total at week 6), treatment condition, intercurrent-event strategies (typically treatment-policy for rescue medication, hypothetical or composite for discontinuation due to lack of efficacy, and a stated strategy for death including suicide), and population-level summary. Report the estimand verbatim in Module 2.5 and 2.7.3.",
    "The primary analysis is normally a mixed model for repeated measures (MMRM) with unstructured covariance, fixed effects for treatment, visit, treatment-by-visit, baseline score and baseline-by-visit, and pooled site or region; it must be accompanied by pre-specified MNAR sensitivity analyses - control-based pattern mixture (jump-to-reference, copy-reference), multiple imputation with a delta-adjustment, and a tipping-point analysis identifying the delta at which significance is lost. LOCF is no longer acceptable as a primary approach.",
    "Control family-wise type I error at two-sided 0.05 across doses, co-primary and key secondary endpoints using a pre-specified hierarchical (fixed-sequence) or graphical (Bretz/Maurer) procedure; only endpoints that pass within the controlled family may be labeled. Where two doses are studied, state whether the dose comparison is part of the testing family or purely descriptive.",
    "When using the Sequential Parallel Comparison Design or other placebo-response-mitigating designs, pre-specify the weighting of stage 1 and stage 2 statistics, the placebo-non-responder definition, and provide a stage-1-only sensitivity analysis; regulators view SPCD results as supportive unless the weighting and re-randomization procedures were fully pre-specified and the trial was adequately powered under conservative assumptions.",
    "Group-sequential and adaptive designs require a pre-specified alpha-spending function (typically O'Brien-Fleming), a documented firewalled independent DMC charter, and, for sample-size re-estimation, a method preserving type I error (e.g. promising-zone or CHW weighted statistics); unblinded interim access by sponsor personnel must be documented and its impact on trial integrity addressed.",
    "For maintenance/relapse-prevention claims, use a randomized-withdrawal design with time-to-relapse as the primary endpoint analyzed by a stratified log-rank test with a Cox model hazard ratio and 95% CI; pre-specify the relapse definition (e.g. MADRS >= threshold, CGI-S increase, hospitalization, or intervention) and provide sensitivity analyses for informative censoring.",
    "Subgroup analyses (sex, age including <25 years, race/ethnicity, region, baseline severity, prior treatment failures) should be pre-specified with forest plots and interaction tests presented as descriptive and hypothesis-generating; regional consistency should be evaluated per ICH E17 using pre-specified consistency criteria rather than post hoc region selection.",
    "Interpret effect magnitude with anchor-based methods: pre-specify responder thresholds (e.g. >=50% reduction from baseline, MADRS <=10 remission, CGI-I of 1 or 2), present responder rate differences with 95% CIs and NNT, and include a cumulative distribution function of change from baseline so reviewers can assess the full response distribution."
  ],
  "endpointConsiderations": [
    "MDD: change from baseline in HAM-D-17 total or MADRS total at 6-8 weeks is the accepted primary endpoint; CGI-S/CGI-I and remission/response rates serve as key secondaries. Caveat: HAM-D-17 contains somatic items that can be moved by sedation or appetite effects independent of mood, so MADRS is often preferred for cleaner construct validity; both require documented rater training and are highly susceptible to placebo response.",
    "Treatment-resistant depression: MADRS change at day 28 with an ongoing oral antidepressant background is accepted; the TRD definition (typically inadequate response to >=2 adequate antidepressant trials in the current episode, documented prospectively or via a validated retrospective instrument such as the MGH-ATRQ) must be pre-specified and verifiable, and a randomized-withdrawal maintenance study is expected to support durability.",
    "Schizophrenia acute exacerbation: change from baseline in PANSS total at 4-6 weeks is the standard primary endpoint, with CGI-S as key secondary. Caveats: PANSS total conflates positive, negative, and general psychopathology domains; a negative-symptom claim requires a dedicated stable-patient study with a purpose-built instrument (PANSS-FSNS, BNSS, or NSA-16) and must address pseudospecificity from improvement in positive symptoms, depression, or EPS.",
    "Schizophrenia maintenance: time to relapse or impending relapse in a randomized-withdrawal design, with relapse pre-defined by symptom-score thresholds, hospitalization, or increased care intensity; the enrichment (stabilization) period must be described because it constrains the labeled population.",
    "Bipolar disorder: acute mania uses YMRS change at 3 weeks; acute bipolar depression uses MADRS change at 6-8 weeks; maintenance uses time to any mood episode requiring intervention. Each claim requires its own adequate trials - a mania claim does not extrapolate to bipolar depression or to maintenance. Treatment-emergent affective switch must be monitored and reported as a safety endpoint.",
    "GAD and other anxiety disorders: HAM-A total change is standard for GAD; LSAS for social anxiety; PSS/Y-BOCS for OCD (Y-BOCS change at 10-12 weeks). Caveat: HAM-A somatic factor overlaps with drug sedative effects, so factor-level analyses and CGI concordance strengthen interpretability.",
    "PTSD: CAPS-5 total severity change is the accepted primary endpoint, with PCL-5 as patient-reported secondary; trials must account for high placebo response, concurrent psychotherapy as an intercurrent event, and index-trauma heterogeneity. Where a drug is developed as an adjunct to psychotherapy, the psychotherapy protocol must be manualized and fidelity-monitored.",
    "ADHD: ADHD-RS-5 (or Conners) total change is primary; onset and duration of effect for stimulant and long-acting formulations require a laboratory classroom or analog classroom design with SKAMP ratings at multiple post-dose timepoints. Caveats: parent versus clinician versus teacher rater source must be pre-specified, and abuse-deterrence claims require separate formulation-specific studies.",
    "Agitation in Alzheimer's dementia: CMAI total change with mADCS-CGIC as co-primary or key secondary; regulators require careful exclusion of pseudospecificity (i.e. that the effect is not simply sedation) and demand dedicated falls, somnolence, cerebrovascular event, and mortality analyses given the class boxed warning for antipsychotics in elderly dementia patients.",
    "Functional and quality-of-life endpoints (SDS, Q-LES-Q-SF, WHODAS, PSP, SF-36) can support labeling only if pre-specified within the multiplicity-controlled testing family and supported by COA validation evidence per the PFDD guidance series; otherwise they are descriptive and cannot appear as efficacy claims."
  ],
  "retrievalKeywords": [
    "madrs",
    "ham-d",
    "panss",
    "ymrs",
    "caps-5",
    "y-bocs",
    "adhd-rs-5",
    "cgi-s",
    "cgi-i",
    "c-ssrs",
    "suicidal ideation and behavior",
    "placebo response",
    "sequential parallel comparison design",
    "treatment-resistant depression",
    "randomized withdrawal",
    "relapse prevention",
    "extrapyramidal symptoms",
    "akathisia",
    "tardive dyskinesia",
    "aims",
    "simpson-angus",
    "metabolic syndrome",
    "prolactin",
    "abuse potential",
    "drug liking",
    "human abuse potential study",
    "controlled substance scheduling",
    "8-factor analysis",
    "mmrm",
    "tipping point analysis",
    "estimand",
    "intercurrent event",
    "ich e9(r1)",
    "ich e1 exposure",
    "thorough qt",
    "qtc",
    "cyp2d6 poor metabolizer",
    "rater training",
    "inter-rater reliability",
    "centralized rating",
    "dsm-5-tr",
    "negative symptoms",
    "pseudospecificity",
    "discontinuation-emergent symptoms",
    "antidepressant boxed warning",
    "psychiatry division"
  ]
};

export default psychiatryProfile;
