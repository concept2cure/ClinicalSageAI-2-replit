/**
 * Allergy & Immunotherapy therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/allergy
 */
import type { TherapeuticAreaProfile } from './types.js';

export const allergyProfile: TherapeuticAreaProfile = {
  "id": "allergy",
  "displayName": "Allergy & Immunotherapy",
  "description": "Regulatory profile for allergen immunotherapy products (subcutaneous and sublingual), allergenic extracts, venom products, allergic rhinitis/rhinoconjunctivitis and chronic urticaria pharmacotherapy, food allergy immunotherapy, and biologics targeting type 2 allergic inflammation. Regulatory ownership is split and this is the defining feature of the area: standardized and non-standardized allergenic extracts and allergen immunotherapy products are biologics licensed by CBER under a BLA (Office of Therapeutic Products / allergenics program, 21 CFR Part 680), while symptomatic pharmacotherapy such as antihistamines and intranasal corticosteroids is reviewed by CDER's Division of Pulmonology, Allergy, and Critical Care. In the EU, allergen products fall under Directive 2001/83/EC as amended with the CHMP Guideline on Allergen Products and the therapeutic-allergen clinical guideline, and in Germany additionally under the Therapieallergene-Verordnung. The profile emphasizes potency standardization and reference-standard management, environmental exposure chamber versus field-trial evidence, the combined symptom and medication score (CSMS) as the accepted primary endpoint, systemic-reaction and anaphylaxis risk characterization with epinephrine provisions, and the special demands of double-blind placebo-controlled food challenge (DBPCFC) endpoints.",
  "contextRules": [
    {
      "id": "allergy-potency-standardization",
      "scope": "section",
      "instruction": "For allergenic extracts and allergen immunotherapy products, define potency using an appropriate, justified system and state it consistently across all modules: for US-standardized extracts, the CBER reference standard and the applicable unitage (BAU/mL, AU/mL, weight/volume, PNU, or micrograms of major allergen); for EU products, the manufacturer's in-house reference preparation (IHRP) with full characterization and a documented strategy for IHRP replacement and bridging. Quantify the major allergen content by a validated immunoassay, describe the total allergenic activity assay (e.g. IgE inhibition/ELISA competition), and document batch-to-batch consistency across at least three consecutive commercial-scale lots. Never express the clinical dose only in volume or dilution terms - always in the defined potency unit and, where possible, in micrograms of the major allergen.",
      "severity": "critical",
      "appliesTo": "3.2.S.4",
      "triggerKeywords": [
        "BAU",
        "AU/mL",
        "PNU",
        "major allergen",
        "in-house reference preparation",
        "IHRP",
        "potency",
        "standardized extract",
        "IgE inhibition"
      ],
      "guidanceRef": "21 CFR Part 680; EMA Guideline on Allergen Products: Production and Quality Issues (EMEA/CHMP/BWP/304831/2007)"
    },
    {
      "id": "allergy-csms-primary",
      "scope": "section",
      "instruction": "For allergic rhinitis/rhinoconjunctivitis immunotherapy efficacy, use a combined symptom and medication score as the primary endpoint and specify its construction in full: the symptom domains and their ordinal scales (typically sneezing, rhinorrhea, nasal itching, nasal congestion, and ocular symptoms scored 0-3), the rescue-medication hierarchy with the point value assigned to each tier, the equal or otherwise justified weighting of the symptom and medication components, the definition of the analysis period (peak season, entire season, or a defined chamber interval), and the daily-diary capture and compliance rules. Justify the clinical relevance of the observed relative difference; regulators in the EU expect a clinically relevant difference (commonly cited as at least 20 percent relative to placebo) and will question a statistically significant but small effect.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "combined symptom medication score",
        "CSMS",
        "rescue medication score",
        "total nasal symptom score",
        "TNSS",
        "peak season",
        "pollen season",
        "daily diary"
      ],
      "guidanceRef": "EMA Guideline on the Clinical Development of Products for Specific Immunotherapy for the Treatment of Allergic Diseases (CHMP/EWP/18504/2006)"
    },
    {
      "id": "allergy-systemic-reaction-grading",
      "scope": "section",
      "instruction": "Characterize systemic allergic reactions and anaphylaxis using a single prespecified grading system applied consistently across the program (for example the WAO subcutaneous immunotherapy systemic reaction grading system, and for sublingual products the WAO SLIT local and systemic grading), and cross-tabulate events by grade, time to onset relative to dosing, dose/updosing phase, epinephrine administration, and setting (in-clinic versus at-home). State the observation period after in-clinic dosing, the epinephrine auto-injector prescription and training requirements, the criteria for dose adjustment or discontinuation, and any exclusion of subjects with uncontrolled asthma - which is the single most consistently cited risk factor for fatal reactions.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "anaphylaxis",
        "systemic reaction",
        "WAO grading",
        "epinephrine",
        "auto-injector",
        "observation period",
        "updosing",
        "uncontrolled asthma"
      ],
      "guidanceRef": "FDA labeling requirements for allergen extracts (boxed warning); WAO Systemic Reaction Grading System"
    },
    {
      "id": "allergy-dbpcfc-conduct",
      "scope": "section",
      "instruction": "For food allergy immunotherapy, the efficacy endpoint must rest on a double-blind placebo-controlled food challenge conducted to a prespecified, validated protocol: the challenge material and its allergen-protein content per dose, the dose-escalation schedule and interval, the objective stopping criteria (using predefined objective signs rather than subjective symptoms alone), the blinding and matrix-masking validation, the required medical supervision and resuscitation capability, and the definition of the tolerated dose (both the single highest tolerated dose and the cumulative tolerated dose). Baseline (entry) and exit challenges must use the same protocol, and the responder threshold must be prespecified in milligrams of allergen protein with a clinical rationale tied to real-world accidental-exposure amounts.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "DBPCFC",
        "food challenge",
        "eliciting dose",
        "cumulative tolerated dose",
        "peanut protein",
        "challenge stopping criteria",
        "desensitization"
      ],
      "guidanceRef": "FDA Guidance for Industry: Peanut Allergy - Developing Drug Products for Oral Immunotherapy"
    },
    {
      "id": "allergy-eec-versus-field",
      "scope": "section",
      "instruction": "Distinguish clearly between environmental exposure chamber (EEC) data and natural-exposure field-trial data in both design and claims. EEC studies may support dose-finding, onset of action, and duration of effect, and require a validated chamber with documented allergen concentration homogeneity, particle characterization, temperature/humidity control, and demonstrated reproducibility of the symptom response. Confirmatory efficacy for a marketing claim is generally expected from at least one adequately powered natural-exposure field trial covering a full and documented pollen season, with pollen counts from certified counting stations reported alongside the symptom data. Do not present EEC results as a substitute for field confirmation without a prospectively agreed Agency position.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "environmental exposure chamber",
        "EEC",
        "pollen count",
        "natural exposure",
        "field trial",
        "season definition",
        "chamber validation"
      ],
      "guidanceRef": "EMA CHMP/EWP/18504/2006; FDA Guidance: Allergic Rhinitis - Developing Drug Products for Treatment"
    },
    {
      "id": "allergy-sustained-effect",
      "scope": "section",
      "instruction": "Where a disease-modification or sustained-effect claim is sought, the program must include a treatment-free follow-up period after completing the full course (conventionally three years of treatment followed by at least one and preferably two treatment-free seasons), with the same primary endpoint and the same diary and rescue-medication rules applied in the follow-up. Prespecify the sustained-effect analysis, address the attrition that accumulates over a five-year design, and do not infer sustained benefit from immunologic markers (specific IgG4, IgE-blocking factor) alone.",
      "severity": "major",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "sustained effect",
        "disease modification",
        "treatment-free follow-up",
        "three-year course",
        "IgG4",
        "blocking antibody",
        "long-term efficacy"
      ],
      "guidanceRef": "EMA CHMP/EWP/18504/2006"
    },
    {
      "id": "allergy-mixture-and-homologous-groups",
      "scope": "section",
      "instruction": "When multiple allergens are combined in one product, address the scientific basis for the mixture explicitly: cross-reactivity and homologous-group justification, the proteolytic degradation risk when enzymatically active extracts (notably mold, insect, and some epidermal extracts) are mixed with labile pollen allergens, the resulting stability data for the actual mixture as supplied, and whether the per-allergen dose in the mixture remains at the clinically effective level demonstrated for the individual allergen. Do not extrapolate single-allergen efficacy to an unstudied multi-allergen mixture without justification.",
      "severity": "major",
      "appliesTo": "3.2.S.2",
      "triggerKeywords": [
        "allergen mixture",
        "homologous group",
        "cross-reactivity",
        "proteolytic degradation",
        "mold extract",
        "multi-allergen",
        "compounding"
      ],
      "guidanceRef": "EMA EMEA/CHMP/BWP/304831/2007; 21 CFR 680.3"
    },
    {
      "id": "allergy-biologic-type2-safety",
      "scope": "section",
      "instruction": "For biologics targeting allergic/type 2 pathways (anti-IgE, anti-IL-5/IL-5Ra, anti-IL-4Ra, anti-TSLP), present a safety summary organized around the modality's recognized risks: anaphylaxis and delayed hypersensitivity to the biologic itself (with the observation-period and self-administration policy stated), helminth/parasitic infection given the eosinophil and type 2 mechanism, immunogenicity with a validated tiered screening/confirmatory/neutralizing assay strategy demonstrating drug tolerance at trough, injection-site reactions, and product-specific findings such as conjunctivitis with IL-4Ra blockade and transient eosinophilia. Include exposure-adjusted incidence rates and cross-reference the immunogenicity impact on PK, efficacy, and safety.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "anti-IgE",
        "omalizumab class",
        "anti-IL-5",
        "IL-4 receptor alpha",
        "TSLP",
        "immunogenicity",
        "anti-drug antibody",
        "helminth",
        "eosinophilia"
      ],
      "guidanceRef": "FDA Guidance: Immunogenicity Assessment for Therapeutic Protein Products; ICH S8 Immunotoxicity Studies"
    },
    {
      "id": "allergy-pediatric-program",
      "scope": "module",
      "instruction": "Design the pediatric program as a primary rather than an afterthought, because allergic rhinitis, food allergy, and atopic disease are predominantly pediatric. Provide efficacy data in the pediatric age range being sought (adolescents and, where indicated, children from age 5 or younger for food allergy), age-appropriate dosage forms and administration instructions, caregiver-administration usability data, and a safety database adequate to characterize systemic reactions in children, who may report prodromal symptoms less reliably. Justify any extrapolation of adult efficacy with immunologic and dose-response bridging rather than assertion.",
      "severity": "major",
      "appliesTo": "5",
      "triggerKeywords": [
        "pediatric",
        "adolescent",
        "children under 5",
        "caregiver administration",
        "age-appropriate",
        "extrapolation",
        "school-age"
      ],
      "guidanceRef": "ICH E11(R1); FDA Guidance: Peanut Allergy - Developing Drug Products for Oral Immunotherapy"
    },
    {
      "id": "allergy-diary-compliance-estimand",
      "scope": "section",
      "instruction": "Because the primary endpoint is a diary-derived seasonal average, prespecify the estimand with explicit intercurrent-event strategies for treatment discontinuation, use of prohibited rescue medication beyond the defined hierarchy, relocation out of the pollen zone, and days with missing diary entries. State the minimum number of evaluable diary days required for a subject to contribute to the seasonal average, the rule for constructing the average from partial data, and the sensitivity analyses (multiple imputation, worst-case, and a tipping-point analysis) that test the missing-data assumption. Also prespecify how the pollen season itself is defined and by whom, since a post hoc season redefinition is a recognized source of bias.",
      "severity": "critical",
      "appliesTo": "5.3.5.3",
      "triggerKeywords": [
        "diary compliance",
        "missing days",
        "season definition",
        "estimand",
        "intercurrent event",
        "prohibited medication",
        "seasonal average"
      ],
      "guidanceRef": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials"
    }
  ],
  "riskFactors": [
    "Potency and reference-standard instability: loss or drift of the CBER reference standard or the manufacturer's in-house reference preparation, or an inadequately bridged IHRP replacement, invalidating the link between the clinical dose and the commercial product.",
    "Batch-to-batch variability inherent to biologically sourced extracts, where source-material variation (pollen collection site and season, mite culture medium, venom collection) propagates into allergen content and clinical dose.",
    "Proteolytic degradation of labile allergens when enzymatically active extracts are mixed, producing a marketed mixture with materially lower effective potency than the studied single-allergen product.",
    "Anaphylaxis and fatal systemic reactions, concentrated in patients with uncontrolled or severe asthma, during updosing, after dosing errors, and with at-home administration - the dominant benefit-risk issue for the entire class and the basis for the boxed warning on allergen extracts.",
    "Season-dependent efficacy failure: an unusually weak pollen season, an atypical season timing, or a geographically shifted season can leave a field trial underpowered on effect size regardless of the drug's true activity, and repeating the trial costs a full year.",
    "Very high and variable placebo response in allergic rhinitis and in food-challenge settings, driven by symptom subjectivity and by expectancy effects during challenge procedures.",
    "Diary non-compliance over a multi-month season, producing large amounts of missing daily data at exactly the timepoints (peak season) that carry the most weight in the primary endpoint.",
    "Regulatory-pathway misclassification: treating an allergen immunotherapy product as a CDER drug rather than a CBER biologic, or relying on the historical practitioner-compounding practice for mixed extracts when a licensed product is required, leading to fundamental submission-strategy failure.",
    "EU-specific exposure for allergen products marketed under national named-patient or Therapieallergene-Verordnung arrangements, where a formal marketing authorization now requires a full clinical dossier that legacy products never generated.",
    "Immunogenicity and cross-reactivity complexity for anti-IgE and other type 2 biologics, where anti-drug antibodies can alter free-IgE dynamics and confound both PK and efficacy interpretation.",
    "Food-challenge safety and operational risk: severe reactions during entry or exit DBPCFC, unblinding through taste or texture of the challenge matrix, and inconsistent application of stopping criteria across sites, all of which threaten endpoint integrity.",
    "Insufficient long-term safety exposure for a chronic, multi-year immunotherapy course, where ICH E1 expectations and the need to characterize rare severe systemic reactions require a much larger database than efficacy alone would demand."
  ],
  "commonGaps": [
    {
      "ctdSection": "3.2.S.4",
      "patterns": [
        "potency not standardized",
        "major allergen not quantified",
        "no reference standard",
        "ihrp replacement not bridged",
        "pnu only",
        "no ige inhibition assay",
        "batch consistency not demonstrated"
      ],
      "description": "Potency and allergen-content control strategy is inadequate: no validated major-allergen quantification, no total allergenic activity assay, potency expressed only as w/v or PNU without a defined biological unit, or no documented procedure for qualifying a replacement reference preparation.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA EMEA/CHMP/BWP/304831/2007; 21 CFR Part 680"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "csms not prespecified",
        "medication score weighting",
        "rescue hierarchy not defined",
        "peak season defined post hoc",
        "clinical relevance not justified",
        "endpoint changed after unblinding"
      ],
      "description": "Combined symptom and medication score is incompletely specified: rescue-medication hierarchy and point values not prespecified, symptom/medication weighting unjustified, analysis period (peak versus entire season) chosen after seeing the data, or clinical relevance of the observed difference not argued.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA CHMP/EWP/18504/2006"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "dose finding not performed",
        "dose selection not justified",
        "dose response not demonstrated",
        "immunologic marker used for dose",
        "different formulation in phase 2",
        "no dose ranging"
      ],
      "description": "No adequate dose-finding study establishing the clinically effective dose in the target population; the confirmatory trial dose is selected from immunologic markers or from another sponsor's product rather than from a prospective dose-ranging study with the final formulation.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA CHMP/EWP/18504/2006; ICH E4 Dose-Response Information to Support Drug Registration"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no grading system",
        "systemic reactions not graded",
        "epinephrine use not reported",
        "time to onset not analyzed",
        "asthma status not characterized",
        "home dosing reactions not separated",
        "observation period not stated"
      ],
      "description": "Systemic reaction and anaphylaxis data are not presented with a single prespecified grading system, not cross-tabulated by dosing phase and setting, or epinephrine use and time-to-onset are not reported; asthma status of subjects experiencing severe reactions is not characterized.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "WAO Systemic Reaction Grading System; ICH E2E"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "estimand not defined",
        "missing diary days not addressed",
        "minimum evaluable days not specified",
        "no sensitivity analysis",
        "imputation method not prespecified",
        "discontinuation handling unclear"
      ],
      "description": "Estimand and missing-data strategy for a diary-based seasonal endpoint are undefined: no minimum evaluable-days rule, no prespecified handling of discontinuation or prohibited rescue use, and no tipping-point or worst-case sensitivity analysis.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "pollen counts not reported",
        "season not defined prospectively",
        "certified counting station",
        "exposure not documented",
        "site-level pollen data missing",
        "season redefined"
      ],
      "description": "Pollen season definition, pollen counts from certified stations, or environmental exposure documentation is missing or provided only for a subset of sites, making it impossible to verify that subjects were meaningfully exposed during the analysis period.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA CHMP/EWP/18504/2006"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "challenge protocol not standardized",
        "stopping criteria subjective",
        "matrix masking not validated",
        "protein content not verified",
        "entry exit challenge differ",
        "dose interval varied",
        "challenge unblinded"
      ],
      "description": "Food challenge protocol is deficient: challenge material allergen-protein content not analytically verified, stopping criteria subjective or inconsistently applied, blinding/matrix masking not validated, or entry and exit challenges use different dose schedules.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Peanut Allergy - Developing Drug Products for Oral Immunotherapy"
    },
    {
      "ctdSection": "3.2.S.2",
      "patterns": [
        "source material not specified",
        "botanical identity not confirmed",
        "contaminating allergens not controlled",
        "culture medium not described",
        "adventitious agent testing missing",
        "collection process not documented"
      ],
      "description": "Source-material control is inadequate: no specification for the raw allergenic source (botanical or entomological identity, collection site and season, purity, contaminant allergens), no control of adventitious agents for animal-derived materials, and no documentation of the mite culture medium or venom collection process.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA EMEA/CHMP/BWP/304831/2007"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "immunogenicity assay not validated",
        "drug tolerance not demonstrated",
        "no neutralizing antibody assay",
        "ada impact not assessed",
        "pre-existing antibodies not evaluated",
        "sampling schedule inadequate"
      ],
      "description": "Immunogenicity assessment for a type 2 biologic is inadequate: assay not validated for drug tolerance at trough, no neutralizing-antibody tier, ADA incidence not related to PK, efficacy, or hypersensitivity events, and no assessment of pre-existing antibodies.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products - Developing and Validating Assays for Anti-Drug Antibody Detection"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "sustained effect not demonstrated",
        "no treatment-free follow-up",
        "igg4 used as evidence of efficacy",
        "disease modification claimed",
        "long-term benefit inferred",
        "follow-up season not analyzed"
      ],
      "description": "Sustained-effect or disease-modification claim is asserted without a treatment-free follow-up period using the same primary endpoint, or is supported only by immunologic surrogates such as specific IgG4 or IgE-blocking factor.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA CHMP/EWP/18504/2006"
    },
    {
      "ctdSection": "1.14.1",
      "patterns": [
        "no boxed warning",
        "epinephrine requirement absent",
        "first dose observation not specified",
        "human factors not performed",
        "instructions for use missing",
        "medication guide inconsistent",
        "rems not proposed"
      ],
      "description": "Proposed labeling and risk-management materials do not reflect the anaphylaxis risk: no boxed warning language consistent with the class, no epinephrine auto-injector co-prescription requirement, no in-clinic first-dose observation instruction, or Instructions for Use not validated by human factors testing for caregiver/self administration.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Guidance: Format and Content of a REMS Document; FDA Guidance: Applying Human Factors and Usability Engineering to Medical Devices"
    },
    {
      "ctdSection": "3.2.P.8",
      "patterns": [
        "in-use stability missing",
        "diluted concentration not tested",
        "protein adsorption not assessed",
        "cold chain excursion",
        "multi-dose vial stability",
        "reconstitution not studied"
      ],
      "description": "Stability program does not reflect real use: no in-use stability for multi-dose vials after first puncture, no data on diluted maintenance concentrations prepared at the point of care, no protein-adsorption assessment for dilute allergen solutions, and no cold-chain excursion data.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH Q1A(R2); ICH Q5C Stability Testing of Biotechnological/Biological Products"
    }
  ],
  "guidanceRefs": [
    {
      "code": "EMA CHMP/EWP/18504/2006",
      "authority": "EMA",
      "title": "Guideline on the Clinical Development of Products for Specific Immunotherapy for the Treatment of Allergic Diseases",
      "why": "The single most important clinical guideline in this area. Defines the required dose-finding step, the combined symptom and medication score as the primary endpoint with its construction rules, the expectation of natural-exposure field trials over full seasons, and the design needed to support a sustained-effect claim. Anchors Module 2.5 and the pivotal protocol."
    },
    {
      "code": "EMEA/CHMP/BWP/304831/2007",
      "authority": "EMA",
      "title": "Guideline on Allergen Products: Production and Quality Issues",
      "why": "Governs the Module 3 package for allergen products: source-material control, in-house reference preparation establishment and replacement, total allergenic activity and major-allergen quantification, mixture and homologous-group justification, and batch consistency. Essential for any EU allergen marketing authorization."
    },
    {
      "code": "21 CFR Part 680",
      "authority": "FDA",
      "title": "Additional Standards for Bacterial Products / Allergenic Products (21 CFR 680.1-680.3)",
      "why": "The binding US regulation for allergenic product manufacture, licensing, potency testing, and labeling, including the requirement to test against CBER reference standards where they exist and the constraints on preparing mixtures. Determines that these products are BLAs reviewed by CBER, not NDAs."
    },
    {
      "code": "FDA Guidance for Industry - Peanut Allergy: Developing Drug Products for Oral Immunotherapy",
      "authority": "FDA",
      "title": "Peanut Allergy: Developing Drug Products for Oral Immunotherapy",
      "why": "Sets FDA's expectations for food-allergy OIT: DBPCFC design for entry and exit challenges, objective stopping criteria, the tolerated-dose responder definition and its clinical justification, the required safety monitoring and epinephrine provisions, and the pediatric age range. Directly shapes 5.3.5.1 and 2.7.4."
    },
    {
      "code": "FDA Guidance for Industry - Allergic Rhinitis: Clinical Development Programs for Drug Products",
      "authority": "FDA",
      "title": "Allergic Rhinitis: Developing Drug Products for Treatment",
      "why": "Provides FDA's framework for symptomatic allergic rhinitis pharmacotherapy - reflective and instantaneous total nasal symptom scores, seasonal versus perennial trial design, onset-of-action assessment, and the role of environmental exposure chambers. Used for the CDER-reviewed portion of an allergy portfolio."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Addendum on Estimands and Sensitivity Analysis in Clinical Trials to the Guideline on Statistical Principles for Clinical Trials",
      "why": "Provides the framework for handling this area's dominant intercurrent events - rescue-medication use above the defined hierarchy, treatment discontinuation after a systemic reaction, missing diary days, and relocation out of the pollen zone - and the sensitivity analyses reviewers require for a diary-derived seasonal endpoint."
    },
    {
      "code": "ICH E4",
      "authority": "ICH",
      "title": "Dose-Response Information to Support Drug Registration",
      "why": "Underpins the requirement, enforced strictly by CHMP in immunotherapy, for a prospective dose-ranging study in the target population with the final formulation before the confirmatory trial. Cited when justifying the dose carried into Phase 3 in Module 2.5 and 2.7.3."
    },
    {
      "code": "FDA Guidance for Industry - Immunogenicity Testing of Therapeutic Protein Products: Developing and Validating Assays for Anti-Drug Antibody Detection",
      "authority": "FDA",
      "title": "Immunogenicity Testing of Therapeutic Protein Products - Developing and Validating Assays for Anti-Drug Antibody Detection",
      "why": "Defines the tiered screening/confirmatory/titer/neutralizing assay strategy, drug-tolerance and target-interference requirements, and sampling schedule needed for anti-IgE, anti-IL-5, anti-IL-4Ra and anti-TSLP biologics in this area. Governs the immunogenicity subsection of 2.7.4 and the assay validation reports in 5.3.1."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Frames the pediatric-first reality of allergy development, including age-cohort selection, caregiver administration, formulation acceptability for sublingual tablets and oral immunotherapy powders, and the limits of extrapolating adult efficacy to children."
    },
    {
      "code": "ICH Q5C",
      "authority": "ICH",
      "title": "Stability Testing of Biotechnological/Biological Products",
      "why": "Governs the stability program for allergen extracts and therapeutic proteins in this area, including the need for stability-indicating potency assays, in-use and diluted-solution stability, and handling of freeze-thaw and cold-chain excursions for biologically variable material."
    },
    {
      "code": "ICH E2E",
      "authority": "ICH",
      "title": "Pharmacovigilance Planning",
      "why": "Structures the safety specification and pharmacovigilance plan around anaphylaxis and severe systemic reactions - the defining risk of the class - including targeted follow-up questionnaires, registry commitments, and effectiveness evaluation of risk-minimization measures such as epinephrine co-prescription."
    },
    {
      "code": "FDA Guidance for Industry - Format and Content of a REMS Document",
      "authority": "FDA",
      "title": "Format and Content of a REMS Document",
      "why": "Relevant because several oral and sublingual immunotherapy products carry a REMS with elements to assure safe use (certified prescribers, certified pharmacies or healthcare settings, and documented patient counseling). Used to draft the proposed REMS submitted in Module 1 and to align it with the boxed warning."
    }
  ],
  "reviewerExpectations": [
    "CBER reviewers will trace the clinical dose from the pivotal trial lots through the reference standard to the proposed commercial specification, and will reject a dossier where the clinical dose cannot be expressed in a controllable potency unit tied to a qualified reference preparation.",
    "Reviewers expect a prospective dose-ranging study conducted with the final formulation in the target population; a Phase 3 dose selected from immunologic markers, from a different formulation, or from published data on another sponsor's product will be challenged as unsupported.",
    "The clinical reviewer will examine the pollen season definition, the certified pollen-count data by site and year, and whether the peak-season analysis window was fixed before unblinding; a post hoc season window is treated as a serious threat to the result's credibility.",
    "Safety reviewers focus on systemic reactions graded by a single prespecified scale, cross-tabulated by updosing versus maintenance, in-clinic versus at-home, and by asthma control status, together with epinephrine use and time to onset.",
    "Reviewers expect the proposed labeling to carry class-consistent anaphylaxis warnings, a requirement for epinephrine auto-injector availability, first-dose in-clinic observation, and human-factors-validated Instructions for Use for self or caregiver administration.",
    "For food allergy programs the reviewer will scrutinize DBPCFC conduct in detail: verified allergen-protein content per challenge dose, objective stopping criteria applied consistently, validated masking, and identical entry and exit protocols.",
    "Statistical reviewers expect a fully specified estimand for the seasonal diary endpoint, a prespecified minimum number of evaluable diary days, and tipping-point sensitivity analyses; they will recompute the CSMS from raw diary data to confirm the reported score construction.",
    "EU assessors additionally expect an argument for clinical relevance of the effect size, not only statistical significance, and will probe an effect below roughly 20 percent relative to placebo on the combined score.",
    "Quality reviewers expect batch-to-batch consistency data on at least three consecutive commercial-scale lots with both major-allergen content and total allergenic activity, and a documented, prospectively defined procedure for replacing the in-house reference preparation.",
    "For type 2 biologics, reviewers expect a validated immunogenicity assay demonstrating drug tolerance at trough concentrations and an analysis relating ADA status to PK, efficacy, and hypersensitivity events, plus a helminth-infection risk discussion in the RMP."
  ],
  "pathwayHints": [
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Applicable to food allergy immunotherapy and to therapies for severe, potentially fatal allergic conditions - peanut and other food allergy with a history of anaphylaxis, idiopathic anaphylaxis, mast cell disorders, and hereditary angioedema-adjacent programs - where preliminary data show substantial improvement over available therapy.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "The serious-condition criterion is met by food allergy with anaphylaxis history but not by uncomplicated seasonal allergic rhinitis. Where designation is granted, the safety database for rare severe systemic reactions and the REMS design usually become the rate-limiting elements rather than efficacy, so both should be raised at the first breakthrough meeting."
    },
    {
      "pathway": "fast_track",
      "applicability": "Available for food allergy immunotherapy in children, venom immunotherapy for high-risk stinging-insect anaphylaxis, and therapies for severe allergic conditions inadequately controlled by available treatment.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "The additional meetings should be used to fix the DBPCFC protocol, the tolerated-dose responder threshold, and the systemic-reaction grading system before the pivotal trial, since renegotiating any of these after the trial begins usually costs a full study."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Applies to rare allergic and mast-cell conditions - systemic mastocytosis, hereditary alpha-tryptasemia-associated disease, idiopathic anaphylaxis, eosinophilic esophagitis subsets, and rare venom or occupational allergen indications with small US prevalence.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Orphan status does not relax the CBER quality expectations for allergen products - potency standardization and reference-standard management remain fully applicable regardless of population size. It does support smaller efficacy databases and greater reliance on registry and natural-history data in 5.3.5.4."
    },
    {
      "pathway": "priority_review",
      "applicability": "Appropriate where the product would be the first approved therapy for a food allergy or a severe allergic condition, or offers a materially safer administration route (for example a sublingual alternative to a subcutaneous regimen with a lower systemic-reaction rate).",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "Because the labeling for these products carries a boxed warning and often a REMS, the six-month clock is dominated by risk-management negotiation. Submit a fully drafted REMS and human-factors-validated Instructions for Use with the original application rather than during review."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME may apply to therapies for severe food allergy or rare severe allergic/mast-cell disease with high unmet need where early clinical data show a clinically relevant advantage.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "The rapporteur will focus early scientific advice on the CSMS or challenge-based endpoint construction and on the allergen-product quality package, which is the most common source of EU major objections. Requesting EU advice on the in-house reference preparation strategy early is more valuable than advice on trial size."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "Applicable in the EU for seriously debilitating or life-threatening allergic disease - severe food allergy in young children, rare mast-cell disorders - where the full sustained-effect dataset (which requires a multi-year treatment-free follow-up) is not yet available at submission.",
      "impactedSections": [
        "2.5",
        "1.8.2",
        "5.3.5.1"
      ],
      "reviewerNotes": "The specific obligations will almost certainly require completion of the treatment-free follow-up seasons and a systemic-reaction registry. The RMP must convert the anaphylaxis uncertainty into concrete additional pharmacovigilance and risk-minimization activity with measurable effectiveness indicators."
    }
  ],
  "statisticalConsiderations": [
    "Fully specify the estimand for the combined symptom and medication score, naming rescue-medication use above the defined hierarchy, treatment discontinuation (often triggered by a systemic reaction, which is informative and not missing at random), relocation out of the pollen zone, and missing diary days; state the population-level summary and confirm the analysis model implements the stated strategy.",
    "Prespecify the diary-completeness rule: the minimum number of evaluable days within the analysis window for a subject to contribute, the method of constructing the seasonal average from partial data, and the treatment of days with zero exposure; changing this rule after unblinding invalidates the primary analysis.",
    "Analyze the CSMS with a prespecified model appropriate to its distribution - typically an ANCOVA or mixed model on the seasonal average adjusted for stratification factors and baseline/pre-season severity - and provide a nonparametric (rank-based) sensitivity analysis given the skew and floor effects common in mild seasons.",
    "Prespecify the pollen season and the peak-season window using an objective, publicly verifiable rule based on certified pollen counts (for example a defined threshold of grains per cubic metre sustained over a defined number of days), and fix the rule and the data source before database lock.",
    "Control the family-wise error rate across the key secondary endpoints (symptom score alone, medication score alone, RQLQ, well-days, onset of action) with a prespecified hierarchical or graphical procedure entered only after the primary succeeds; do not present multiple unadjusted secondary comparisons as supportive evidence.",
    "For food allergy, prespecify the responder definition as tolerating a stated single highest dose or cumulative dose of allergen protein at exit challenge without dose-limiting objective symptoms, analyze it as a binary endpoint with non-responder imputation for missing or non-completed challenges, and provide the full tolerated-dose distribution (not only the responder proportion) as a supportive analysis.",
    "Address the informative nature of discontinuation due to adverse events in immunotherapy: subjects who stop because of systemic reactions are systematically different, so a simple MAR-based analysis is optimistic; include a jump-to-reference or delta-adjusted multiple imputation and a tipping-point analysis.",
    "Where the design spans multiple seasons or a treatment-free follow-up, prespecify whether each season is analyzed separately or pooled, define the analysis population for the follow-up seasons in light of cumulative attrition, and avoid interpreting a follow-up-season result as confirmatory if the retained population is no longer randomization-balanced.",
    "Interim analyses in seasonal trials are constrained by the calendar; if used, prespecify alpha spending, the DMC charter, and the practical reality that a season cannot be extended - and account for the operational bias risk when interim results become available between seasons.",
    "Prespecify subgroup analyses by sensitization profile (mono- versus poly-sensitized), baseline specific IgE and skin-prick reactivity, asthma status, age group, and geographic region with interaction testing, and report enrollment against the Diversity Action Plan; poly-sensitized subjects are a recognized source of heterogeneity in immunotherapy effect estimates."
  ],
  "endpointConsiderations": [
    "The combined symptom and medication score (CSMS) over the pollen season, or over the peak-season window, is the accepted primary efficacy endpoint for allergic rhinitis/rhinoconjunctivitis immunotherapy in both the US and EU; its caveat is that the effect size depends heavily on season intensity and on the rescue-medication hierarchy chosen, and EU assessors expect a clinically relevant, not merely significant, difference.",
    "Total nasal symptom score (TNSS) and total ocular symptom score (TOSS), scored reflectively or instantaneously on 0-3 ordinal scales, are the standard building blocks; reflective and instantaneous scoring answer different questions (average control versus point-in-time control) and should not be interchanged between the protocol and the CSR.",
    "Rescue-medication score with a prespecified tiered hierarchy (oral antihistamine, intranasal corticosteroid, oral corticosteroid) is essential because unrestricted rescue use otherwise masks the treatment effect; the point values assigned to each tier materially affect the result and must be justified prospectively.",
    "In food allergy, the proportion of subjects tolerating a prespecified single dose of allergen protein at exit DBPCFC without dose-limiting symptoms is the accepted primary endpoint; the threshold must be justified against realistic accidental-exposure amounts, and the endpoint measures desensitization during ongoing therapy, not sustained unresponsiveness.",
    "Sustained unresponsiveness, assessed by challenge after a defined period off therapy, is a distinct and more demanding claim than desensitization and requires its own prespecified challenge timing and analysis; it should never be inferred from desensitization data.",
    "Environmental exposure chamber symptom scores support onset of action, duration of effect, and dose-finding, and offer excellent control of exposure, but their translation to natural-exposure effect size is not established, so they are generally supportive rather than confirmatory for a marketing claim.",
    "Rhinoconjunctivitis Quality of Life Questionnaire (RQLQ) is the conventional health-related quality-of-life measure, with a conventional 0.5-point per-item minimal important difference that should be confirmed by anchor-based analysis in the study population before it supports a labeling claim.",
    "Well days or symptom-free days (days with symptom score below a threshold and no rescue medication) are intuitive supportive endpoints but are highly sensitive to the threshold definition and to season intensity, so the definition must be prespecified.",
    "Urticaria Activity Score over 7 days (UAS7), with its itch and hive severity components, is the accepted primary endpoint in chronic spontaneous urticaria, with a prespecified responder definition (commonly UAS7 of 6 or less, or a complete response of UAS7 equal to 0) and a documented daily-diary compliance rule.",
    "Sting challenge outcome (absence of a systemic reaction on deliberate sting challenge) is the classical efficacy demonstration for venom immunotherapy, but its use is limited by ethical and practical constraints, so field-sting outcome data and registry evidence often supplement it.",
    "Immunologic biomarkers - allergen-specific IgG4, IgE-blocking factor, basophil activation, and the specific IgE/total IgE ratio - are valuable for mechanism, dose-response, and consistency arguments in Module 2.7.2, but they are not accepted surrogates for clinical efficacy and must not carry a claim on their own.",
    "Asthma-related endpoints (asthma symptom and medication scores, exacerbations, time to first asthma event) are increasingly included in house-dust-mite immunotherapy programs seeking an allergic-asthma indication; these require an asthma-appropriate population definition, spirometry to the ATS/ERS standard, and prespecified inhaled-corticosteroid reduction rules."
  ],
  "retrievalKeywords": [
    "allergen immunotherapy",
    "subcutaneous immunotherapy",
    "sublingual immunotherapy",
    "slit tablet",
    "allergenic extract",
    "standardized extract",
    "bioequivalent allergy unit",
    "bau",
    "major allergen content",
    "in-house reference preparation",
    "total allergenic activity",
    "ige inhibition elisa",
    "combined symptom and medication score",
    "csms",
    "total nasal symptom score",
    "tnss",
    "rescue medication score",
    "pollen count",
    "pollen season definition",
    "environmental exposure chamber",
    "natural exposure field trial",
    "rqlq",
    "allergic rhinoconjunctivitis",
    "house dust mite",
    "ragweed",
    "timothy grass",
    "birch pollen",
    "venom immunotherapy",
    "sting challenge",
    "peanut oral immunotherapy",
    "dbpcfc",
    "double-blind placebo-controlled food challenge",
    "eliciting dose",
    "cumulative tolerated dose",
    "desensitization",
    "sustained unresponsiveness",
    "anaphylaxis",
    "systemic reaction grading",
    "wao grading",
    "epinephrine auto-injector",
    "boxed warning allergen extract",
    "rems",
    "updosing",
    "maintenance dose",
    "chronic spontaneous urticaria",
    "uas7",
    "omalizumab anti-ige",
    "anti-il-5",
    "il-4 receptor alpha",
    "tslp",
    "specific igg4",
    "basophil activation test",
    "skin prick test",
    "cber allergenics",
    "21 cfr 680",
    "therapieallergene-verordnung",
    "poly-sensitized",
    "immunogenicity anti-drug antibody"
  ]
};

export default allergyProfile;
