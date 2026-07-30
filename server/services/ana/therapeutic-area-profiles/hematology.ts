/**
 * Hematology - Non-Malignant therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/hematology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const hematologyProfile: TherapeuticAreaProfile = {
  "id": "hematology",
  "displayName": "Hematology - Non-Malignant",
  "description": "Regulatory profile for non-malignant hematology: sickle cell disease, transfusion-dependent and non-transfusion-dependent thalassemia, hemophilia A and B (including inhibitor populations and gene therapy), von Willebrand disease and rare bleeding disorders, immune thrombocytopenia, paroxysmal nocturnal hemoglobinuria and complement-mediated disorders (aHUS, cold agglutinin disease, warm autoimmune hemolytic anemia), thrombotic thrombocytopenic purpura, aplastic anemia and bone marrow failure syndromes, and iron disorders. Reviewed by FDA's Division of Non-Malignant Hematology (CDER) or by CBER's Office of Therapeutic Products for cell and gene therapies, and at EMA by the Blood Products Working Party, CHMP and the Committee for Advanced Therapies. Programs are characterized by small, ultra-rare populations, event-rate endpoints with heavy overdispersion, transfusion as a pervasive confounder and intercurrent event, and - for gene and genome-editing therapies - decades-long follow-up obligations.",
  "contextRules": [
    {
      "id": "hem-ctx-abr-analysis",
      "scope": "section",
      "instruction": "For bleeding-rate endpoints in hemophilia and related disorders, present the annualized bleeding rate using a negative binomial (or, where justified, a Poisson model with robust variance) with log of the observation period as offset, report the dispersion parameter, and give both the model-based rate ratio with 95% confidence interval and the observed mean and median ABR with the proportion of subjects with zero bleeds. Where an intra-patient comparison against a prospectively collected pre-study period is used, state explicitly that the design is non-randomized, quantify regression-to-the-mean and reporting-bias risk, and provide a concurrent or external comparator analysis as support.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "annualized bleeding rate",
        "abr",
        "negative binomial",
        "intra-patient comparison",
        "bleeding episodes",
        "zero bleeds"
      ],
      "guidanceRef": "EMA-FVIII-2018"
    },
    {
      "id": "hem-ctx-factor-assay",
      "scope": "section",
      "instruction": "Characterize and reconcile factor activity results obtained by the one-stage clotting assay versus the chromogenic substrate assay across the reagent and analyzer combinations used in routine clinical laboratories. Quantify the systematic discrepancy, state which assay was used for the pivotal PK and efficacy analyses, and propose the conversion or assay guidance that will appear in labeling; for modified or extended half-life molecules, provide a field study or reagent-panel evaluation. Cross-reference the bioanalytical validation reports in 5.3.1.4 and the labeling statement in Module 1.",
      "severity": "critical",
      "appliesTo": "2.7.1",
      "triggerKeywords": [
        "one-stage assay",
        "chromogenic assay",
        "factor viii activity",
        "factor ix activity",
        "reagent discrepancy",
        "aptt reagent"
      ]
    },
    {
      "id": "hem-ctx-inhibitor-immunogenicity",
      "scope": "section",
      "instruction": "Report inhibitor development using the Nijmegen-modified Bethesda assay with a pre-specified confirmation on a second independent sample, define low-titre and high-titre thresholds, and present incidence separately for previously untreated patients and previously treated patients with exposure-day denominators. For non-factor and protein therapeutics, report the full tiered anti-drug antibody package - screening, confirmatory, titre, neutralizing capacity - with the impact of ADA on pharmacokinetics, factor activity, efficacy and hypersensitivity events.",
      "severity": "critical",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "inhibitor",
        "bethesda",
        "nijmegen",
        "anti-drug antibody",
        "neutralizing antibody",
        "previously untreated patients",
        "exposure days"
      ],
      "guidanceRef": "FDA-IMMUNO-2019"
    },
    {
      "id": "hem-ctx-transfusion-confounding",
      "scope": "section",
      "instruction": "Wherever hemoglobin, hemolysis markers or platelet counts are used as endpoints, pre-specify the washout rule that excludes values measured within a defined window after red blood cell or platelet transfusion, and treat transfusion itself as an intercurrent event under the declared estimand. Report transfusion burden (units and episodes, annualized) as a co-primary or key secondary endpoint rather than as a background characteristic, and never present a hemoglobin response that has not been censored for recent transfusion.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "hemoglobin response",
        "transfusion independence",
        "transfusion burden",
        "red blood cell units",
        "ldh",
        "hemolysis",
        "washout"
      ]
    },
    {
      "id": "hem-ctx-gtx-longterm",
      "scope": "module",
      "instruction": "For gene therapy and genome-editing products, include the long-term follow-up protocol committing to 15 years of observation for integrating vectors and genome editing (5 years minimum for non-integrating AAV with a risk-based justification), specifying assessments for delayed adverse events, malignancy surveillance, vector shedding, persistence of transgene expression, integration-site analysis where applicable, and off-target editing assessment. File the protocol in 5.3.5.4 and mirror the commitment in the RMP and in Module 1.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "gene therapy",
        "long-term follow-up",
        "aav",
        "lentiviral vector",
        "integration site",
        "genome editing",
        "off-target",
        "vector shedding"
      ],
      "guidanceRef": "FDA-LTFU-2020"
    },
    {
      "id": "hem-ctx-aav-nab",
      "scope": "section",
      "instruction": "For AAV-based products, describe the pre-existing anti-AAV neutralizing (and total binding) antibody assay used for eligibility, its validation status, the cut-point derivation, and whether it will be commercialized as a companion or complementary diagnostic; state the eligibility threshold and its clinical justification, and quantify the fraction of the intended population excluded by it. Also describe the corticosteroid or immunomodulation algorithm used to manage transaminase elevations and its effect on durability of transgene expression.",
      "severity": "major",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "anti-aav antibody",
        "neutralizing antibody titer",
        "seroprevalence",
        "corticosteroid prophylaxis",
        "transaminitis",
        "durability of expression"
      ],
      "guidanceRef": "FDA-GTX-HEMO-2020"
    },
    {
      "id": "hem-ctx-external-control",
      "scope": "section",
      "instruction": "Where a single-arm design with an external or natural-history control is used because randomization is infeasible, pre-specify the control data source, the eligibility mapping between the external cohort and the trial population, the covariates used for adjustment (propensity score or matching), the handling of missing covariates, and quantitative bias analyses for unmeasured confounding. State that the external control protocol and statistical analysis plan were finalized before unblinding of the trial data and were discussed with the agency.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "external control",
        "natural history",
        "single-arm",
        "historical control",
        "propensity score",
        "registry data"
      ],
      "guidanceRef": "FDA-RARE-2023"
    },
    {
      "id": "hem-ctx-scd-endpoints",
      "scope": "section",
      "instruction": "In sickle cell disease, define the vaso-occlusive crisis endpoint precisely: acute pain or acute chest syndrome, priapism or hepatic/splenic sequestration requiring a healthcare-facility visit and parenteral or oral opioid or NSAID administration, with a minimum separation interval between distinct events and blinded independent adjudication of every reported event. State the hydroxyurea background policy (stable dose for a defined period, unchanged during the trial) and stratify randomization by baseline VOC frequency and hydroxyurea use.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "vaso-occlusive crisis",
        "voc",
        "acute chest syndrome",
        "hydroxyurea",
        "sickle cell",
        "adjudication committee"
      ],
      "guidanceRef": "FDA-SCD-2020"
    },
    {
      "id": "hem-ctx-thrombosis-infection",
      "scope": "section",
      "instruction": "For complement inhibitors, present encapsulated-organism infection risk as a pre-specified adverse event of special interest with the meningococcal vaccination and antibiotic-prophylaxis algorithm actually applied, breakthrough infection narratives, and the proposed REMS or EU additional risk-minimisation measures including the patient safety card. For thrombopoietin receptor agonists and for products used in PNH or TTP, present thromboembolic and hemorrhagic events with exposure-adjusted rates and against disease background rates.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "meningococcal",
        "encapsulated organism",
        "complement inhibitor",
        "rems",
        "thromboembolic",
        "breakthrough hemolysis"
      ]
    },
    {
      "id": "hem-ctx-pediatric",
      "scope": "module",
      "instruction": "Non-malignant hematologic diseases are predominantly pediatric-onset; plan pediatric development concurrently rather than sequentially. Document the extrapolation framework - similarity of disease pathophysiology and exposure-response between adults and children - the age-appropriate formulation, weight-band or body-weight dosing derived from population PK, and the growth and development assessments. For gene therapy in minors, address the additional consent, assent and long-term follow-up considerations explicitly.",
      "severity": "major",
      "appliesTo": "1",
      "triggerKeywords": [
        "pediatric",
        "adolescent",
        "weight-band dosing",
        "ipsp",
        "pip",
        "growth and development",
        "assent"
      ],
      "guidanceRef": "ICH-E11R1"
    },
    {
      "id": "hem-ctx-always-small-n",
      "scope": "always",
      "instruction": "In ultra-rare populations, do not compensate for a small N with post-hoc subgroup or endpoint selection. Every efficacy claim must trace to a pre-specified, alpha-protected analysis; supportive analyses must be labeled exploratory. Present individual patient-level data listings and responder profiles (spider or swimmer plots) alongside summary statistics, because reviewers in these divisions read the data patient by patient.",
      "severity": "major",
      "triggerKeywords": [
        "rare disease",
        "small sample",
        "post-hoc",
        "patient-level listing",
        "swimmer plot"
      ],
      "guidanceRef": "FDA-RARE-2023"
    }
  ],
  "riskFactors": [
    "Ultra-rare populations force single-arm or intra-patient-comparison designs whose interpretability depends entirely on the quality of the external or historical comparator; a weak natural-history dataset is the single most common cause of a complete response letter in this area.",
    "Transfusion, rescue factor concentrate and background hydroxyurea act as pervasive confounders of hemoglobin, hemolysis and bleeding endpoints, and their mishandling as intercurrent events is a recurring statistical deficiency.",
    "Factor activity assay discrepancy between one-stage and chromogenic methods can create a clinically meaningful mismatch between the labeled potency and what a hospital laboratory measures at the bedside, a patient-safety issue that reviewers treat as approvability-relevant.",
    "Gene therapy programs carry irreversible-exposure risk, hepatotoxicity requiring corticosteroid management, uncertain durability of transgene expression, insertional-oncogenesis concern for integrating vectors, and a 15-year follow-up obligation that must be operationally and financially credible at the time of filing.",
    "Complement inhibitors carry a life-threatening meningococcal infection risk that requires a REMS in the US and additional risk-minimisation measures in the EU, constraining distribution and prescriber certification.",
    "Immunogenicity - inhibitor formation in previously untreated hemophilia patients in particular - can render a product ineffective in the very population with the greatest need, and the previously-untreated-patient study is often a post-marketing requirement negotiated at approval.",
    "Endpoint acceptance is still evolving for several conditions (hemoglobin response in sickle cell disease, functional and patient-reported outcomes in bleeding disorders), so an endpoint accepted for one product is not a guarantee of acceptance for the next mechanism.",
    "Manufacturing comparability across process changes (scale-up, site transfer, potency assay bridging) is disproportionately consequential for cell, gene and plasma-derived products where the clinical bridging study may be infeasible."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "abr analysis method",
        "poisson without overdispersion",
        "no negative binomial",
        "intra-patient comparison bias",
        "regression to the mean",
        "pre-study bleed rate retrospective"
      ],
      "description": "Annualized bleeding rate analyzed with a model that ignores overdispersion, or based on a retrospectively collected pre-study bleeding rate that is subject to recall and regression-to-the-mean bias, without a sensitivity or external-comparator analysis.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA-FVIII-2018"
    },
    {
      "ctdSection": "2.7.1",
      "patterns": [
        "assay discrepancy not characterized",
        "one-stage chromogenic",
        "single reagent only",
        "no field study",
        "potency labeling not reconciled"
      ],
      "description": "Factor activity measured with a single assay/reagent combination and never reconciled against the range of methods used in clinical laboratories, leaving prescribers unable to monitor the product accurately and creating a labeling deficiency.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "inhibitor testing not standardized",
        "bethesda not nijmegen",
        "no confirmatory second sample",
        "ada assay not validated",
        "neutralizing assay missing",
        "exposure days not reported"
      ],
      "description": "Inhibitor or anti-drug antibody assessment lacks a validated Nijmegen-modified Bethesda or tiered ADA assay, a confirmatory repeat sample, neutralizing-antibody characterization, or exposure-day denominators for previously untreated patients.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-IMMUNO-2019"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "external control not justified",
        "natural history inadequate",
        "historical comparator mismatched",
        "no propensity adjustment",
        "unmeasured confounding not assessed",
        "control protocol finalized after"
      ],
      "description": "Single-arm evidence anchored to an external or historical control without a pre-specified comparability analysis, covariate adjustment, or quantitative bias analysis, and sometimes with the external-control analysis plan finalized after the trial data were seen.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-RARE-2023"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "long-term follow-up not",
        "15-year follow-up absent",
        "integration site analysis missing",
        "malignancy surveillance not planned",
        "shedding data incomplete",
        "off-target editing not assessed"
      ],
      "description": "Gene therapy or genome-editing application filed without an adequate long-term follow-up protocol, integration-site or off-target analysis plan, delayed-adverse-event surveillance, or vector shedding characterization.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-LTFU-2020"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "hemoglobin not censored",
        "post-transfusion value included",
        "transfusion not intercurrent",
        "transfusion burden not reported",
        "washout window undefined"
      ],
      "description": "Hemoglobin or hemolysis endpoints computed from values obtained shortly after transfusion, or transfusion handled as ordinary missing data rather than as a declared intercurrent event, systematically biasing the apparent treatment effect.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E9R1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "meningococcal risk not mitigated",
        "vaccination algorithm absent",
        "no rems proposal",
        "encapsulated organism",
        "prophylactic antibiotic not specified"
      ],
      "description": "For complement-directed therapies, the meningococcal and encapsulated-organism risk-mitigation strategy (vaccination timing, antibiotic prophylaxis, patient card, prescriber certification) is not specified or not aligned between the protocol, the RMP and the proposed REMS.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "3.2.S",
      "patterns": [
        "comparability not demonstrated",
        "potency assay bridging",
        "process change after pivotal",
        "vector genome titer method changed",
        "no analytical comparability protocol"
      ],
      "description": "Manufacturing process or potency-assay changes made between the pivotal clinical lots and the commercial process without a pre-agreed analytical comparability protocol, forcing a clinical bridging question that cannot be answered in a rare population.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-POTENCY-2023"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "voc definition ambiguous",
        "no blinded adjudication",
        "healthcare visit not required",
        "event separation interval undefined",
        "opioid use not documented"
      ],
      "description": "Vaso-occlusive crisis or other clinical-event endpoints defined loosely, without a required healthcare contact, a minimum inter-event interval, or blinded independent adjudication, leaving the primary endpoint vulnerable to ascertainment bias.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-SCD-2020"
    },
    {
      "ctdSection": "1.9",
      "patterns": [
        "pediatric development deferred",
        "no age-appropriate formulation",
        "weight-band dosing not justified",
        "pip not agreed",
        "growth assessment missing"
      ],
      "description": "Pediatric development deferred despite a pediatric-onset disease, without an age-appropriate formulation, population-PK-derived weight-band dosing, or growth and development monitoring.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E11R1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "small safety database not justified",
        "exposure-adjusted rate not provided",
        "no comparator context",
        "thrombotic events not analysed",
        "aesi not pre-specified"
      ],
      "description": "Safety analyses present raw counts in a small database without exposure adjustment, background disease rates, or pre-specified adverse events of special interest reflecting the mechanism (thrombosis, hemolysis, infection, hepatotoxicity).",
      "severity": "major",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-SCD-2020",
      "authority": "FDA",
      "title": "Sickle Cell Disease: Developing Drugs and Biological Products for Treatment (Guidance for Industry)",
      "why": "Provides FDA's expectations on the definition and adjudication of vaso-occlusive crises, acceptable hematologic and clinical endpoints, trial populations by genotype, hydroxyurea background therapy, and pediatric inclusion; the anchor document for the sickle cell efficacy strategy in 2.5 and 2.7.3."
    },
    {
      "code": "FDA-GTX-HEMO-2020",
      "authority": "FDA",
      "title": "Human Gene Therapy for Hemophilia (Guidance for Industry)",
      "why": "Addresses factor-activity endpoints versus bleeding-rate endpoints for gene therapy, durability of expression, pre-existing anti-AAV antibody eligibility testing, hepatotoxicity management and follow-up duration; used to design the pivotal gene therapy trial and to frame the durability discussion in 2.5."
    },
    {
      "code": "FDA-LTFU-2020",
      "authority": "FDA",
      "title": "Long Term Follow-Up After Administration of Human Gene Therapy Products (Guidance for Industry)",
      "why": "Establishes the risk-based framework and duration expectations (up to 15 years) for delayed adverse event surveillance, including integration-site analysis and malignancy monitoring; the basis for the long-term follow-up protocol filed in Module 5 and committed to in the RMP."
    },
    {
      "code": "FDA-GENOME-EDIT-2024",
      "authority": "FDA",
      "title": "Human Gene Therapy Products Incorporating Human Genome Editing (Guidance for Industry)",
      "why": "Sets expectations for on-target and off-target editing assessment, specificity assays, delivery-system characterization and long-term follow-up for editing-based therapies such as those for sickle cell disease and beta-thalassemia; drives Module 3 characterization and the nonclinical package."
    },
    {
      "code": "FDA-RARE-2023",
      "authority": "FDA",
      "title": "Rare Diseases: Considerations for the Development of Drugs and Biological Products (Guidance for Industry)",
      "why": "FDA's consolidated advice on natural-history studies, external controls, endpoint development, small-population trial design and evidence of effectiveness in rare diseases; used to justify the design and the external-control analysis in 2.5 and 2.7.3."
    },
    {
      "code": "FDA-NHS-2019",
      "authority": "FDA",
      "title": "Rare Diseases: Natural History Studies for Drug Development (Draft Guidance for Industry)",
      "why": "Specifies how a prospective or retrospective natural-history study should be designed and analyzed so it can support endpoint selection, enrichment and external control; the reference for the natural-history dataset submitted alongside a single-arm pivotal study."
    },
    {
      "code": "FDA-EXTERNAL-CONTROL-2023",
      "authority": "FDA",
      "title": "Considerations for the Design and Conduct of Externally Controlled Trials for Drug and Biological Products (Draft Guidance for Industry)",
      "why": "Defines when an externally controlled trial can support effectiveness, the comparability and data-quality requirements, and the need to prespecify the analysis before access to outcome data; used to defend single-arm evidence in ultra-rare hematologic disease."
    },
    {
      "code": "FDA-IMMUNO-2019",
      "authority": "FDA",
      "title": "Immunogenicity Testing of Therapeutic Protein Products - Developing and Validating Assays for Anti-Drug Antibody Detection (Guidance for Industry)",
      "why": "Prescribes the tiered screening, confirmatory, titre and neutralizing-antibody assay development and validation used for factor products, complement inhibitors and other protein therapeutics; supports 2.7.2 and the bioanalytical reports in 5.3.1.4."
    },
    {
      "code": "FDA-POTENCY-2023",
      "authority": "FDA",
      "title": "Potency Assurance for Cellular and Gene Therapy Products (Draft Guidance for Industry)",
      "why": "Sets out the potency assurance strategy, matrixed assays and lifecycle approach expected for cell and gene therapy products; central to the comparability argument when the process changes between pivotal and commercial manufacture."
    },
    {
      "code": "FDA-RMAT-2019",
      "authority": "FDA",
      "title": "Expedited Programs for Regenerative Medicine Therapies for Serious Conditions (Guidance for Industry)",
      "why": "Defines RMAT designation eligibility and benefits for cell and gene therapies in sickle cell disease, thalassemia and hemophilia, including the potential use of surrogate endpoints and real-world evidence to support accelerated approval."
    },
    {
      "code": "EMA-FVIII-2018",
      "authority": "EMA",
      "title": "Guideline on the Clinical Investigation of Recombinant and Human Plasma-Derived Factor VIII Products (EMA/CHMP/BPWP/144533/2009 Rev. 2)",
      "why": "EMA's controlling document for hemophilia A development: pharmacokinetic study design, minimum numbers of previously treated and previously untreated patients, exposure-day requirements, inhibitor surveillance and surgery data; used to size the EU clinical package and to align assay methodology."
    },
    {
      "code": "EMA-FIX-2018",
      "authority": "EMA",
      "title": "Guideline on the Clinical Investigation of Recombinant and Human Plasma-Derived Factor IX Products (EMA/CHMP/BPWP/144552/2009 Rev. 2)",
      "why": "The hemophilia B counterpart, including allergic-reaction and nephrotic-syndrome surveillance in previously untreated patients and recovery/half-life expectations; used for the EU-specific clinical and pharmacovigilance plan."
    },
    {
      "code": "EMA-ATMP-CT-2019",
      "authority": "EMA",
      "title": "Guideline on Quality, Non-Clinical and Clinical Requirements for Investigational Advanced Therapy Medicinal Products in Clinical Trials (EMA/CAT/852602/2018)",
      "why": "Defines the EU expectations for ATMP quality and non-clinical packages entering clinical trials, including vector characterization, biodistribution and shedding; the reference for CAT interactions on gene therapy for hemophilia and hemoglobinopathies."
    },
    {
      "code": "ICH-S12",
      "authority": "ICH",
      "title": "ICH S12 Nonclinical Biodistribution Considerations for Gene Therapy Products",
      "why": "Harmonized expectations for biodistribution study design, sample collection, analytical methods and data interpretation supporting first-in-human gene therapy; structures the nonclinical summary in 2.6 and Module 4."
    },
    {
      "code": "ICH-E9R1",
      "authority": "ICH",
      "title": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials",
      "why": "Required to define how transfusion, rescue factor administration, splenectomy, dose escalation and discontinuation are handled as intercurrent events; without it the hemoglobin, platelet and bleeding endpoints are not interpretable."
    },
    {
      "code": "ICH-E11R1",
      "authority": "ICH",
      "title": "ICH E11(R1) Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Governs the pediatric extrapolation, dosing and safety-monitoring strategy for diseases such as sickle cell disease, thalassemia and hemophilia that present in infancy; supports the iPSP and PIP and the pediatric sections of 2.5 and 2.7.2."
    },
    {
      "code": "ICH-E6R3",
      "authority": "ICH",
      "title": "ICH E6(R3) Good Clinical Practice",
      "why": "Sets the quality-by-design and risk-proportionate GCP expectations for small multinational rare-disease trials, including data governance for registry and external-control data sources used in this area."
    }
  ],
  "reviewerExpectations": [
    "The clinical reviewer will read the data patient by patient. Expect individual listings, swimmer and spider plots of bleeding events, transfusion episodes and hemoglobin trajectories, and complete narratives for every subject who discontinued, was transfused, or experienced an adverse event of special interest.",
    "The statistical reviewer will re-fit the bleeding-rate model from the datasets, check the dispersion assumption, and test whether the conclusion survives a Poisson-versus-negative-binomial sensitivity analysis and the exclusion of high-influence subjects.",
    "For any intra-patient comparison, the reviewer expects prospective, protocol-defined collection of the pre-treatment period and will discount retrospective chart-derived baseline bleeding rates as biased in the sponsor's favour.",
    "The clinical pharmacology reviewer will look specifically for the one-stage versus chromogenic assay discrepancy and will expect a labeling statement telling laboratories which assay and reagents produce accurate results for the product.",
    "For gene therapy, the OTP reviewer expects durability data with individual transgene expression trajectories over the longest available follow-up, an explicit position on redosing (generally not possible after AAV exposure), the hepatotoxicity and corticosteroid management algorithm, and a fully resourced 15-year follow-up plan.",
    "The reviewer expects the immunogenicity package to link ADA or inhibitor status to individual pharmacokinetic, factor-activity and clinical outcomes rather than to report incidence in isolation.",
    "For complement inhibitors, the reviewer expects the meningococcal risk-management strategy in the protocol, the RMP and the proposed REMS to be identical, with documented vaccination status for every subject and narratives for every infection.",
    "Reviewers will assess whether the trial population, including genotype distribution in sickle cell disease and thalassemia and prior-treatment status in hemophilia, supports the breadth of the proposed indication; an indication broader than the studied population is routinely narrowed at labeling."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Applies to essentially the whole of non-malignant hematology - sickle cell disease, thalassemia, hemophilia A and B, von Willebrand disease, PNH, aHUS, TTP, cold agglutinin disease, aplastic anemia and congenital bone marrow failure syndromes all fall well under the US 200,000-patient threshold and the EU 5-in-10,000 prevalence criterion.",
      "impactedSections": [
        "1.5",
        "1.7",
        "2.5",
        "2.7.3",
        "2.7.4"
      ],
      "reviewerNotes": "Orphan status supports a smaller safety database and greater reliance on external controls, but reviewers still expect a rigorous, prespecified evidence package; EU orphan maintenance at the time of opinion requires demonstrating significant benefit over authorised alternatives, which is increasingly contested in hemophilia where many products exist."
    },
    {
      "pathway": "rmat",
      "applicability": "Directly applicable to cell and gene therapies for sickle cell disease, beta-thalassemia and hemophilia, including lentiviral and genome-edited autologous products, where preliminary clinical evidence indicates the potential to address an unmet medical need in a serious condition.",
      "impactedSections": [
        "1.12",
        "2.5",
        "3.2.S",
        "3.2.P",
        "5.3.5.4"
      ],
      "reviewerNotes": "RMAT gives early and frequent interaction with OTP, which sponsors should use to lock the potency assurance strategy, comparability protocol and long-term follow-up design before the pivotal study; RMAT also opens the door to surrogate-endpoint-based accelerated approval and to real-world evidence supporting post-approval requirements."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Appropriate where preliminary clinical evidence shows substantial improvement over available therapy - for example durable transfusion independence in transfusion-dependent thalassemia, elimination of severe vaso-occlusive events in sickle cell disease, or factor-level normalization removing the need for prophylaxis in hemophilia.",
      "impactedSections": [
        "1.12",
        "2.5",
        "2.7.3"
      ],
      "reviewerNotes": "Reviewers use the designation to negotiate the endpoint definition, the adjudication charter and the size of the safety database early; the intensive-guidance benefit is largely wasted if the sponsor does not bring the external-control analysis plan to those meetings."
    },
    {
      "pathway": "fast_track",
      "applicability": "Available for serious non-malignant hematologic conditions with unmet need, including hemophilia with inhibitors, refractory immune thrombocytopenia, congenital TTP and severe aplastic anemia.",
      "impactedSections": [
        "1.12",
        "2.5",
        "1.14.1"
      ],
      "reviewerNotes": "The rolling review benefit is real in rare disease where dataset lock and long-term follow-up cuts are staggered; agree the submission sequence and the data-cut convention with the division so that safety updates do not restart the review clock."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Used where a surrogate reasonably likely to predict clinical benefit is available - for example hemoglobin response in sickle cell disease, factor activity level as a surrogate for bleeding protection in hemophilia gene therapy, or LDH normalization in PNH - with a confirmatory requirement on clinical events.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14.1"
      ],
      "reviewerNotes": "Post-FDORA, the confirmatory trial must generally be underway at the time of approval and the withdrawal procedures are more readily invoked; sponsors should expect the agency to specify the confirmatory endpoint, the enrollment milestone and the completion date as conditions of approval."
    },
    {
      "pathway": "priority_review",
      "applicability": "Commonly granted for first-in-class or first-in-disease therapies in serious hematologic conditions; rare pediatric disease priority review vouchers have also historically applied to several products in this area, subject to the current statutory status of the voucher programme.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "The compressed clock demands an inspection-ready submission: apheresis and manufacturing sites, central laboratories and adjudication vendors must be identified in Module 1 for pre-approval and BIMO inspection scheduling at the time of filing."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "The EU route where comprehensive clinical data are not yet available for a seriously debilitating rare hematologic disease, notably for ATMPs whose durability data are still maturing at the time of the MAA.",
      "impactedSections": [
        "1.8.2",
        "2.5",
        "2.7.4",
        "5.3.5.4"
      ],
      "reviewerNotes": "CHMP and CAT will impose specific obligations covering durability follow-up, registry enrolment and the long-term follow-up study; the annual renewal cycle makes the operational credibility of the registry a gating issue rather than a formality."
    },
    {
      "pathway": "prime",
      "applicability": "EMA PRIME has been granted repeatedly to gene and cell therapies in hemophilia, sickle cell disease and thalassemia on the basis of early proof-of-concept data showing major therapeutic advantage.",
      "impactedSections": [
        "1.12",
        "2.5",
        "3.2.S",
        "5.3.5.4"
      ],
      "reviewerNotes": "PRIME provides a CHMP rapporteur (and CAT co-ordinator for ATMPs) from an early stage; sponsors are expected to use the enhanced scientific advice on the potency assay, comparability strategy and the paediatric investigation plan rather than deferring these to the MAA."
    }
  ],
  "statisticalConsiderations": [
    "Model recurrent-event endpoints (bleeding episodes, vaso-occlusive crises, transfusion episodes) with a negative binomial regression using log observation time as an offset, reporting the dispersion parameter, adjusted rate ratio with confidence interval, and the observed mean, median and zero-event proportion; supplement with Andersen-Gill or LWYY recurrent-event time-to-event models as sensitivity analyses, and pre-specify how deaths and other terminating events are handled.",
    "Declare an ICH E9(R1) estimand naming transfusion, rescue factor administration, splenectomy, initiation of a prohibited therapy and discontinuation as intercurrent events; hemoglobin and platelet endpoints require a composite or hypothetical strategy with a defined post-transfusion exclusion window, and treatment-policy strategies for these events are usually not interpretable.",
    "In small populations, favour analyses that maximize information per patient - repeated-measures models over single-timepoint comparisons, Bayesian borrowing from a well-characterized natural-history or external cohort with a pre-specified and justified prior and a sensitivity analysis across prior strengths, and permutation or exact methods where asymptotic approximations fail at the observed sample size.",
    "For externally controlled analyses, pre-specify the propensity-score or matching approach, the covariate set, the estimand (average treatment effect in the treated is usually appropriate), diagnostics for covariate balance, the handling of missing covariates by multiple imputation, and a quantitative bias analysis (E-value or tipping-point on unmeasured confounding); finalize and date the SAP before any access to outcome data.",
    "Control multiplicity across co-primary endpoints (for example transfusion independence and hemoglobin change), key secondary endpoints intended for labeling, and dose groups, using a hierarchical or graphical procedure; in single-arm trials, pre-specify the performance goal or historical threshold and its derivation rather than testing against zero.",
    "Pre-specify the interim analysis plan with an alpha-spending function and both efficacy and safety stopping rules; in gene therapy trials the practical constraint is that dosing is irreversible, so the DMC charter must define the pause criteria for hepatotoxicity, thrombotic microangiopathy and malignancy signals explicitly rather than relying on general judgment.",
    "Handle missing data from long follow-up and from patients lost to registry follow-up with multiple imputation or pattern-mixture models, and report the reasons for and timing of missingness by arm; in 15-year follow-up commitments, define in advance what constitutes adequate ascertainment for the regulatory milestone.",
    "Report durability of effect (transgene expression, factor activity, hemoglobin) with individual trajectories and a pre-specified definition of loss of response, and avoid summarizing a heterogeneous durability profile with a single mean that conceals early decliners."
  ],
  "endpointConsiderations": [
    "Hemophilia A and B - annualized bleeding rate (total ABR, with joint ABR and spontaneous ABR as key secondaries) is the accepted primary efficacy endpoint, supported by factor consumption, the proportion of subjects with zero treated bleeds, and joint health measured by the Hemophilia Joint Health Score. Caveat: ABR is highly overdispersed and skewed; comparisons against a retrospective pre-study rate are biased, and prophylaxis-versus-on-demand comparisons must account for the very different baseline expectations.",
    "Hemophilia gene therapy - factor VIII or factor IX activity level is used as a surrogate supporting the bleeding-protection claim, with sustained activity above a defined threshold over a defined interval. Caveat: factor VIII gene therapy shows substantial inter-individual variability and year-on-year decline in expression, so durability data and a pre-specified definition of loss of response are decisive; assay choice (one-stage versus chromogenic) systematically changes the reported activity level and must be fixed in advance.",
    "Sickle cell disease - annualized rate of vaso-occlusive crises requiring a healthcare-facility visit (including acute chest syndrome, priapism and hepatic/splenic sequestration) is the principal clinically meaningful endpoint; complete resolution of severe vaso-occlusive events over a defined post-treatment window has supported curative-intent cell and gene therapies. Caveat: VOC ascertainment depends entirely on the definition and on blinded adjudication, and any change to opioid access or care patterns during the trial can shift the rate independently of treatment.",
    "Sickle cell disease supportive endpoints - hemoglobin response (an increase of at least 1 g/dL from baseline at a defined week) supported one accelerated approval, together with hemolysis markers (indirect bilirubin, reticulocyte percentage, LDH) and transcranial Doppler velocity in children. Caveat: a hemoglobin increase without a corresponding effect on clinical events has proven insufficient to confirm benefit, and post-transfusion values must be excluded.",
    "Transfusion-dependent beta-thalassemia - transfusion independence, defined as a weighted average hemoglobin at or above approximately 9 g/dL without any red blood cell transfusion for a continuous period of at least 12 months, is the accepted curative-intent endpoint; for non-curative agents, a reduction of at least 33 percent in transfusion burden with a reduction of at least 2 red blood cell units over a fixed 12-week interval has been accepted. Caveat: baseline transfusion burden must be established prospectively over an adequate pre-study period, and the hemoglobin threshold and the transfusion-decision algorithm must be standardized across sites.",
    "Immune thrombocytopenia - durable platelet response, typically a platelet count of at least 50 x 10^9/L for a defined proportion of assessment visits without rescue medication, with bleeding events (WHO or ITP bleeding scale) and reduction or discontinuation of concomitant corticosteroids as key secondaries. Caveat: rescue medication use is the dominant intercurrent event and must render the visit a non-response; platelet count alone is a surrogate and reviewers expect a corroborating bleeding-outcome analysis.",
    "Paroxysmal nocturnal hemoglobinuria - LDH normalization or a defined percentage reduction from baseline, transfusion avoidance, and hemoglobin stabilization or change from baseline; breakthrough hemolysis and FACIT-Fatigue are important secondaries. Caveat: with C5 inhibitors as standard of care, extravascular hemolysis has become the differentiating issue, and an LDH-only endpoint no longer characterizes benefit in a C5-experienced population.",
    "Cold agglutinin disease and warm autoimmune hemolytic anemia - a composite response of hemoglobin at or above approximately 12 g/dL, or an increase of at least 2 g/dL from baseline, without transfusion or other protocol-prohibited therapy during a defined window. Caveat: seasonal and temperature-related variability in cold agglutinin disease and the heterogeneity of background immunosuppression in warm AIHA both require stratification and careful intercurrent-event handling.",
    "Congenital and immune-mediated thrombotic thrombocytopenic purpura - time to platelet count response, exacerbation and recurrence rates, and a composite of TTP-related death, recurrence and major thromboembolic events. Caveat: standard of care (plasma exchange, immunosuppression) is itself effective and rapidly deployed, so trials must define the timing of randomization relative to plasma exchange precisely.",
    "Patient-reported and functional endpoints across the area - fatigue (FACIT-Fatigue, PROMIS Fatigue), pain interference, health-related quality of life (SF-36, EQ-5D) and disease-specific instruments (Haem-A-QoL, ASCQ-Me for sickle cell disease). Caveat: any of these used for a labeling claim must satisfy the PRO evidentiary standard including content validity in the specific population and an anchor-derived meaningful-change threshold; open-label designs make PRO claims particularly vulnerable to reviewer challenge."
  ],
  "retrievalKeywords": [
    "sickle cell disease",
    "vaso-occlusive crisis",
    "annualized bleeding rate",
    "hemophilia a",
    "hemophilia b",
    "factor viii activity",
    "factor ix activity",
    "one-stage versus chromogenic assay",
    "nijmegen bethesda inhibitor",
    "previously untreated patients",
    "beta-thalassemia",
    "transfusion independence",
    "transfusion burden reduction",
    "hemoglobin response",
    "ldh normalization",
    "paroxysmal nocturnal hemoglobinuria",
    "breakthrough hemolysis",
    "complement inhibitor meningococcal",
    "immune thrombocytopenia platelet response",
    "thrombotic thrombocytopenic purpura",
    "cold agglutinin disease",
    "warm autoimmune hemolytic anemia",
    "aplastic anemia",
    "aav neutralizing antibody",
    "lentiviral vector",
    "genome editing off-target",
    "integration site analysis",
    "long-term follow-up 15 years",
    "vector shedding",
    "potency assurance",
    "manufacturing comparability",
    "external control natural history",
    "propensity score matching",
    "negative binomial recurrent events",
    "rare disease small population",
    "rmat designation",
    "hydroxyurea background therapy",
    "facit-fatigue",
    "hemophilia joint health score",
    "rems risk evaluation mitigation strategy"
  ]
};

export default hematologyProfile;
