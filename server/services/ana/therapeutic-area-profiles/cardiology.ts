/**
 * Cardiology / Cardiovascular Medicine therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/cardiology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const cardiologyProfile: TherapeuticAreaProfile = {
  "id": "cardiology",
  "displayName": "Cardiology / Cardiovascular Medicine",
  "description": "Regulatory profile for cardiovascular drug development (heart failure, hypertension, dyslipidemia-driven ASCVD risk reduction, antithrombotics, arrhythmia, pulmonary hypertension). Reviewed in the US by CDER Division of Cardiology and Nephrology (OCHEN) and in the EU under CHMP cardiovascular guidelines. Programs are dominated by large event-driven outcome trials, hard morbidity/mortality endpoints, mandatory proarrhythmia characterization, and bleeding/pressor safety assessment.",
  "contextRules": [
    {
      "id": "cv-2.5-benefit-risk-outcomes",
      "scope": "section",
      "instruction": "Frame the Clinical Overview benefit-risk around the primary cardiovascular outcome (CV death, HF hospitalization, MI, stroke) rather than surrogate hemodynamic or biomarker change. State the composite endpoint definition verbatim, identify which components drive the treatment effect, present the mortality component separately, and reconcile any discordance between components. Explicitly address whether the effect size is clinically meaningful against contemporary standard of care (RAASi, beta-blocker, SGLT2i, MRA background therapy).",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "MACE",
        "composite endpoint",
        "cardiovascular death",
        "heart failure hospitalization",
        "benefit-risk"
      ],
      "guidanceRef": "FDA Heart Failure Endpoints Draft Guidance (2019)"
    },
    {
      "id": "cv-2.7.4-qt-proarrhythmia",
      "scope": "section",
      "instruction": "Include a dedicated cardiac electrophysiology subsection in the Summary of Clinical Safety: concentration-QTc analysis with the estimated effect at the clinical and supratherapeutic Cmax and its two-sided 90% CI upper bound versus the 10 ms threshold, categorical QTc outlier tabulations (>450/480/500 ms; change >30/60 ms), heart-rate and PR/QRS effects, and adjudicated arrhythmic adverse events. If relying on the ICH E14/S7B Q&A double-negative nonclinical pathway in lieu of a dedicated TQT study, state the qualifying hERG and in vivo QT data and the assay validation basis in Module 2.6 and cross-reference it here.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "QT",
        "QTc",
        "TQT",
        "hERG",
        "proarrhythmia",
        "concentration-QTc"
      ],
      "guidanceRef": "ICH E14 / E14-S7B Q&A"
    },
    {
      "id": "cv-2.7.4-bp-pressor",
      "scope": "section",
      "instruction": "Present blood pressure and heart rate safety using both mean change from baseline and the distribution of maximum on-treatment values, and prefer 24-hour ambulatory BP monitoring data where available. Any mean systolic increase should be quantified with a CI and contextualized against the expected excess CV event risk. Do not summarize BP only as adverse-event counts of 'hypertension'.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "blood pressure",
        "pressor",
        "ABPM",
        "ambulatory blood pressure",
        "heart rate"
      ],
      "guidanceRef": "FDA Assessment of Pressor Effects of Drugs (2022)"
    },
    {
      "id": "cv-5.3.5.1-adjudication",
      "scope": "section",
      "instruction": "For every pivotal outcome study include the Clinical Events Committee charter, pre-specified event definitions aligned to standardized CV endpoint definitions, evidence of blinded independent adjudication, and the concordance between investigator-reported and adjudicated events. Provide the adjudication rate for potential events not reported by investigators (triggered/searched events) to demonstrate ascertainment completeness.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "adjudication",
        "clinical events committee",
        "CEC",
        "endpoint definitions"
      ],
      "guidanceRef": "ICH E6(R3)"
    },
    {
      "id": "cv-module5-vital-status",
      "scope": "module",
      "instruction": "Document complete vital-status ascertainment for all randomized subjects in every mortality-inclusive trial, including subjects who withdrew consent from treatment but permitted survival follow-up, with a per-country accounting of vital status unknown at end of study. Quantify the median follow-up and the percentage of potential follow-up time actually observed.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "vital status",
        "lost to follow-up",
        "withdrawal of consent",
        "survival follow-up"
      ],
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "id": "cv-2.7.3-subgroup-consistency",
      "scope": "section",
      "instruction": "Present forest plots of the primary endpoint across pre-specified subgroups including sex, age >=75, race/ethnicity, region, baseline eGFR strata, ejection fraction strata, diabetes status, and background therapy. Report interaction p-values as exploratory and provide a reasoned discussion of any region-by-treatment interaction, including enrollment and standard-of-care differences, per ICH E17.",
      "severity": "major",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "subgroup",
        "forest plot",
        "regional consistency",
        "interaction"
      ],
      "guidanceRef": "ICH E17"
    },
    {
      "id": "cv-always-background-therapy",
      "scope": "always",
      "instruction": "Whenever describing efficacy, state the background guideline-directed medical therapy at baseline and its change over the trial. Claims of incremental benefit must be supported by demonstrating that the control arm received contemporary standard of care; undertreated control arms are a recurring cause of failure to establish clinical relevance in EU and US review.",
      "severity": "major",
      "triggerKeywords": [
        "standard of care",
        "background therapy",
        "guideline-directed medical therapy",
        "add-on"
      ]
    }
  ],
  "riskFactors": [
    "QT/QTc prolongation and torsadogenic risk requiring ICH E14-compliant characterization; failure here can force a REMS, contraindication, or non-approval.",
    "Excess bleeding with antithrombotic and antiplatelet agents, including intracranial and fatal bleeding, requiring standardized (e.g., BARC/TIMI/ISTH) classification and net clinical benefit analysis.",
    "Blood pressure and heart rate increases (pressor effect) in a population where small mean BP rises translate into measurable excess CV events.",
    "Renal function deterioration and hyperkalemia with RAAS-active and diuretic-active agents, which are also the leading causes of premature discontinuation in HF trials.",
    "Hepatotoxicity signals (Hy's Law cases) in chronically dosed lipid- and metabolism-active cardiovascular agents.",
    "Event-driven trial operational risk: lower-than-projected event accrual, high crossover to open-label active therapy, and informative censoring from treatment discontinuation.",
    "Valvular, fibrotic, or pulmonary safety signals for agents with serotonergic or growth-factor activity, requiring dedicated echocardiographic surveillance."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no thorough qt",
        "qt study not conducted",
        "concentration-qtc not provided",
        "supratherapeutic exposure not achieved",
        "qtc analysis incomplete"
      ],
      "description": "Absent or inadequate cardiac repolarization assessment: no TQT study and no qualifying ICH E14/S7B nonclinical package, failure to achieve supratherapeutic exposures covering intrinsic/extrinsic factors, or concentration-QTc modeling without a stated 90% CI upper bound at the relevant exposure.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E14 / E14-S7B Q&A"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "events not adjudicated",
        "investigator reported events only",
        "cec charter not provided",
        "endpoint definitions not prespecified"
      ],
      "description": "Cardiovascular endpoints counted without blinded independent adjudication, or adjudication charter and event definitions finalized after unblinding, undermining the primary analysis.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "composite driven by",
        "no mortality benefit",
        "component discordance",
        "soft component drives effect",
        "hospitalization only"
      ],
      "description": "Composite primary endpoint effect driven entirely by the least severe component (e.g., hospitalization or revascularization) with neutral or adverse mortality, without adequate discussion of clinical meaningfulness.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "missing vital status",
        "high loss to follow-up",
        "withdrawal of consent not characterized",
        "incomplete follow-up"
      ],
      "description": "Incomplete vital-status or event follow-up in an outcome trial, with missingness large relative to the observed treatment effect and no tipping-point or delta-adjusted sensitivity analysis.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "bleeding not classified",
        "no net clinical benefit",
        "bleeding definitions inconsistent",
        "intracranial hemorrhage not tabulated"
      ],
      "description": "Bleeding safety presented as unstandardized adverse-event terms rather than a pre-specified hierarchical bleeding scale, with no net clinical benefit analysis balancing ischemic prevention against bleeding harm.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "no exposure response",
        "dose selection not justified",
        "single dose studied",
        "no dose ranging"
      ],
      "description": "Phase 3 dose selected without adequate exposure-response characterization or dose-ranging, leaving the lowest effective dose unestablished — a frequent basis for post-marketing requirements or a complete response.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E4"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "renal function decline",
        "hyperkalemia not characterized",
        "creatinine increase unexplained",
        "electrolyte monitoring absent"
      ],
      "description": "Renal and electrolyte safety in RAAS-active or diuretic programs summarized without shift tables, discontinuation attribution, or characterization of the acute eGFR dip versus chronic trajectory.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "1.14",
      "patterns": [
        "labeling overstates",
        "claim not supported by primary endpoint",
        "subgroup claim",
        "mortality claim unsupported"
      ],
      "description": "Proposed indication or labeling language claiming mortality or component-specific benefit that the pre-specified, multiplicity-controlled hierarchy does not support.",
      "severity": "major",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "ICH E14 (R3) and ICH E14/S7B Q&A",
      "authority": "ICH",
      "title": "Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs; Clinical and Nonclinical Evaluation of QT/QTc Q&As",
      "why": "Defines whether a thorough QT study is required, how concentration-QTc modeling can substitute, and the double-negative nonclinical criteria; drives the Module 2.7.4 cardiac safety section and labeling Section 12.2."
    },
    {
      "code": "ICH S7B",
      "authority": "ICH",
      "title": "Nonclinical Evaluation of the Potential for Delayed Ventricular Repolarization (QT Interval Prolongation) by Human Pharmaceuticals",
      "why": "Supplies the hERG and in vivo QT dataset in Module 2.6.3/4.2.1.3 that supports or replaces clinical proarrhythmia claims under the E14/S7B Q&A framework."
    },
    {
      "code": "FDA Draft Guidance, Treatment for Heart Failure: Endpoints for Drug Development (June 2019)",
      "authority": "FDA",
      "title": "Treatment for Heart Failure: Endpoints for Drug Development",
      "why": "Establishes FDA's expectations for mortality/morbidity endpoints, symptom and function endpoints (KCCQ, 6MWT), and when symptomatic benefit alone can support approval; used to justify the primary estimand in Module 2.5 and 5.3.5.1 protocols."
    },
    {
      "code": "FDA Guidance, Assessment of Pressor Effects of Drugs (September 2022, final)",
      "authority": "FDA",
      "title": "Assessment of Pressor Effects of Drugs — Nonclinical and Clinical Evaluation",
      "why": "Prescribes how to detect and quantify drug-induced blood pressure increases, including ABPM design; frames the BP safety narrative in Module 2.7.4 and Warnings/Precautions."
    },
    {
      "code": "FDA Guidance, Hypertension: Developing Fixed-Combination Drug Products for Treatment (2018)",
      "authority": "FDA",
      "title": "Hypertension: Developing Fixed-Combination Drug Products for Treatment",
      "why": "Sets the factorial design and contribution-of-elements expectations for antihypertensive combinations, governing Module 2.7.3 efficacy substantiation for each component."
    },
    {
      "code": "EMA CPMP/EWP/235/95 Rev. 2",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for the Treatment of Chronic Heart Failure",
      "why": "EU counterpart defining acceptable HF populations, endpoints, trial duration, and the requirement to demonstrate benefit on top of established therapy; anchors EU-specific arguments in Module 2.5 and 1.8.1."
    },
    {
      "code": "EMA/238/1995 Rev. 4",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products in the Treatment of Hypertension",
      "why": "Defines EU expectations for BP endpoints (trough sitting DBP/SBP, ABPM), duration, and outcome data requirements for antihypertensives."
    },
    {
      "code": "FDA Guidance, Multiple Endpoints in Clinical Trials (October 2022, final)",
      "authority": "FDA",
      "title": "Multiple Endpoints in Clinical Trials",
      "why": "Governs the hierarchical testing strategy for composite primary plus mortality and symptom secondary endpoints that is standard in CV programs; drives the SAP and Module 2.7.3 multiplicity narrative."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Statistical Principles for Clinical Trials — Addendum on Estimands and Sensitivity Analysis",
      "why": "Required to define the treatment-policy versus hypothetical estimand for intercurrent events such as heart transplant, LVAD implantation, and open-label rescue in CV outcome trials."
    },
    {
      "code": "ICH E17",
      "authority": "ICH",
      "title": "General Principles for Planning and Design of Multi-Regional Clinical Trials",
      "why": "Supports pre-specified regional allocation and consistency evaluation for the globally enrolled outcome trials that underpin most CV submissions."
    }
  ],
  "reviewerExpectations": [
    "The reviewer will recompute the primary composite from adjudicated event listings and check that the number of first events, not total events, matches the reported hazard ratio unless a recurrent-event estimand was pre-specified.",
    "The reviewer expects a complete cardiac electrophysiology story: exposure margins covering hepatic/renal impairment and DDI-inflated Cmax, categorical outliers, and arrhythmic events, not just a mean ddQTc number.",
    "The reviewer will assess whether background guideline-directed medical therapy in the control arm reflects current practice, and will discount efficacy demonstrated against undertreated comparators.",
    "The reviewer scrutinizes the amount and pattern of missing data relative to the treatment effect, and expects tipping-point analyses when vital status or endpoint ascertainment is incomplete.",
    "The reviewer expects mortality (all-cause and CV) to be presented separately regardless of whether it was in the primary composite, with Kaplan-Meier curves and follow-up accounting.",
    "The reviewer checks the consistency of effect across the pre-specified alpha-controlled hierarchy and rejects labeling claims for endpoints tested after a failed step in the hierarchy.",
    "For chronic use, the reviewer expects an ICH E1-compliant exposure database (at least 1,500 exposed, 300-600 for 6 months, 100 for 12 months) with a rationale where CV outcome trial exposure substitutes."
  ],
  "pathwayHints": [
    {
      "pathway": "fast_track",
      "applicability": "Serious cardiovascular conditions with unmet need such as advanced/refractory heart failure, cardiogenic shock, transthyretin cardiomyopathy, and severe pulmonary arterial hypertension where existing therapy is inadequate.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Fast Track enables rolling review and more frequent meetings but does not change the evidentiary standard; the sponsor must still deliver an adequately powered outcome or validated surrogate trial. Document the unmet-need argument in the Clinical Overview and align it with the proposed indication statement."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Rare cardiomyopathies (e.g., obstructive hypertrophic cardiomyopathy, amyloid cardiomyopathy) or genetically defined CV disease where early data show substantial improvement over available therapy on a clinically significant endpoint.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect intensive CMC and manufacturing readiness scrutiny early because timelines compress; the Clinical Overview must clearly identify the preliminary clinical evidence that supported designation and how the pivotal package matured it."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Pulmonary arterial hypertension, ATTR cardiomyopathy, familial chylomicronemia and homozygous familial hypercholesterolemia, and pediatric cardiomyopathies meeting prevalence thresholds.",
      "impactedSections": [
        "1.3",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Orphan designation does not relax substantial-evidence requirements; where a single adequate and well-controlled trial plus confirmatory evidence is proposed, state that argument explicitly and support it with the FDA confirmatory-evidence framework."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Narrowly applicable in cardiology — used where a reasonably likely surrogate exists (e.g., LDL-C lowering in homozygous familial hypercholesterolemia, hemodynamic measures in select PAH settings) in a serious condition with unmet need.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "The confirmatory outcome trial must be underway or enrolling at the time of approval under FDORA; describe its design, milestones, and enrollment status in Module 2.5 and be prepared for expedited-withdrawal provisions in labeling discussions."
    }
  ],
  "statisticalConsiderations": [
    "Define the primary estimand explicitly per ICH E9(R1): population, endpoint, and the strategy for intercurrent events such as heart transplantation, LVAD, open-label rescue therapy, and treatment discontinuation. Treatment-policy is the default for outcome trials; hypothetical strategies require justification.",
    "Time-to-first-event Cox models require assessment of the proportional hazards assumption; where curves cross or diverge late, pre-specify supportive analyses (restricted mean survival time, win ratio, or piecewise hazards) rather than introducing them post hoc.",
    "Recurrent-event methods (Andersen-Gill, LWYY, joint frailty models accounting for terminal death) are increasingly accepted for HF hospitalization but must be pre-specified with a stated handling of the competing risk of death.",
    "Multiplicity must be controlled across the composite primary, key secondary endpoints, dose groups, and any interim looks using a pre-specified hierarchical or graphical (Bonferroni-Holm / Maurer-Bretz) procedure documented in the SAP before unblinding.",
    "Event-driven trials require a pre-specified alpha-spending function (typically O'Brien-Fleming) for group-sequential interims and explicit non-binding futility rules; unblinded sample-size re-estimation must preserve type I error and be firewalled through an independent statistical group.",
    "Non-inferiority designs (common for antithrombotics and antiarrhythmics) require a justified margin derived from a constancy-assessed meta-analysis of historical placebo-controlled data, with both the per-protocol and ITT analyses supporting the conclusion.",
    "Missing data sensitivity analyses should include tipping-point and delta-adjusted multiple imputation; a complete-case primary analysis in an outcome trial is not acceptable."
  ],
  "endpointConsiderations": [
    "3-point and 4-point MACE composites (CV death, non-fatal MI, non-fatal stroke, +/- hospitalization for unstable angina) are the established outcome endpoints for ASCVD risk reduction; component definitions must follow standardized CV endpoint definitions and be adjudicated.",
    "Heart failure: composite of CV death plus HF hospitalization (or urgent HF visit requiring IV therapy) is the accepted primary; total (recurrent) HF events are accepted with pre-specification. Symptomatic benefit alone can support approval when measured by a validated PRO.",
    "KCCQ (Kansas City Cardiomyopathy Questionnaire) total symptom or clinical summary score is the accepted HF PRO for symptom claims; responder-threshold analyses (e.g., >=5 point improvement) require a pre-specified anchor-based justification and PRO measure qualification evidence in Module 5.3.5.3.",
    "Exercise capacity endpoints — peak VO2 by cardiopulmonary exercise testing and 6-minute walk distance — are accepted in HFrEF, HCM, and PAH; 6MWD is exposure- and site-variability sensitive and generally requires supportive functional or outcome data.",
    "Blood pressure: mean change from baseline in trough sitting SBP/DBP at 6-12 weeks is the accepted efficacy endpoint for antihypertensives, with 24-hour ABPM supporting duration of effect and absence of excessive nocturnal dipping.",
    "LDL-C percent change from baseline is an accepted surrogate for approval in lipid-lowering programs, but outcome data are expected for ASCVD risk-reduction claims in labeling.",
    "NT-proBNP/BNP change is prognostic and supportive but is not accepted as a stand-alone primary efficacy endpoint for approval; it is best used for enrichment and mechanistic support in Module 2.7.3.",
    "Atrial fibrillation: time to first recurrence of symptomatic AF documented by ECG or continuous monitoring, with pre-specified monitoring intensity identical between arms to avoid ascertainment bias.",
    "PAH: change in pulmonary vascular resistance is supportive, but time to clinical worsening (death, hospitalization for PAH, need for parenteral therapy, disease progression) is the endpoint FDA and EMA expect for a durable benefit claim."
  ],
  "retrievalKeywords": [
    "mace",
    "cardiovascular outcomes trial",
    "heart failure hospitalization",
    "hfref",
    "hfpef",
    "left ventricular ejection fraction",
    "nt-probnp",
    "kccq",
    "six-minute walk distance",
    "qtc prolongation",
    "thorough qt study",
    "herg",
    "torsades de pointes",
    "clinical events committee adjudication",
    "ambulatory blood pressure monitoring",
    "ldl-c lowering",
    "antiplatelet bleeding barc",
    "timi major bleeding",
    "net clinical benefit",
    "win ratio",
    "restricted mean survival time",
    "guideline-directed medical therapy",
    "pulmonary arterial hypertension",
    "time to clinical worsening",
    "atrial fibrillation recurrence",
    "hyperkalemia raas inhibitor"
  ]
};

export default cardiologyProfile;
