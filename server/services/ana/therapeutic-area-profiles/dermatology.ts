/**
 * Dermatology therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/dermatology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const dermatologyProfile: TherapeuticAreaProfile = {
  "id": "dermatology",
  "displayName": "Dermatology",
  "description": "Regulatory profile for topical, systemic, and biologic drug development in dermatologic disease - psoriasis, atopic dermatitis, acne vulgaris, rosacea, vitiligo, alopecia areata, hidradenitis suppurativa, chronic hand eczema, actinic keratosis, and dermatologic infection. Reviewed in the US primarily by the Division of Dermatology and Dentistry (DDD) within OND, and in the EU under the CHMP guidelines on atopic dermatitis, psoriasis, and topical product quality/equivalence. The profile emphasizes the field's two structural pressure points: (1) the dominance of static ordinal Investigator's Global Assessment endpoints, which require rigorous scale definition, evaluator training and consistency, and a defensible success definition; and (2) the demanding quality and equivalence requirements for topical dosage forms, where Q1/Q2/Q3 sameness, in vitro release and permeation testing, maximal-use systemic exposure, and dermal safety (irritation, sensitization, phototoxicity, photoallergy) drive both approvability and labeling.",
  "contextRules": [
    {
      "id": "derm-iga-definition",
      "scope": "section",
      "instruction": "For any trial using a static Investigator's Global Assessment (IGA/vIGA-AD/IGA-TS for rosacea/IGA for acne), reproduce the exact ordinal scale with its full morphologic anchor text in the protocol, SAP, and CSR, and define success unambiguously as a score of 0 or 1 (clear/almost clear) PLUS a prespecified minimum improvement from baseline (typically at least 2 grades). Document that the same trained evaluator assessed a given subject at all visits where feasible, describe the evaluator training and certification program with inter- and intra-rater agreement data, and state that the assessment was made without reference to prior scores. Do not switch scale versions mid-program or pool data across differing scale definitions without a prespecified concordance analysis.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "IGA",
        "investigator global assessment",
        "clear or almost clear",
        "2-grade improvement",
        "evaluator training",
        "static global"
      ],
      "guidanceRef": "FDA Guidance for Industry: Acne Vulgaris - Developing Drugs for Treatment; FDA Guidance: Atopic Dermatitis - Developing Drugs for Treatment (2024 draft)"
    },
    {
      "id": "derm-coprimary-endpoints",
      "scope": "section",
      "instruction": "When the indication convention requires co-primary endpoints (acne: IGA success plus absolute change in inflammatory and non-inflammatory lesion counts; atopic dermatitis: vIGA-AD success plus EASI-75), state in the Clinical Overview that success requires all co-primary endpoints to be met in each pivotal trial, describe how the sample size accounts for the joint power requirement, and confirm that no alpha adjustment was applied across co-primaries (each must independently succeed). Present lesion counting methodology, including whether counts were performed by the same evaluator, how confluent lesions were handled, and how the count was capped or truncated.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "co-primary",
        "lesion count",
        "EASI-75",
        "inflammatory lesions",
        "non-inflammatory lesions",
        "PASI 75",
        "joint power"
      ],
      "guidanceRef": "FDA Guidance for Industry: Acne Vulgaris - Developing Drugs for Treatment"
    },
    {
      "id": "derm-maximal-use-pk",
      "scope": "section",
      "instruction": "For every topical drug product, include a maximal use systemic exposure (MUsT) study conducted in the target population (including the relevant pediatric age cohorts) with the highest labeled application frequency applied to the largest anticipated treated body surface area, on diseased and therefore compromised skin. Report full PK profiles including accumulation at steady state, and use the resulting systemic exposure to justify whether systemic safety assessments - QT, drug-drug interaction, hepatic/renal impairment, reproductive toxicity margins, HPA-axis suppression for corticosteroids - are required or can be waived.",
      "severity": "critical",
      "appliesTo": "5.3.1.1",
      "triggerKeywords": [
        "maximal use",
        "MUsT",
        "systemic exposure",
        "topical",
        "body surface area",
        "HPA axis",
        "percutaneous absorption"
      ],
      "guidanceRef": "FDA Guidance for Industry: General Clinical Pharmacology Considerations for Pediatric Studies; FDA Draft Guidance: Topical Dermatologic Corticosteroids - In Vivo Bioequivalence"
    },
    {
      "id": "derm-dermal-safety-battery",
      "scope": "module",
      "instruction": "Include the complete dermal safety battery for topical products applied to skin: cumulative irritation, repeat-insult patch test for contact sensitization in an adequate number of evaluable subjects, and - for any molecule or excipient absorbing in the UV/visible range or with a structural alert - phototoxicity and photoallergy studies. Report local tolerability at the application site in the pivotal trials using a prespecified graded scale for erythema, scaling, dryness, burning/stinging, and pruritus, assessed separately from efficacy, and summarize it in 2.7.4 as a distinct section rather than folding it into general adverse events.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "irritation",
        "sensitization",
        "repeat insult patch test",
        "phototoxicity",
        "photoallergy",
        "local tolerability",
        "application site reaction"
      ],
      "guidanceRef": "ICH M3(R2); FDA Draft Guidance: Photosafety Testing / ICH S10 Photosafety Evaluation of Pharmaceuticals"
    },
    {
      "id": "derm-q3-topical-equivalence",
      "scope": "section",
      "instruction": "For a generic or hybrid topical product, or for any post-approval formulation change, document sameness at three levels: Q1 (same components), Q2 (same components in the same concentrations within the applicable tolerance), and Q3 (same arrangement of matter - demonstrated through comparative physicochemical and structural characterization such as rheology, globule/particle size distribution, polymorphic form, pH, specific gravity, and drug thermodynamic activity). Support Q3 sameness with in vitro release testing (IVRT) and, where the product-specific guidance requires it, in vitro permeation testing (IVPT) using human skin from multiple donors, each with a validated method and prespecified statistical comparison criteria.",
      "severity": "critical",
      "appliesTo": "3.2.P.2",
      "triggerKeywords": [
        "Q1 Q2 Q3",
        "in vitro release",
        "IVRT",
        "IVPT",
        "permeation",
        "generic topical",
        "rheology",
        "globule size"
      ],
      "guidanceRef": "FDA Draft Guidance: In Vitro Release Test Studies for Topical and Transdermal Drug Products; FDA Draft Guidance: In Vitro Permeation Test Studies for Topical and Transdermal Drug Products"
    },
    {
      "id": "derm-vehicle-control",
      "scope": "section",
      "instruction": "Use a vehicle (not inert placebo) control for topical products, and state that the vehicle is identical to the test formulation in every respect except the active moiety. If the vehicle itself contains a component with pharmacologic activity in the disease (for example urea, salicylic acid, a keratolytic, or an emollient with documented barrier effect), disclose this and justify why the comparison remains interpretable. Report the vehicle response rate explicitly and discuss it in 2.5, since high vehicle response is a known driver of failed dermatology trials.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "vehicle control",
        "placebo control topical",
        "emollient",
        "vehicle response",
        "excipient activity"
      ],
      "guidanceRef": "FDA Guidance for Industry: Atopic Dermatitis - Developing Drugs for Treatment"
    },
    {
      "id": "derm-systemic-immunomodulator-safety",
      "scope": "section",
      "instruction": "For systemic immunomodulators used in dermatology (JAK inhibitors, IL-17/IL-23/IL-4Ra biologics, TNF inhibitors, S1P modulators), organize the safety summary around the recognized class risks: serious and opportunistic infection including tuberculosis reactivation and herpes zoster, malignancy including non-melanoma skin cancer and lymphoma, major adverse cardiovascular events, venous thromboembolism, mortality (for oral JAK inhibitors, per the boxed warning class labeling), hepatic and lipid effects, cytopenias, inflammatory bowel disease and suicidality signals for IL-17 agents, and conjunctivitis/keratitis for IL-4Ra agents. Present exposure-adjusted incidence rates with person-time denominators and compare to an external reference where available.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "JAK inhibitor",
        "boxed warning",
        "MACE",
        "venous thromboembolism",
        "malignancy",
        "herpes zoster",
        "tuberculosis screening",
        "IL-17",
        "IL-23",
        "dupilumab class"
      ],
      "guidanceRef": "FDA class labeling for Janus kinase inhibitors (2021); ICH E2E Pharmacovigilance Planning"
    },
    {
      "id": "derm-pediatric-topical",
      "scope": "module",
      "instruction": "For pediatric dermatology development, address the higher surface-area-to-body-weight ratio explicitly: conduct the maximal use PK study in each relevant age cohort down to the youngest age sought, evaluate HPA-axis suppression for corticosteroids and systemic exposure for any percutaneously absorbed agent, and provide age-appropriate formulation and application-site data. Do not extrapolate adult topical safety to infants and toddlers on the basis of body-weight scaling alone; the barrier function and absorption characteristics differ.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "pediatric topical",
        "infant",
        "surface area to body weight",
        "HPA axis children",
        "age cohort",
        "toddler"
      ],
      "guidanceRef": "ICH E11(R1); FDA Guidance: General Clinical Pharmacology Considerations for Pediatric Studies"
    },
    {
      "id": "derm-photography-standardization",
      "scope": "section",
      "instruction": "Where standardized photography supports efficacy assessment or an independent central read, document the imaging protocol: fixed camera, lens, lighting, distance, background, subject positioning, and body-region mapping; the process for anonymizing and randomizing images before central read; the number and qualification of central readers; and the adjudication rule for reader disagreement. State clearly whether the central photographic read is the primary endpoint source or a supportive/sensitivity analysis, and do not substitute a post hoc central read for a failed site-based primary.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "photography",
        "central read",
        "image standardization",
        "blinded reader",
        "adjudication",
        "imaging protocol"
      ],
      "guidanceRef": "FDA Guidance: Clinical Trial Imaging Endpoint Process Standards"
    },
    {
      "id": "derm-itch-pro",
      "scope": "section",
      "instruction": "When pruritus is a key secondary or co-primary endpoint (atopic dermatitis, prurigo nodularis, chronic urticaria), use a validated numeric rating scale (Peak Pruritus NRS or WI-NRS) with a documented recall period, a prespecified responder definition (typically at least a 4-point improvement from baseline in subjects with sufficient baseline severity), and a prespecified minimum baseline score for inclusion in the responder analysis. Provide the anchor-based derivation of the responder threshold in the studied population and document electronic diary compliance and handling of missing daily entries in the weekly average.",
      "severity": "major",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "pruritus",
        "itch NRS",
        "peak pruritus",
        "WI-NRS",
        "4-point improvement",
        "daily diary",
        "eDiary compliance"
      ],
      "guidanceRef": "FDA Patient-Focused Drug Development Guidance 3: Selecting, Developing, or Modifying Fit-for-Purpose Clinical Outcome Assessments"
    }
  ],
  "riskFactors": [
    "High and variable vehicle/placebo response rates in atopic dermatitis, acne, and rosacea trials, which erode assay sensitivity and are a leading cause of a pivotal trial failing despite a genuinely active drug.",
    "IGA evaluator drift and inter-rater inconsistency across a large multicenter trial, particularly when the same subject is scored by different evaluators at different visits, producing endpoint noise that the statistical reviewer will probe.",
    "Q3 (microstructure) non-equivalence for a topical generic or a post-approval formulation change, where Q1/Q2 sameness is achieved but rheology, globule size, or thermodynamic activity differ, invalidating the equivalence claim.",
    "Maximal use PK study conducted on healthy or minimally involved skin rather than the diseased, barrier-compromised skin of the target population, understating systemic exposure and leaving the systemic safety waiver undefended.",
    "Contact sensitization or photoallergy discovered late from an excipient rather than the active moiety, requiring reformulation after pivotal trials are complete.",
    "Class-level boxed-warning risk for oral JAK inhibitors (serious infections, mortality, MACE, malignancy, thrombosis) requiring a long-term safety database and a REMS-adjacent communication plan even for a dermatologic indication in an otherwise healthy population.",
    "Insufficient long-term safety exposure: dermatologic chronic-use indications require the ICH E1 database (1500 total, 300-600 at 6 months, 100 at 12 months), and sponsors frequently under-enroll the 12-month cohort for topical products they consider low-risk.",
    "Actinic keratosis and field-cancerization programs face endpoint durability questions - complete clearance at 8 weeks without recurrence follow-up through 12 months is routinely challenged.",
    "Pediatric extrapolation failures where adult efficacy is assumed but the required pediatric PK, HPA-axis, and safety data are deferred, converting into post-marketing requirements or blocking the pediatric age range in labeling.",
    "Photographic and central-read endpoints introduced or re-scored post hoc after a site-based primary endpoint misses, which reviewers treat as an unreliable basis for approval.",
    "Formulation stability and preservative-effectiveness problems in multi-dose topical containers, including antimicrobial preservative efficacy over in-use conditions and content uniformity in semisolid dosage forms.",
    "Nitrosamine and elemental-impurity risk in topical and oral dermatology products, particularly for secondary/tertiary amine-containing actives or excipients, requiring a documented risk assessment and confirmatory testing."
  ],
  "commonGaps": [
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "iga scale not defined",
        "evaluator training not documented",
        "inter-rater reliability not reported",
        "success definition incomplete",
        "no 2-grade improvement",
        "different evaluator each visit",
        "scale version changed"
      ],
      "description": "IGA scale definition, evaluator training/certification, inter- and intra-rater reliability data, or the requirement for consistent evaluator across visits is not documented; success definition omits the minimum grade-improvement requirement.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Acne Vulgaris - Developing Drugs for Treatment"
    },
    {
      "ctdSection": "5.3.1.1",
      "patterns": [
        "no maximal use study",
        "must not performed",
        "healthy skin only",
        "body surface area not maximal",
        "steady state not assessed",
        "pediatric cohort omitted",
        "systemic exposure not quantified"
      ],
      "description": "Maximal use systemic exposure study is absent, conducted in healthy volunteers or on intact skin rather than diseased skin, omits the largest labeled treated body surface area or the youngest pediatric cohort, or does not characterize steady-state accumulation.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Guidance: General Clinical Pharmacology Considerations for Pediatric Studies"
    },
    {
      "ctdSection": "3.2.P.2",
      "patterns": [
        "q3 not demonstrated",
        "rheology not characterized",
        "globule size not measured",
        "ivrt method not validated",
        "ivpt donors insufficient",
        "polymorph not assessed",
        "microstructure not compared"
      ],
      "description": "Q3 microstructure characterization for a semisolid product is incomplete: no comparative rheology across the full shear range, no globule or particle size distribution, no polymorphic form assessment, or IVRT/IVPT performed without a validated method and prespecified equivalence criteria.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Draft Guidance: In Vitro Permeation Test Studies for Topical and Transdermal Drug Products"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no sensitization study",
        "repeat insult patch test missing",
        "irritation not assessed",
        "phototoxicity not evaluated",
        "photoallergy not studied",
        "local tolerability not graded",
        "application site reactions pooled"
      ],
      "description": "Dermal safety package is incomplete: no repeat-insult patch test for sensitization, no cumulative irritation study, or missing phototoxicity/photoallergy evaluation for a chromophore-containing molecule or excipient; local tolerability not reported as a separate prespecified assessment.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH S10 Photosafety Evaluation of Pharmaceuticals"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "ich e1 not met",
        "insufficient 12-month exposure",
        "long-term safety database small",
        "exposure duration inadequate",
        "open-label extension too short",
        "safety population not representative"
      ],
      "description": "Long-term safety exposure does not meet ICH E1 for a chronic-use dermatologic indication: fewer than the expected number of subjects at 6 and 12 months, or exposure concentrated in a less severe population than the intended label.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E1 The Extent of Population Exposure to Assess Clinical Safety"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "exposure-adjusted rate not presented",
        "tb screening not described",
        "zoster not tabulated",
        "mace not adjudicated",
        "vte not analyzed",
        "nmsc not separated",
        "malignancy rate no comparator"
      ],
      "description": "Class risks for systemic immunomodulators are not analyzed with exposure-adjusted incidence rates and prespecified queries: TB screening/monitoring not described, herpes zoster and opportunistic infection not separately tabulated, MACE/VTE/malignancy not adjudicated, or NMSC not distinguished from other malignancy.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA JAK inhibitor class labeling; ICH E2E"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "itch nrs threshold not justified",
        "responder definition post hoc",
        "baseline severity not required",
        "ediary compliance not reported",
        "missing diary days imputed",
        "recall period not stated",
        "pro not validated in population"
      ],
      "description": "Pruritus or symptom PRO responder definition is not anchor-derived in the study population, baseline severity threshold for responder eligibility is not prespecified, or eDiary compliance and missing-day handling in the weekly average are undocumented.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Patient-Focused Drug Development Guidance 3"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "vehicle not identical",
        "vehicle contains active excipient",
        "vehicle response not reported",
        "assay sensitivity not demonstrated",
        "placebo used instead of vehicle"
      ],
      "description": "Vehicle control is not truly identical to the test formulation minus active, or the vehicle contains pharmacologically active components whose contribution is not discussed; vehicle response rate is not reported or reconciled with historical rates.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Atopic Dermatitis - Developing Drugs for Treatment"
    },
    {
      "ctdSection": "3.2.P.8",
      "patterns": [
        "in-use stability missing",
        "preservative effectiveness not tested",
        "phase separation not evaluated",
        "content uniformity not assessed",
        "crystallization not monitored",
        "photostability not performed"
      ],
      "description": "Stability and in-use data for semisolid or multi-dose topical products are incomplete: no in-use stability after first opening, no antimicrobial preservative effectiveness under in-use conditions, no assessment of phase separation or crystallization, or no content uniformity across the tube/pump.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH Q1A(R2) Stability Testing of New Drug Substances and Products"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "pediatric data absent",
        "youngest age not studied",
        "hpa axis pediatric not evaluated",
        "extrapolation not justified",
        "no pediatric pk",
        "formulation not age appropriate"
      ],
      "description": "Pediatric program is deficient: no data in the youngest age group sought, no age-appropriate formulation or usability assessment, HPA-axis suppression not evaluated for a pediatric corticosteroid, or extrapolation of adult efficacy asserted without a PK/PD bridge.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E11(R1)"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "no recurrence follow-up",
        "durability not assessed",
        "relapse rate not reported",
        "withdrawal data absent",
        "maintenance phase not studied",
        "clearance at week 8 only"
      ],
      "description": "Clinical Overview does not present recurrence or durability data for indications where relapse is the clinically dominant question (actinic keratosis, psoriasis after withdrawal, acne after course completion), or presents only short-term clearance without follow-up.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA Guideline on Clinical Investigation of Medicinal Products Indicated for the Treatment of Psoriasis (CHMP/EWP/2454/02 corr)"
    },
    {
      "ctdSection": "3.2.S.3",
      "patterns": [
        "nitrosamine assessment missing",
        "elemental impurity risk not assessed",
        "degradant not qualified",
        "q3b threshold exceeded",
        "no forced degradation",
        "impurity specification not justified"
      ],
      "description": "Impurity control is inadequate for the route: nitrosamine risk assessment not performed or not documented for amine-containing actives/excipients, elemental impurity risk assessment absent, or degradation products not qualified against ICH Q3B thresholds adjusted for the topical route and dose.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH Q3B(R2); ICH Q3D(R2); FDA Guidance: Control of Nitrosamine Impurities in Human Drugs"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA Guidance for Industry - Acne Vulgaris: Developing Drugs for Treatment",
      "authority": "FDA",
      "title": "Acne Vulgaris: Developing Drugs for Treatment",
      "why": "Establishes the co-primary endpoint convention for acne (IGA success plus absolute change in inflammatory and non-inflammatory lesion counts), the 12-week minimum treatment duration, the vehicle-control requirement, and the evaluator-consistency expectation. Directly drives the Module 2.5 endpoint justification and the CSR endpoint definitions."
    },
    {
      "code": "FDA Draft Guidance for Industry - Atopic Dermatitis: Developing Drugs for Treatment",
      "authority": "FDA",
      "title": "Atopic Dermatitis: Developing Drugs for Treatment",
      "why": "Sets FDA expectations for AD trials: the vIGA-AD and EASI co-primary construct, pruritus as a key secondary with a validated NRS, disease-severity entry criteria, background-therapy and rescue rules, and pediatric development expectations. Used to align the pivotal protocol and to defend the responder definitions in 5.3.5.3."
    },
    {
      "code": "FDA Draft Guidance for Industry - In Vitro Permeation Test Studies for Topical and Transdermal Drug Products",
      "authority": "FDA",
      "title": "In Vitro Permeation Test Studies for Topical and Transdermal Drug Products Submitted in ANDAs",
      "why": "Defines the IVPT study design FDA accepts for topical bioequivalence: human skin from a specified minimum number of donors, replicate sections, validated analytical method, and the statistical comparison of cumulative permeation and flux. Central to any generic topical dossier and to post-approval formulation-change justification."
    },
    {
      "code": "FDA Draft Guidance for Industry - In Vitro Release Test Studies for Topical and Transdermal Drug Products",
      "authority": "FDA",
      "title": "In Vitro Release Test Studies for Topical and Transdermal Drug Products Submitted in ANDAs",
      "why": "Specifies IVRT method development, validation (linearity, precision, discrimination), and the acceptance criteria for comparing test and reference semisolid products. Supports Q3 sameness arguments in Module 3.2.P.2 and SUPAC-type post-approval changes."
    },
    {
      "code": "FDA Guidance for Industry - Topical Dermatologic Corticosteroids: In Vivo Bioequivalence",
      "authority": "FDA",
      "title": "Topical Dermatologic Corticosteroids: In Vivo Bioequivalence",
      "why": "Sets out the vasoconstrictor (skin blanching) assay design for corticosteroid bioequivalence, including the pilot dose-duration study, the ED50 determination, and the pivotal study statistical criteria. Required for any generic topical corticosteroid and informative for potency classification in labeling."
    },
    {
      "code": "EMA CHMP/EWP/2454/02 corr",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products Indicated for the Treatment of Psoriasis",
      "why": "Defines the EU expectations for psoriasis programs: PASI 75/90 and PGA endpoints, severity classification, induction plus maintenance/withdrawal design, comparator selection against established systemic therapy, and long-term safety follow-up. Used to structure an EU-compatible Module 2.5 and to justify comparator choice."
    },
    {
      "code": "EMA/CHMP/EWP/518592/2018",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for the Treatment of Atopic Dermatitis",
      "why": "CHMP counterpart to the FDA AD guidance; addresses population definition by validated severity criteria, EASI and IGA endpoints, itch and sleep endpoints, use of topical corticosteroid background therapy, and long-term maintenance evidence. Key to reconciling EU and US pivotal designs in one program."
    },
    {
      "code": "EMA/CHMP/QWP/708282/2018",
      "authority": "EMA",
      "title": "Draft Guideline on Quality and Equivalence of Topical Products",
      "why": "The EU framework for topical product quality and for demonstrating equivalence without clinical endpoint studies, using extended pharmaceutical equivalence plus IVRT/IVPT and, where needed, in vivo PK or PD. Essential for EU hybrid applications and for aligning the global Module 3 topical strategy."
    },
    {
      "code": "ICH E1",
      "authority": "ICH",
      "title": "The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the 1500 total / 300-600 at six months / 100 at twelve months exposure expectation that governs nearly every chronic dermatologic indication (psoriasis, atopic dermatitis, rosacea, hidradenitis). Drives open-label-extension sizing and the 2.7.4 exposure tables."
    },
    {
      "code": "ICH S10",
      "authority": "ICH",
      "title": "Photosafety Evaluation of Pharmaceuticals",
      "why": "Defines when photosafety assessment is required based on UV/visible absorption (molar extinction coefficient threshold), tissue distribution, and route, and specifies the acceptable nonclinical and clinical phototoxicity/photoallergy testing strategy. Directly applicable to topical dermatology products and to systemic agents with skin distribution."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Governs the pediatric strategy that dominates atopic dermatitis and acne development, including age-cohort definition, extrapolation principles, formulation acceptability, and the higher surface-area-to-body-weight absorption concern for topical products in infants."
    },
    {
      "code": "FDA Guidance for Industry - Control of Nitrosamine Impurities in Human Drugs",
      "authority": "FDA",
      "title": "Control of Nitrosamine Impurities in Human Drugs",
      "why": "Requires a documented three-step risk assessment, confirmatory testing, and control strategy for nitrosamine and nitrosamine drug substance-related impurities. Applies to many dermatology actives and to excipients in semisolid formulations, and gaps here have blocked otherwise complete applications."
    },
    {
      "code": "FDA Patient-Focused Drug Development Guidance 3",
      "authority": "FDA",
      "title": "Selecting, Developing, or Modifying Fit-for-Purpose Clinical Outcome Assessments",
      "why": "Sets the evidentiary bar for the itch NRS, DLQI, POEM, SCORAD, HiSCL and other dermatology COAs used to support labeling claims, including content validity in the specific population and anchor-based responder-threshold derivation."
    }
  ],
  "reviewerExpectations": [
    "The DDD clinical reviewer will verify that the IGA scale text in the protocol, SAP, CSR, and proposed labeling is identical, and will question any program where the scale wording or the number of grades varied between trials.",
    "Reviewers expect co-primary endpoints in acne and atopic dermatitis to each succeed independently in each pivotal trial; success on one co-primary with a near-miss on the other is not treated as a positive trial.",
    "The clinical pharmacology reviewer expects a maximal use PK study on diseased skin at the largest labeled body surface area and will use its exposure to decide whether QT, DDI, hepatic/renal impairment, and reproductive-risk labeling are required.",
    "The reviewer expects vehicle response rates to be reported and compared to historical experience, and will treat a trial with an unusually low vehicle response as potentially unrepresentative rather than as strengthening the result.",
    "For chronic indications the reviewer will check the ICH E1 exposure table subject-by-duration and will not accept exposure accumulated predominantly in mild disease when the label targets moderate-to-severe.",
    "For systemic immunomodulators the reviewer expects exposure-adjusted incidence rates with person-time denominators for serious infection, herpes zoster, TB, malignancy including NMSC, MACE, VTE, and death, plus an explicit comparison to the class experience.",
    "The product-quality reviewer expects a full Q3 microstructure characterization package for semisolids and will challenge specification setting for a semisolid based only on assay, pH, and viscosity at a single shear rate.",
    "Reviewers expect the local tolerability assessment (erythema, stinging/burning, dryness, scaling, pruritus at the application site) to be reported on a prespecified graded scale separately from spontaneously reported adverse events.",
    "Where photographs support the endpoint, reviewers expect the imaging charter, reader qualifications, blinding and randomization of images, and an adjudication rule; a central read introduced after the site-based primary failed will be discounted.",
    "For pediatric claims the reviewer expects data generated in the youngest age group in the proposed indication, not extrapolation across the pediatric range, particularly for topical products where absorption differs by age."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Applies to rare dermatologic conditions such as epidermolysis bullosa, pemphigus vulgaris, generalized pustular psoriasis, netherton syndrome, cutaneous T-cell lymphoma, and X-linked hypohidrotic ectodermal dysplasia.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Rare dermatologic diseases often lack validated outcome measures, so the orphan program should include a fit-for-purpose COA development plan under the PFDD framework in parallel with the pivotal trial. Expect the division to accept a smaller database but to insist on rigorous, objective lesion or wound-closure measurement with central reading."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Realistic for serious dermatologic disease with substantial preliminary improvement over available therapy - generalized pustular psoriasis flare treatment, severe epidermolysis bullosa, refractory pemphigus, or advanced hidradenitis suppurativa unresponsive to biologics.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Ordinary chronic plaque psoriasis, acne, and mild-to-moderate atopic dermatitis do not meet the 'serious condition' bar. Where designation is granted, the compressed timeline typically outruns the ICH E1 long-term safety accrual, so the open-label extension and the safety-database plan should be negotiated early."
    },
    {
      "pathway": "fast_track",
      "applicability": "Available for serious dermatologic conditions with unmet need, including severe atopic dermatitis refractory to approved systemics, hidradenitis suppurativa Hurley stage III, bullous diseases, and severe alopecia areata where the psychosocial morbidity argument is supported.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "The unmet-need argument must be evidence-based (documented failure of, or contraindication to, approved therapies), not merely a claim of inconvenience. Use the extra meetings to lock the IGA scale, evaluator-training program, and responder definitions before the pivotal trial starts."
    },
    {
      "pathway": "priority_review",
      "applicability": "Appropriate where the product offers a significant safety or effectiveness improvement over available therapy - for example a topical alternative to a systemic agent carrying a boxed warning, or the first approved therapy for a dermatologic condition with no options.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "The improvement argument should be quantified in Module 2.5 with a direct comparison to labeled outcomes for available therapy. Because dermatology labeling negotiation is heavy (IGA definitions, application instructions, pediatric age ranges, warnings), have near-final proposed labeling at submission to fit the six-month clock."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Also applies to rare cutaneous oncology and genodermatoses where a topical or intralesional route is used and the systemic exposure question, not the efficacy question, drives the regulatory strategy.",
      "impactedSections": [
        "2.7.2",
        "3.2.P.2",
        "5.3.1.1"
      ],
      "reviewerNotes": "Even in an orphan setting, the maximal use PK study remains expected because pediatric and large-surface-area application in genodermatoses can produce meaningful systemic exposure. Do not assume orphan status waives the clinical pharmacology package."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME is plausible for severe rare dermatologic disease with high unmet need, such as recessive dystrophic epidermolysis bullosa, generalized pustular psoriasis, or severe pemphigus, particularly for advanced therapy medicinal products.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "PRIME entry requires compelling early clinical data on a clinically relevant endpoint. For topical or gene-therapy dermatology products the rapporteur will focus early advice on outcome-measure validation and on the quality/comparability package, which for cell and gene products is usually the rate-limiting element."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "Applicable in the EU for seriously debilitating dermatologic disease - severe epidermolysis bullosa, life-threatening bullous disease, advanced cutaneous lymphoma - where comprehensive long-term data are not yet available.",
      "impactedSections": [
        "2.5",
        "1.8.2",
        "5.3.5.1"
      ],
      "reviewerNotes": "CMA will carry specific obligations requiring completion of the long-term safety and durability dataset. Given ICH E1 expectations in chronic skin disease, the RMP must set out a concrete registry or extension-study plan with enrollment commitments, not a general pharmacovigilance statement."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand explicitly for each co-primary endpoint, naming rescue-medication use (topical corticosteroid rescue in atopic dermatitis is the dominant intercurrent event), discontinuation, and use of prohibited concomitant therapy; the conventional dermatology convention of treating rescue as treatment failure is a composite strategy and must be stated as such rather than described only as an imputation rule.",
    "Because dichotomous IGA and PASI/EASI responder endpoints dominate, prespecify the analysis method for binary outcomes (Cochran-Mantel-Haenszel stratified by randomization factors, or a logistic model) and prespecify the handling of missing responder status - typically non-responder imputation as primary with multiple imputation and tipping-point analyses as sensitivity.",
    "Do not adjust alpha across co-primary endpoints; each must be met at the full two-sided 0.05. Alpha control is instead required across the ordered key secondary endpoints (itch NRS responder, EASI-90, DLQI, sleep) using a prespecified fixed-sequence or graphical procedure that is only entered if all co-primaries succeed.",
    "Size the trial for the joint probability of success on all co-primary endpoints, not for the least-powered endpoint individually; state the assumed correlation between the IGA and lesion-count or EASI endpoints and provide the sensitivity of power to that assumption.",
    "Prespecify the vehicle response assumption from historical data in the same population and severity range, and include an assessment of assay sensitivity; a trial where the vehicle arm performs far outside the historical range should be discussed in 2.5 as a potential conduct or population issue.",
    "For continuous severity scores (EASI, PASI, SCORAD, IHS4) analyzed as change from baseline, use a mixed model for repeated measures with baseline severity as a covariate, and address the floor effect and skew of these scores; consider a prespecified rank-based or nonparametric sensitivity analysis.",
    "Where a randomized-withdrawal or maintenance design follows an induction period, prespecify the re-randomization population, the definition of loss of response, and the analysis of time to loss of response with competing-risk handling for discontinuation for reasons other than loss of response.",
    "For pooled safety analysis across trials with different durations, present exposure-adjusted incidence rates per 100 patient-years with confidence intervals, and prespecify whether the pooling is by trial phase (placebo-controlled period versus all-exposure period) so that the placebo comparison is not diluted by uncontrolled extension data.",
    "Prespecify handling of subjects with multiple treated body regions or bilateral/split-body designs; a within-subject design requires an analysis that accounts for the correlation between sites and a justification that systemic absorption does not contaminate the control site.",
    "Prespecify subgroup analyses by baseline severity, disease duration, prior systemic therapy, Fitzpatrick skin type, race and ethnicity, age, and body-surface-area involvement with interaction testing, and report enrollment diversity against the Diversity Action Plan commitment rather than only as a demographic table."
  ],
  "endpointConsiderations": [
    "Investigator's Global Assessment success - a static ordinal score of 0 (clear) or 1 (almost clear) with a minimum 2-grade improvement from baseline - is the anchoring endpoint across acne, rosacea, atopic dermatitis (vIGA-AD), and psoriasis (sPGA). Its principal caveat is evaluator subjectivity, requiring documented scale anchors, training, certification, and evaluator consistency across visits.",
    "EASI-75 (at least 75 percent improvement in Eczema Area and Severity Index) is the established co-primary or key secondary in atopic dermatitis; EASI-90 and EASI-100 support depth-of-response claims. EASI is region-weighted and skewed, so absolute change and percentage change behave differently and both should be prespecified.",
    "PASI 75 and PASI 90 remain the psoriasis efficacy standard, with PASI 100 increasingly expected for newer systemic agents; PASI's known limitations are poor performance in low-BSA disease and insensitivity in special sites, which is why sPGA and site-specific scores (scalp, nail, palmoplantar, genital) are added as secondaries.",
    "Absolute and percentage change in inflammatory and non-inflammatory lesion counts are required co-primaries in acne alongside IGA success; lesion counting is labor-intensive and evaluator-dependent, and confluent-lesion and count-capping rules must be prespecified.",
    "Peak Pruritus NRS responder (typically a 4-point or greater improvement, in subjects with a prespecified minimum baseline score) is the accepted itch endpoint in atopic dermatitis and prurigo nodularis; it depends on daily eDiary capture, so compliance rules and weekly-average construction from incomplete days must be prespecified.",
    "SCORAD and POEM are widely used in atopic dermatitis but SCORAD mixes investigator-assessed signs with patient-reported symptoms, making it awkward as a regulatory primary; POEM is patient-reported and useful as a supportive symptom measure with a documented responder threshold.",
    "Dermatology Life Quality Index (DLQI) responder, typically a 4-point or greater improvement, supports health-related quality-of-life claims in psoriasis and atopic dermatitis but requires anchor-based justification in the study population and is not accepted as a standalone primary.",
    "Hidradenitis Suppurativa Clinical Response (HiSCR, at least 50 percent reduction in abscess and inflammatory nodule count with no increase in abscesses or draining fistulas) is the accepted HS endpoint, with HiSCR75/90 and skin-pain NRS increasingly expected as more stringent supportive measures.",
    "Severity of Alopecia Tool (SALT) score of 20 or less (at least 80 percent scalp coverage) is the accepted responder definition in alopecia areata, with eyebrow and eyelash assessments as secondaries; durability after withdrawal is a recurring reviewer question.",
    "Facial Vitiligo Area Scoring Index (F-VASI75) and Total VASI are used in vitiligo, where the very slow repigmentation kinetics require trial durations of at least 24 to 52 weeks and where standardized photography with central reading is effectively required.",
    "Complete clearance of actinic keratosis lesions in a defined treatment field at a prespecified post-treatment timepoint is the standard endpoint, but reviewers routinely require recurrence follow-up (commonly to 12 months) because early clearance without durability is of limited clinical value.",
    "Microbiological and clinical cure endpoints in dermatologic infection (onychomycosis complete cure requires both negative KOH/culture and 0 percent clinical involvement) are stringent by convention; sponsors should not substitute the more permissive 'mycologic cure' or 'almost clear nail' as the primary without prior Agency agreement."
  ],
  "retrievalKeywords": [
    "investigator global assessment",
    "iga",
    "viga-ad",
    "easi-75",
    "pasi 75",
    "pasi 90",
    "scorad",
    "poem",
    "dlqi",
    "peak pruritus nrs",
    "itch nrs",
    "lesion count",
    "inflammatory lesions",
    "acne vulgaris",
    "atopic dermatitis",
    "plaque psoriasis",
    "rosacea",
    "hidradenitis suppurativa",
    "hiscr",
    "alopecia areata",
    "salt score",
    "vitiligo vasi",
    "actinic keratosis",
    "onychomycosis complete cure",
    "topical formulation",
    "vehicle control",
    "q1 q2 q3 sameness",
    "in vitro release testing",
    "in vitro permeation testing",
    "ivrt",
    "ivpt",
    "vasoconstrictor assay",
    "maximal use trial",
    "must",
    "percutaneous absorption",
    "hpa axis suppression",
    "repeat insult patch test",
    "cumulative irritation",
    "phototoxicity",
    "photoallergy",
    "jak inhibitor boxed warning",
    "il-17 inhibitor",
    "il-23 inhibitor",
    "il-4 receptor alpha",
    "dermal safety",
    "local tolerability",
    "application site reaction",
    "ich e1 long-term exposure",
    "standardized photography central read",
    "fitzpatrick skin type",
    "semisolid rheology",
    "preservative effectiveness"
  ]
};

export default dermatologyProfile;
