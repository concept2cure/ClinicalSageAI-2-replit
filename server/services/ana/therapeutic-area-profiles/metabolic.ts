/**
 * Metabolic Disorders (Diabetes, Obesity, Dyslipidemia, MASH, Inborn Errors of Metabolism) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/metabolic
 */
import type { TherapeuticAreaProfile } from './types.js';

export const metabolicProfile: TherapeuticAreaProfile = {
  "id": "metabolic",
  "displayName": "Metabolic Disorders (Diabetes, Obesity, Dyslipidemia, MASH, Inborn Errors of Metabolism)",
  "description": "Regulatory profile for metabolic disease drug development covering type 1 and type 2 diabetes, obesity and weight management, lipid disorders, metabolic dysfunction-associated steatohepatitis (MASH/NASH), and inherited metabolic disorders. Reviewed by CDER's Division of Diabetes, Lipid Disorders, and Obesity (DDLO) and by CHMP under the EU diabetes and weight-management guidelines. Programs hinge on validated surrogate endpoints (HbA1c, percent weight loss, LDL-C, histology), long safety databases, and cardiovascular/pancreatic/thyroid safety characterization.",
  "contextRules": [
    {
      "id": "met-2.7.3-hba1c-primary",
      "scope": "section",
      "instruction": "For glycemic indications, present HbA1c change from baseline at the primary timepoint (typically 26 weeks for monotherapy/add-on, 52 weeks for durability) with the treatment-policy estimand as primary. Report the proportion achieving HbA1c <7.0% and <6.5%, and present rescue-medication use and its handling as a distinct intercurrent event. Supplement with fasting plasma glucose, CGM-derived time-in-range where collected, and body weight and blood pressure changes.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "HbA1c",
        "glycemic control",
        "time in range",
        "rescue medication",
        "fasting plasma glucose"
      ],
      "guidanceRef": "EMA CPMP/EWP/1080/00 Rev. 2"
    },
    {
      "id": "met-2.7.3-weight-coprimary",
      "scope": "section",
      "instruction": "For weight-management indications, present the co-primary endpoints of mean percent change in body weight and the proportion of subjects achieving >=5% weight loss at 52 weeks, and evaluate them against the FDA benchmark of a >=5% placebo-adjusted mean difference or a categorical responder difference that is statistically superior. Include the full weight-loss distribution (cumulative distribution function), waist circumference, and the effect on cardiometabolic risk factors as secondary evidence.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "percent weight loss",
        "weight management",
        "obesity",
        "responder analysis",
        "BMI"
      ],
      "guidanceRef": "FDA Obesity/Overweight Weight Reduction Draft Guidance (2025)"
    },
    {
      "id": "met-2.7.4-hypoglycemia",
      "scope": "section",
      "instruction": "Report hypoglycemia using the ADA/international consensus classification (Level 1 <70 mg/dL, Level 2 <54 mg/dL clinically significant, Level 3 severe requiring assistance) as event rates per patient-year and proportions of subjects, split by nocturnal versus daytime and by background insulin/sulfonylurea use. Do not report hypoglycemia only as an adverse-event preferred term.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "hypoglycemia",
        "severe hypoglycemia",
        "Level 2",
        "nocturnal hypoglycemia"
      ],
      "guidanceRef": "FDA T2DM Safety Draft Guidance (2020)"
    },
    {
      "id": "met-2.7.4-cv-safety",
      "scope": "section",
      "instruction": "Present the cardiovascular safety assessment consistent with the 2020 FDA draft guidance framework: an adequately sized safety database enriched with subjects at higher CV risk, with adjudicated MACE, and either a completed CV outcomes trial or a pre-specified meta-analysis with a stated risk-ratio upper bound. State explicitly whether a post-marketing CVOT is proposed and why the pre-approval database is adequate to exclude unacceptable excess risk.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "cardiovascular outcomes trial",
        "CVOT",
        "MACE",
        "cardiovascular safety",
        "meta-analysis"
      ],
      "guidanceRef": "FDA T2DM Safety Draft Guidance (2020)"
    },
    {
      "id": "met-module4-carcinogenicity",
      "scope": "module",
      "instruction": "For incretin-based and other chronically dosed metabolic agents, present the rodent carcinogenicity package with explicit attention to thyroid C-cell findings, exposure multiples at the no-observed-effect level relative to human clinical exposure, and human relevance arguments (species differences in GLP-1 receptor expression on C-cells). Cross-reference to calcitonin monitoring and the proposed boxed warning or contraindication for MTC/MEN2 in Module 1.14.",
      "severity": "critical",
      "appliesTo": "4",
      "triggerKeywords": [
        "C-cell",
        "medullary thyroid carcinoma",
        "carcinogenicity",
        "calcitonin",
        "MEN2"
      ],
      "guidanceRef": "ICH S1B(R1)"
    },
    {
      "id": "met-2.7.4-pancreatic-gi",
      "scope": "section",
      "instruction": "Provide a dedicated analysis of pancreatitis and pancreatic safety (adjudicated events, amylase/lipase shift tables and their clinical correlation), gallbladder and biliary events, and gastrointestinal tolerability including the proportion of GI-related discontinuations by titration step. For agents producing rapid or large weight loss, address muscle/lean-mass loss, bone density, nutritional adequacy, and gastroparesis/ileus reports.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "pancreatitis",
        "lipase",
        "amylase",
        "cholelithiasis",
        "gastroparesis",
        "lean mass"
      ]
    },
    {
      "id": "met-5.3.5.3-mash-histology",
      "scope": "section",
      "instruction": "For MASH/NASH programs, document the central-reader histopathology process: reader qualification, blinding to treatment and to visit sequence, paired-biopsy reading conventions, inter- and intra-reader agreement statistics (kappa), and the pre-specified definitions of the dual endpoints (resolution of steatohepatitis without worsening of fibrosis; >=1 stage fibrosis improvement without worsening of steatohepatitis). Reader variability is a principal source of FDA deficiencies in this area.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "NASH",
        "MASH",
        "liver biopsy",
        "NAS",
        "fibrosis stage",
        "central reader",
        "kappa"
      ],
      "guidanceRef": "FDA Noncirrhotic NASH with Liver Fibrosis Draft Guidance (2018)"
    },
    {
      "id": "met-always-lifestyle-background",
      "scope": "always",
      "instruction": "State the mandated background diet, exercise, and behavioral intervention applied equally across arms in every weight-management and metabolic efficacy discussion, and quantify adherence to it. Efficacy claims that do not account for an unequal or unspecified lifestyle background are routinely challenged.",
      "severity": "major",
      "triggerKeywords": [
        "lifestyle intervention",
        "diet and exercise",
        "caloric deficit",
        "behavioral therapy"
      ]
    }
  ],
  "riskFactors": [
    "Cardiovascular risk of glucose-lowering agents, historically the single largest regulatory driver in diabetes and the reason for enriched safety databases and CVOT commitments.",
    "Thyroid C-cell tumor findings and medullary thyroid carcinoma risk for GLP-1 receptor agonists, driving boxed warnings, contraindications, and post-marketing registry requirements.",
    "Acute pancreatitis, cholelithiasis/cholecystitis, and biliary events associated with incretin therapy and rapid weight loss.",
    "Severe hypoglycemia, especially in insulin and insulin-secretagogue combinations, and diabetic ketoacidosis (including euglycemic DKA with SGLT2 inhibitors).",
    "Loss of lean body mass, sarcopenia, and bone mineral density decline with high-magnitude weight loss agents, plus weight regain after discontinuation.",
    "Psychiatric safety, including suicidal ideation and behavior, which requires prospective assessment (e.g., C-SSRS) in centrally acting weight-management agents.",
    "Hepatotoxicity and Hy's Law case adjudication in MASH and lipid programs where the target organ is the liver and background disease confounds LFT interpretation.",
    "Genitourinary infections, volume depletion, and amputation/fracture signals for SGLT2-class agents requiring dedicated tabulation."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "cv risk not excluded",
        "no cvot",
        "mace upper bound exceeds",
        "cardiovascular safety database inadequate",
        "meta-analysis not prespecified"
      ],
      "description": "Cardiovascular safety of a glucose-lowering or weight-management agent not adequately excluded: no adjudicated MACE, a safety database not enriched for CV risk, or a meta-analysis whose risk-ratio upper confidence bound does not meet the expected threshold.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA T2DM Safety Draft Guidance (2020)"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "high rescue medication use",
        "intercurrent events not defined",
        "estimand not specified",
        "hba1c analysis excludes rescued subjects",
        "loss to follow-up in weight trial"
      ],
      "description": "Glycemic or weight endpoint analyzed with an undefined estimand — rescue medication, treatment discontinuation, and bariatric surgery not pre-specified as intercurrent events — or high dropout in a 52-week weight trial handled with LOCF rather than a principled imputation approach.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "hypoglycemia not classified",
        "no level 2 events",
        "hypoglycemia rates not per patient year",
        "nocturnal events not separated"
      ],
      "description": "Hypoglycemia reported only as adverse-event counts without the consensus Level 1/2/3 classification, event rates per patient-year, or stratification by background secretagogue/insulin use.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "biopsy reader variability",
        "no central reading",
        "kappa not reported",
        "histology endpoint not prespecified",
        "paired biopsy unblinded"
      ],
      "description": "MASH histology endpoints derived from site or unblinded reading, missing inter/intra-reader agreement statistics, or reader sequence unblinding that inflates apparent treatment effect.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no bone mineral density",
        "lean mass not measured",
        "body composition not assessed",
        "nutritional adequacy not addressed"
      ],
      "description": "High-magnitude weight-loss programs lacking body composition (DXA lean mass), bone mineral density, or nutritional-adequacy data, leaving the quality of weight lost uncharacterized.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "suicidality not assessed",
        "no c-ssrs",
        "psychiatric adverse events not prospectively collected",
        "neuropsychiatric signal"
      ],
      "description": "Centrally acting weight-management agents submitted without prospective suicidality assessment or with post hoc psychiatric event review only.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.5",
      "patterns": [
        "insufficient long term exposure",
        "fewer than 100 patients at one year",
        "safety database too small",
        "ich e1 not met"
      ],
      "description": "Chronic-use metabolic indication with a long-term exposure database falling short of ICH E1 (>=1,500 exposed, 300-600 at 6 months, 100 at 12 months), which for obesity is expected to be substantially larger (typically ~3,000 exposed with ~1,500 at one year).",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E1"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "dose titration not justified",
        "no dose response for safety",
        "maximum tolerated dose not established",
        "phase 3 dose not supported"
      ],
      "description": "Titration schedule and Phase 3 dose selection unsupported by exposure-response for both efficacy and GI tolerability, leaving the benefit-risk of the highest dose unjustified.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E4"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "immunogenicity not correlated",
        "anti-drug antibodies not linked to efficacy",
        "neutralizing antibody assay not validated"
      ],
      "description": "For peptide and protein metabolic therapeutics, anti-drug antibody incidence reported without correlation to PK, efficacy loss, hypersensitivity, or injection-site reactions, and without a validated neutralizing-antibody assay.",
      "severity": "major",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA Draft Guidance (March 2020), Type 2 Diabetes Mellitus: Evaluating the Safety of New Drugs for Improving Glycemic Control",
      "authority": "FDA",
      "title": "Type 2 Diabetes Mellitus: Evaluating the Safety of New Drugs for Improving Glycemic Control",
      "why": "Replaces the 2008 CV-risk guidance; defines the expected safety database size, enrichment for CV and CKD risk, and the framework for demonstrating acceptable CV safety without a mandatory CVOT. Drives Module 2.7.4 structure and post-marketing commitments."
    },
    {
      "code": "FDA Draft Guidance (January 2025), Obesity and Overweight: Developing Drugs and Biological Products for Weight Reduction",
      "authority": "FDA",
      "title": "Obesity and Overweight: Developing Drugs and Biological Products for Weight Reduction",
      "why": "Sets the co-primary weight endpoints, the >=5% placebo-adjusted efficacy benchmark, 52-week trial duration, required cardiometabolic secondary endpoints, and the enlarged safety database expectation for chronic weight management."
    },
    {
      "code": "EMA CPMP/EWP/1080/00 Rev. 2",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products in the Treatment or Prevention of Diabetes Mellitus",
      "why": "EU expectations for HbA1c as primary endpoint, trial duration and durability, add-on trial design, and the specific requirements for type 1 versus type 2 populations and pediatric extrapolation."
    },
    {
      "code": "EMA/CHMP/311805/2014",
      "authority": "EMA",
      "title": "Guideline on Clinical Evaluation of Medicinal Products Used in Weight Management",
      "why": "EU counterpart to the FDA obesity guidance; defines the categorical and mean weight-loss criteria, the 12-month minimum efficacy duration, and maintenance-of-effect expectations used in EU Module 2.5 argumentation."
    },
    {
      "code": "FDA Draft Guidance (December 2018), Noncirrhotic Nonalcoholic Steatohepatitis With Liver Fibrosis: Developing Drugs for Treatment",
      "authority": "FDA",
      "title": "Noncirrhotic Nonalcoholic Steatohepatitis With Liver Fibrosis: Developing Drugs for Treatment",
      "why": "Defines the histologic surrogate endpoints eligible for accelerated approval and the clinical-outcome endpoints (progression to cirrhosis, hepatic decompensation, MELD, transplant, death) required for confirmation."
    },
    {
      "code": "ICH E1",
      "authority": "ICH",
      "title": "The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Establishes the minimum long-term exposure database that metabolic chronic-use indications must meet or exceed; cited directly in Module 2.7.5 exposure tables."
    },
    {
      "code": "ICH S1B(R1) and ICH S1A",
      "authority": "ICH",
      "title": "Testing for Carcinogenicity of Pharmaceuticals (including the addendum on rodent carcinogenicity study design)",
      "why": "Governs the two-year rodent carcinogenicity requirement for chronically administered metabolic agents and the weight-of-evidence approach that may waive the rat study; underpins the C-cell tumor and human-relevance discussion in Module 2.4/2.6."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Statistical Principles for Clinical Trials — Estimands and Sensitivity Analysis",
      "why": "Essential for defining how rescue medication, treatment discontinuation, and bariatric surgery are handled in HbA1c and weight endpoints, an area of frequent FDA/EMA information requests."
    },
    {
      "code": "FDA Guidance, Rare Diseases: Considerations for the Development of Drugs and Biological Products (December 2023, final)",
      "authority": "FDA",
      "title": "Rare Diseases: Considerations for the Development of Drugs and Biological Products",
      "why": "Governs inborn errors of metabolism programs — natural history study design, biomarker-based endpoints, small-population trial designs, and use of external controls."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Frames the pediatric type 2 diabetes and pediatric obesity study requirements that support PSP/PIP commitments in Module 1.9/1.10 and the extrapolation argument in Module 2.5."
    }
  ],
  "reviewerExpectations": [
    "The reviewer expects the HbA1c estimand to be explicit and will look for how many subjects received rescue medication, since differential rescue can mask or manufacture treatment effect.",
    "The reviewer independently evaluates whether the CV safety database is large enough and sufficiently enriched, and will impose a post-marketing CVOT requirement if the pre-approval upper confidence bound is not reassuring.",
    "For weight-management products, the reviewer verifies both co-primary criteria are met, examines the full weight-change distribution rather than the mean alone, and assesses whether weight loss is maintained through 52 weeks and what happens on withdrawal.",
    "The reviewer scrutinizes GI tolerability and discontinuation by titration step to decide whether the proposed maintenance dose and escalation schedule are supportable in the label.",
    "In MASH, the reviewer will focus on the biopsy central-reading methodology and reader agreement, and will discount an effect that is not robust to alternative reader adjudication rules.",
    "The reviewer expects thyroid C-cell and pancreatic safety to be addressed proactively for incretin-class agents, with monitoring, contraindication language, and registry commitments proposed by the sponsor rather than requested by the agency.",
    "The reviewer checks that pediatric and special-population (renal/hepatic impairment) dosing is supported by population PK and dedicated impairment studies, since metabolic populations have high comorbid CKD prevalence."
  ],
  "pathwayHints": [
    {
      "pathway": "accelerated_approval",
      "applicability": "MASH with fibrosis, using histologic improvement (steatohepatitis resolution or >=1 stage fibrosis improvement) as a surrogate reasonably likely to predict clinical benefit; also applicable to certain inborn errors of metabolism using a disease-specific biochemical biomarker.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.3",
        "1.14"
      ],
      "reviewerNotes": "Under FDORA the confirmatory outcome trial (progression to cirrhosis, hepatic decompensation, transplant, death) must be underway at approval; the Clinical Overview must state its design, enrollment status, and milestone dates, and labeling will carry the accelerated-approval statement."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Inborn errors of metabolism (urea cycle disorders, lysosomal storage diseases, homozygous familial hypercholesterolemia, familial chylomicronemia syndrome, lipodystrophy, and monogenic obesity syndromes such as POMC/LEPR deficiency).",
      "impactedSections": [
        "1.3",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect reliance on natural-history-controlled or single-arm designs with biomarker endpoints; the reviewer will require a rigorously characterized natural history dataset and pre-specified comparison methodology, plus a plan for confirmatory evidence."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Monogenic and syndromic obesity, severe insulin resistance syndromes, and MASH agents showing substantial improvement over available therapy on a clinically significant endpoint in early trials.",
      "impactedSections": [
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Designation compresses timelines; ensure the long-term safety database strategy and manufacturing scale-up are addressed early because ICH E1 exposure remains an approval requirement for chronic metabolic indications."
    },
    {
      "pathway": "priority_review",
      "applicability": "Metabolic products offering significant improvement in safety or effectiveness over available therapy, or those qualifying via a rare pediatric disease priority review voucher for inherited metabolic disease.",
      "impactedSections": [
        "1.2",
        "2.5"
      ],
      "reviewerNotes": "Priority review shortens the review clock without changing evidentiary standards; submission readiness of Module 3 and the integrated safety database is the practical constraint."
    },
    {
      "pathway": "prime",
      "applicability": "EU pathway for inherited metabolic disorders and MASH candidates addressing unmet need with early clinical evidence of major therapeutic advantage.",
      "impactedSections": [
        "1.8.1",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "PRIME brings a rapporteur appointed early and iterative scientific advice; align the EU development plan and pediatric investigation plan with CHMP advice and document the advice history in Module 1.8."
    }
  ],
  "statisticalConsiderations": [
    "Specify the estimand for HbA1c and percent weight change with an explicit intercurrent-event strategy: treatment-policy for the primary in most programs, with hypothetical or composite strategies as pre-specified sensitivity analyses. LOCF is not an acceptable primary approach.",
    "Handle missing data in 52- and 72-week metabolic trials with multiple imputation under MAR as primary and retrieved-dropout or jump-to-reference/washout imputation as sensitivity, given the high and often differential dropout in obesity trials.",
    "Control multiplicity across doses, co-primary endpoints, and the ordered key secondary hierarchy (e.g., >=10% and >=15% weight-loss responders, waist circumference, lipids, blood pressure) with a graphical or fixed-sequence procedure pre-specified in the SAP.",
    "Co-primary endpoints require both to succeed at the full alpha level (no alpha split needed) but power must be computed jointly, accounting for the correlation between the continuous and responder endpoints.",
    "CV safety meta-analyses must be pre-specified in a standalone SAP, use a fixed-effect Mantel-Haenszel or exact stratified method appropriate for sparse events, and stratify by trial rather than pooling patient-level data across heterogeneous designs.",
    "Non-inferiority for insulin and glycemic add-on comparisons conventionally uses a 0.3% or 0.4% HbA1c margin; the margin must be justified against historical evidence and supported by both the full-analysis-set and per-protocol analyses.",
    "For MASH dual histologic endpoints, pre-specify whether success requires one or both endpoints, the alpha allocation between them, and the treatment of missing end-of-treatment biopsies (typically imputed as non-responders)."
  ],
  "endpointConsiderations": [
    "HbA1c change from baseline at 24-26 weeks is the accepted primary efficacy endpoint for glycemic control, with 52-week data expected to demonstrate durability; the accepted supportive endpoint set includes fasting plasma glucose, postprandial glucose, and the proportion at target.",
    "Continuous glucose monitoring metrics (time in range 70-180 mg/dL, time below range, glycemic variability) are increasingly accepted as key secondary endpoints, particularly in type 1 diabetes, but time in range is not yet an established stand-alone approval endpoint for type 2 disease.",
    "Weight management requires co-primary endpoints: mean percent change in body weight and the proportion achieving >=5% loss at 52 weeks; higher thresholds (>=10%, >=15%, >=20%) are supported as key secondary responder endpoints for labeling.",
    "LDL-C percent change is the accepted surrogate for lipid-lowering approval; non-HDL-C, ApoB, Lp(a), and triglycerides serve as secondary endpoints, with outcome trials required for ASCVD risk-reduction claims.",
    "MASH surrogate endpoints are histologic: resolution of steatohepatitis with no worsening of fibrosis, and >=1 stage fibrosis improvement with no worsening of steatohepatitis; non-invasive tests (FibroScan/VCTE, MRI-PDFF, ELF, FIB-4) are supportive and useful for enrichment but are not yet approvable primary endpoints.",
    "In inborn errors of metabolism, disease-specific biochemical biomarkers (e.g., plasma ammonia, glycosaminoglycan excretion, phenylalanine concentration, substrate accumulation) can support accelerated or full approval when the biomarker is mechanistically and epidemiologically linked to clinical outcome.",
    "Cardiometabolic secondary endpoints — waist circumference, blood pressure, lipid panel, and glycemic parameters in prediabetes — are expected in weight-management programs to substantiate the health benefit of weight loss.",
    "Patient-reported outcomes (e.g., IWQOL-Lite-CT for obesity, DTSQ for diabetes treatment satisfaction) require a fit-for-purpose validation dossier in Module 5.3.5.3 before they can support labeling claims."
  ],
  "retrievalKeywords": [
    "hba1c",
    "glycemic control",
    "type 2 diabetes mellitus",
    "type 1 diabetes",
    "continuous glucose monitoring time in range",
    "severe hypoglycemia",
    "diabetic ketoacidosis",
    "glp-1 receptor agonist",
    "sglt2 inhibitor",
    "percent body weight loss",
    "weight management responder analysis",
    "c-cell tumor medullary thyroid carcinoma",
    "acute pancreatitis lipase",
    "cardiovascular outcomes trial diabetes",
    "mash nash fibrosis",
    "liver biopsy central reader",
    "mri-pdff fibroscan",
    "ldl-c lowering",
    "hypertriglyceridemia",
    "inborn errors of metabolism natural history",
    "rescue medication estimand",
    "ich e1 long-term exposure",
    "body composition lean mass dxa",
    "insulin resistance homa-ir",
    "prediabetes progression"
  ]
};

export default metabolicProfile;
