/**
 * Vaccines and Related Biological Products (Preventive and Therapeutic) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/vaccines
 */
import type { TherapeuticAreaProfile } from './types.js';

export const vaccinesProfile: TherapeuticAreaProfile = {
  "id": "vaccines",
  "displayName": "Vaccines and Related Biological Products (Preventive and Therapeutic)",
  "description": "Regulatory profile for preventive and therapeutic vaccine development regulated in the US by CBER's Office of Vaccines Research and Review (BLA under section 351 of the PHS Act) and in the EU by EMA/CHMP with the Vaccine Working Party. Covers immunogenicity- and efficacy-based licensure, correlates and immunobridging, lot-to-lot consistency, adjuvant and platform-specific considerations (protein subunit, conjugate, viral vector, mRNA/LNP, live attenuated), potency and stability of biological drug substance/product, safety follow-up including solicited reactogenicity and adverse events of special interest, pregnancy and pediatric age de-escalation, and post-licensure pharmacovigilance and effectiveness commitments.",
  "contextRules": [
    {
      "id": "vac-immunogenicity-assays",
      "scope": "section",
      "instruction": "Provide a complete immunoassay validation package for every assay supporting a licensure endpoint: functional assays (serum bactericidal assay, opsonophagocytic killing assay, plaque/microneutralization, hemagglutination inhibition) and binding assays (ELISA, multiplex). Document specificity, precision (intra/inter-assay, operator, day), linearity, accuracy/trueness against an international standard where one exists (e.g., WHO International Standard), LLOQ/ULOQ, robustness, sample stability, bridging between assay versions and between laboratories, and the qualification of any reference serum panel. State the pre-specified assay cut-point/threshold and how it was derived.",
      "severity": "critical",
      "appliesTo": "5.3.5.4",
      "triggerKeywords": [
        "assay validation",
        "SBA",
        "OPA",
        "microneutralization",
        "hemagglutination inhibition",
        "international standard",
        "LLOQ",
        "bridging",
        "reference panel"
      ],
      "guidanceRef": "FDA-2018-D-1214"
    },
    {
      "id": "vac-immunobridging",
      "scope": "section",
      "instruction": "Where licensure rests on immunobridging rather than clinical disease endpoints, state in the Clinical Overview the immunologic basis: the correlate or surrogate of protection and its supporting evidence, the comparator (licensed vaccine, prior age group, or prior strain), the co-primary non-inferiority criteria on both GMT ratio and seroresponse rate difference with their pre-specified margins (commonly a 1.5-fold GMT margin and a 10-percentage-point seroresponse margin), and the justification that the immune response measured is mechanistically relevant to protection.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "immunobridging",
        "correlate of protection",
        "GMT ratio",
        "seroresponse",
        "seroconversion",
        "non-inferiority margin",
        "surrogate endpoint"
      ],
      "guidanceRef": "EMA/CHMP/VWP/164653/2005"
    },
    {
      "id": "vac-lot-consistency",
      "scope": "section",
      "instruction": "Include a lot-to-lot consistency study using three consecutively manufactured commercial-scale lots, with pre-specified equivalence bounds on the GMT ratio for each pairwise lot comparison (commonly two-sided 95% CI for each ratio within 0.67-1.5) for every antigen and serotype. Confirm the lots are representative of the intended commercial process, scale and site, and cross-reference Module 3 for the manufacturing description of those lots.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "lot consistency",
        "lot-to-lot",
        "three consecutive lots",
        "equivalence bounds",
        "GMT ratio",
        "commercial scale"
      ],
      "guidanceRef": "EMA/CHMP/VWP/164653/2005"
    },
    {
      "id": "vac-safety-database",
      "scope": "section",
      "instruction": "Describe the safety database against the expected size for a preventive vaccine in healthy individuals: generally at least 3,000 subjects exposed to the intended dose and formulation for a common indication, with solicited local and systemic reactogenicity captured on a diary card for 7 days, unsolicited adverse events for 28-30 days, serious adverse events and adverse events of special interest for at least 6 months post-final dose (12 months for novel platforms/adjuvants). Present reactogenicity by dose, age stratum, and baseline serostatus, and define and analyze AESIs (including immune-mediated conditions and platform-specific risks such as myocarditis/pericarditis, Guillain-Barre syndrome, intussusception, vaccine-associated enhanced disease).",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "solicited adverse events",
        "reactogenicity",
        "diary card",
        "adverse events of special interest",
        "AESI",
        "myocarditis",
        "Guillain-Barre",
        "enhanced disease",
        "safety database size"
      ],
      "guidanceRef": "FDA-1997-D-0250"
    },
    {
      "id": "vac-potency-and-stability",
      "scope": "module",
      "instruction": "Establish a potency assay that is stability-indicating and, where feasible, reflects the mechanism of protection (in vivo or validated in vitro relative potency). Provide the control strategy for the drug substance and drug product, adjuvant characterization and antigen-adjuvant adsorption/association where applicable, container-closure and preservative (multidose) justification with antimicrobial effectiveness testing, real-time and accelerated stability supporting the shelf life and the in-use period, and thermal excursion data supporting cold-chain claims. Reference the comparability protocol for any process or site change.",
      "severity": "critical",
      "appliesTo": "3",
      "triggerKeywords": [
        "potency assay",
        "relative potency",
        "stability-indicating",
        "adjuvant adsorption",
        "antimicrobial effectiveness",
        "cold chain",
        "shelf life",
        "comparability"
      ],
      "guidanceRef": "ICH Q5C"
    },
    {
      "id": "vac-nonclinical",
      "scope": "module",
      "instruction": "Provide the nonclinical package appropriate to a vaccine: immunogenicity and, where a model exists, protection in a relevant animal model; repeat-dose toxicity study in a relevant species using the clinical route, full human dose and an N+1 dosing schedule with a recovery period and local tolerance assessment; biodistribution for viral vector and nucleic-acid platforms; and a developmental and reproductive toxicity (DART) study when the target population includes women of childbearing potential or pregnant women. Address adjuvant-specific toxicology and, for novel adjuvants, characterize the adjuvant independently.",
      "severity": "major",
      "appliesTo": "4",
      "triggerKeywords": [
        "repeat-dose toxicity",
        "N+1 dosing",
        "local tolerance",
        "biodistribution",
        "DART",
        "novel adjuvant",
        "animal protection model",
        "challenge model"
      ],
      "guidanceRef": "WHO TRS 927 Annex 1"
    },
    {
      "id": "vac-pediatric-de-escalation",
      "scope": "module",
      "instruction": "Describe the age de-escalation strategy explicitly: staged enrollment from adults to adolescents to progressively younger children with pre-specified safety review committee gates, dose/formulation selection per age group, concomitant-use studies with routine childhood immunizations demonstrating non-interference for both the investigational and the co-administered vaccine antigens, and the maternal-immunization strategy where relevant. Document PIP/PSP alignment.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "age de-escalation",
        "concomitant administration",
        "co-administration",
        "non-interference",
        "routine immunization",
        "maternal immunization",
        "PIP",
        "PSP"
      ],
      "guidanceRef": "ICH E11(R1)"
    },
    {
      "id": "vac-postlicensure",
      "scope": "section",
      "instruction": "Include the pharmacovigilance plan and, where required, the Risk Management Plan: routine and enhanced passive surveillance, planned post-licensure effectiveness or safety studies (including active surveillance in linked databases), pregnancy exposure registry, lot traceability, and any commitments on long-term follow-up for novel platforms. Align the US Postmarketing Requirements/Commitments with the EU RMP so the two are not inconsistent.",
      "severity": "major",
      "appliesTo": "1.14",
      "triggerKeywords": [
        "risk management plan",
        "pharmacovigilance",
        "post-licensure",
        "pregnancy registry",
        "effectiveness study",
        "traceability",
        "PMR",
        "PMC"
      ],
      "guidanceRef": "EMA/838713/2011"
    },
    {
      "id": "vac-always-terminology",
      "scope": "always",
      "instruction": "Use consistent immunologic terminology and units throughout: define seroconversion, seroresponse, seroprotection and their thresholds once and apply them identically across Modules 2 and 5 and the proposed labeling; express titers in the units of the referenced international standard; and keep antigen/serotype nomenclature, strain designations, dose expressed as antigen content per dose, and schedule descriptions identical across the CTD and the package insert.",
      "severity": "major",
      "triggerKeywords": [
        "seroconversion",
        "seroprotection",
        "seroresponse",
        "GMT",
        "titer units",
        "serotype",
        "strain designation",
        "antigen content"
      ]
    }
  ],
  "riskFactors": [
    "Absence of an accepted correlate of protection for the target disease, forcing an expensive and slow disease-endpoint efficacy trial or an immunobridging argument the Agency may not accept.",
    "Immunoassay not adequately validated, not standardized against an international standard, or changed mid-program without a documented bridging study — undermining every immunogenicity conclusion.",
    "Lot-to-lot consistency lots not manufactured at commercial scale, site or process, requiring repetition or additional comparability data late in development.",
    "Safety database too small or with too short a follow-up for a product given to healthy people, particularly infants, pregnant women or the elderly; inadequate characterization of AESIs for the platform.",
    "Reactogenicity profile that erodes the benefit-risk in a low-incidence disease setting, or a rare serious event (myocarditis, GBS, intussusception, thrombosis with thrombocytopenia) detected too late to characterize before licensure.",
    "Vaccine-associated enhanced disease signal or theoretical concern (respiratory syncytial virus, dengue, coronaviruses) not addressed in nonclinical models or in the clinical monitoring plan.",
    "Potency assay that is not stability-indicating or not mechanistically relevant, leading to an unapprovable control strategy or an unsupportable shelf life.",
    "Interference in co-administration studies with routine immunizations, resulting in restrictive labeling or additional studies.",
    "Manufacturing changes (scale-up, new facility, new adjuvant lot, new cell bank) introduced after pivotal lots without a pre-agreed comparability protocol.",
    "Divergent US and EU expectations on endpoint definitions, seroresponse thresholds or the size of the safety database, producing two non-interchangeable datasets.",
    "Effectiveness that wanes or is strain-dependent, requiring booster or strain-change strategies that were not built into the development plan or the regulatory framework."
  ],
  "commonGaps": [
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "assay not validated",
        "no international standard",
        "bridging study not performed",
        "cut-point derived post hoc",
        "inter-laboratory variability not",
        "assay transfer not qualified"
      ],
      "description": "Immunoassay validation incomplete: missing precision/robustness components, no international standard calibration, no inter-laboratory or assay-version bridging, or a cut-point derived post hoc.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-2018-D-1214"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "no correlate of protection",
        "gmt only criterion",
        "seroresponse criterion missing",
        "margin not pre-specified",
        "bridging population not justified",
        "surrogate not validated"
      ],
      "description": "Immunobridging argument lacks a defensible correlate of protection, uses only a GMT criterion without seroresponse, or applies margins that were not pre-specified or not agreed with the Agency.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/VWP/164653/2005"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "lot consistency not demonstrated",
        "non-commercial scale lots",
        "serotype excluded from consistency",
        "equivalence bound exceeded",
        "only two lots"
      ],
      "description": "Lot consistency study missing, uses non-commercial-scale lots, omits some antigens/serotypes, or fails equivalence bounds for one pairwise comparison without an adequate explanation.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/VWP/164653/2005"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "safety database too small",
        "follow-up less than 6 months",
        "aesi not pre-defined",
        "brighton case definition not used",
        "reactogenicity not stratified",
        "solicited events not collected"
      ],
      "description": "Safety database below expectations for the target population, follow-up shorter than 6 months post-final dose, AESIs not pre-defined with case definitions, or reactogenicity not presented by age and dose.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-1997-D-0250"
    },
    {
      "ctdSection": "3.2.S.4",
      "patterns": [
        "potency assay not stability-indicating",
        "reference standard not qualified",
        "adjuvant not characterized",
        "adsorption not controlled",
        "no potency specification justification"
      ],
      "description": "Potency assay not stability-indicating or not linked to the mechanism of protection; reference standard qualification and lifecycle plan absent; adjuvant characterization or antigen-adjuvant association not controlled.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH Q5C"
    },
    {
      "ctdSection": "4.2.3",
      "patterns": [
        "no biodistribution study",
        "toxicity study not clinical route",
        "n+1 dosing not used",
        "local tolerance not assessed",
        "dart study missing",
        "novel adjuvant toxicology absent"
      ],
      "description": "Nonclinical package missing elements expected for the platform: no biodistribution for vector/nucleic-acid vaccines, repeat-dose toxicity not using clinical route/full human dose/N+1 schedule, no local tolerance, or DART absent despite inclusion of women of childbearing potential.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "WHO TRS 927 Annex 1"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "co-administration not studied",
        "interference not assessed",
        "one-directional non-inferiority",
        "routine vaccine antigens not measured"
      ],
      "description": "Concomitant-administration data missing for vaccines intended for routine schedules, or non-interference assessed only in one direction (investigational vaccine but not the co-administered antigens).",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E11(R1)"
    },
    {
      "ctdSection": "1.14",
      "patterns": [
        "rmp missing",
        "no post-licensure effectiveness study",
        "pregnancy registry not proposed",
        "active surveillance not planned",
        "traceability not addressed"
      ],
      "description": "Pharmacovigilance/RMP does not address platform-specific risks, lacks an active surveillance or effectiveness study proposal, or omits a pregnancy exposure registry for a vaccine likely to be used in pregnancy.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA/838713/2011"
    },
    {
      "ctdSection": "3.2.A.2",
      "patterns": [
        "adventitious agent testing incomplete",
        "cell bank not characterized",
        "viral seed not qualified",
        "tse risk assessment missing",
        "animal-derived materials not documented"
      ],
      "description": "Adventitious agent safety evaluation incomplete: cell bank and viral seed characterization, TSE/BSE risk assessment for animal-derived materials, or viral clearance/inactivation justification not provided.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH Q5A(R2)"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "baseline serostatus not analyzed",
        "strain-specific efficacy not",
        "case definition not adjudicated",
        "endpoint committee not blinded",
        "age subgroup efficacy missing"
      ],
      "description": "Efficacy analyses do not present results by baseline serostatus, age stratum, or circulating strain/serotype, and case definitions for the disease endpoint were not adjudicated by a blinded committee.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-1997-D-0250"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-1997-D-0250",
      "authority": "FDA",
      "title": "Guidance for Industry: Considerations for Plasmid DNA Vaccines for Infectious Disease Indications / and the companion FDA guidance 'Clinical Data Needed to Support the Licensure of Preventive Infectious Disease Vaccines'",
      "why": "CBER's core statement of clinical evidence expectations for preventive vaccines — safety database size, solicited/unsolicited event collection windows, efficacy trial design and immunogenicity endpoints — and platform-specific expectations for nucleic-acid constructs."
    },
    {
      "code": "FDA-2018-D-1214",
      "authority": "FDA",
      "title": "Bioanalytical Method Validation (Guidance for Industry) and CBER expectations for immunogenicity assay validation",
      "why": "Establishes the validation parameters sponsors must document for the functional and binding immunoassays that generate the pivotal immunogenicity data and any assay bridging."
    },
    {
      "code": "EMA/CHMP/VWP/164653/2005",
      "authority": "EMA",
      "title": "Guideline on Clinical Evaluation of New Vaccines",
      "why": "EU reference for immunogenicity endpoint definitions, immunobridging and non-inferiority criteria, lot-to-lot consistency design, co-administration studies and efficacy trial expectations."
    },
    {
      "code": "EMA/CHMP/VWP/141697/2009",
      "authority": "EMA",
      "title": "Guideline on the Clinical Evaluation of Vaccines — Adjuvants and Adjuvanted Vaccines (Guideline on Adjuvants in Vaccines for Human Use)",
      "why": "Governs justification of adjuvant selection and dose, adjuvant-specific nonclinical and clinical data, and the reactogenicity/immunogenicity trade-off argument."
    },
    {
      "code": "ICH Q5A(R2)",
      "authority": "ICH",
      "title": "Viral Safety Evaluation of Biotechnology Products Derived from Cell Lines of Human or Animal Origin",
      "why": "Framework for cell bank characterization, adventitious agent testing and viral clearance that underpins Module 3 safety of biologically derived vaccine substances."
    },
    {
      "code": "ICH Q5C",
      "authority": "ICH",
      "title": "Quality of Biotechnological Products: Stability Testing of Biotechnological/Biological Products",
      "why": "Basis for the stability protocol, stability-indicating potency assay, shelf-life and in-use period justification, and thermal excursion support for cold-chain distribution."
    },
    {
      "code": "ICH Q5E",
      "authority": "ICH",
      "title": "Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process",
      "why": "Defines the comparability exercise required when the process, scale or site changes between clinical and commercial lots — a frequent late-stage vaccine issue."
    },
    {
      "code": "WHO TRS 927 Annex 1",
      "authority": "WHO",
      "title": "WHO Guidelines on Nonclinical Evaluation of Vaccines",
      "why": "Internationally accepted expectations for vaccine nonclinical design: relevant species selection, N+1 repeat-dose toxicity with clinical route and full human dose, local tolerance, biodistribution and DART."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Supports the age de-escalation plan, pediatric formulation and dosing strategy, and the PSP/PIP content for vaccines intended for routine childhood schedules."
    },
    {
      "code": "EMA/838713/2011",
      "authority": "EMA",
      "title": "Guideline on Good Pharmacovigilance Practices (GVP) Product- or Population-Specific Considerations I: Vaccines for Prophylaxis Against Infectious Diseases",
      "why": "Sets EU expectations for the vaccine Risk Management Plan, enhanced passive and active surveillance, effectiveness studies, lot traceability and pregnancy exposure follow-up."
    }
  ],
  "reviewerExpectations": [
    "A clear statement of the immunologic basis for licensure — correlate of protection with its evidentiary support, or a disease-endpoint efficacy trial — and consistency between that basis and the endpoints actually analyzed.",
    "Fully validated, standard-calibrated immunoassays with documented bridging across assay versions and laboratories, and a reference serum panel that the reviewer can trace.",
    "Lot-to-lot consistency demonstrated on three consecutive commercial-scale lots against pre-specified equivalence bounds for every antigen or serotype in the product.",
    "A safety database sized and followed appropriately for a product administered to healthy people, with pre-specified AESIs using standardized case definitions (e.g., Brighton Collaboration) and blinded adjudication.",
    "Reactogenicity presented by age stratum, dose number and baseline serostatus, with a benefit-risk narrative that acknowledges the healthy-recipient context and the background incidence of the target disease.",
    "A stability-indicating, mechanistically relevant potency assay with a justified specification, plus a control strategy that ties drug substance, adjuvant, formulation and container closure together.",
    "Explicit handling of manufacturing changes across the program with an ICH Q5E comparability argument linking clinical lots to the commercial process.",
    "Co-administration and concomitant-use data adequate to support the intended schedule position, assessed bidirectionally.",
    "A pharmacovigilance plan proportionate to the platform novelty and the target population, with concrete post-licensure effectiveness and safety study proposals and a pregnancy strategy.",
    "Labeling that states the immunogenicity thresholds, the schedule, the age indication and the limitations of the effectiveness data in language traceable to the submitted analyses."
  ],
  "pathwayHints": [
    {
      "pathway": "accelerated_approval",
      "applicability": "Available where a vaccine's effectiveness is shown on an immune-response surrogate reasonably likely to predict clinical benefit and a disease-endpoint efficacy trial is infeasible or unethical — including the Animal Rule pathway for vaccines against agents where human challenge or field efficacy trials cannot be conducted.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "Reviewers require a well-characterized animal model with a defined immune marker and a bridging argument to humans; a confirmatory post-licensure effectiveness study is expected and should be designed before approval."
    },
    {
      "pathway": "priority_review",
      "applicability": "Applies where the vaccine addresses a serious condition and would provide significant improvement over available preventive options, including outbreak and emerging-pathogen settings.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "Compressed review timelines make the completeness of the CMC/potency and immunoassay validation packages decisive; sponsors should have facility readiness and pre-license inspection scheduling resolved early."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Relevant to therapeutic vaccines and to preventive vaccines for serious conditions where preliminary clinical evidence indicates substantial improvement over available prophylaxis.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect intensive interaction on immunogenicity endpoints and manufacturing scale-up in parallel with clinical development; CMC readiness is usually the rate-limiting step."
    },
    {
      "pathway": "fast_track",
      "applicability": "Available for vaccines addressing serious conditions with unmet prevention need; supports rolling BLA submission and more frequent Agency meetings.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Rolling review is valuable for vaccines because Module 3 and Module 4 can be submitted while long-term safety follow-up accrues, but the sponsor must control version consistency across rolling components."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME eligibility for vaccines addressing an unmet public-health need with early evidence of potential to bring major therapeutic advantage, notably emerging-pathogen and antimicrobial-resistance-adjacent vaccines.",
      "impactedSections": [
        "2.5",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "PRIME brings a rapporteur appointed early and iterative scientific advice; sponsors should use it to align immunobridging criteria and RMP scope before pivotal trial start."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU pathway for vaccines addressing seriously debilitating or life-threatening diseases or emergency situations where comprehensive data are not yet available but the benefit of immediate availability outweighs the risk of less complete data.",
      "impactedSections": [
        "2.5",
        "2.7.4",
        "1.14"
      ],
      "reviewerNotes": "Requires specific obligations with defined timelines — typically completion of the efficacy trial, longer-term safety follow-up and effectiveness studies — reviewed annually for renewal."
    }
  ],
  "statisticalConsiderations": [
    "Specify the estimand for immunogenicity endpoints per ICH E9(R1): the per-protocol immunogenicity population is usually primary for immunobridging, with intercurrent events (protocol deviations, missing post-vaccination samples, intercurrent infection changing serostatus) handled by pre-specified rules and supported by an ITT sensitivity analysis.",
    "Analyze GMTs on the log-transformed scale using ANCOVA adjusted for baseline titer, age stratum and site, and report the geometric mean ratio with a two-sided 95% CI compared against the pre-specified non-inferiority bound; report seroresponse as a difference in proportions with an exact or Miettinen-Nurminen CI.",
    "Where both a GMT-ratio and a seroresponse-difference criterion apply, both must be met (an intersection-union test) — this requires no multiplicity adjustment but drives the sample size; extend the same logic across multiple serotypes and pre-specify whether all serotypes or a defined subset must succeed.",
    "Control family-wise error across serotypes, age cohorts, dose levels and co-primary endpoints with a pre-specified hierarchical or graphical procedure, and pre-specify the success criteria for multi-valent vaccines including any allowance for a limited number of serotype failures with justification.",
    "For disease-endpoint efficacy trials, pre-specify the vaccine efficacy definition (1 - relative risk or 1 - hazard ratio), the lower bound of the CI required for success (commonly >30% with a point estimate of at least 50% for novel preventive vaccines), the case-driven analysis timing, and the surveillance period; use exact conditional or Poisson-based methods for small case counts.",
    "Pre-specify group-sequential interim analyses with an alpha-spending function for case-driven efficacy trials, define the independent data monitoring committee charter, and define stopping rules for efficacy, futility and safety — including the handling of unblinding after an interim efficacy success.",
    "Handle missing immunogenicity samples and missing diary-card reactogenicity data transparently: report completion rates, avoid single imputation for titers, and pre-specify multiple-imputation or tipping-point sensitivity analyses when missingness exceeds a defined threshold.",
    "For lot consistency, apply equivalence testing pairwise across all three lots with a pre-specified two-sided 95% CI bound on each GMT ratio; power the study for all pairwise comparisons and all antigens simultaneously.",
    "Pre-specify safety analyses including exposure-adjusted incidence rates, observed-versus-expected analyses for AESIs against a defensible background incidence source, and the age- and sex-stratified presentation required for labeling."
  ],
  "endpointConsiderations": [
    "Disease-endpoint vaccine efficacy: laboratory-confirmed, protocol-defined and blindly adjudicated cases, with efficacy expressed as 1 minus the relative risk or hazard ratio and success defined by the lower bound of the 95% CI; caveat is that efficacy is strain-, season- and setting-dependent and may not transport across epidemiologic contexts.",
    "Correlate-of-protection-based immunogenicity: a titer threshold with established mechanistic and epidemiologic support (e.g., anti-PRP antibody for Haemophilus influenzae type b, serum bactericidal titer for meningococcal vaccines, anti-HAV and anti-HBs thresholds, tetanus/diphtheria antitoxin levels) — caveat is that thresholds established for one assay or population may not transfer to another assay or age group.",
    "Seroresponse/seroconversion rate: a defined fold-rise from baseline (commonly 4-fold) or attainment of a threshold in initially seronegative subjects; caveat is heavy dependence on baseline serostatus and assay LLOQ, which must be pre-specified.",
    "Geometric mean titer/concentration ratio versus a licensed comparator: the standard immunobridging metric, with a typical 1.5-fold non-inferiority margin; caveat is that GMT alone can mask a subgroup that fails to respond, which is why a seroresponse criterion is required alongside.",
    "Functional antibody endpoints (opsonophagocytic killing, serum bactericidal activity with human complement, neutralizing antibody titers) are preferred over binding antibody where the mechanism of protection is functional; caveat is assay complexity, limited standardization and inter-laboratory variability.",
    "Cell-mediated immunity endpoints (antigen-specific T-cell responses by ICS or ELISpot) are supportive rather than primary for most preventive vaccines and are more central for therapeutic vaccines; caveat is the absence of validated thresholds of protection.",
    "Duration of protection and persistence: antibody persistence at 6, 12, 24 months and beyond, with booster response as evidence of immune memory; caveat is that persistence data are usually generated post-licensure and drive schedule changes.",
    "Reactogenicity endpoints: solicited local (pain, erythema, swelling) and systemic (fever, fatigue, myalgia, headache) events over 7 days with pre-defined grading scales; caveat is the need for a uniform toxicity grading scale across studies and age groups.",
    "For therapeutic vaccines, clinical endpoints (disease progression, event rate, overall survival for oncology-adjacent products) rather than immunogenicity are typically required; immunologic response alone has repeatedly failed to predict clinical benefit."
  ],
  "retrievalKeywords": [
    "vaccine immunogenicity",
    "correlate of protection",
    "immunobridging",
    "geometric mean titer",
    "gmt ratio",
    "seroconversion",
    "seroresponse",
    "seroprotection threshold",
    "opsonophagocytic killing assay",
    "serum bactericidal assay",
    "microneutralization",
    "hemagglutination inhibition",
    "lot-to-lot consistency",
    "three consecutive lots",
    "adjuvant",
    "aluminum adjuvant",
    "as01",
    "mrna lipid nanoparticle",
    "viral vector vaccine",
    "live attenuated",
    "potency assay",
    "relative potency",
    "stability-indicating",
    "adventitious agents",
    "cell bank characterization",
    "solicited adverse events",
    "reactogenicity diary",
    "adverse events of special interest",
    "brighton collaboration",
    "vaccine-associated enhanced disease",
    "myocarditis",
    "guillain-barre syndrome",
    "intussusception",
    "co-administration non-interference",
    "age de-escalation",
    "maternal immunization",
    "pregnancy exposure registry",
    "post-licensure effectiveness",
    "risk management plan",
    "cber ovrr",
    "vaccine efficacy lower bound"
  ]
};

export default vaccinesProfile;
