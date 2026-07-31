/**
 * Gastroenterology & Hepatology therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/gastroenterology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const gastroenterologyProfile: TherapeuticAreaProfile = {
  "id": "gastroenterology",
  "displayName": "Gastroenterology & Hepatology",
  "description": "Regulatory profile covering inflammatory bowel disease (ulcerative colitis, Crohn's disease), eosinophilic esophagitis, celiac disease, functional GI disorders (IBS, chronic idiopathic constipation, gastroparesis), C. difficile infection and live biotherapeutics, and hepatology (MASH/NASH, chronic hepatitis B and C, primary biliary cholangitis, cirrhosis and its complications). Reviewed principally by FDA's Division of Gastroenterology and Division of Hepatology and Nutrition (OND Office of Immunology and Inflammation / Office of Rare Diseases, Pediatrics, Urologic and Reproductive Medicine as applicable) and by EMA's Gastroenterology Drafting Group. Development programs in this area are dominated by (1) objective mucosal/histologic endpoints read centrally, (2) patient-reported symptom endpoints that must meet PRO validation standards, (3) surrogate endpoints supporting accelerated approval in liver disease, and (4) intensive hepatic safety and DILI surveillance.",
  "contextRules": [
    {
      "id": "gi-ctx-endpoint-hierarchy",
      "scope": "section",
      "instruction": "In the Clinical Overview, state the co-primary endpoint construct explicitly and defend it against the applicable disease guidance: for ulcerative colitis, clinical remission by the modified Mayo score (stool frequency subscore 0 or 1 with >=1-point decrease, rectal bleeding subscore 0, endoscopic subscore 0 or 1 excluding friability) with endoscopic improvement and histologic-endoscopic mucosal improvement as key secondaries; for Crohn's disease, co-primary clinical remission by the PRO-2 (abdominal pain and stool frequency) plus endoscopic response by SES-CD. Do not rely on CDAI alone as the sole registrational efficacy endpoint and do not introduce sponsor-modified index cut-offs without a pre-specified psychometric justification.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "ulcerative colitis",
        "crohn",
        "mayo score",
        "ses-cd",
        "cdai",
        "mucosal healing",
        "endoscopic remission"
      ],
      "guidanceRef": "FDA-UC-2022"
    },
    {
      "id": "gi-ctx-central-reading",
      "scope": "section",
      "instruction": "For any endoscopic or histologic endpoint, document in the study report that reading was performed by central, blinded readers who were masked to treatment assignment, visit sequence and site; describe reader training and certification, the adjudication rule for discordant reads, and provide inter-reader and intra-reader agreement statistics (kappa) prospectively defined in the imaging/reading charter. Cross-reference the reading charter as an appendix in 5.3.5.1 and summarize concordance between central and local reads in 2.7.3.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "central reading",
        "blinded reader",
        "endoscopy",
        "histology",
        "geboes",
        "robarts",
        "nancy index",
        "biopsy"
      ]
    },
    {
      "id": "gi-ctx-hepatic-safety",
      "scope": "section",
      "instruction": "Include a dedicated hepatic safety subsection presenting Hy's Law case identification, eDISH (evaluation of Drug-Induced Serious Hepatotoxicity) scatterplots of peak ALT versus peak total bilirubin on log scale, shift tables for ALT/AST/ALP/TBL by multiples of ULN, time-to-onset and dechallenge/rechallenge narratives, and the charter and outputs of the independent hepatic adjudication committee. In hepatology programs, present these analyses separately for subjects with baseline abnormal liver chemistries and by fibrosis stage or Child-Pugh class, and reconcile drug-related hepatic events against disease-driven fluctuation.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "dili",
        "hy's law",
        "edish",
        "alt",
        "aspartate aminotransferase",
        "bilirubin",
        "hepatotoxicity"
      ],
      "guidanceRef": "FDA-DILI-2009"
    },
    {
      "id": "gi-ctx-hepatic-impairment-pk",
      "scope": "section",
      "instruction": "Provide a dedicated hepatic impairment pharmacokinetic study stratified by Child-Pugh A, B and C (or a justified reduced design plus population PK) for any product with hepatic elimination, high protein binding, or an intended hepatology indication; include unbound-fraction data where protein binding exceeds ~90%. State the resulting dosing recommendation in 2.7.2 and carry it verbatim into the proposed labeling. A population-PK-only justification must be supported by adequate representation of moderate impairment and a covariate analysis demonstrating no clinically relevant exposure change.",
      "severity": "major",
      "appliesTo": "5.3.3.3",
      "triggerKeywords": [
        "hepatic impairment",
        "child-pugh",
        "cirrhosis",
        "protein binding",
        "population pk"
      ],
      "guidanceRef": "FDA-HEPIMP-2003"
    },
    {
      "id": "gi-ctx-pro-validation",
      "scope": "section",
      "instruction": "For every patient-reported symptom endpoint (PRO-2 in Crohn's disease, the Dysphagia Symptom Questionnaire in eosinophilic esophagitis, abdominal pain NRS and stool consistency diaries in IBS, CSBM diaries in chronic idiopathic constipation), file the full PRO dossier: conceptual framework, qualitative content-validity interviews in the target population, psychometric evaluation (reliability, construct validity, ability to detect change), the responder definition with its anchor-based derivation, recall period, mode of administration and equivalence of electronic migration, plus e-diary compliance rates by treatment arm. Place the instrument, scoring manual and validation report in 5.3.5.4 and summarize in 2.7.3.",
      "severity": "critical",
      "appliesTo": "5.3.5.4",
      "triggerKeywords": [
        "patient reported outcome",
        "pro",
        "diary",
        "dsq",
        "csbm",
        "abdominal pain",
        "responder definition",
        "edp"
      ],
      "guidanceRef": "FDA-PRO-2009"
    },
    {
      "id": "gi-ctx-immunosuppression-safety",
      "scope": "section",
      "instruction": "For immunomodulators and biologics used in IBD, present pre-specified adverse events of special interest with exposure-adjusted incidence rates: serious and opportunistic infections (including tuberculosis reactivation with the screening algorithm used), hepatitis B reactivation, herpes zoster, progressive multifocal leukoencephalopathy where mechanistically plausible, malignancy including lymphoma and hepatosplenic T-cell lymphoma, major adverse cardiovascular events and thrombosis for JAK inhibitors, and injection-site or infusion reactions. Provide the long-term extension dataset and a registry-based post-marketing surveillance commitment in Module 1.8.2 / RMP.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "opportunistic infection",
        "tuberculosis",
        "malignancy",
        "jak inhibitor",
        "hepatitis b reactivation",
        "lymphoma",
        "biologic"
      ]
    },
    {
      "id": "gi-ctx-mash-surrogate",
      "scope": "section",
      "instruction": "For MASH/NASH programs pursuing accelerated approval, state which histologic surrogate is being relied upon (resolution of steatohepatitis with no worsening of fibrosis, or improvement in fibrosis by at least one stage with no worsening of steatohepatitis, using the NASH CRN scoring system), confirm two independent central pathologists with a pre-specified adjudication rule, and describe the confirmatory outcomes trial already underway with its composite of progression to cirrhosis, hepatic decompensation, MELD >=15, liver transplantation and death. Address biopsy sampling variability and the reader-agreement data supporting the endpoint.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "mash",
        "nash",
        "steatohepatitis",
        "fibrosis stage",
        "nash crn",
        "liver biopsy",
        "accelerated approval"
      ],
      "guidanceRef": "FDA-NASH-2018"
    },
    {
      "id": "gi-ctx-background-therapy",
      "scope": "section",
      "instruction": "Standardize and fully report background therapy: permitted stable doses of 5-aminosalicylates, thiopurines or methotrexate at entry, the mandatory corticosteroid taper schedule during maintenance, and the definition of rescue therapy. Report corticosteroid-free remission separately as a pre-specified endpoint and treat initiation of rescue therapy, surgery or dose escalation as intercurrent events handled by the estimand strategy, not as informal censoring.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "corticosteroid taper",
        "steroid-free remission",
        "background therapy",
        "rescue therapy",
        "concomitant"
      ]
    },
    {
      "id": "gi-ctx-pediatric-plan",
      "scope": "module",
      "instruction": "File an initial Pediatric Study Plan with FDA and a Paediatric Investigation Plan with EMA early; for IBD, eosinophilic esophagitis and chronic hepatitis B, full waivers are rarely granted and partial extrapolation of efficacy from adults with pharmacokinetic/pharmacodynamic bridging plus safety data is the expected approach. Document the extrapolation assumptions (similar disease course, similar exposure-response) and the modeling that supports pediatric dose selection in 2.5 and 2.7.2.",
      "severity": "major",
      "appliesTo": "1",
      "triggerKeywords": [
        "pediatric",
        "ipsp",
        "pip",
        "extrapolation",
        "adolescent"
      ],
      "guidanceRef": "ICH-E11R1"
    },
    {
      "id": "gi-ctx-lbp-cmc",
      "scope": "module",
      "instruction": "For live biotherapeutic products and microbiota-based therapies, address strain identity and genomic characterization, absence of transmissible antimicrobial resistance determinants and virulence factors, donor screening and pathogen testing where donor-derived, viable-organism potency assay with a validated stability-indicating method, and lot-to-lot consistency. Coordinate the CBER OTAT/OTP filing expectations and mirror the donor-screening and traceability controls in the clinical safety narrative.",
      "severity": "major",
      "appliesTo": "3",
      "triggerKeywords": [
        "live biotherapeutic",
        "microbiome",
        "fecal microbiota",
        "clostridioides difficile",
        "donor screening",
        "strain identity"
      ],
      "guidanceRef": "FDA-LBP-2016"
    },
    {
      "id": "gi-ctx-always-consistency",
      "scope": "always",
      "instruction": "Keep endpoint definitions, index cut-offs, analysis populations and responder thresholds byte-identical across the protocol, statistical analysis plan, 2.7.3, 2.5 and the proposed labeling. Any post-hoc modification of a scoring index, timepoint or population must be flagged as post-hoc in the text and never presented as if pre-specified; reviewers routinely reconstruct these definitions from the datasets and a mismatch triggers an information request.",
      "severity": "major",
      "triggerKeywords": [
        "endpoint definition",
        "post-hoc",
        "analysis population",
        "labeling claim"
      ]
    }
  ],
  "riskFactors": [
    "Endpoint dependence on subjective endoscopic and histologic grading, where local-versus-central reader discordance can erase a treatment effect and where index cut-offs differ between FDA and EMA expectations.",
    "Drug-induced liver injury signal detection is confounded in hepatology populations whose baseline liver chemistries fluctuate; a single mishandled Hy's Law case can dominate the benefit-risk assessment.",
    "High and variable placebo response in functional GI disorders (IBS, chronic idiopathic constipation, gastroparesis), inflating sample-size requirements and producing failed replicate trials.",
    "Reliance on histologic surrogate endpoints for accelerated approval in MASH and biochemical surrogates (alkaline phosphatase, bilirubin) in cholestatic liver disease, with post-marketing confirmatory outcome trials that are long, expensive and at risk of enrollment failure after approval.",
    "Immunosuppressive mechanism classes carry class-wide safety constraints (serious infection, malignancy, and for JAK inhibitors the boxed warning on mortality, MACE, thrombosis and malignancy) that shape the entire labeling and REMS/RMP negotiation.",
    "Biopsy sampling variability and interobserver variability in fibrosis staging, which limit the reliability of a one-stage change endpoint.",
    "Chronic use indications trigger ICH E1 exposure expectations (1500 subjects exposed, 300-600 for 6 months, 100 for 12 months) that sponsors frequently under-resource when planning a single pivotal maintenance study.",
    "Regional divergence in acceptable comparators and standard of care (aminosalicylate background in Europe, biologic-experienced populations in the US) that undermines a single global pivotal package."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "no central read",
        "central reading not",
        "local endoscopy",
        "reader variability",
        "inter-reader agreement not",
        "reading charter missing",
        "unblinded reader"
      ],
      "description": "Endoscopic or histologic endpoints read locally or without documented blinded central adjudication, with no inter-reader or intra-reader agreement statistics, leaving the primary efficacy result unverifiable.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-UC-2022"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "hy's law not",
        "no edish",
        "hepatic adjudication",
        "liver injury not adjudicated",
        "transaminase elevation unexplained",
        "dili assessment missing",
        "rechallenge not documented"
      ],
      "description": "Hepatic safety analysis lacks Hy's Law case identification, eDISH plots, shift tables and independent adjudication, or fails to separate drug-related injury from underlying liver disease activity.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-DILI-2009"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "pro not validated",
        "instrument lacks content validity",
        "no qualitative interviews",
        "responder definition not anchored",
        "recall period",
        "ediary compliance",
        "instrument modified without"
      ],
      "description": "Patient-reported symptom instrument used as a primary or key secondary endpoint without content-validity evidence in the target population, without an anchor-based responder definition, or migrated to an electronic platform without equivalence testing.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-PRO-2009"
    },
    {
      "ctdSection": "5.3.3.3",
      "patterns": [
        "hepatic impairment study not",
        "child-pugh not stratified",
        "no dose adjustment for",
        "severe impairment not studied",
        "unbound fraction not measured"
      ],
      "description": "Missing or under-powered hepatic impairment pharmacokinetic study, or one that omits Child-Pugh C subjects and unbound-drug measurement, leaving the labeled dose in cirrhotic patients unsupported.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-HEPIMP-2003"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "missing data not addressed",
        "no non-responder imputation",
        "last observation carried forward",
        "rescue therapy censored",
        "estimand not defined",
        "intercurrent event"
      ],
      "description": "Binary remission endpoints analyzed without non-responder imputation for dropouts and rescue-therapy users, or an estimand framework that treats corticosteroid rescue, surgery and dose escalation as ignorable censoring.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E9R1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "insufficient long-term exposure",
        "ich e1 not met",
        "6-month exposure",
        "12-month safety",
        "open-label extension incomplete",
        "exposure-adjusted incidence not"
      ],
      "description": "Chronic-use safety database falls short of ICH E1 exposure expectations, or long-term extension data are presented as crude counts rather than exposure-adjusted incidence rates with comparator context.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "opportunistic infection not",
        "tuberculosis screening not described",
        "malignancy rate not compared",
        "hepatitis b reactivation not",
        "aesi list incomplete",
        "no background incidence"
      ],
      "description": "Adverse events of special interest for immunosuppressive mechanisms are not pre-specified, lack a screening or monitoring algorithm, or are reported without comparison to an external background incidence in the IBD population.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "surrogate not justified",
        "confirmatory trial not underway",
        "accelerated approval basis",
        "histologic surrogate",
        "biopsy variability not addressed"
      ],
      "description": "Accelerated approval sought on a histologic or biochemical surrogate without an adequately designed confirmatory outcomes trial already enrolling, and without addressing biopsy sampling and reader variability that inflate the apparent effect.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-NASH-2018"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "immunogenicity not assessed",
        "ada assay not validated",
        "neutralizing antibody",
        "no exposure-immunogenicity",
        "titer not reported"
      ],
      "description": "For biologics, anti-drug antibody incidence, titer, neutralizing capacity and the impact of immunogenicity on exposure, efficacy and hypersensitivity are not characterized with a validated tiered assay.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-IMMUNO-2019"
    },
    {
      "ctdSection": "1.9",
      "patterns": [
        "pediatric plan absent",
        "no ipsp",
        "pip not agreed",
        "waiver requested without",
        "adolescent data missing"
      ],
      "description": "No agreed pediatric study plan or paediatric investigation plan for a chronic GI or liver indication that manifests in children, or a waiver request unsupported by disease-prevalence and extrapolation arguments.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E11R1"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "background therapy not standardized",
        "steroid taper not specified",
        "steroid-free remission not reported",
        "concomitant medication uncontrolled"
      ],
      "description": "Corticosteroid taper and permitted background immunomodulators are not standardized across arms, so corticosteroid-free remission cannot be interpreted and treatment effect may be confounded by differential background therapy.",
      "severity": "major",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-UC-2022",
      "authority": "FDA",
      "title": "Ulcerative Colitis: Developing Drugs for Treatment (Guidance for Industry)",
      "why": "Defines FDA's expected co-primary construct for induction and maintenance trials (modified Mayo clinical remission plus endoscopic and histologic improvement), trial-population definitions by prior biologic exposure, and the corticosteroid-free remission endpoint; used to justify endpoint selection in 2.5 and 2.7.3 and to design the pivotal induction/maintenance program."
    },
    {
      "code": "FDA-CD-2022",
      "authority": "FDA",
      "title": "Crohn's Disease: Developing Drugs for Treatment (Guidance for Industry)",
      "why": "Establishes the shift away from CDAI toward co-primary PRO-2 symptom remission plus endoscopic response by SES-CD, and addresses fistulizing disease and pediatric development; used to defend the primary endpoint definition and the treat-through versus re-randomized maintenance design."
    },
    {
      "code": "FDA-IBS-2012",
      "authority": "FDA",
      "title": "Irritable Bowel Syndrome - Clinical Evaluation of Drugs for Treatment (Guidance for Industry)",
      "why": "Specifies the composite weekly responder definition for IBS-C (>=30% reduction in worst abdominal pain plus >=1 increase in complete spontaneous bowel movements) and IBS-D (pain plus Bristol stool consistency), the 12-week responder window and diary requirements; drives the SAP responder algorithm and the PRO dossier."
    },
    {
      "code": "FDA-EOE-2020",
      "authority": "FDA",
      "title": "Eosinophilic Esophagitis: Developing Drugs for Treatment (Draft Guidance for Industry)",
      "why": "Sets the expectation of co-primary histologic (peak eosinophil count per high-power field) and patient-reported dysphagia endpoints, and describes acceptable biopsy protocols and central pathology reading; used to align the EoE pivotal design and the DSQ validation package."
    },
    {
      "code": "FDA-NASH-2018",
      "authority": "FDA",
      "title": "Noncirrhotic Nonalcoholic Steatohepatitis With Liver Fibrosis: Developing Drugs for Treatment (Draft Guidance for Industry)",
      "why": "Defines the two histologic surrogate endpoints acceptable for accelerated approval, the NASH CRN scoring framework, biopsy timing, and the composite clinical outcome required for the confirmatory trial; the primary reference for MASH accelerated-approval strategy documented in 2.5."
    },
    {
      "code": "FDA-NASH-CIRR-2019",
      "authority": "FDA",
      "title": "Nonalcoholic Steatohepatitis With Compensated Cirrhosis: Developing Drugs for Treatment (Draft Guidance for Industry)",
      "why": "Covers the compensated-cirrhosis population where histologic improvement is no longer sufficient, outlining decompensation-event composites and hepatic venous pressure gradient as supportive measures; used when the program extends into F4 disease."
    },
    {
      "code": "FDA-DILI-2009",
      "authority": "FDA",
      "title": "Drug-Induced Liver Injury: Premarketing Clinical Evaluation (Guidance for Industry)",
      "why": "The controlling reference for hepatic safety monitoring, Hy's Law, eDISH analysis, stopping rules, rechallenge policy and hepatic adjudication committees; structures the hepatic safety subsection of 2.7.4 and the protocol liver-monitoring algorithm."
    },
    {
      "code": "FDA-HEPIMP-2003",
      "authority": "FDA",
      "title": "Pharmacokinetics in Patients With Impaired Hepatic Function: Study Design, Data Analysis, and Impact on Dosing and Labeling (Guidance for Industry)",
      "why": "Prescribes the Child-Pugh-stratified reduced or full PK study design and the translation of exposure changes into labeled dose adjustments; supports 5.3.3.3, 2.7.2 and Section 8.6 of US labeling."
    },
    {
      "code": "FDA-HBV-2022",
      "authority": "FDA",
      "title": "Chronic Hepatitis B Virus Infection: Developing Drugs for Treatment (Guidance for Industry)",
      "why": "Defines functional cure (sustained HBsAg loss with HBV DNA suppression off therapy), virologic endpoints, population definitions by HBeAg status, and resistance monitoring; used to set the primary endpoint and the off-treatment follow-up duration."
    },
    {
      "code": "FDA-HCV-2017",
      "authority": "FDA",
      "title": "Chronic Hepatitis C Virus Infection: Developing Direct-Acting Antiviral Drugs for Treatment (Guidance for Industry)",
      "why": "Establishes SVR12 as the approvable endpoint, genotype and cirrhosis subpopulation requirements, and resistance-associated substitution analyses; governs the efficacy narrative and virology package in 2.7.3 and 5.3.5.1."
    },
    {
      "code": "FDA-PRO-2009",
      "authority": "FDA",
      "title": "Patient-Reported Outcome Measures: Use in Medical Product Development to Support Labeling Claims (Guidance for Industry)",
      "why": "Sets the evidentiary standard for any symptom-based endpoint used for a labeling claim, including content validity, psychometrics, responder definitions and electronic migration; the basis for the PRO dossier filed in 5.3.5.4."
    },
    {
      "code": "FDA-LBP-2016",
      "authority": "FDA",
      "title": "Early Clinical Trials With Live Biotherapeutic Products: Chemistry, Manufacturing, and Control Information (Guidance for Industry)",
      "why": "Defines strain characterization, potency by viable organisms, antimicrobial-resistance and virulence screening, and donor-material controls for microbiome products used in recurrent C. difficile infection; drives Module 3 content and the IND-enabling package."
    },
    {
      "code": "EMA-UC-2018",
      "authority": "EMA",
      "title": "Guideline on the Development of New Medicinal Products for the Treatment of Ulcerative Colitis (CHMP/EWP/18463/2006 Rev. 1)",
      "why": "EMA's expectations for induction and maintenance design, endoscopic and histologic assessment, mucosal healing, and long-term safety; reconciled against the FDA endpoint construct in 2.5 to support a single global program."
    },
    {
      "code": "EMA-CD-2018",
      "authority": "EMA",
      "title": "Guideline on the Development of New Medicinal Products for the Treatment of Crohn's Disease (CHMP/EWP/2284/99 Rev. 2)",
      "why": "EMA's position on symptom plus endoscopic endpoints, fistulising disease, randomised withdrawal maintenance design and the role of biomarkers such as faecal calprotectin; used for the EU-specific efficacy justification."
    },
    {
      "code": "ICH-E9R1",
      "authority": "ICH",
      "title": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials",
      "why": "Frames the handling of rescue corticosteroids, surgery, dose escalation and discontinuation as intercurrent events with a declared estimand strategy; required to make the remission endpoint interpretable and to pre-specify sensitivity analyses."
    },
    {
      "code": "ICH-E1",
      "authority": "ICH",
      "title": "ICH E1 The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the minimum safety-exposure expectations for chronic IBD and functional GI therapies; used to size the safety database and to justify the long-term extension programme in 2.7.4."
    },
    {
      "code": "ICH-E11R1",
      "authority": "ICH",
      "title": "ICH E11(R1) Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Underpins the pediatric extrapolation strategy and dose-selection modeling required for iPSP/PIP agreement in pediatric IBD, EoE and chronic hepatitis B."
    },
    {
      "code": "FDA-IMMUNO-2019",
      "authority": "FDA",
      "title": "Immunogenicity Testing of Therapeutic Protein Products - Developing and Validating Assays for Anti-Drug Antibody Detection (Guidance for Industry)",
      "why": "Defines the tiered screening, confirmatory and neutralizing-antibody assay validation expected for IBD biologics; supports the immunogenicity section of 2.7.2 and the exposure-response analysis."
    }
  ],
  "reviewerExpectations": [
    "A reviewer will reconstruct the primary endpoint from the submitted ADaM datasets and confirm that each component subscore (stool frequency, rectal bleeding, endoscopy, histology) meets the exact definition stated in the protocol, SAP, 2.7.3 and the proposed label - any drift between documents becomes an information request.",
    "The clinical reviewer expects the endoscopy/histology reading charter, reader certification records and blinded-read concordance statistics to be filed and will discount efficacy claims resting on locally read endoscopy.",
    "The hepatology reviewer will independently generate eDISH plots from the ADLB dataset and will look for every subject with ALT or AST >3x ULN with total bilirubin >2x ULN, expecting a complete narrative, alternative-etiology workup and adjudication outcome for each.",
    "The statistical reviewer expects non-responder imputation as the primary handling of missing binary outcomes, a declared estimand with explicit intercurrent-event strategies, and tipping-point or multiple-imputation sensitivity analyses that do not overturn the conclusion.",
    "For maintenance indications, the reviewer will scrutinize whether a treat-through or randomized-withdrawal design was used and whether the induction responders enrolled into maintenance are representative, including how non-responders were accounted for in the labeled population.",
    "The reviewer expects corticosteroid-free clinical remission and endoscopic improvement to be reported as pre-specified, multiplicity-controlled secondary endpoints if any labeling claim is intended, not as descriptive exploratory analyses.",
    "For accelerated approval in liver disease, the reviewer will require documented evidence that the confirmatory outcomes trial is enrolling at the time of the application and will scrutinize the reasonably-likely-to-predict argument for the surrogate.",
    "Reviewers expect the safety database to include the elderly, patients with prior biologic exposure, and patients with concomitant immunomodulators, with subgroup consistency of efficacy displayed in forest plots and no unexplained heterogeneity by region."
  ],
  "pathwayHints": [
    {
      "pathway": "accelerated_approval",
      "applicability": "Well established in hepatology: histologic surrogates in noncirrhotic MASH with fibrosis (resolution of steatohepatitis without worsening fibrosis, or >=1-stage fibrosis improvement without worsening steatohepatitis) and biochemical surrogates in primary biliary cholangitis (alkaline phosphatase below approximately 1.67x ULN with a meaningful decrease and normal total bilirubin). Not generally available for IBD or functional GI disorders, where symptom and endoscopic endpoints are regarded as clinical rather than surrogate.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14.1",
        "5.3.5.3"
      ],
      "reviewerNotes": "The application must show the confirmatory outcomes trial is already underway with an agreed protocol, define the withdrawal conditions, and present central-pathology reader agreement supporting the histologic surrogate. Under the FDORA amendments, expect conditions of use and a specified completion timeline for the confirmatory study to be negotiated before action."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Realistic where preliminary clinical evidence shows substantial improvement over available therapy on a clinically significant endpoint in serious disease - for example functional cure (sustained HBsAg loss) in chronic hepatitis B, or a first therapy for a serious cholestatic liver disease such as primary sclerosing cholangitis. Less persuasive in a crowded IBD landscape unless the comparison is against an established active therapy.",
      "impactedSections": [
        "1.12",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Designation buys intensive FDA guidance and rolling review; reviewers expect the sponsor to use it to align on the endpoint construct, central reading charter and safety database size early, and will hold the sponsor to the agreed development plan at the pre-NDA/BLA meeting."
    },
    {
      "pathway": "fast_track",
      "applicability": "Broadly available for serious GI and liver conditions with unmet need, including biologic-refractory ulcerative colitis and Crohn's disease, decompensated cirrhosis complications, and recurrent Clostridioides difficile infection.",
      "impactedSections": [
        "1.12",
        "2.5",
        "1.14.1"
      ],
      "reviewerNotes": "Enables rolling submission; sequencing must be agreed with the review division so that the clinical modules are submitted only after the datasets and central-read outputs are locked, otherwise the rolling advantage is lost to information requests."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Applies to primary sclerosing cholangitis, primary biliary cholangitis, Wilson disease, short bowel syndrome with intestinal failure, autoimmune hepatitis, hepatorenal syndrome, alpha-1 antitrypsin deficiency liver disease and eosinophilic esophagitis subpopulations. Not applicable to ulcerative colitis, Crohn's disease, IBS or MASH at the population level.",
      "impactedSections": [
        "1.5",
        "1.7",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "Reviewers accept smaller safety databases and greater reliance on natural-history comparators in these settings, but expect a rigorous justification of the historical or external control, a pre-specified analysis of the natural-history dataset, and a robust post-marketing safety plan in the RMP."
    },
    {
      "pathway": "priority_review",
      "applicability": "Granted where the product would provide a significant improvement in safety or effectiveness - typical for first-in-class hepatitis B functional-cure regimens, novel mechanisms in biologic-refractory IBD, and therapies for serious complications of cirrhosis.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "The 6-month clock compresses information-request turnaround; the submission must be inspection-ready with clinical sites, central reading vendors and bioanalytical labs identified for BIMO in Module 1 at the time of filing."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU route for seriously debilitating GI and liver conditions where comprehensive data are not yet available - for example a MASH product approved on histologic surrogate pending the outcomes trial, or a therapy for a rare cholestatic liver disease.",
      "impactedSections": [
        "1.8.2",
        "2.5",
        "2.7.4",
        "5.3.5.1"
      ],
      "reviewerNotes": "CHMP requires a positive benefit-risk balance, a defined specific obligation with binding milestones, and evidence the sponsor can complete the confirmatory study; annual renewal and a robust EU Risk Management Plan with additional pharmacovigilance activities are expected."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME support is realistic for products addressing an unmet need in rare liver disease, biologic-refractory IBD, or a functional cure for chronic hepatitis B, supported by compelling non-clinical and early clinical proof of concept.",
      "impactedSections": [
        "1.12",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Requires early proof-of-concept data and yields a rapporteur appointed at CHMP level plus enhanced scientific advice; sponsors are expected to bring the endpoint strategy and the paediatric plan to that advice rather than to defer them to the MAA."
    }
  ],
  "statisticalConsiderations": [
    "Declare an ICH E9(R1) estimand for each primary and key secondary endpoint, naming the population, endpoint variable, and the strategy for each intercurrent event: rescue corticosteroids or immunomodulators, IBD-related surgery, dose escalation, and discontinuation for lack of efficacy are conventionally handled by a composite strategy (treated as non-responders), while discontinuation for reasons unrelated to treatment may warrant a hypothetical or treatment-policy strategy - state and justify the choice, do not default silently.",
    "Use non-responder imputation as the primary analysis for binary remission and response endpoints, with pre-specified sensitivity analyses (multiple imputation under MAR, tipping-point analysis, and a treatment-policy analysis that includes all randomized subjects) to demonstrate that the conclusion is not driven by the imputation rule. Last-observation-carried-forward is not acceptable as a primary approach.",
    "Control the family-wise type I error at 0.05 two-sided across the co-primary endpoints and the ordered secondary endpoints intended for labeling using a pre-specified hierarchical (fixed-sequence) or graphical procedure; co-primary endpoints must each be met at the full alpha, which materially raises the required sample size relative to a single-endpoint design.",
    "Pre-specify stratification factors that reflect the known prognostic drivers - prior biologic or advanced-therapy exposure, baseline disease severity by endoscopic subscore, concomitant corticosteroid use, geographic region - and provide the corresponding stratified analysis plus an unstratified sensitivity analysis; imbalance in prior-biologic exposure is a frequent source of reviewer challenge in IBD.",
    "For maintenance evaluation, pre-specify whether the design is treat-through (all induction subjects continue to the maintenance endpoint) or randomized withdrawal of induction responders, and define the labeled population accordingly; randomized-withdrawal designs must handle the induction non-responders transparently and cannot support a claim in the overall induction population.",
    "For event-rate endpoints in hepatology (decompensation, variceal bleeding, transplant, death), use time-to-first-event methods with competing-risk analyses for death from other causes, and pre-specify whether the analysis is cause-specific hazard or subdistribution hazard; report absolute event rates alongside hazard ratios.",
    "Where an interim analysis is planned, pre-specify the alpha-spending function, the futility rule (binding or non-binding), the composition and firewall of the independent data monitoring committee, and the plan for maintaining trial integrity; unplanned sample-size re-estimation based on unblinded treatment effect requires an adaptive-design justification and pre-agreement with the division.",
    "Address multiplicity created by multiple dose arms in a single trial and by pooling of induction studies; pre-specify whether doses are tested hierarchically or with a Dunnett-type adjustment, and avoid post-hoc dose-pooling to rescue a marginal result.",
    "For multiregional trials, follow ICH E17 in pre-specifying the pooling strategy and the assessment of regional consistency of treatment effect, with adequate representation from each region rather than post-hoc regional subgroup exploration."
  ],
  "endpointConsiderations": [
    "Ulcerative colitis - clinical remission by the modified (3-component) Mayo score: stool frequency subscore 0 or 1 with at least a 1-point decrease from baseline, rectal bleeding subscore 0, and endoscopic subscore 0 or 1 with friability excluded from a score of 1. Caveat: the exclusion of friability from a score of 1 is a recent tightening that materially lowers remission rates; historical cross-trial comparisons using older definitions are not valid.",
    "Ulcerative colitis supportive endpoints - endoscopic improvement, histologic-endoscopic mucosal improvement (Geboes, Robarts Histopathology Index or Nancy Index combined with endoscopic subscore 0/1), and corticosteroid-free clinical remission at the end of maintenance. Caveat: the histologic indices are not interchangeable and each requires its own reader-agreement data; only pre-specified, alpha-protected versions can support labeling.",
    "Crohn's disease - co-primary clinical remission by the PRO-2 (average daily abdominal pain score and average daily very soft/liquid stool frequency, with thresholds pre-specified) and endoscopic response defined as at least a 50% reduction in SES-CD from baseline. Caveat: CDAI is now considered insufficiently specific because of its heavy weighting of non-inflammatory symptoms and should be reported only as supportive; fistulising disease requires a separate endpoint (closure of draining fistulas confirmed by MRI).",
    "Eosinophilic esophagitis - co-primary histologic response (peak eosinophil count at or below 6 eosinophils per high-power field across all esophageal levels sampled) and a validated dysphagia symptom endpoint such as the Dysphagia Symptom Questionnaire. Caveat: histologic response alone is not approvable; symptom-histology dissociation is common and the symptom instrument must be validated in the enrolled age range.",
    "IBS-C - the FDA composite weekly responder: at least 30% reduction in weekly average of worst abdominal pain from baseline AND an increase of at least 1 complete spontaneous bowel movement per week, in at least 6 of 12 treatment weeks. IBS-D - at least 30% pain reduction AND a reduction to Bristol stool type 6 or 7 on at least 50% fewer days, on the same weekly-responder framework. Caveat: the composite is stringent and placebo response is high and variable across regions; a run-in period and diary-compliance thresholds are essential.",
    "Chronic idiopathic constipation - at least 3 complete spontaneous bowel movements per week and an increase of at least 1 CSBM from baseline, in at least 9 of 12 weeks including 3 of the last 4 weeks. Caveat: the 3-of-last-4-weeks requirement is intended to exclude transient effects and cannot be dropped without prior agreement.",
    "MASH/NASH noncirrhotic with fibrosis - resolution of steatohepatitis (ballooning score 0, inflammation 0-1) with no worsening of fibrosis, OR improvement in fibrosis by at least one stage with no worsening of steatohepatitis, scored by the NASH CRN system on central-read paired biopsies. Caveat: these are surrogates supporting accelerated approval only; sampling variability and interobserver variability in ballooning and fibrosis staging are substantial and require two independent readers with adjudication. Non-invasive tests (FibroScan/VCTE, MRI-PDFF, ELF, FAST) are supportive and prognostic enrichment tools, not yet substitutes for biopsy in registrational trials.",
    "MASH with compensated cirrhosis and other advanced liver disease - composite clinical outcomes: progression to histologic cirrhosis, hepatic decompensation events (ascites, variceal bleeding, hepatic encephalopathy), MELD score increase to 15 or above, liver transplantation, and all-cause death. Caveat: event rates are low, requiring long follow-up and large samples; hepatic venous pressure gradient response is supportive rather than approvable on its own.",
    "Chronic hepatitis B - functional cure defined as sustained HBsAg loss (with or without anti-HBs seroconversion) plus HBV DNA below the lower limit of quantification, assessed after a defined off-treatment period; supportive endpoints include HBV DNA suppression, ALT normalization and HBeAg seroconversion. Caveat: the off-treatment durability window is central to approvability and post-treatment ALT flares must be prospectively monitored and adjudicated.",
    "Chronic hepatitis C - sustained virologic response 12 weeks after the end of therapy (SVR12) is the accepted approvable endpoint, with resistance-associated substitution analysis by genotype and cirrhosis status. Caveat: with high background SVR rates, trials are typically single-arm against a pre-specified historical performance threshold, which must be agreed with the division in advance.",
    "Primary biliary cholangitis - the biochemical composite of alkaline phosphatase below approximately 1.67x ULN with at least a 15% decrease from baseline and total bilirubin within normal limits, at 12 months, supports accelerated approval; transplant-free survival is the confirmatory clinical outcome. Caveat: pruritus is a major patient-relevant symptom and requires a separately validated PRO if a symptom claim is sought, and some mechanisms worsen it.",
    "Recurrent Clostridioides difficile infection - sustained clinical cure (resolution of diarrhea without recurrence) typically at 8 weeks after treatment, with recurrence defined by a pre-specified combination of symptom return and toxin positivity. Caveat: the definition of a recurrence episode and the handling of intercurrent antibiotic exposure drive the effect size and must be adjudicated blindly."
  ],
  "retrievalKeywords": [
    "ulcerative colitis",
    "crohn's disease",
    "modified mayo score",
    "ses-cd",
    "endoscopic improvement",
    "histologic remission",
    "geboes score",
    "robarts histopathology index",
    "corticosteroid-free remission",
    "eosinophilic esophagitis",
    "peak eosinophil count",
    "dysphagia symptom questionnaire",
    "irritable bowel syndrome",
    "complete spontaneous bowel movement",
    "chronic idiopathic constipation",
    "mash",
    "nonalcoholic steatohepatitis",
    "nash crn fibrosis stage",
    "liver biopsy central pathology",
    "fibroscan vcte",
    "mri-pdff",
    "hepatic decompensation",
    "meld score",
    "child-pugh",
    "hepatic impairment pharmacokinetics",
    "hy's law",
    "edish",
    "drug-induced liver injury",
    "hbsag loss functional cure",
    "svr12",
    "primary biliary cholangitis alkaline phosphatase",
    "primary sclerosing cholangitis",
    "faecal calprotectin",
    "clostridioides difficile recurrence",
    "live biotherapeutic product",
    "fecal microbiota transplantation",
    "biologic-refractory",
    "jak inhibitor safety",
    "opportunistic infection",
    "randomized withdrawal maintenance",
    "non-responder imputation",
    "accelerated approval surrogate endpoint"
  ]
};

export default gastroenterologyProfile;
