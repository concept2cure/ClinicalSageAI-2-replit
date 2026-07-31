/**
 * General / Cross-Cutting (Area-Agnostic Best Practice) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/other
 */
import type { TherapeuticAreaProfile } from './types.js';

export const otherProfile: TherapeuticAreaProfile = {
  "id": "other",
  "displayName": "General / Cross-Cutting (Area-Agnostic Best Practice)",
  "description": "Fallback regulatory authoring profile applied when no therapeutic-area-specific profile matches, or as a baseline layered under every area profile. Encodes the ICH CTD structural requirements, the substantial-evidence standard, GCP and data-integrity expectations, benefit-risk framing, and the cross-cutting clinical pharmacology, safety-characterization, statistical, and labeling obligations that FDA and EMA apply to essentially every marketing application regardless of indication. Use it to catch structural, traceability, and consistency defects — the deficiencies that cause Refuse-to-File actions and validation failures independent of the science.",
  "contextRules": [
    {
      "id": "gen-ctd-structure-granularity",
      "scope": "always",
      "instruction": "Place content in the ICH M4 section where reviewers expect it and respect the granularity rules: Module 2 summaries must not introduce data absent from Modules 3-5; every quantitative statement in 2.5 or 2.7 must carry a cross-reference to the source table, listing, or study report location (study number plus section/table number). Do not duplicate long text between 2.5 and 2.7 — 2.5 is the sponsor's critical assessment and argument, 2.7 is the factual integrated summary. Keep 2.5 within the ICH M4E length expectation (approximately 30 pages) and push detail down.",
      "severity": "major",
      "appliesTo": "all",
      "triggerKeywords": [
        "module 2",
        "clinical overview",
        "clinical summary",
        "cross-reference",
        "ctd structure"
      ],
      "guidanceRef": "ICH-M4E-R2"
    },
    {
      "id": "gen-substantial-evidence",
      "scope": "section",
      "instruction": "State explicitly what constitutes the evidence of effectiveness: which trials are adequate and well-controlled, whether the standard is met by two independent trials or by one trial plus confirmatory evidence, and — if the latter — identify the confirmatory evidence category (mechanistic/pharmacologic data, evidence from a related indication, natural history, or compelling within-trial replication) and argue it against FDA's stated criteria. Address trial quality attributes reviewers weigh: randomization and blinding integrity, endpoint objectivity, multicenter consistency, and the absence of results-driven analysis choices.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "substantial evidence",
        "adequate and well-controlled",
        "single trial",
        "confirmatory evidence",
        "effectiveness"
      ],
      "guidanceRef": "FDA-SUBSTANTIAL-EVIDENCE-2019"
    },
    {
      "id": "gen-benefit-risk-framework",
      "scope": "section",
      "instruction": "Close the Clinical Overview with a structured benefit-risk assessment following FDA's Benefit-Risk Framework dimensions: analysis of condition, current treatment options, benefit, risk and risk management. Quantify benefits and risks in the same population and time frame, state the key uncertainties and how each is addressed or managed (labeling, REMS, postmarketing study), and present the conclusion as a reasoned judgment rather than an assertion. Mirror this structure in the EU dossier alongside the RMP.",
      "severity": "critical",
      "appliesTo": "2.5.6",
      "triggerKeywords": [
        "benefit-risk",
        "risk management",
        "uncertainty",
        "unmet need",
        "treatment options"
      ],
      "guidanceRef": "FDA-BENEFIT-RISK-2023"
    },
    {
      "id": "gen-estimand-and-sap",
      "scope": "section",
      "instruction": "For every pivotal study, present the estimand in the five ICH E9(R1) attributes (treatment condition, population, variable, intercurrent-event strategies, population-level summary) and confirm that the primary analysis matches it. Document that the SAP was finalized and dated before unblinding, list every amendment with its date relative to database lock and unblinding, and reconcile any difference between the pre-specified and reported analyses in a dedicated subsection. Report all analyses performed, not only the favorable ones.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "estimand",
        "intercurrent event",
        "statistical analysis plan",
        "sap",
        "pre-specified",
        "unblinding"
      ],
      "guidanceRef": "ICH-E9-R1"
    },
    {
      "id": "gen-multiplicity",
      "scope": "section",
      "instruction": "Describe the multiplicity control strategy explicitly: the family of hypotheses, the testing hierarchy or gatekeeping/graphical procedure, alpha allocation and any recycling, and how interim analyses consumed alpha. Endpoints outside the controlled family must be labeled as not multiplicity-controlled and described with confidence intervals and descriptive language only — never with p-values presented as confirmatory or with claim-like wording.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "multiplicity",
        "alpha",
        "hierarchical testing",
        "type i error",
        "secondary endpoints",
        "gatekeeping"
      ],
      "guidanceRef": "FDA-MULTIPLE-ENDPOINTS-2022"
    },
    {
      "id": "gen-missing-data",
      "scope": "section",
      "instruction": "Report discontinuation and missing-data rates by arm and by reason, state the primary missing-data assumption and its clinical plausibility, and present pre-specified sensitivity analyses under alternative assumptions (e.g., control-based or washout multiple imputation, tipping point). Do not present LOCF or complete-case analysis as the primary approach. Distinguish missing outcome data from intercurrent events handled by the estimand.",
      "severity": "major",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "missing data",
        "dropout",
        "discontinuation",
        "imputation",
        "tipping point",
        "sensitivity analysis",
        "locf"
      ],
      "guidanceRef": "ICH-E9-R1"
    },
    {
      "id": "gen-integrated-safety",
      "scope": "section",
      "instruction": "Build the integrated safety summary from justified pooling groups (state the rationale for each pool and why studies with materially different populations, doses, durations, or comparators are or are not pooled). Include: extent of exposure by dose and duration against ICH E1 expectations for chronic use, common adverse events by MedDRA preferred term with a stated version, deaths and serious adverse events with narratives, discontinuations due to adverse events, adverse events of special interest with pre-specified search strategies (standardized MedDRA queries named explicitly), laboratory/vital sign/ECG shift and outlier analyses, hepatotoxicity assessment including Hy's Law case evaluation, and safety in subgroups (age, sex, race/ethnicity, renal and hepatic impairment). Use exposure-adjusted rates when exposure differs between arms.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "integrated safety",
        "iss",
        "pooling",
        "adverse events of special interest",
        "smq",
        "hy's law",
        "exposure-adjusted"
      ],
      "guidanceRef": "FDA-ISS-ISE-2015"
    },
    {
      "id": "gen-clinical-pharmacology",
      "scope": "section",
      "instruction": "Cover the standard clinical pharmacology package or justify each omission: ADME/mass balance, dose- and time-dependence of PK, food effect for oral products, drug-drug interaction assessment following ICH M12 (in vitro enzyme/transporter phenotyping driving the in vivo study or PBPK strategy), hepatic and renal impairment studies per the FDA organ-impairment guidances, QT assessment per ICH E14/S7B (thorough QT study or a justified concentration-QTc analysis), intrinsic-factor effects (age, sex, body weight, genotype), and exposure-response analyses for efficacy and safety that support the proposed dose and any dose adjustments in labeling. For biologics, include immunogenicity incidence with a validated tiered assay and the impact of ADA on PK, efficacy, and safety.",
      "severity": "critical",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "pharmacokinetics",
        "drug interaction",
        "renal impairment",
        "hepatic impairment",
        "qt",
        "exposure-response",
        "immunogenicity",
        "pbpk"
      ],
      "guidanceRef": "ICH-M12"
    },
    {
      "id": "gen-dose-justification",
      "scope": "section",
      "instruction": "Justify the proposed dose and regimen with an explicit dose-response argument spanning nonclinical, PK/PD, dose-ranging, and exposure-response data — not simply the dose carried forward from Phase 2. Where more than one dose was studied, explain why the proposed dose optimizes benefit-risk. For oncology programs specifically, address Project Optimus expectations: randomized dose comparison rather than MTD-only selection, and characterization of the dose-toxicity and dose-efficacy relationships.",
      "severity": "major",
      "appliesTo": "2.5.4",
      "triggerKeywords": [
        "dose selection",
        "dose optimization",
        "mtd",
        "dose-response",
        "project optimus",
        "regimen"
      ],
      "guidanceRef": "ICH-E4"
    },
    {
      "id": "gen-gcp-integrity",
      "scope": "module",
      "instruction": "Document GCP compliance and data integrity per ICH E6(R3): the monitoring approach (risk-based monitoring plan), significant protocol deviations by category and their impact analysis, site-level result consistency for any site contributing a large share of subjects, handling of any site with data-quality findings, investigator financial disclosure (FDA Form 3454/3455), and the audit/inspection history. Provide a clear statement of which studies were conducted outside the US/EU and how their applicability to the target population was assessed per ICH E17 and the acceptance-of-foreign-data regulations.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "gcp",
        "protocol deviation",
        "data integrity",
        "monitoring",
        "financial disclosure",
        "foreign clinical data",
        "inspection"
      ],
      "guidanceRef": "ICH-E6-R3"
    },
    {
      "id": "gen-population-representativeness",
      "scope": "section",
      "instruction": "Characterize the enrolled population against the intended use population by age (including geriatric per ICH E7 and pediatric per the agreed iPSP/PIP), sex, race and ethnicity, and relevant comorbidities and concomitant medications. State the enrollment goals and actual enrollment, discuss any material under-representation and its impact on generalizability, and reference the Diversity Action Plan (US) and the pediatric investigation plan (EU) status. Do not present subgroup consistency claims from underpowered subgroups as evidence; frame them as descriptive consistency checks.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "diversity",
        "race",
        "ethnicity",
        "geriatric",
        "pediatric",
        "subgroup",
        "generalizability",
        "enrollment"
      ],
      "guidanceRef": "FDA-DIVERSITY-ACTION-PLAN-2024"
    },
    {
      "id": "gen-labeling-traceability",
      "scope": "section",
      "instruction": "Every statement in proposed labeling must be traceable to submitted data: build an annotated label linking each Highlights and Full Prescribing Information statement to the specific Module 2/5 location supporting it. The indication statement must match the population actually studied and the endpoint actually met; dosing, warnings, and adverse-reaction tables must reconcile numerically with 2.7.4. Follow the PLR format and, where applicable, the Pregnancy and Lactation Labeling Rule content requirements.",
      "severity": "critical",
      "appliesTo": "1.14.1",
      "triggerKeywords": [
        "labeling",
        "prescribing information",
        "annotated label",
        "indication statement",
        "plr",
        "pllr"
      ],
      "guidanceRef": "FDA-PLR-2013"
    },
    {
      "id": "gen-pharmacovigilance-rmp",
      "scope": "section",
      "instruction": "Provide the safety specification, pharmacovigilance plan, and risk-minimization measures consistent with ICH E2E and, for the EU, the GVP Module V RMP template: identified risks, potential risks, and missing information each with the evidence, frequency, and the specific activity addressing it. Ensure the risks listed in the RMP/REMS match the warnings and precautions in labeling and the postmarketing commitments table — inconsistency across these three documents is a routine finding.",
      "severity": "major",
      "appliesTo": "1.16",
      "triggerKeywords": [
        "risk management plan",
        "rmp",
        "rems",
        "pharmacovigilance",
        "missing information",
        "safety specification"
      ],
      "guidanceRef": "ICH-E2E"
    },
    {
      "id": "gen-data-standards",
      "scope": "module",
      "instruction": "Submit study data in FDA-supported CDISC standards per the Study Data Technical Conformance Guide: SDTM for tabulations and ADaM for analysis datasets, with complete define.xml, a reviewer's guide (cSDRG/ADRG), and traceability from ADaM back to SDTM to CRF. Resolve validation rule findings or explain each remaining one in the reviewer's guide. Non-conformant data is a Refuse-to-File basis independent of scientific merit.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "cdisc",
        "sdtm",
        "adam",
        "define.xml",
        "study data",
        "conformance",
        "reviewer's guide"
      ],
      "guidanceRef": "FDA-STUDY-DATA-TCG"
    },
    {
      "id": "gen-nonclinical-bridge",
      "scope": "module",
      "instruction": "Confirm the nonclinical program supports the proposed indication, duration, and population per ICH M3(R2) (or S6(R1) for biotechnology-derived products): repeat-dose toxicology of adequate duration for chronic use, genotoxicity battery per ICH S2(R1), carcinogenicity assessment or a justified waiver per ICH S1, reproductive and developmental toxicology per ICH S5(R3) aligned to the intended population and the labeled pregnancy information, and safety pharmacology per ICH S7A/S7B. Present safety margins as exposure multiples (AUC/Cmax) at the clinical dose, not dose-per-body-weight ratios alone, and state the impurity qualification status per ICH Q3A/Q3B and mutagenic impurity control per ICH M7.",
      "severity": "major",
      "appliesTo": "4",
      "triggerKeywords": [
        "nonclinical",
        "toxicology",
        "carcinogenicity",
        "genotoxicity",
        "reproductive toxicity",
        "safety margin",
        "impurity",
        "ich m7"
      ],
      "guidanceRef": "ICH-M3-R2"
    },
    {
      "id": "gen-quality-consistency",
      "scope": "module",
      "instruction": "Ensure Module 3 is internally consistent and consistent with Module 5: the batches used in pivotal clinical trials must be identified and linked to the specification in force at the time; specifications must be justified with batch analysis data and stability; any formulation, site, or process change between clinical and commercial material must be accompanied by comparability or bioequivalence bridging; and the control strategy should be presented in ICH Q8/Q9/Q11 terms (CQAs, critical process parameters, risk assessment) with an established-conditions/lifecycle position per ICH Q12.",
      "severity": "major",
      "appliesTo": "3",
      "triggerKeywords": [
        "specification",
        "batch analysis",
        "stability",
        "control strategy",
        "bioequivalence",
        "formulation change",
        "established conditions"
      ],
      "guidanceRef": "ICH-Q8-Q9-Q10-Q11"
    },
    {
      "id": "gen-consistency-across-modules",
      "scope": "always",
      "instruction": "Run a numerical and terminological consistency check before any submission: subject counts, exposure figures, event counts, effect estimates, and cut-off dates must be identical wherever they appear across Modules 1, 2, 5, the RMP/REMS, and labeling. Use one data cut-off date per submission and state it prominently; where different studies have different cut-offs, label each explicitly. Use consistent product naming, dose expression, population definitions, and MedDRA version throughout.",
      "severity": "major",
      "appliesTo": "all",
      "triggerKeywords": [
        "consistency",
        "data cut-off",
        "subject counts",
        "discrepancy",
        "reconciliation",
        "medra version"
      ],
      "guidanceRef": "ICH-M4E-R2"
    },
    {
      "id": "gen-no-fabrication",
      "scope": "always",
      "instruction": "Never assert a clinical conclusion, numeric result, statistical outcome, or regulatory agreement that is not present in a source document. Where a value is required but unavailable, insert an explicit placeholder identifying the needed source (study number, table, meeting minutes) rather than an estimate. Regulatory agreements must be cited to the dated meeting minutes or written response, and any sponsor position that diverges from prior agency advice must be flagged and justified rather than silently changed.",
      "severity": "critical",
      "appliesTo": "all",
      "triggerKeywords": [
        "placeholder",
        "tbd",
        "agreement",
        "meeting minutes",
        "assumption",
        "estimate"
      ],
      "guidanceRef": "FDA-FORMAL-MEETINGS-2023"
    }
  ],
  "riskFactors": [
    "Refuse-to-File and validation risk from structural defects: missing or non-conformant study datasets, absent define.xml or reviewer's guides, incomplete Module 1 administrative content, or an application whose organization prevents review — these are independent of the scientific merit of the program.",
    "Internal inconsistency across modules: differing subject counts, event counts, cut-off dates, or effect estimates between Module 2 summaries, clinical study reports, the RMP/REMS, and labeling erodes reviewer confidence and generates cascades of information requests.",
    "Post hoc or shifting analyses: primary endpoint or analysis population changes after unblinding, unreported interim looks, or emphasis on unadjusted secondary endpoints invite a finding that the evidence is not persuasive.",
    "GCP and data-integrity findings: a single site with implausible data, systemic protocol deviations, or an inspection classification of Official Action Indicated can invalidate a substantial share of the dataset and delay or prevent approval.",
    "Inadequate safety database size or exposure duration for the intended chronic use relative to ICH E1, leaving uncommon but serious risks uncharacterized and forcing large postmarketing requirements or a restrictive label.",
    "Clinical pharmacology gaps — missing DDI, organ-impairment, QT, or exposure-response characterization — that translate directly into missing or overly conservative dosing instructions in labeling.",
    "Dose selection carried forward without optimization data, particularly where a lower dose might deliver comparable efficacy with better tolerability; increasingly a review issue across therapeutic areas, not only oncology.",
    "CMC-clinical disconnects: formulation, process, or site changes between pivotal trial material and commercial product without adequate bridging, and manufacturing facilities not inspection-ready at the time of the review clock.",
    "Population non-representativeness relative to the intended use population, with no Diversity Action Plan or pediatric plan alignment, constraining the label and drawing advisory-committee and payer criticism.",
    "Divergence from documented agency advice without justification, or reliance on informal or undocumented feedback — meeting minutes govern, and unrecorded understandings are not commitments.",
    "Regional divergence: a dossier optimized for FDA that lacks the EU RMP, PIP compliance check, environmental risk assessment, or the EU-specific quality and clinical annexes will fail EMA validation or draw Major Objections."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.5",
      "patterns": [
        "no benefit-risk",
        "benefit-risk not structured",
        "unmet need not characterized",
        "conclusion not supported",
        "overview restates summary",
        "no critical assessment"
      ],
      "description": "Clinical Overview reads as a restatement of the Clinical Summary rather than the sponsor's critical, integrated benefit-risk argument; key uncertainties and their management are not identified.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-BENEFIT-RISK-2023"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "multiplicity not controlled",
        "no testing hierarchy",
        "secondary endpoint claim",
        "p-value without adjustment",
        "post hoc presented as confirmatory",
        "alpha not allocated"
      ],
      "description": "Efficacy summary presents non-multiplicity-controlled or post hoc results in claim-like language, or fails to describe the alpha allocation and testing hierarchy including alpha spent at interim analyses.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-MULTIPLE-ENDPOINTS-2022"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "estimand not defined",
        "analysis differs from sap",
        "sap amended after unblinding",
        "population changed",
        "intercurrent events not specified",
        "pre-specification unclear"
      ],
      "description": "Estimand not stated in the five E9(R1) attributes, or the reported primary analysis differs from the pre-specified one with no dated reconciliation of SAP amendments relative to unblinding.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E9-R1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "pooling not justified",
        "no exposure-adjusted rates",
        "aesi not pre-specified",
        "smq not named",
        "hy's law not evaluated",
        "narratives missing",
        "discontinuations not tabulated"
      ],
      "description": "Integrated safety summary pools heterogeneous studies without justification, omits exposure-adjusted incidence where follow-up differs, lacks pre-specified AESI search strategies with named MedDRA queries, or omits the drug-induced liver injury / Hy's Law evaluation.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-ISS-ISE-2015"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "ddi not assessed",
        "renal impairment study missing",
        "hepatic impairment not evaluated",
        "qt not characterized",
        "exposure-response missing",
        "immunogenicity not reported",
        "food effect not studied"
      ],
      "description": "Clinical pharmacology package is incomplete without a documented justification — most often missing in vivo DDI or PBPK support, organ-impairment characterization, concentration-QTc analysis, or exposure-response analyses linking dose to the labeled benefit-risk.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-M12"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "missing data not addressed",
        "high dropout",
        "locf primary",
        "complete case analysis",
        "no sensitivity analysis",
        "imputation not justified"
      ],
      "description": "Missing data are not quantified by arm and reason, the primary analysis relies on a naive method, or no pre-specified sensitivity analyses under alternative missingness assumptions are presented.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E9-R1"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "protocol deviations not summarized",
        "site heterogeneity",
        "gcp compliance not stated",
        "financial disclosure missing",
        "foreign data applicability",
        "monitoring plan absent"
      ],
      "description": "GCP and conduct-quality documentation is thin: significant deviations not categorized or impact-assessed, no by-site consistency analysis, missing investigator financial disclosure, or no argument for the applicability of foreign clinical data to the US/EU population.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E6-R3"
    },
    {
      "ctdSection": "1.14.1",
      "patterns": [
        "label not traceable",
        "annotated label missing",
        "indication broader than studied",
        "numbers do not reconcile",
        "warning not supported",
        "dosing not justified"
      ],
      "description": "Proposed labeling contains statements without a traceable data source, an indication broader than the studied population or the endpoint met, or adverse-reaction tables that do not reconcile numerically with the integrated safety summary.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-PLR-2013"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "cdisc non-conformant",
        "define.xml missing",
        "adam traceability",
        "validation errors unexplained",
        "reviewer's guide absent",
        "legacy data conversion"
      ],
      "description": "Study data do not conform to the FDA Study Data Technical Conformance Guide: missing or incomplete define.xml, absent cSDRG/ADRG, unexplained validation rule failures, or ADaM datasets without traceability to SDTM and CRF.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-STUDY-DATA-TCG"
    },
    {
      "ctdSection": "2.6.7",
      "patterns": [
        "safety margin not calculated",
        "exposure multiple missing",
        "carcinogenicity waiver not justified",
        "reproductive toxicity gap",
        "impurity not qualified",
        "nonclinical duration insufficient"
      ],
      "description": "Nonclinical summary reports doses without exposure-based safety margins, omits or fails to justify waiver of a required study (carcinogenicity, DART, juvenile toxicity), or leaves impurities and degradants unqualified against ICH Q3A/Q3B/M7 limits.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-M3-R2"
    },
    {
      "ctdSection": "3.2.P.2",
      "patterns": [
        "formulation change not bridged",
        "clinical batches not identified",
        "no bioequivalence data",
        "specification not justified",
        "stability data insufficient",
        "commercial process not validated"
      ],
      "description": "Quality module does not link commercial product to the material used in pivotal trials: pivotal batches unidentified, formulation or process changes unbridged, or specifications set without batch-analysis and stability justification.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-Q8-Q9-Q10-Q11"
    },
    {
      "ctdSection": "1.16",
      "patterns": [
        "rmp inconsistent with label",
        "missing information not listed",
        "risk minimization not specified",
        "rems not justified",
        "postmarketing commitments not aligned"
      ],
      "description": "Risk management documentation does not reconcile with labeling and the postmarketing commitment table: risks identified in the RMP absent from Warnings and Precautions, or risk-minimization measures proposed without an effectiveness evaluation plan.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E2E"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "diversity action plan",
        "enrollment not representative",
        "pediatric plan not addressed",
        "geriatric data limited",
        "subgroup underpowered",
        "sex differences not analyzed"
      ],
      "description": "Population representativeness is not addressed: no Diversity Action Plan reference or enrollment-goal comparison, no pediatric plan status, insufficient geriatric or organ-impaired representation, or underpowered subgroup analyses presented as supportive evidence.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-DIVERSITY-ACTION-PLAN-2024"
    },
    {
      "ctdSection": "2.5.4",
      "patterns": [
        "dose not justified",
        "only one dose studied",
        "mtd-based selection",
        "no dose-response",
        "regimen not optimized",
        "titration not supported"
      ],
      "description": "Proposed dose and regimen are carried forward from earlier phases without a dose-response or exposure-response justification, or without evidence that a lower dose would not provide comparable benefit with better tolerability.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E4"
    },
    {
      "ctdSection": "1.6",
      "patterns": [
        "agreement not documented",
        "diverges from advice",
        "meeting minutes not cited",
        "commitment not tracked",
        "advice not implemented"
      ],
      "description": "The application diverges from documented agency advice without acknowledgment, or cites agreements that are not traceable to dated official meeting minutes or written responses.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-FORMAL-MEETINGS-2023"
    }
  ],
  "guidanceRefs": [
    {
      "code": "ICH-M4E-R2",
      "authority": "ICH",
      "title": "ICH M4E(R2): Revision of M4E Guideline on Enhancing the Format and Structure of Benefit-Risk Information in ICH E2 (Common Technical Document — Efficacy)",
      "why": "Defines the content, granularity, and length expectations for Modules 2.5 and 2.7, including the structured benefit-risk section of the Clinical Overview; the baseline reference for where content belongs and how summaries relate to source study reports."
    },
    {
      "code": "ICH-E9-R1",
      "authority": "ICH",
      "title": "ICH E9(R1): Statistical Principles for Clinical Trials — Addendum on Estimands and Sensitivity Analysis (2019), with the parent ICH E9 (1998)",
      "why": "Governs estimand definition, intercurrent-event strategies, analysis population selection, missing-data handling, and sensitivity analysis — the framework reviewers apply to every pivotal trial regardless of area."
    },
    {
      "code": "ICH-E6-R3",
      "authority": "ICH",
      "title": "ICH E6(R3): Good Clinical Practice (Step 4, 2025), superseding E6(R2)",
      "why": "The operative GCP standard: quality-by-design in protocol development, risk-proportionate monitoring, data governance and integrity across the data lifecycle, and sponsor/investigator responsibilities that the conduct sections of Module 5 must evidence."
    },
    {
      "code": "ICH-E8-R1",
      "authority": "ICH",
      "title": "ICH E8(R1): General Considerations for Clinical Studies (2021)",
      "why": "Sets expectations for quality by design, identification of critical-to-quality factors, study-type selection across the development program, and patient input — used to frame the development rationale in Module 2.5.1-2.5.3."
    },
    {
      "code": "ICH-M3-R2",
      "authority": "ICH",
      "title": "ICH M3(R2): Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization for Pharmaceuticals (with ICH S6(R1) for biotechnology-derived products)",
      "why": "Determines which nonclinical studies are required to support each clinical phase, duration, and population, and how safety margins should be expressed; the reference for justifying any omitted study in Module 2.4/2.6."
    },
    {
      "code": "ICH-E2E",
      "authority": "ICH",
      "title": "ICH E2E: Pharmacovigilance Planning, applied with EU GVP Module V (Risk Management Systems) and the FDA REMS framework",
      "why": "Defines the safety specification (identified risks, potential risks, missing information) and the pharmacovigilance plan that anchor the RMP, REMS, and postmarketing commitments, and that must reconcile with labeling."
    },
    {
      "code": "ICH-M12",
      "authority": "ICH",
      "title": "ICH M12: Drug Interaction Studies (Step 4, 2024)",
      "why": "Harmonized standard for in vitro enzyme and transporter evaluation, decision criteria for triggering in vivo studies, index perpetrators and substrates, PBPK use, and translation of DDI results into dosing recommendations in labeling."
    },
    {
      "code": "ICH-E14-S7B",
      "authority": "ICH",
      "title": "ICH E14 (Clinical Evaluation of QT/QTc Interval Prolongation) and ICH S7B, with the E14/S7B Q&As on concentration-QTc modeling and the double-negative nonclinical assessment",
      "why": "Determines whether a thorough QT study is required or whether a concentration-QTc analysis from early-phase data plus a qualifying nonclinical package suffices; drives the cardiac safety content of 2.7.2 and Section 12 of labeling."
    },
    {
      "code": "ICH-E1",
      "authority": "ICH",
      "title": "ICH E1: The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the baseline safety-database expectation (approximately 1,500 total exposed, 300-600 for 6 months, 100 for 12 months at the therapeutic dose) used to judge whether the exposure in 2.7.4 is adequate for a chronic-use indication."
    },
    {
      "code": "ICH-E17",
      "authority": "ICH",
      "title": "ICH E17: General Principles for Planning and Design of Multi-Regional Clinical Trials (2017)",
      "why": "Framework for regional allocation, pooling strategy, and evaluating consistency of treatment effect across regions — the basis for arguing that foreign clinical data are applicable to the US or EU population."
    },
    {
      "code": "ICH-E4",
      "authority": "ICH",
      "title": "ICH E4: Dose-Response Information to Support Drug Registration",
      "why": "Establishes that the application should characterize the dose-response relationship for both effectiveness and adverse effects; the reference underpinning any challenge to a dose carried forward without optimization data."
    },
    {
      "code": "ICH-Q8-Q9-Q10-Q11",
      "authority": "ICH",
      "title": "ICH Q8(R2) Pharmaceutical Development, Q9(R1) Quality Risk Management, Q10 Pharmaceutical Quality System, Q11 Development and Manufacture of Drug Substances, and Q12 Lifecycle Management",
      "why": "The quality framework used to present the control strategy — CQAs, critical process parameters, design space, risk assessment, and established conditions — and to justify specifications and post-approval change management in Module 3."
    },
    {
      "code": "FDA-SUBSTANTIAL-EVIDENCE-2019",
      "authority": "FDA",
      "title": "Demonstrating Substantial Evidence of Effectiveness for Human Drug and Biological Products — FDA (draft, December 2019), with Providing Clinical Evidence of Effectiveness (1998)",
      "why": "Defines when one adequate and well-controlled trial plus confirmatory evidence can substitute for two trials, what counts as confirmatory evidence, and the trial-quality attributes that make evidence persuasive — central to the argument in Module 2.5."
    },
    {
      "code": "FDA-BENEFIT-RISK-2023",
      "authority": "FDA",
      "title": "Benefit-Risk Assessment for New Drug and Biological Products — FDA, 2023",
      "why": "Describes the FDA Benefit-Risk Framework dimensions (analysis of condition, current treatment options, benefit, risk and risk management) that reviewers populate; sponsors mirror this structure so the assessment maps onto the review document."
    },
    {
      "code": "FDA-MULTIPLE-ENDPOINTS-2022",
      "authority": "FDA",
      "title": "Multiple Endpoints in Clinical Trials — FDA, October 2022 (final)",
      "why": "Standards for families of hypotheses, hierarchical and graphical multiplicity procedures, co-primary and composite endpoints, and the language permitted for endpoints outside the controlled family."
    },
    {
      "code": "FDA-ISS-ISE-2015",
      "authority": "FDA",
      "title": "Integrated Summaries of Effectiveness and Safety: Location Within the Common Technical Document — FDA (draft, 2015), with the FDA Premarketing Risk Assessment guidance",
      "why": "Clarifies where the integrated summaries live in the eCTD and what they must contain beyond the Module 2.7 summaries, including pooling strategy and the analyses expected in an integrated safety assessment."
    },
    {
      "code": "FDA-STUDY-DATA-TCG",
      "authority": "FDA",
      "title": "Study Data Technical Conformance Guide and the Data Standards Catalog (with Providing Regulatory Submissions in Electronic Format — Standardized Study Data)",
      "why": "Binding technical requirements for CDISC SDTM/ADaM/SEND submission, define.xml, reviewer's guides, and validation rules; non-conformance is a stated basis for Refuse-to-File."
    },
    {
      "code": "FDA-PLR-2013",
      "authority": "FDA",
      "title": "Labeling for Human Prescription Drug and Biological Products — Implementing the PLR Content and Format Requirements, with the Pregnancy and Lactation Labeling Rule guidances and Clinical Studies Section guidance",
      "why": "Governs the structure and evidentiary support for each labeling section, including what clinical trial results may be described and how; used to build the annotated label linking claims to data."
    },
    {
      "code": "FDA-DIVERSITY-ACTION-PLAN-2024",
      "authority": "FDA",
      "title": "Diversity Action Plans to Improve Enrollment of Participants from Underrepresented Populations in Clinical Studies — FDA (draft, June 2024), with the 2020 Enhancing the Diversity of Clinical Trial Populations guidance",
      "why": "Sets enrollment-goal setting, rationale, and reporting expectations for representativeness of the intended use population — required content for pivotal trial planning and discussed in Module 5.3.5.1 and 2.5."
    },
    {
      "code": "FDA-FORMAL-MEETINGS-2023",
      "authority": "FDA",
      "title": "Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products — FDA (2023, PDUFA VII)",
      "why": "Defines meeting types (Type A/B/B(EOP)/C/D and INTERACT), timelines, package content, and the status of official minutes as the record of agreement — the basis for citing agency advice in the dossier."
    },
    {
      "code": "FDA-EXPEDITED-PROGRAMS-2014",
      "authority": "FDA",
      "title": "Expedited Programs for Serious Conditions — Drugs and Biologics (FDA, 2014), with the FDORA-implementing accelerated approval guidance",
      "why": "Single reference for Fast Track, Breakthrough Therapy, Accelerated Approval, and Priority Review criteria, evidence expectations, and the confirmatory-trial and withdrawal provisions that shape the development plan and Module 1 content."
    },
    {
      "code": "EMA-MAA-PRESENTATION",
      "authority": "EMA",
      "title": "EMA pre-authorisation procedural advice and Notice to Applicants Volume 2B, with GVP Module V (Risk Management Systems) and the EU Clinical Trials Regulation 536/2014",
      "why": "Defines EU-specific dossier requirements — RMP, PIP compliance check, product information annexes, environmental risk assessment, and CTR transparency obligations — that a US-oriented dossier must be supplemented to meet."
    }
  ],
  "reviewerExpectations": [
    "The reviewer reads Module 2.5 as the sponsor's argument and expects it to state, in the first pages, the condition, unmet need, the trials constituting substantial evidence, the magnitude and clinical meaningfulness of the effect, the principal risks, and the residual uncertainties — not a chronological narrative of the program.",
    "Every number a reviewer can check will be checked: subject disposition, exposure, event counts, and effect estimates must reconcile exactly across Module 2, the CSRs, the datasets, the RMP, and the proposed label.",
    "Statistical reviewers verify that the reported primary analysis is the pre-specified one, examine the timing of SAP amendments relative to unblinding, and ask for all analyses performed — selective reporting is treated as a credibility issue, not a formatting issue.",
    "Safety reviewers independently re-derive rates from the submitted datasets; they expect the pooling rationale, MedDRA version, AESI definitions with named search strategies, and exposure-adjusted denominators to be stated so their derivation matches the sponsor's.",
    "Clinical pharmacology reviewers look for an exposure-response basis for the proposed dose and for every dose adjustment recommended in labeling, and will convert an absent DDI or organ-impairment study into a labeling limitation rather than approve the sponsor's proposed language.",
    "Reviewers assess the enrolled population against the intended use population and will narrow the indication, add a limitation of use, or require a postmarketing study when a subgroup relevant to real-world use is materially under-represented.",
    "The label is reviewed as a data-traceability exercise: an annotated label linking each statement to its source accelerates review, and unsupported statements are struck rather than negotiated.",
    "Project managers and regulatory project leads screen for filing completeness — Module 1 administrative documents, financial disclosure, data standards conformance, pediatric plan status — before the scientific review begins; defects here consume review-clock time.",
    "Reviewers cross-check the application against the minutes of prior meetings and will explicitly ask why agreed approaches were not followed; documented divergence with a rationale is acceptable, silent divergence is not.",
    "Inspection outcomes (clinical site, bioanalytical, and manufacturing) are part of the approval decision; reviewers expect the sponsor to have identified high-enrolling and high-risk sites and to have addressed any prior inspection findings in the submission.",
    "For EU submissions, the rapporteur expects the RMP, the PIP compliance statement, the SmPC/PL/labelling annexes, and the quality dossier to be internally consistent with the clinical evidence, and treats missing EU-specific components as validation failures rather than review issues."
  ],
  "pathwayHints": [
    {
      "pathway": "fast_track",
      "applicability": "Drug or biologic intended to treat a serious condition, with nonclinical or clinical data demonstrating the potential to address an unmet medical need, or designated as a qualified infectious disease product. Requestable with the IND or any time thereafter.",
      "impactedSections": [
        "1.2",
        "2.5"
      ],
      "reviewerNotes": "Confers more frequent meetings and written communication, and eligibility for rolling review if the agency agrees the development plan supports it. Practical value is procedural rather than evidentiary — it does not change the substantial-evidence standard. Document the designation letter and any rolling-review agreement in Module 1.2 and reflect the agreed submission sequence in the submission plan."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Serious condition plus preliminary clinical evidence indicating substantial improvement over available therapies on one or more clinically significant endpoints. Requires clinical, not merely nonclinical, evidence.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Brings intensive agency guidance from as early as Phase 1 and senior-manager involvement; sponsors should use it to agree the pivotal design, the primary endpoint, and the safety database size in writing. Compressed timelines make CMC readiness and manufacturing scale-up the binding constraint — plan process validation and stability accordingly."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Serious condition, meaningful advantage over available therapy, and an effect on a surrogate or intermediate clinical endpoint reasonably likely to predict clinical benefit.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.11",
        "1.14.1"
      ],
      "reviewerNotes": "Under FDORA the confirmatory trial should generally be underway at approval, with milestones and progress reporting; the application must present the surrogate's evidentiary basis (biological rationale plus epidemiologic or trial-level association) explicitly. Expect a narrowly framed indication tied to the surrogate, an enforceable postmarketing requirement, and exposure to the expedited withdrawal procedure if confirmation fails."
    },
    {
      "pathway": "priority_review",
      "applicability": "Requested at NDA/BLA submission where the product, if approved, would be a significant improvement in the safety or effectiveness of treatment, diagnosis, or prevention of a serious condition; also conferred by priority review vouchers.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "Shortens the review goal to six months from filing, which compresses the window for resolving information requests, completing facility inspections, and negotiating labeling. Submit a complete, inspection-ready application; late-cycle amendments can extend the goal date and forfeit the advantage."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "US: disease or condition affecting fewer than 200,000 persons in the United States, or where costs will not be recovered. EU: life-threatening or chronically debilitating condition with prevalence not more than 5 in 10,000, plus no satisfactory method or significant benefit over existing methods.",
      "impactedSections": [
        "1.2",
        "1.3",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Confers seven years (US) or ten years (EU) of market exclusivity, fee relief, and protocol-assistance benefits. EU designation must be maintained at the time of marketing authorization, requiring a defensible significant-benefit argument in the MAA. Orphan status does not lower the effectiveness standard, though it supports flexibility in trial size and design under the rare-disease framework."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME for medicines targeting an unmet need with preliminary clinical evidence of potential major therapeutic advantage; academic and SME applicants may apply on earlier nonclinical plus tolerability data.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Provides early appointment of a CHMP rapporteur, a kick-off meeting, and enhanced scientific advice at development milestones. Use it to align on the pivotal design and the EU-specific dossier components (RMP, PIP, quality) well before submission; it also supports a request for accelerated assessment, which is granted and retained only when the dossier is complete and uncontroversial."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU authorisation on less comprehensive data for seriously debilitating or life-threatening conditions, orphan medicines, or emergency-use situations, where the benefit of immediate availability outweighs the risk of incomplete data and comprehensive data can be provided later.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.4",
        "5.3.5.4"
      ],
      "reviewerNotes": "Carries binding specific obligations with deadlines, annual renewal, and a comprehensive RMP. Design the confirmatory evidence generation so the same studies satisfy any parallel FDA accelerated-approval confirmatory requirement, and state clearly in Module 2.5 which data are pending and when they will be delivered."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand for the primary and each key secondary endpoint using all five ICH E9(R1) attributes, and ensure the intercurrent-event strategies (treatment policy, hypothetical, composite, while-on-treatment, principal stratum) reflect the actual clinical question rather than analytic convenience; the primary analysis method must match the chosen estimand.",
    "Finalize and date the SAP before unblinding, register any amendment with its rationale and timing relative to database lock, and reconcile the reported analyses against the plan in the CSR; unplanned analyses must be labeled exploratory and reported alongside the planned ones.",
    "Pre-specify a multiplicity control strategy covering the entire confirmatory family — including multiple doses, multiple populations, co-primary and key secondary endpoints, and interim analyses — using a hierarchical, graphical, or closed-testing procedure with explicit alpha allocation and any recycling rules.",
    "Quantify missing data by arm and reason, state the primary missingness assumption and defend its plausibility clinically, and pre-specify sensitivity analyses under departures from it (control-based or jump-to-reference multiple imputation, delta-adjustment, tipping-point); avoid LOCF and complete-case as primary approaches.",
    "For group-sequential or adaptive designs, pre-specify the alpha-spending function, the adaptation rules, the firewall protecting trial integrity, and simulate operating characteristics; report every interim analysis conducted, who saw unblinded data, and any consequent changes, per the FDA adaptive-design guidance.",
    "Use non-inferiority designs only with a justified margin derived from historical evidence of the active control's effect (constancy and assay sensitivity arguments documented), pre-specify both the ITT and per-protocol analyses, and interpret concordance between them as part of the conclusion.",
    "Report effect estimates with confidence intervals and the clinically meaningful threshold used to interpret them; a statistically significant result should be accompanied by an argument for clinical meaningfulness, ideally anchored to a within-patient meaningful change estimate for patient-reported outcomes.",
    "Treat subgroup analyses as consistency checks: pre-specify the subgroups of regulatory interest (age, sex, race/ethnicity, region, disease severity, relevant genotype), display forest plots with interaction tests interpreted cautiously, and do not build claims on post hoc subgroups.",
    "For multiregional trials, pre-specify the regional allocation and the approach to assessing consistency of treatment effect per ICH E17, and avoid regional sample sizes so small that consistency evaluation is uninformative.",
    "Justify safety analyses methodologically as well: state the analysis population and denominators, use exposure-adjusted incidence when follow-up differs materially, pre-specify AESI definitions and search algorithms, and use time-to-event methods for events with long latency rather than crude proportions.",
    "Document software, versions, and the reproducibility path from raw data through SDTM and ADaM to each reported result; reviewers routinely attempt to reproduce key analyses and unexplained discrepancies become information requests.",
    "Where Bayesian, borrowing, or model-based approaches are used, pre-specify the prior, the borrowing mechanism, and the simulated operating characteristics including behavior under prior-data conflict, and provide a frequentist-interpretable summary of the operating characteristics for the reviewer."
  ],
  "endpointConsiderations": [
    "The primary endpoint must be pre-specified, clinically meaningful (mortality, morbidity, how a patient feels, functions, or survives) or a surrogate with a documented basis, measured with a validated and standardized instrument, and assessed identically across arms and sites.",
    "Surrogate endpoints require an explicit justification chain — biological rationale, epidemiologic association, and ideally trial-level evidence that treatment effect on the surrogate predicts effect on outcome; the FDA Surrogate Endpoint Table indicates which surrogates have precedent for full versus accelerated approval in a given context and should be consulted before adopting one.",
    "Composite endpoints must have components of comparable clinical importance and be pre-specified with adjudication by a blinded independent committee using a charter; report each component separately so the reviewer can see whether the effect is driven by the least important component.",
    "Clinical outcome assessments (patient-reported, clinician-reported, observer-reported, performance outcomes) must be fit for purpose for the specific context of use per the FDA PFDD guidance series: documented content validity in the target population, appropriate recall period and administration mode, established reliability and ability to detect change, and a pre-specified responder definition anchored to meaningful within-patient change.",
    "Time-to-event endpoints require pre-specified censoring rules, a defined assessment schedule to limit interval-censoring and ascertainment bias, and — in open-label trials — blinded independent central review for subjective components; report median follow-up by reverse Kaplan-Meier.",
    "Blinded outcome assessment is expected wherever the endpoint has any subjective element; where blinding is impossible, describe the specific bias-mitigation measures (central reading, objective components, blinded adjudication) and address residual bias in the limitations.",
    "Endpoints intended to support labeling claims must be inside the multiplicity-controlled family; endpoints outside it can describe the data but cannot support a claim, and Module 2.7.3 language must respect that boundary.",
    "For safety, pre-specify adverse events of special interest based on class effects, mechanism, and nonclinical findings, with the MedDRA search strategy (preferred terms or a named standardized query) fixed in advance so that incidence rates are not the product of a post hoc term selection.",
    "Health-economic, quality-of-life, and other endpoints intended for payers should be collected with the same rigor as regulatory endpoints if they may appear in labeling or promotional material; otherwise designate them clearly as exploratory.",
    "When adopting a novel endpoint, pursue early agency alignment (Type C meeting, COA qualification, or biomarker qualification under ICH E15/E16 and the FDA drug development tool programs) and document that alignment in Module 1.6 and 2.5 rather than defending the endpoint for the first time at submission."
  ],
  "retrievalKeywords": [
    "common technical document",
    "ctd",
    "ectd",
    "module 2.5",
    "clinical overview",
    "clinical summary",
    "substantial evidence",
    "adequate and well-controlled",
    "confirmatory evidence",
    "benefit-risk framework",
    "estimand",
    "intercurrent event",
    "statistical analysis plan",
    "pre-specification",
    "multiplicity",
    "alpha spending",
    "hierarchical testing",
    "missing data",
    "tipping point analysis",
    "multiple imputation",
    "non-inferiority margin",
    "adaptive design",
    "interim analysis",
    "group sequential",
    "integrated summary of safety",
    "integrated summary of effectiveness",
    "iss",
    "ise",
    "pooling strategy",
    "exposure-adjusted incidence",
    "adverse events of special interest",
    "standardized meddra query",
    "hy's law",
    "drug-induced liver injury",
    "ich e1 exposure",
    "safety database size",
    "pharmacokinetics",
    "exposure-response",
    "drug-drug interaction",
    "pbpk",
    "renal impairment",
    "hepatic impairment",
    "qt prolongation",
    "concentration-qtc",
    "immunogenicity",
    "anti-drug antibody",
    "dose optimization",
    "dose-response",
    "good clinical practice",
    "ich e6(r3)",
    "protocol deviation",
    "risk-based monitoring",
    "data integrity",
    "financial disclosure",
    "foreign clinical data",
    "multiregional clinical trial",
    "cdisc",
    "sdtm",
    "adam",
    "define.xml",
    "study data technical conformance",
    "refuse to file",
    "annotated labeling",
    "prescribing information",
    "plr format",
    "pregnancy and lactation labeling",
    "risk management plan",
    "rems",
    "pharmacovigilance plan",
    "missing information",
    "postmarketing requirement",
    "diversity action plan",
    "pediatric study plan",
    "pip",
    "geriatric population",
    "subgroup analysis",
    "surrogate endpoint",
    "clinical outcome assessment",
    "patient-reported outcome",
    "meaningful within-patient change",
    "blinded independent central review",
    "adjudication charter",
    "nonclinical safety margin",
    "carcinogenicity",
    "reproductive toxicity",
    "ich m7",
    "impurity qualification",
    "control strategy",
    "specification justification",
    "comparability",
    "bioequivalence bridging",
    "formal meeting",
    "type b meeting",
    "meeting minutes",
    "expedited programs"
  ]
};

export default otherProfile;
