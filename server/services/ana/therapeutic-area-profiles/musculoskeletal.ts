/**
 * Musculoskeletal & Rheumatology therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/musculoskeletal
 */
import type { TherapeuticAreaProfile } from './types.js';

export const musculoskeletalProfile: TherapeuticAreaProfile = {
  "id": "musculoskeletal",
  "displayName": "Musculoskeletal & Rheumatology",
  "description": "Regulatory profile for immune-mediated inflammatory rheumatic diseases and musculoskeletal disorders including rheumatoid arthritis, psoriatic arthritis, axial spondyloarthritis (ankylosing spondylitis and non-radiographic axSpA), juvenile idiopathic arthritis, systemic lupus erythematosus and lupus nephritis, systemic sclerosis, Sjogren's disease, ANCA-associated and large-vessel vasculitis, gout, osteoarthritis, osteoporosis, and rare muscle and skeletal diseases (Duchenne muscular dystrophy, myositis, osteogenesis imperfecta, X-linked hypophosphatemia). Reviewed by FDA's Division of Rheumatology and Transplant Medicine (DRTM) in the Office of Immunology and Inflammation, and by EMA/CHMP under disease-specific efficacy guidelines. The area is defined by composite responder endpoints (ACR20/50/70, DAS28, ASAS20/40, SRI-4, BILAG), radiographic structural-progression co-endpoints (modified Total Sharp Score, mSASSS), physical function and PRO co-primaries (HAQ-DI), the serious infection/malignancy/MACE safety burden of immunosuppressive and JAK-inhibitor therapy including the class boxed warning arising from ORAL Surveillance, active-comparator and non-inferiority designs, and extensive biosimilar development activity.",
  "contextRules": [
    {
      "id": "msk-composite-endpoint-273",
      "scope": "section",
      "instruction": "Report composite responder endpoints with their full component breakdown, not only the composite rate. For ACR20/50/70, present each of the seven core-set components (tender joint count, swollen joint count, patient global, physician global, patient pain, HAQ-DI, acute phase reactant) as mean/median change and as the proportion achieving the component threshold, so reviewers can confirm the composite is not driven by a single soft component. Do the same for ASAS20/40, DAS28 remission/LDA, and SRI-4/BICLA.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "ACR20",
        "ACR50",
        "ACR70",
        "DAS28",
        "ASAS20",
        "ASAS40",
        "SRI-4",
        "BICLA",
        "composite endpoint",
        "core set"
      ],
      "guidanceRef": "FDA Rheumatoid Arthritis: Developing Drug Products for Treatment (draft, 2013)"
    },
    {
      "id": "msk-radiographic-structural",
      "scope": "section",
      "instruction": "For any structural-damage or inhibition-of-progression claim, describe the radiographic reading methodology in full: modified Total Sharp Score (van der Heijde) or mSASSS as applicable, number of independent readers, blinding to treatment and to chronological sequence, adjudication rules for reader disagreement, smallest detectable change, and the pre-specified handling of missing films (typically linear extrapolation with sensitivity analyses). Structural claims require at least 12 months of radiographic follow-up; 6-month data may be presented as supportive only.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "Sharp score",
        "mTSS",
        "radiographic progression",
        "mSASSS",
        "structural damage",
        "reader blinding",
        "erosion score"
      ],
      "guidanceRef": "EMA/CPMP/EWP/556/95 Rev.2 (RA guideline)"
    },
    {
      "id": "msk-serious-infection-2744",
      "scope": "section",
      "instruction": "Provide a dedicated serious and opportunistic infection analysis with exposure-adjusted incidence rates per 100 patient-years, covering tuberculosis (including reactivation and screening protocol used), herpes zoster with dermatomal versus disseminated classification, hepatitis B reactivation, invasive fungal infections, PML where mechanistically plausible, and sepsis. Present rates by treatment arm, by background therapy (methotrexate, corticosteroid dose), and over cumulative long-term extension exposure, with comparison to an external or active-comparator benchmark where available.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "serious infection",
        "opportunistic infection",
        "tuberculosis",
        "herpes zoster",
        "hepatitis B reactivation",
        "exposure-adjusted incidence",
        "patient-years"
      ],
      "guidanceRef": "FDA/EMA immunosuppressant safety expectations"
    },
    {
      "id": "msk-jak-class-safety",
      "scope": "section",
      "instruction": "For JAK inhibitors and mechanistically related agents, address the class safety concerns established by ORAL Surveillance explicitly: adjudicated major adverse cardiovascular events, malignancy excluding NMSC and NMSC separately, venous thromboembolism (DVT and PE reported separately), and all-cause mortality, each presented as exposure-adjusted incidence with 95% CIs and stratified by cardiovascular risk factors and age >=65. State how the data inform the class boxed warning and the restriction to patients with inadequate response to one or more TNF blockers.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "JAK inhibitor",
        "ORAL Surveillance",
        "MACE",
        "venous thromboembolism",
        "malignancy",
        "boxed warning",
        "mortality"
      ],
      "guidanceRef": "FDA JAK inhibitor class labeling actions (2021)"
    },
    {
      "id": "msk-immunogenicity-biologics",
      "scope": "section",
      "instruction": "For biologics, present a complete immunogenicity assessment per the FDA immunogenicity guidance and EMA immunogenicity guideline: assay strategy (screening, confirmatory, titer, neutralizing antibody), assay validation including drug tolerance and target interference, ADA and NAb incidence by arm and over time, and the impact of ADA status on pharmacokinetics, efficacy (composite responder rates), and safety (injection-site/infusion reactions, hypersensitivity, anaphylaxis). Where concomitant methotrexate is expected to reduce immunogenicity, present ADA incidence with and without methotrexate.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "immunogenicity",
        "anti-drug antibody",
        "neutralizing antibody",
        "ADA",
        "drug tolerance",
        "infusion reaction",
        "methotrexate concomitant"
      ],
      "guidanceRef": "FDA Immunogenicity Testing of Therapeutic Protein Products (2019)"
    },
    {
      "id": "msk-nonresponder-imputation",
      "scope": "section",
      "instruction": "For binary composite responder endpoints, pre-specify non-responder imputation (NRI) as the primary handling of missing data and of intercurrent events such as rescue therapy, treatment discontinuation, and use of prohibited concomitant medication, consistent with a composite estimand strategy. Provide sensitivity analyses using alternative approaches (tipping point, multiple imputation, observed cases) and state the discontinuation rate by reason and arm. Observed-case analysis alone is not acceptable as primary.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "non-responder imputation",
        "NRI",
        "missing data",
        "rescue therapy",
        "observed case",
        "escape therapy"
      ],
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "id": "msk-background-therapy",
      "scope": "section",
      "instruction": "State the background therapy regimen precisely and consistently: whether the drug is studied as monotherapy or on a background of methotrexate or other csDMARDs, whether corticosteroid doses were required to be stable and at what threshold, the permitted NSAID use, and the rescue/escape rules. The labeled indication must match the studied background - a combination-only development program cannot support a monotherapy claim, and reviewers will restrict labeling accordingly.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "background therapy",
        "methotrexate",
        "csDMARD",
        "corticosteroid taper",
        "monotherapy",
        "concomitant medication",
        "escape rules"
      ]
    },
    {
      "id": "msk-pediatric-jia",
      "scope": "section",
      "instruction": "Address PREA and the EU Paediatric Regulation with a concrete JIA (or pediatric SLE/uveitis) plan. Where extrapolation from adult RA to polyarticular JIA is proposed, justify it with similarity of pathophysiology and exposure-response, and specify the PK/PD bridging and the JIA ACR Pediatric 30/50/70/90 endpoints. Long-term pediatric studies must include growth velocity, bone mineral density, and sexual-maturation (Tanner) monitoring, and vaccination/live-vaccine guidance must be addressed.",
      "severity": "major",
      "appliesTo": "1.9",
      "triggerKeywords": [
        "juvenile idiopathic arthritis",
        "JIA ACR Pedi 30",
        "pediatric extrapolation",
        "growth velocity",
        "bone mineral density",
        "live vaccine",
        "PREA",
        "PIP"
      ],
      "guidanceRef": "EMA/CHMP/PDCO paediatric rheumatology requirements"
    },
    {
      "id": "msk-noninferiority-margin",
      "scope": "section",
      "instruction": "Where an active-controlled non-inferiority design is used, justify the NI margin quantitatively using the 95-95 or synthesis method: identify the historical placebo-controlled evidence establishing the active comparator's effect (M1), the fraction of that effect to be preserved (M2), and address constancy and assay-sensitivity assumptions given that background therapy and populations have changed since the historical trials. Provide both the ITT and per-protocol analyses, since NI conclusions require concordance.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "non-inferiority",
        "NI margin",
        "active comparator",
        "constancy assumption",
        "assay sensitivity",
        "per-protocol"
      ],
      "guidanceRef": "FDA Non-Inferiority Clinical Trials to Establish Effectiveness (2016)"
    },
    {
      "id": "msk-biosimilar-totality",
      "scope": "module",
      "instruction": "For a biosimilar rheumatology program, structure the submission as a totality-of-the-evidence argument with analytical similarity as the foundation: state the residual uncertainty remaining after analytical and functional characterization, justify the PK similarity study design and the equivalence margins for AUC and Cmax, and justify the choice of the most sensitive indication and endpoint for the comparative clinical study (typically ACR20 in RA or PASI75 in psoriasis) together with the equivalence margin derivation. Present comparative immunogenicity as a co-critical assessment and provide the scientific justification for extrapolation to each additional indication sought.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "biosimilar",
        "analytical similarity",
        "totality of the evidence",
        "equivalence margin",
        "extrapolation of indications",
        "comparative immunogenicity",
        "switching study"
      ],
      "guidanceRef": "FDA Scientific Considerations in Demonstrating Biosimilarity (2015) / EMA CHMP/437/04 Rev 1"
    },
    {
      "id": "msk-osteoporosis-bmd-fracture",
      "scope": "section",
      "instruction": "For osteoporosis, the primary endpoint for a new therapeutic must be incident vertebral fracture (morphometric, by blinded central quantitative or semiquantitative reading) with non-vertebral and hip fracture as key secondaries; BMD by DXA and bone turnover markers are supportive and cannot substitute for fracture outcomes for a new molecular entity. Report vertebral fracture ascertainment methodology, the radiographic reading protocol, and the timing of scheduled spine films.",
      "severity": "major",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "osteoporosis",
        "vertebral fracture",
        "BMD",
        "DXA",
        "bone turnover marker",
        "hip fracture",
        "fracture endpoint"
      ],
      "guidanceRef": "EMA/CHMP/EWP/452/02 Osteoporosis Guideline"
    },
    {
      "id": "msk-always-nomenclature",
      "scope": "always",
      "instruction": "Use current classification criteria consistently and cite them where enrollment depended on them (2010 ACR/EULAR RA criteria, CASPAR for PsA, ASAS axSpA criteria, 2019 EULAR/ACR SLE criteria, 2012 revised Chapel Hill nomenclature for vasculitis, ILAR criteria for JIA). Report all effect estimates with two-sided 95% confidence intervals and, for binary composite endpoints, with risk differences and NNT alongside relative measures.",
      "severity": "minor",
      "triggerKeywords": [
        "ACR/EULAR criteria",
        "CASPAR",
        "ASAS criteria",
        "classification criteria",
        "ILAR"
      ]
    }
  ],
  "riskFactors": [
    "Serious and opportunistic infection burden of immunosuppressive and biologic therapy - tuberculosis reactivation, herpes zoster, hepatitis B reactivation, invasive fungal infection, sepsis - which drives boxed warnings, screening requirements, and long-term pharmacovigilance obligations",
    "JAK-inhibitor class risks established by the ORAL Surveillance post-marketing trial (MACE, malignancy, VTE, all-cause mortality), which produced a class boxed warning and second-line restriction and now shape the entire evidentiary and labeling strategy for that mechanism",
    "Malignancy signal for immunomodulators, including lymphoma and non-melanoma skin cancer, requiring long-term extension data, standardized incidence ratio comparison to registry benchmarks, and often a post-marketing registry commitment",
    "Composite responder endpoints whose components can be driven by soft, subjective elements (patient/physician global, tender joint count), inviting reviewer challenge if the component breakdown shows imbalance",
    "Radiographic structural claims that depend heavily on reading methodology, reader blinding to sequence, and imputation of missing films - a frequent source of reviewer disagreement about whether progression inhibition is real",
    "High placebo/background-therapy response and rescue/escape designs in RA and PsA, where escape rules and non-responder imputation determine the apparent effect size",
    "Immunogenicity of biologics affecting exposure, efficacy attenuation over time, and hypersensitivity/infusion reactions, with assay drug-tolerance limitations often understated",
    "Long-term corticosteroid exposure in lupus and vasculitis trials, which confounds efficacy interpretation and requires pre-specified tapering protocols and steroid-sparing co-endpoints",
    "SLE trial failure history - heterogeneous disease activity, organ-domain variability, background medication changes, and the fragility of SRI-4/BICLA composites - making SLE among the highest-attrition rheumatology indications",
    "Pediatric obligations (JIA, pediatric SLE, pediatric uveitis) with growth, bone-density, and vaccination considerations, plus ethical constraints on placebo-controlled designs requiring withdrawal or add-on designs",
    "Reproductive-safety data gaps for agents used in a predominantly female population of childbearing potential, including pregnancy registries and placental-transfer characterization for IgG biologics",
    "Crowded active-comparator landscape driving non-inferiority and biosimilar designs where margin justification, constancy, and assay sensitivity are recurring review issues"
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "component analysis missing",
        "acr20 components",
        "core set not reported",
        "composite driven by",
        "tender joint count",
        "patient global"
      ],
      "description": "Composite responder endpoints (ACR20/50/70, ASAS20/40, SRI-4, BICLA) are reported without the individual core-set component data, preventing assessment of whether the composite is driven by subjective components.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA RA Developing Drug Products (2013 draft)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "serious infection rate",
        "exposure-adjusted",
        "patient-years not",
        "tuberculosis screening",
        "herpes zoster not",
        "hepatitis b reactivation",
        "opportunistic infection"
      ],
      "description": "Serious and opportunistic infections are not presented as exposure-adjusted incidence per 100 patient-years, or TB screening/prophylaxis protocols, herpes zoster classification, and HBV reactivation surveillance are not described.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "observed case",
        "non-responder imputation",
        "nri not",
        "missing data",
        "rescue therapy not counted",
        "escape not imputed",
        "locf"
      ],
      "description": "Missing data and intercurrent events for binary composite endpoints are handled by observed-case analysis rather than pre-specified non-responder imputation, with no tipping-point or multiple-imputation sensitivity analyses.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "reader blinding",
        "chronological order",
        "sharp score methodology",
        "smallest detectable change",
        "missing radiograph",
        "linear extrapolation",
        "adjudication"
      ],
      "description": "Radiographic reading methodology is inadequately described - number and blinding of readers, blinding to chronological sequence, adjudication, smallest detectable change, and handling of missing films - so a structural progression claim cannot be verified.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "neutralizing antibody",
        "drug tolerance",
        "ada impact",
        "immunogenicity assay not validated",
        "titer not reported",
        "infusion reaction"
      ],
      "description": "Immunogenicity assessment is incomplete: no neutralizing antibody assay, inadequate drug-tolerance validation, or no analysis of the impact of ADA status on PK, efficacy, and hypersensitivity events.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Immunogenicity Testing of Therapeutic Protein Products (2019)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "mace not adjudicated",
        "venous thromboembolism",
        "malignancy rate",
        "all-cause mortality",
        "oral surveillance",
        "cardiovascular risk stratification",
        "boxed warning not addressed"
      ],
      "description": "For JAK inhibitors or agents with a comparable mechanism, MACE, malignancy, VTE, and all-cause mortality are not adjudicated and not presented as exposure-adjusted rates stratified by age and cardiovascular risk, leaving the class boxed warning unaddressed.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "monotherapy claim",
        "background therapy mismatch",
        "indication broader than",
        "nr-axspa",
        "population studied differs",
        "first-line claim"
      ],
      "description": "The proposed indication does not match the studied background therapy or population - e.g. a monotherapy claim from combination-with-methotrexate data, or a broad axSpA claim from radiographic-only data without nr-axSpA evidence.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "ni margin not justified",
        "non-inferiority margin",
        "constancy assumption",
        "assay sensitivity",
        "historical evidence not cited",
        "per-protocol not presented"
      ],
      "description": "Non-inferiority margin is asserted without a quantitative derivation from historical placebo-controlled evidence, or constancy and assay-sensitivity assumptions are not addressed despite changes in background standard of care.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Non-Inferiority Clinical Trials (2016)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "ich e1",
        "long-term extension",
        "cumulative exposure",
        "standardized incidence ratio",
        "registry comparison",
        "12-month exposure",
        "safety database size"
      ],
      "description": "Long-term exposure is insufficient or not duration-stratified per ICH E1, and open-label extension safety is reported only descriptively without cumulative exposure-adjusted rates or comparison to registry benchmarks.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E1"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "haq-di not",
        "physical function",
        "basfi",
        "patient-reported outcome not validated",
        "fatigue endpoint",
        "secondary endpoint uncontrolled"
      ],
      "description": "Physical function and patient-reported outcomes (HAQ-DI, BASFI, SF-36, FACIT-Fatigue) are absent, not validated for the population, or outside the multiplicity-controlled testing family, so functional claims cannot be labeled.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA PFDD Guidance Series"
    },
    {
      "ctdSection": "1.9",
      "patterns": [
        "pediatric plan",
        "jia",
        "prea",
        "pip not agreed",
        "growth velocity",
        "bone mineral density",
        "live vaccine",
        "tanner"
      ],
      "description": "Pediatric plan for JIA or pediatric SLE is missing or lacks PK/PD bridging, JIA ACR Pediatric endpoints, growth and bone-mineral-density monitoring, or vaccination/live-vaccine guidance.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "pregnancy registry",
        "placental transfer",
        "lactation",
        "women of childbearing potential",
        "contraception requirement",
        "reproductive toxicity"
      ],
      "description": "Reproductive and pregnancy safety is inadequately characterized for a therapy used predominantly in women of childbearing potential - no placental transfer discussion for IgG biologics, no pregnancy registry plan, no lactation data strategy.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Pregnancy and Lactation Labeling Rule"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "corticosteroid taper",
        "steroid-sparing",
        "prednisone dose",
        "background steroid not standardized",
        "glucocorticoid toxicity index"
      ],
      "description": "Corticosteroid tapering protocol in lupus or vasculitis trials is not standardized or not analyzed, so the steroid-sparing contribution to the composite endpoint cannot be separated from the drug effect.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "5.3.1",
      "patterns": [
        "analytical similarity",
        "totality of the evidence",
        "equivalence margin not derived",
        "extrapolation not justified",
        "comparative immunogenicity",
        "switching data"
      ],
      "description": "For a biosimilar, analytical similarity is not presented as the foundation of a totality-of-evidence argument, equivalence margins for the PK and clinical endpoints are not derived from comparator historical data, and indication extrapolation lacks a mechanistic justification.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Scientific Considerations in Demonstrating Biosimilarity (2015)"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "bmd as primary",
        "bone mineral density surrogate",
        "fracture endpoint missing",
        "vertebral fracture ascertainment",
        "bone turnover marker",
        "dxa only"
      ],
      "description": "For osteoporosis programs, BMD or bone turnover markers are proposed as the primary basis of effectiveness for a new molecular entity without incident fracture data, or vertebral fracture ascertainment methodology is not described.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/EWP/452/02"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-2013-D-0575 (Rheumatoid Arthritis: Developing Drug Products for Treatment, draft May 2013)",
      "authority": "FDA",
      "title": "Rheumatoid Arthritis: Developing Drug Products for Treatment",
      "why": "FDA's controlling document for RA development: defines acceptable claims (signs and symptoms, major clinical response, inhibition of structural damage, improvement in physical function), the ACR core set and composite endpoints, trial duration for each claim, and safety database expectations; anchors the design rationale in Module 2.5 and the claim structure in labeling."
    },
    {
      "code": "EMA/CPMP/EWP/556/95 Rev. 2",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for the Treatment of Rheumatoid Arthritis",
      "why": "CHMP's controlling RA guideline covering ACR/EULAR response and remission criteria, radiographic progression requirements (>=12 months, van der Heijde-modified Sharp score), background-therapy definitions, and long-term efficacy maintenance; used to align the EU dossier and the SmPC indication wording."
    },
    {
      "code": "ICH E1",
      "authority": "ICH",
      "title": "The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the long-term exposure minimums applicable to chronic rheumatic disease therapies and the duration-stratified exposure tables required in Module 2.7.4, including the 12-month cohort in which infection and malignancy signals emerge."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Statistical Principles for Clinical Trials - Addendum on Estimands and Sensitivity Analysis",
      "why": "Frames the intercurrent-event handling that governs rheumatology composite endpoints - rescue/escape therapy, corticosteroid increase, treatment discontinuation - and dictates that non-responder imputation be justified as a composite estimand strategy rather than merely a missing-data convention."
    },
    {
      "code": "FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products - Developing and Validating Assays for Anti-Drug Antibody Detection (final, Jan 2019)",
      "authority": "FDA",
      "title": "Immunogenicity Testing of Therapeutic Protein Products",
      "why": "Prescribes the tiered ADA assay strategy, drug-tolerance and target-interference validation, and NAb assessment that biologic rheumatology programs must document in Module 5.3.5.3 and summarize in 2.7.2/2.7.4."
    },
    {
      "code": "EMA/CHMP/BMWP/14327/2006 Rev. 1",
      "authority": "EMA",
      "title": "Guideline on Immunogenicity Assessment of Therapeutic Proteins",
      "why": "EU counterpart establishing risk-based immunogenicity assessment, the requirement to relate ADA to PK/efficacy/safety, and post-authorisation immunogenicity follow-up in the RMP."
    },
    {
      "code": "FDA Guidance: Non-Inferiority Clinical Trials to Establish Effectiveness (final, Nov 2016)",
      "authority": "FDA",
      "title": "Non-Inferiority Clinical Trials to Establish Effectiveness",
      "why": "Governs the margin derivation (M1/M2, 95-95 and synthesis methods), constancy and assay-sensitivity assumptions for the active-controlled designs that dominate crowded rheumatology indications and biosimilar comparative studies."
    },
    {
      "code": "FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (final, Apr 2015) and Clinical Pharmacology Data to Support a Demonstration of Biosimilarity (final, Dec 2016)",
      "authority": "FDA",
      "title": "Scientific Considerations in Demonstrating Biosimilarity / Clinical Pharmacology Data to Support Biosimilarity",
      "why": "Defines the stepwise, totality-of-the-evidence development paradigm, the residual-uncertainty logic, PK equivalence margins, and the basis for extrapolating across rheumatology and dermatology indications for TNF-inhibitor and other biosimilars."
    },
    {
      "code": "EMA CHMP/437/04 Rev. 1",
      "authority": "EMA",
      "title": "Guideline on Similar Biological Medicinal Products",
      "why": "CHMP's overarching biosimilar framework, used together with the product-class guidelines to justify the comparative clinical package, the most sensitive indication and endpoint, and indication extrapolation in the EU."
    },
    {
      "code": "EMA/CHMP/EWP/438/04 (Guideline on clinical investigation of medicinal products for the treatment of psoriatic arthritis) and EMA/CPMP/EWP/4891/03 (ankylosing spondylitis)",
      "authority": "EMA",
      "title": "Guidelines on Clinical Investigation in Psoriatic Arthritis and Ankylosing Spondylitis",
      "why": "Define EU expectations for PsA (ACR/PsARC/MDA endpoints, enthesitis, dactylitis, skin domain, radiographic progression) and axSpA (ASAS20/40, BASDAI/ASDAS, mSASSS), including which domains must be separately demonstrated for a full indication."
    },
    {
      "code": "EMA/CHMP/EWP/452/02 Rev. 1",
      "authority": "EMA",
      "title": "Guideline on the Evaluation of Medicinal Products in the Treatment of Primary Osteoporosis",
      "why": "Establishes that incident vertebral fracture is the required primary endpoint for new osteoporosis therapies, with BMD and bone turnover markers as supportive only, and sets the radiographic ascertainment and trial-duration expectations."
    },
    {
      "code": "FDA Guidance: Systemic Lupus Erythematosus - Developing Medical Products for Treatment (final, June 2010) and Lupus Nephritis Caused by Systemic Lupus Erythematosus: Developing Medical Products for Treatment (draft, 2023)",
      "authority": "FDA",
      "title": "Systemic Lupus Erythematosus / Lupus Nephritis: Developing Medical Products for Treatment",
      "why": "Define acceptable SLE endpoints (SRI-based composites, BILAG-based responses, reduction in flares, corticosteroid-sparing) and renal response definitions (complete/partial renal response, proteinuria and eGFR criteria) plus mandatory background-therapy standardization."
    },
    {
      "code": "ICH E11(R1) and FDA PREA / EU Regulation (EC) No 1901/2006",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Governs the JIA and pediatric SLE obligations, extrapolation justification from adult data, age-appropriate endpoint selection (JIA ACR Pedi 30/50/70/90), and the growth, skeletal, and immunization monitoring required in long-term pediatric exposure."
    },
    {
      "code": "ICH E2E and GVP Module V",
      "authority": "ICH",
      "title": "Pharmacovigilance Planning / EU Good Pharmacovigilance Practices Module V (Risk Management Systems)",
      "why": "Frames the RMP and pharmacovigilance plan that rheumatology biologics require - serious infection, TB, malignancy, VTE/MACE for JAK inhibitors, pregnancy registries - including the disease registries and PASS studies commonly imposed as additional pharmacovigilance."
    }
  ],
  "reviewerExpectations": [
    "DRTM reviewers dissect composite endpoints into their components and will discount a result where the composite is driven predominantly by subjective components (patient/physician global, tender joint count) without corroborating objective change in swollen joint count and acute-phase reactants.",
    "Reviewers expect structural-damage claims to rest on at least 12 months of centrally read radiographs with readers blinded to both treatment and chronological sequence, adjudication rules stated, and pre-specified imputation for missing films; they will re-analyze with alternative imputation.",
    "Serious and opportunistic infections are expected as exposure-adjusted incidence rates per 100 patient-years across the entire program including long-term extensions, with TB screening protocol, herpes zoster classification, and HBV reactivation surveillance described; simple percentage tables are insufficient.",
    "For JAK inhibitors and comparable mechanisms, reviewers expect prospectively adjudicated MACE, malignancy, VTE, and mortality data stratified by age and cardiovascular risk factors, and will evaluate whether the data support or fail to mitigate the class boxed warning and second-line positioning.",
    "Reviewers require non-responder imputation as the primary handling for binary composite endpoints, with rescue/escape therapy and discontinuation counted as failure; they will request tipping-point analyses where discontinuation is imbalanced.",
    "Immunogenicity is reviewed as a clinical rather than a bioanalytical topic: reviewers expect ADA and NAb incidence linked to trough concentrations, to loss of response over time, and to hypersensitivity events, with drug-tolerance limits of the assay disclosed.",
    "Reviewers align the indication tightly with the studied population and background therapy - monotherapy versus combination, TNF-naive versus TNF-inadequate-responder, radiographic versus non-radiographic axSpA - and will narrow labeling where the evidence is narrower than the request.",
    "EMA rapporteurs expect physical function (HAQ-DI, BASFI) and health-related quality-of-life outcomes as part of the demonstrated benefit for chronic rheumatic disease, plus maintenance-of-efficacy data over at least 12 months.",
    "For biosimilars, reviewers expect analytical similarity to carry the argument and the clinical study to serve as a confirmatory check in the most sensitive population and endpoint; disproportionate reliance on the clinical study to resolve analytical differences is a recognized red flag.",
    "For lupus and vasculitis, reviewers expect a standardized, protocol-mandated corticosteroid taper and a pre-specified steroid-sparing analysis so that the drug effect can be distinguished from background-therapy manipulation."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Broadly applicable across rare rheumatic and musculoskeletal diseases with US prevalence under 200,000 - systemic sclerosis, ANCA-associated vasculitis, giant cell arteritis, idiopathic inflammatory myopathies, systemic JIA, Duchenne muscular dystrophy, osteogenesis imperfecta, X-linked hypophosphatemia, and lupus nephritis subsets; not applicable to RA, osteoarthritis, or postmenopausal osteoporosis.",
      "impactedSections": [
        "1.7",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Designation supports smaller databases and greater reliance on natural-history comparators, but reviewers still expect a pre-specified primary endpoint, rigorous multiplicity control, and an explicit ICH E1 shortfall justification with post-marketing safety commitments; orphan status does not relieve the infection/malignancy characterization burden for immunosuppressive mechanisms."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Realistic for agents showing substantial improvement over available therapy in serious rheumatic disease with high unmet need - refractory lupus nephritis, diffuse cutaneous systemic sclerosis with interstitial lung disease, refractory myositis, and cell therapies (e.g. CAR-T approaches in severe autoimmune disease).",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Requires a comparison against available therapy on a clinically significant endpoint; FDA will expect early alignment on the composite endpoint definition and on the long-term safety follow-up plan, which for cell and gene therapies extends to 15 years."
    },
    {
      "pathway": "fast_track",
      "applicability": "Applies to serious rheumatic conditions with unmet need - lupus nephritis progressing to end-stage renal disease, systemic sclerosis-associated ILD, refractory vasculitis, severe systemic JIA with macrophage activation syndrome risk, and rare muscular dystrophies.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "Principally procedural (rolling review, more frequent meetings). Reviewers still expect the full exposure-adjusted infection and malignancy safety characterization at the time of the final rolling component, and a complete immunogenicity package for biologics."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Applicable where a reasonably likely surrogate exists for a serious rheumatic disease - proteinuria/complete renal response in lupus nephritis, dystrophin expression in Duchenne muscular dystrophy, or specified biomarker responses in rare metabolic bone disease. Not applicable to symptomatic RA, PsA, or osteoarthritis claims.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "Under FDORA the confirmatory trial should be underway or enrolling at the time of the application; the surrogate's relationship to the clinical outcome must be argued with quantitative evidence, and the post-marketing requirement, withdrawal procedures, and promotional-material submission obligations must be addressed in Module 1."
    },
    {
      "pathway": "priority_review",
      "applicability": "Available where the product provides a significant improvement in safety or effectiveness for a serious rheumatic disease - for example a first therapy for a rare vasculitis or myositis, a corticosteroid-eliminating regimen in giant cell arteritis, or an agent with materially lower serious-infection risk than existing biologics.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "2.7.4"
      ],
      "reviewerNotes": "Safety-superiority claims require product-specific comparative data, typically head-to-head or robustly matched; class-mechanism reasoning alone is insufficient and can carry into contested labeling negotiations."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME is plausible for therapies addressing seriously debilitating rheumatic diseases without satisfactory treatment - refractory systemic sclerosis, refractory lupus nephritis, severe rare myopathies - supported by compelling early clinical data.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "CHMP assigns a rapporteur early and expects an agreed development plan; PRIME increases scrutiny of the long-term efficacy maintenance package and of the post-authorisation registry/PASS commitments captured in the RMP."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU option for seriously debilitating rheumatic diseases with unmet need where comprehensive data are not yet available, most plausibly rare vasculitides, systemic sclerosis-ILD, and rare muscle diseases.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.4",
        "1.8.2"
      ],
      "reviewerNotes": "CHMP will impose specific obligations - typically a confirmatory randomized trial and a long-term safety registry covering serious infection, malignancy, and pregnancy outcomes - and the RMP must carry those as important identified or potential risks with concrete additional risk-minimisation measures."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand per ICH E9(R1) with a composite strategy for the dominant intercurrent events in rheumatology - use of rescue or escape therapy, increase in corticosteroid dose above a defined threshold, initiation of prohibited DMARDs, and treatment discontinuation - all of which are conventionally handled as non-response. State the population, variable (e.g. ACR20 response at week 24), treatment condition (including background therapy), and population-level summary (risk difference and odds ratio with 95% CI) identically across the SAP, CSR, and Module 2.5.",
    "For binary composite endpoints, non-responder imputation is the expected primary approach; supplement it with tipping-point analyses varying the assumed response rate among discontinuers, multiple imputation under MAR, and an observed-case analysis, and report discontinuation by reason and arm so reviewers can judge whether NRI is conservative or biased in a given direction.",
    "Control family-wise type I error at two-sided 0.05 across doses and the ordered secondary endpoints that carry labeling value (ACR50/70, DAS28 remission/LDA, HAQ-DI, radiographic progression, PASI in PsA, corticosteroid sparing in SLE) using a pre-specified fixed-sequence or graphical procedure; endpoints falling outside the successful path are descriptive only and must be presented as such.",
    "Radiographic progression is analyzed as change from baseline in mTSS (or mSASSS) using a rank-based or ANCOVA-on-ranks approach given severe non-normality and floor effects, supplemented by the proportion of patients with no progression (change <= 0 or <= smallest detectable change) and cumulative probability plots of change; pre-specify linear extrapolation for missing films with sensitivity analyses under alternative imputations.",
    "Long-term safety events are summarized as exposure-adjusted incidence rates per 100 patient-years with exact Poisson 95% confidence intervals, presented both for the controlled period (permitting between-arm comparison) and for the cumulative all-exposure period, with standardized incidence ratios versus an appropriate registry or SEER benchmark for malignancy.",
    "For active-controlled non-inferiority designs, derive the margin quantitatively (M1 from a meta-analysis of historical placebo-controlled trials of the comparator, M2 as a justified fraction of M1), address the constancy assumption given evolving background therapy, and require concordance between ITT and per-protocol analyses; for biosimilar equivalence designs, pre-specify a symmetric two-sided margin and justify it from the same historical evidence base.",
    "Group-sequential designs require a pre-specified alpha-spending function and an independent DMC with a firewalled charter; where futility or sample-size re-estimation is planned, use a type-I-error-preserving method and document that sponsor personnel remained blinded. In rare rheumatic diseases, Bayesian designs with pre-specified priors and operating characteristics evaluated by simulation are increasingly acceptable but must be agreed in advance.",
    "Pre-specify subgroup analyses (sex, age, race/ethnicity, baseline disease activity, seropositivity/autoantibody status, prior biologic exposure, background methotrexate use, region) with forest plots and interaction tests as descriptive; multiregional consistency should be evaluated with ICH E17 pre-specified criteria rather than post hoc region selection."
  ],
  "endpointConsiderations": [
    "Rheumatoid arthritis: ACR20 at week 12-24 is the conventional primary endpoint for signs and symptoms; DAS28-CRP low disease activity or remission, ACR50/70, and CDAI/SDAI remission serve as key secondaries. Caveats: ACR20 is a low bar and reviewers weigh ACR50/70 and remission for benefit-risk; DAS28-CRP and DAS28-ESR give systematically different remission rates and must not be interchanged; the acute-phase reactant component can be directly modulated by IL-6-targeting drugs, inflating composite response independent of joint improvement.",
    "Rheumatoid arthritis structural claim: change from baseline in van der Heijde-modified Total Sharp Score at 12 months, with erosion and joint space narrowing subscores and the proportion with no radiographic progression. Caveat: requires central blinded reading with sequence blinding; a 6-month result is supportive only and cannot support an 'inhibition of structural damage' claim.",
    "Rheumatoid arthritis function claim: change from baseline in HAQ-DI with the proportion achieving the minimum clinically important difference (typically >=0.22 or >=0.3 depending on the anchor used). Caveat: the MCID threshold must be pre-specified and justified; HAQ-DI must be inside the multiplicity-controlled hierarchy to support a labeled physical-function claim.",
    "Psoriatic arthritis: ACR20 at week 16-24 is the standard primary endpoint, with PASI75/90 (in patients with >=3% BSA), resolution of enthesitis (LEI/SPARCC) and dactylitis, minimal disease activity (MDA), HAQ-DI, and radiographic progression (PsA-modified Sharp score) as key secondaries. Caveat: a full PsA indication generally requires demonstration across the peripheral arthritis, skin, enthesitis, and dactylitis domains; single-domain evidence yields narrowed labeling.",
    "Axial spondyloarthritis: ASAS20 and ASAS40 response at week 12-16 are the accepted primary/co-primary endpoints, with ASDAS major improvement, BASDAI50, BASFI, ASAS partial remission, and MRI SPARCC inflammation scores as secondaries; mSASSS change over >=2 years is required for any structural claim. Caveat: radiographic axSpA (ankylosing spondylitis) and non-radiographic axSpA require separate evidence unless a combined program with objective inflammation criteria (elevated CRP and/or MRI sacroiliitis) is agreed in advance.",
    "Systemic lupus erythematosus: SRI-4 (SELENA-SLEDAI reduction >=4 with no BILAG worsening and no PGA deterioration) or BICLA at week 52, with corticosteroid-sparing (proportion tapering to <=7.5 mg/day prednisone-equivalent) and flare-rate reduction as key secondaries. Caveats: SRI-4 and BICLA can disagree in the same dataset; background therapy and steroid tapering must be protocol-mandated and standardized, or the composite reflects background manipulation rather than drug effect.",
    "Lupus nephritis: complete renal response - typically UPCR <=0.5 g/g, eGFR >=60 mL/min/1.73m2 or no more than 20% below baseline, and limited rescue/steroid exposure - at week 52 or 104, with partial renal response and time to renal flare as secondaries. Caveat: the CRR definition varies across programs and must be pre-specified; concomitant steroid taper compliance is a frequent source of reviewer challenge.",
    "Juvenile idiopathic arthritis: JIA ACR Pediatric 30/50/70/90 responses and, in withdrawal designs, time to flare after randomized withdrawal from open-label response; JADAS-based inactive disease is increasingly used. Caveat: placebo-controlled parallel designs are often ethically constrained, making randomized-withdrawal the default and requiring careful description of the enriched, responder-only randomized population.",
    "Giant cell arteritis and ANCA-associated vasculitis: sustained remission at week 52 (absence of disease activity - BVAS 0 for AAV - with adherence to a pre-specified corticosteroid taper) is the accepted primary endpoint, with cumulative glucocorticoid dose and time to flare as key secondaries. Caveat: the definition of remission is inseparable from the mandated steroid taper, which must be identical across arms.",
    "Osteoarthritis: WOMAC pain and physical function subscales plus Patient Global Assessment for symptomatic claims; structural/disease-modification claims require radiographic joint space width or quantitative MRI cartilage endpoints over >=2 years plus evidence of accompanying symptomatic benefit. Caveat: FDA has not accepted a structural endpoint alone as clinically meaningful without a linked symptomatic or functional benefit.",
    "Osteoporosis: incident morphometric vertebral fracture over 3 years is the required primary endpoint for a new molecular entity, with non-vertebral and hip fracture as key secondaries and BMD/bone turnover markers as supportive. Caveat: BMD may support a bridging or follow-on application in defined circumstances but not a first-in-class effectiveness demonstration.",
    "Gout: proportion of patients achieving serum urate below a pre-specified target (commonly <6.0 mg/dL, or <5.0 mg/dL in tophaceous disease) at month 6 is accepted for urate-lowering therapies, with flare rate and tophus resolution as secondaries; acute gout flare trials use pain NRS in the index joint. Caveat: serum urate is an accepted surrogate for urate-lowering therapy, but cardiovascular safety characterization has become a routine expectation for this class."
  ],
  "retrievalKeywords": [
    "acr20",
    "acr50",
    "acr70",
    "acr core set",
    "das28-crp",
    "cdai",
    "sdai",
    "asas20",
    "asas40",
    "asdas",
    "basdai",
    "basfi",
    "msasss",
    "van der heijde modified sharp score",
    "radiographic progression",
    "smallest detectable change",
    "haq-di",
    "minimum clinically important difference",
    "sri-4",
    "bicla",
    "selena-sledai",
    "bilag",
    "complete renal response",
    "lupus nephritis",
    "bvas",
    "sustained remission",
    "corticosteroid taper",
    "glucocorticoid toxicity index",
    "jia acr pedi 30",
    "randomized withdrawal",
    "non-responder imputation",
    "exposure-adjusted incidence rate",
    "serious infection",
    "opportunistic infection",
    "tuberculosis reactivation",
    "herpes zoster",
    "hepatitis b reactivation",
    "malignancy standardized incidence ratio",
    "oral surveillance",
    "jak inhibitor boxed warning",
    "venous thromboembolism",
    "mace adjudication",
    "immunogenicity",
    "anti-drug antibody",
    "neutralizing antibody",
    "drug tolerance assay",
    "biosimilar",
    "analytical similarity",
    "equivalence margin",
    "indication extrapolation",
    "non-inferiority margin",
    "womac",
    "joint space width",
    "vertebral fracture",
    "serum urate",
    "psarc",
    "minimal disease activity",
    "enthesitis",
    "dactylitis",
    "drtm"
  ]
};

export default musculoskeletalProfile;
