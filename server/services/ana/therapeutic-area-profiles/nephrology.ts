/**
 * Nephrology / Renal Medicine therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/nephrology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const nephrologyProfile: TherapeuticAreaProfile = {
  "id": "nephrology",
  "displayName": "Nephrology / Renal Medicine",
  "description": "Regulatory profile for kidney disease drug development: chronic kidney disease progression, diabetic kidney disease, IgA nephropathy and other glomerular diseases, lupus nephritis, ADPKD, acute kidney injury, anemia and mineral-bone disorder of CKD, hyperkalemia, and transplant immunosuppression. Reviewed by CDER's Division of Cardiology and Nephrology and by CHMP under the renal insufficiency progression guideline. The defining features are surrogate endpoints (eGFR slope, proteinuria) accepted through formal regulatory-scientific consensus, mandatory renal-impairment PK characterization, and the confounding of efficacy signals by acute hemodynamic eGFR effects.",
  "contextRules": [
    {
      "id": "neph-2.7.3-egfr-slope-acute-dip",
      "scope": "section",
      "instruction": "When eGFR slope is the efficacy basis, present both total slope and chronic slope (computed from a pre-specified post-acute-effect landmark, typically week 12 or 14), and separately quantify the acute hemodynamic effect between baseline and the landmark. State the pre-specified primary slope definition, the mixed-model structure, and confirm the chronic-slope benefit is not an artifact of the acute dip. Include the off-treatment eGFR assessment after washout to demonstrate the effect is not purely hemodynamic.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "eGFR slope",
        "acute dip",
        "chronic slope",
        "total slope",
        "hemodynamic effect",
        "off-treatment eGFR"
      ],
      "guidanceRef": "EMA EMA/CHMP/500825/2016"
    },
    {
      "id": "neph-2.7.3-proteinuria-surrogate",
      "scope": "section",
      "instruction": "Where proteinuria (UPCR/UACR) supports an accelerated approval, present the percent change from baseline in geometric mean UPCR at the pre-specified timepoint (commonly 9 months) with the log-transformed analysis, the proportion achieving proteinuria remission thresholds, and the consistency of the proteinuria effect with the concurrent eGFR trajectory. State explicitly the confirmatory eGFR-slope or clinical-outcome analysis that will convert the approval.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "proteinuria",
        "UPCR",
        "UACR",
        "albuminuria",
        "accelerated approval",
        "geometric mean ratio"
      ]
    },
    {
      "id": "neph-2.7.2-renal-impairment-pk",
      "scope": "section",
      "instruction": "Present a dedicated renal impairment PK study covering the full eGFR spectrum including subjects with kidney failure on and off dialysis, with the timing relative to dialysis sessions and the dialyzability assessment stated. Support the dosing recommendation with population PK across the CKD stages actually enrolled and address protein binding changes, active metabolite accumulation, and uremic-toxin-mediated transporter/CYP alterations.",
      "severity": "critical",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "renal impairment",
        "dialysis",
        "dialyzability",
        "creatinine clearance",
        "population PK",
        "dose adjustment"
      ],
      "guidanceRef": "FDA Renal Impairment PK Guidance (2020 draft)"
    },
    {
      "id": "neph-5.3.5.1-gfr-methodology",
      "scope": "section",
      "instruction": "Document the GFR estimating equation used (specify CKD-EPI 2021 race-free versus prior versions), whether it was applied consistently across all studies, the creatinine assay traceability to IDMS, the central laboratory arrangement, and any measured GFR (iohexol/iothalamate) substudy. Equation changes mid-program must be reconciled with a re-analysis.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "CKD-EPI",
        "MDRD",
        "estimating equation",
        "IDMS traceable creatinine",
        "measured GFR",
        "iohexol",
        "cystatin C"
      ]
    },
    {
      "id": "neph-2.7.4-electrolyte-aki",
      "scope": "section",
      "instruction": "Provide dedicated tabulations for hyperkalemia (by severity threshold and by concomitant RAASi use), acute kidney injury events using a standardized definition (KDIGO stages), volume depletion and hypotension, metabolic acidosis, and study-drug discontinuations attributable to each. Present laboratory shift tables and time-to-first-event, not adverse-event counts alone.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "hyperkalemia",
        "acute kidney injury",
        "KDIGO",
        "metabolic acidosis",
        "volume depletion",
        "shift table"
      ]
    },
    {
      "id": "neph-2.7.4-infection-immunosuppression",
      "scope": "section",
      "instruction": "For immunomodulatory therapies in glomerular disease and transplantation, present serious and opportunistic infection rates per patient-year (including herpes zoster, PJP, CMV, BK virus, tuberculosis and hepatitis B reactivation), immunoglobulin level trajectories, vaccination status and response, and malignancy including PTLD. Describe prophylaxis and screening requirements as they will appear in labeling.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "opportunistic infection",
        "PJP prophylaxis",
        "hepatitis B reactivation",
        "hypogammaglobulinemia",
        "PTLD",
        "BK virus"
      ]
    },
    {
      "id": "neph-module5-concomitant-raasi",
      "scope": "module",
      "instruction": "State the background standard of care in every kidney trial — maximally tolerated RAAS inhibition, SGLT2 inhibitor use, blood pressure control targets, and their stability requirements before randomization — and report changes in background therapy by arm during the trial. A benefit demonstrated on incomplete background therapy will be discounted by both FDA and CHMP.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "maximally tolerated RAAS inhibitor",
        "SGLT2 inhibitor background",
        "standard of care",
        "blood pressure target"
      ]
    },
    {
      "id": "neph-always-population-definition",
      "scope": "always",
      "instruction": "Define the enrolled kidney population precisely and consistently: eGFR range, UACR/UPCR entry thresholds, biopsy-confirmed diagnosis where applicable, time since diagnosis, and dialysis status. Vague populations ('CKD patients') undermine the indication statement; the proposed indication must match the enrolled and evaluated population.",
      "severity": "major",
      "triggerKeywords": [
        "eGFR entry criteria",
        "biopsy confirmed",
        "UACR threshold",
        "indication population",
        "dialysis status"
      ]
    }
  ],
  "riskFactors": [
    "Acute eGFR decline (hemodynamic dip) that can be mistaken for harm or, conversely, can inflate apparent chronic slope benefit if the analysis landmark is not pre-specified.",
    "Hyperkalemia with RAAS-active and mineralocorticoid-receptor-active agents in a population with reduced potassium excretion, frequently dose-limiting and a driver of discontinuation.",
    "Acute kidney injury from volume depletion, hypotension, or direct nephrotoxicity, requiring KDIGO-standardized ascertainment and differentiation from expected hemodynamic effects.",
    "Serious and opportunistic infection with immunosuppressive and B-cell- or complement-directed therapies, including meningococcal infection requiring vaccination and a REMS for complement inhibitors.",
    "Drug accumulation and altered clearance across CKD stages, including in dialysis, producing exaggerated pharmacodynamic effects and off-target toxicity if dosing is not adjusted.",
    "Metabolic acidosis, mineral-bone disorder progression, hyperphosphatemia, and secondary hyperparathyroidism as background comorbidities that confound safety interpretation.",
    "Anemia management risks, including thrombotic events and the historical class concerns with erythropoiesis-stimulating agents at higher hemoglobin targets and with HIF-PH inhibitors.",
    "Slow event accrual in progression trials leading to underpowered clinical-outcome endpoints and reliance on surrogate-based approvals with confirmatory obligations.",
    "Polypharmacy and DDI burden in CKD, including transporter-mediated interactions and effects on the metabolism of concomitant immunosuppressants with narrow therapeutic indices."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "no renal impairment study",
        "dialysis patients not studied",
        "dose adjustment not justified",
        "esrd dosing not supported",
        "dialyzability unknown"
      ],
      "description": "Missing or incomplete dedicated renal impairment pharmacokinetic characterization, particularly absent data in kidney failure and dialysis, leaving the labeled dose adjustment unsupported.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Renal Impairment PK Guidance (2020 draft)"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "acute dip not accounted",
        "chronic slope not prespecified",
        "slope analysis post hoc",
        "total slope only",
        "no off-treatment egfr"
      ],
      "description": "eGFR slope analysis that does not pre-specify the acute-versus-chronic slope decomposition, or that lacks off-treatment/washout eGFR to demonstrate the effect is not purely hemodynamic.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "proteinuria surrogate not justified",
        "no confirmatory endpoint",
        "surrogate to outcome link not established",
        "urine collection method inconsistent"
      ],
      "description": "Proteinuria-based efficacy claim without an established quantitative link to the clinical outcome in the specific disease and population, or with inconsistent urine collection methodology (spot versus 24-hour) across studies.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "background therapy not optimized",
        "raasi not maximally tolerated",
        "unstable background therapy",
        "sglt2 use imbalanced"
      ],
      "description": "Randomization on incompletely optimized or unstable background therapy, or post-randomization imbalance in SGLT2 inhibitor or RAASi initiation, confounding attribution of the treatment effect.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "hyperkalemia not tabulated by severity",
        "aki not standardized",
        "kdigo not applied",
        "electrolyte shift tables absent"
      ],
      "description": "Safety analysis presenting hyperkalemia and AKI only as adverse-event preferred terms without severity-threshold tabulation, KDIGO staging, shift tables, or attribution of discontinuations.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "infection risk not characterized",
        "no vaccination requirement",
        "hepatitis b screening absent",
        "immunoglobulin levels not monitored",
        "opportunistic infections not reported"
      ],
      "description": "Immunosuppressive or complement-directed therapy without adequate opportunistic infection surveillance, screening and vaccination requirements, or immunoglobulin monitoring to support labeling and the RMP.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "egfr equation changed",
        "mdrd and ckd-epi mixed",
        "creatinine assay not standardized",
        "local laboratory used"
      ],
      "description": "Inconsistent GFR estimation across studies (mixing MDRD and CKD-EPI versions, or race-inclusive and race-free equations) or use of non-IDMS-traceable local laboratory creatinine, undermining comparability of the slope analysis.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "indication broader than enrolled population",
        "extrapolation to lower egfr",
        "pediatric extrapolation unjustified",
        "population not biopsy confirmed"
      ],
      "description": "Proposed indication extending beyond the eGFR range, proteinuria stratum, or biopsy-confirmed diagnosis actually studied, without an adequate extrapolation rationale.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.5",
      "patterns": [
        "insufficient long term exposure",
        "confirmatory trial not underway",
        "post-marketing commitment not defined",
        "long-term extension incomplete"
      ],
      "description": "Chronic kidney disease indication with inadequate long-term exposure, or an accelerated approval submitted without the confirmatory trial already underway as required under FDORA.",
      "severity": "critical",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "EMA/CHMP/500825/2016",
      "authority": "EMA",
      "title": "Guideline on the Clinical Investigation of Medicinal Products to Prevent Development/Slow Progression of Chronic Renal Insufficiency",
      "why": "The principal EU guideline defining acceptable progression endpoints (composite of eGFR decline, kidney failure, death), the role of eGFR slope and albuminuria, trial duration, and population definition; drives Module 2.5 and 2.7.3 for EU submissions."
    },
    {
      "code": "EMA/CHMP/83874/2014",
      "authority": "EMA",
      "title": "Guideline on the Evaluation of the Pharmacokinetics of Medicinal Products in Patients with Decreased Renal Function",
      "why": "Defines EU expectations for renal impairment PK study design, staging by eGFR, dialysis assessment, metabolite characterization, and the resulting SmPC Section 4.2 dose recommendations."
    },
    {
      "code": "FDA Draft Guidance (2020), Pharmacokinetics in Patients with Impaired Renal Function — Study Design, Data Analysis, and Impact on Dosing",
      "authority": "FDA",
      "title": "Pharmacokinetics in Patients with Impaired Renal Function — Study Design, Data Analysis, and Impact on Dosing and Labeling",
      "why": "Prescribes reduced versus full study designs, eGFR-based staging, dialysis timing, and how to translate PK differences into labeling; supports Module 2.7.2 and labeling Sections 8.6 and 12.3."
    },
    {
      "code": "FDA Draft Guidance (2010), Lupus Nephritis Caused by Systemic Lupus Erythematosus: Developing Medical Products for Treatment",
      "authority": "FDA",
      "title": "Lupus Nephritis Caused by Systemic Lupus Erythematosus: Developing Medical Products for Treatment",
      "why": "Defines complete and partial renal response criteria, the role of proteinuria and eGFR stability, background immunosuppression requirements, and steroid-tapering expectations for lupus nephritis programs."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Statistical Principles for Clinical Trials — Estimands and Sensitivity Analysis",
      "why": "Required to define handling of intercurrent events unique to nephrology: initiation of dialysis, transplantation, death, and rescue immunosuppression, all of which truncate or censor the eGFR trajectory."
    },
    {
      "code": "ICH E17",
      "authority": "ICH",
      "title": "General Principles for Planning and Design of Multi-Regional Clinical Trials",
      "why": "Supports the regional consistency evaluation for globally enrolled kidney trials where CKD etiology, dialysis practice, and transplant access differ substantially by region."
    },
    {
      "code": "EMA Qualification Opinion on Total Kidney Volume (TKV) as a Prognostic Biomarker in ADPKD",
      "authority": "EMA",
      "title": "Qualification Opinion: Total Kidney Volume as a Prognostic Biomarker for Use in Clinical Trials Investigating Autosomal Dominant Polycystic Kidney Disease",
      "why": "Qualifies height-adjusted TKV for prognostic enrichment in ADPKD trials, allowing selection of rapid progressors; cited to justify the enrichment strategy in Module 2.5 and 5.3.5.1."
    },
    {
      "code": "EMA CHMP/EWP/263148/06",
      "authority": "EMA",
      "title": "Guideline on the Clinical Investigation of Immunosuppressants for Solid Organ Transplantation",
      "why": "Defines the composite efficacy failure endpoint (biopsy-proven acute rejection, graft loss, death), non-inferiority margin expectations, and renal function co-primary considerations for transplant programs."
    },
    {
      "code": "FDA Guidance, Rare Diseases: Considerations for the Development of Drugs and Biological Products (2023)",
      "authority": "FDA",
      "title": "Rare Diseases: Considerations for the Development of Drugs and Biological Products",
      "why": "Governs rare glomerular disease programs (C3 glomerulopathy, primary membranous nephropathy, aHUS, Alport syndrome) including natural history requirements and surrogate endpoint justification."
    },
    {
      "code": "ICH E1",
      "authority": "ICH",
      "title": "The Extent of Population Exposure to Assess Clinical Safety for Long-Term Treatment",
      "why": "Sets the minimum long-term exposure for chronic kidney disease indications, where treatment is indefinite and the safety database must support multi-year use."
    }
  ],
  "reviewerExpectations": [
    "The reviewer will separate the acute hemodynamic eGFR effect from the chronic slope and will not credit a benefit that disappears after washout or that derives entirely from the acute dip.",
    "The reviewer expects proteinuria-based accelerated approvals to be paired with a confirmatory eGFR-slope or hard-outcome trial that is already enrolling, with milestones stated in the Clinical Overview.",
    "The reviewer scrutinizes whether background RAAS inhibition was maximally tolerated and stable, and whether SGLT2 inhibitor use was balanced and permitted, since incremental benefit on top of current standard of care is the question of interest.",
    "The reviewer verifies GFR estimation methodology consistency, creatinine assay standardization, and central laboratory use across all studies contributing to the slope analysis.",
    "The reviewer expects hyperkalemia, AKI, and volume-depletion events to be presented with standardized definitions, severity strata, time-to-event, and discontinuation attribution, and will use these to shape monitoring language in labeling.",
    "The reviewer expects the proposed indication statement to match the enrolled eGFR and proteinuria range exactly, and will narrow the indication where data outside that range are sparse.",
    "For immunomodulators, the reviewer expects a complete infection and malignancy characterization, including screening, vaccination, and prophylaxis requirements proposed by the sponsor and reflected in the RMP and REMS assessment.",
    "The reviewer expects pediatric and special-population plans that address the practical realities of the kidney population, including pregnancy exposure risk, dialysis, and transplant recipients."
  ],
  "pathwayHints": [
    {
      "pathway": "accelerated_approval",
      "applicability": "Rare glomerular diseases — IgA nephropathy, primary membranous nephropathy, C3 glomerulopathy, focal segmental glomerulosclerosis — where reduction in proteinuria is accepted as reasonably likely to predict a reduction in the risk of progression to kidney failure.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "Under FDORA the confirmatory trial (typically two-year eGFR slope or a composite kidney failure endpoint) must be underway at approval. Labeling will carry the accelerated-approval statement and the indication will be constrained to the proteinuria stratum and eGFR range studied."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "C3 glomerulopathy, atypical hemolytic uremic syndrome, Alport syndrome, primary hyperoxaluria, Fabry nephropathy, and other rare kidney diseases meeting prevalence thresholds.",
      "impactedSections": [
        "1.3",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Expect reliance on biomarker endpoints supported by natural history data and, in the smallest populations, external or historical controls; pre-specify the comparison methodology and sensitivity analyses rather than constructing them post hoc."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Agents showing substantial improvement over available therapy in rapidly progressive or refractory kidney disease on an endpoint reasonably likely to predict clinical benefit.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "2.7.4"
      ],
      "reviewerNotes": "Designation accelerates interactions but the multi-year eGFR slope or outcome data remain the ultimate evidentiary requirement; plan the confirmatory trial concurrently with the pivotal trial."
    },
    {
      "pathway": "priority_review",
      "applicability": "Products offering significant improvement in the treatment of serious kidney disease, or those carrying a rare pediatric disease priority review voucher for a pediatric nephropathy.",
      "impactedSections": [
        "1.2",
        "2.5"
      ],
      "reviewerNotes": "The compressed clock demands that the renal impairment PK package, integrated safety, and RMP be complete at submission; nephrology submissions frequently receive information requests on dialysis dosing that are difficult to answer late in the cycle."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU pathway for seriously debilitating rare kidney diseases where proteinuria or another surrogate supports early authorization pending confirmatory data.",
      "impactedSections": [
        "1.8.1",
        "1.8.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Specific obligations will require the confirmatory eGFR or outcome data; state the study design and timelines in the RMP and expect annual renewal until obligations are discharged."
    }
  ],
  "statisticalConsiderations": [
    "eGFR slope should be analyzed with a random-coefficients mixed model (random intercept and slope) with pre-specified fixed effects, a stated covariance structure, and a pre-specified landmark separating acute from chronic slope; the primary slope definition (total versus chronic) must be fixed before unblinding.",
    "Define intercurrent events per ICH E9(R1) with explicit strategies for dialysis initiation, kidney transplantation, and death — these truncate the eGFR trajectory and must be handled by a composite or while-alive strategy rather than naive censoring, which biases slope estimates optimistically.",
    "Proteinuria endpoints are strongly right-skewed and must be analyzed on the log scale with results reported as geometric mean ratios and percent change; pre-specify whether spot UPCR/UACR or 24-hour collection is primary and use it consistently.",
    "Composite kidney failure endpoints (sustained >=40% or >=57% eGFR decline, ESKD, renal death) require confirmation of the eGFR decline at a subsequent visit and pre-specified rules for unconfirmed values; the confirmation window materially affects event counts.",
    "Multiplicity across the primary composite, eGFR slope, proteinuria, and cardiovascular secondary endpoints must be controlled with a pre-specified hierarchical or graphical procedure; multiple eGFR thresholds analyzed without adjustment is a common deficiency.",
    "Event-driven progression trials require pre-specified group-sequential alpha spending and, given slow event accrual, careful non-binding futility rules and blinded event-rate monitoring; unblinded sample size re-estimation must be firewalled.",
    "Missing eGFR and urine data should be handled with likelihood-based mixed models under MAR as primary, with pattern-mixture or tipping-point sensitivity analyses; differential dropout by kidney function stratum is common and must be characterized.",
    "For external- or natural-history-controlled rare disease studies, pre-specify the matching or propensity approach, the covariate set, the handling of unmeasured confounding, and quantitative bias analysis."
  ],
  "endpointConsiderations": [
    "The established clinical outcome endpoint in CKD progression is a composite of sustained eGFR decline (>=40% or >=57%, i.e., doubling of serum creatinine), end-stage kidney disease (chronic dialysis or transplant), and renal or all-cause death; components must be confirmed and pre-defined.",
    "Total and chronic eGFR slope over at least two years is accepted as a surrogate for the clinical composite, supported by the NKF-FDA-EMA scientific workshop consensus; the acceptable slope difference depends on baseline eGFR and follow-up duration and the acute effect must be separately quantified.",
    "Proteinuria reduction (percent change in UPCR/UACR, typically at 9 months) is accepted as a surrogate reasonably likely to predict benefit for accelerated approval in IgA nephropathy and select glomerular diseases; the magnitude of reduction expected is disease-specific.",
    "Lupus nephritis uses complete renal response (proteinuria below a defined threshold, e.g., UPCR <=0.5 g/g, with stable or improved eGFR and glucocorticoid dose at or below a specified level) as the accepted primary endpoint, with partial response as a supportive endpoint.",
    "ADPKD uses eGFR slope as the efficacy endpoint, with height-adjusted total kidney volume growth rate serving as a qualified prognostic enrichment biomarker rather than an approvable efficacy endpoint on its own.",
    "Anemia of CKD uses change in hemoglobin from baseline with pre-specified target ranges and non-inferiority against an active comparator, plus a cardiovascular and thromboembolic safety analysis that is effectively co-primary for the benefit-risk assessment.",
    "Hyperkalemia products use change in serum potassium and the proportion maintaining normokalemia, typically with a randomized-withdrawal phase to establish maintained effect, plus demonstration of enabling continued RAASi therapy.",
    "Transplantation uses a composite efficacy failure endpoint of biopsy-proven acute rejection, graft loss, death, or loss to follow-up at 12 months, evaluated by non-inferiority with a justified margin, with renal function (eGFR) as a key secondary or co-primary.",
    "Acute kidney injury programs face the absence of a universally accepted efficacy endpoint; major adverse kidney events at 90 days (MAKE90: death, new dialysis, sustained loss of kidney function) is the most commonly accepted construct and should be pre-specified with component definitions.",
    "Patient-reported outcomes (fatigue, pruritus in CKD, health-related quality of life) require fit-for-purpose validation documented in Module 5.3.5.3 before supporting a labeling claim."
  ],
  "retrievalKeywords": [
    "egfr slope",
    "chronic kidney disease progression",
    "ckd-epi estimating equation",
    "acute egfr dip hemodynamic",
    "proteinuria upcr uacr",
    "albuminuria reduction",
    "iga nephropathy",
    "lupus nephritis complete renal response",
    "focal segmental glomerulosclerosis",
    "c3 glomerulopathy complement inhibitor",
    "adpkd total kidney volume",
    "diabetic kidney disease",
    "end-stage kidney disease dialysis",
    "kidney transplant biopsy-proven acute rejection",
    "renal impairment pharmacokinetics",
    "dialyzability hemodialysis dosing",
    "hyperkalemia raas inhibitor",
    "acute kidney injury kdigo",
    "make90 major adverse kidney events",
    "anemia of ckd hemoglobin target",
    "ckd mineral bone disorder hyperphosphatemia",
    "maximally tolerated raas inhibition",
    "sglt2 inhibitor kidney outcomes",
    "sustained 40 percent egfr decline",
    "natural history external control rare kidney disease"
  ]
};

export default nephrologyProfile;
