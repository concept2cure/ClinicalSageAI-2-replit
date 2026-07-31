/**
 * Obstetrics & Gynecology / Women's Health (incl. Pregnancy Labeling) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/obstetrics-gynecology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const obstetricsGynecologyProfile: TherapeuticAreaProfile = {
  "id": "obstetrics-gynecology",
  "displayName": "Obstetrics & Gynecology / Women's Health (incl. Pregnancy Labeling)",
  "description": "Regulatory profile for products developed for gynecologic and obstetric indications (contraception, endometriosis, uterine fibroids and heavy menstrual bleeding, vasomotor symptoms and genitourinary syndrome of menopause, infertility/ART, vaginal infections, preterm birth, preeclampsia, postpartum conditions) and for any product requiring Pregnancy/Lactation/Females and Males of Reproductive Potential labeling under the PLLR. The area is defined by co-primary endpoint conventions, diary-based patient-reported outcomes, hormonal class safety (thromboembolic, hepatic, endometrial, bone), and an unusually heavy reproductive-toxicology and post-approval pregnancy-safety burden. Reviewed in the US by CDER's Division of Urology, Obstetrics and Gynecology; in the EU by CHMP.",
  "contextRules": [
    {
      "id": "obg-pllr-structure",
      "scope": "section",
      "instruction": "Draft Sections 8.1 (Pregnancy), 8.2 (Lactation) and 8.3 (Females and Males of Reproductive Potential) in strict PLLR format: Risk Summary first (background risk for the indication and general US population, then human data, then animal data with exposure multiples), followed by Clinical Considerations and Data. Do not use the retired A/B/C/D/X letter categories anywhere in the application.",
      "severity": "critical",
      "appliesTo": "1.14.1.3",
      "triggerKeywords": [
        "pregnancy category",
        "8.1",
        "8.2",
        "8.3",
        "risk summary",
        "lactation",
        "reproductive potential"
      ],
      "guidanceRef": "FDA-PLLR-2014"
    },
    {
      "id": "obg-pregnancy-exposure-followup",
      "scope": "module",
      "instruction": "Every clinical protocol must define pregnancy testing frequency, contraception requirements, the action taken on a positive test, and prospective follow-up of the pregnancy to outcome (live birth, congenital anomaly assessment, infant follow-up). Summarize all in-utero exposures and their outcomes in a dedicated listing regardless of how few there are.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "pregnancy test",
        "in-utero exposure",
        "pregnancy outcome",
        "contraception requirement",
        "discontinued due to pregnancy"
      ],
      "guidanceRef": "FDA-PREG-INCLUSION-2018"
    },
    {
      "id": "obg-lactation-data",
      "scope": "section",
      "instruction": "If the product may be used by lactating women, present a clinical lactation study or a justified rationale for its absence: milk concentration-time profile, milk-to-plasma ratio, estimated relative infant dose, and infant exposure/safety observations. State explicitly how these data drive the Section 8.2 language.",
      "severity": "major",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "breast milk",
        "lactation",
        "relative infant dose",
        "milk to plasma",
        "breastfeeding"
      ],
      "guidanceRef": "FDA-LACTATION-2019"
    },
    {
      "id": "obg-repro-tox-completeness",
      "scope": "section",
      "instruction": "Confirm the ICH S5(R3) package is complete for the intended population: fertility and early embryonic development, embryo-fetal development in two species, and pre- and postnatal development, with exposure margins expressed as multiples of the human exposure at the maximum recommended dose. Flag any deferred study and state why it does not preclude the proposed labeling.",
      "severity": "critical",
      "appliesTo": "4.2.3.5",
      "triggerKeywords": [
        "embryo-fetal",
        "eefd",
        "ppnd",
        "fertility study",
        "exposure margin",
        "teratogenicity"
      ],
      "guidanceRef": "ICH-S5R3"
    },
    {
      "id": "obg-coprimary-endpoints",
      "scope": "section",
      "instruction": "For indications with established co-primary conventions - vasomotor symptoms (frequency and severity at weeks 4 and 12), vulvar/vaginal atrophy (superficial and parabasal cell percentages, vaginal pH, and the most bothersome symptom), endometriosis (dysmenorrhea and non-menstrual pelvic pain) - state each co-primary explicitly, confirm all must succeed, and show the study was powered for the joint requirement.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "co-primary",
        "most bothersome symptom",
        "vasomotor",
        "dysmenorrhea",
        "non-menstrual pelvic pain",
        "maturation index"
      ],
      "guidanceRef": "FDA-VMS-VVA-2003"
    },
    {
      "id": "obg-contraceptive-efficacy",
      "scope": "section",
      "instruction": "Contraceptive efficacy submissions must present the Pearl Index with its 95% confidence interval and a life-table cumulative pregnancy probability over 13 cycles, define at-risk cycles and the treatment of cycles with backup method use, describe diary-based compliance capture, and report efficacy by BMI and age strata for labeling.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "pearl index",
        "life table",
        "13 cycles",
        "at-risk cycles",
        "contraceptive efficacy",
        "bmi subgroup"
      ],
      "guidanceRef": "FDA-CONTRACEPTION-2019"
    },
    {
      "id": "obg-hormonal-class-safety",
      "scope": "section",
      "instruction": "For any estrogen-, progestin- or GnRH-active product, present dedicated safety subsections for venous and arterial thromboembolism (with independent adjudication), hepatic events, blood pressure, endometrial histology from centrally read biopsies, breast findings, and bone mineral density by centrally read DXA. Bone loss with GnRH agents must be paired with the add-back regimen actually proposed for labeling.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "thromboembolism",
        "endometrial hyperplasia",
        "endometrial biopsy",
        "bone mineral density",
        "dxa",
        "add-back",
        "hepatic"
      ],
      "guidanceRef": "EMEA-CHMP-021-97"
    },
    {
      "id": "obg-bleeding-diary",
      "scope": "section",
      "instruction": "Analyze menstrual and uterine bleeding using a prespecified reference-period methodology with standardized definitions of bleeding versus spotting, and report amenorrhea, unscheduled bleeding and discontinuation for bleeding by reference period. For heavy menstrual bleeding, use alkaline hematin quantification with a prespecified responder definition.",
      "severity": "major",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "bleeding diary",
        "spotting",
        "reference period",
        "amenorrhea",
        "alkaline hematin",
        "menstrual blood loss"
      ],
      "guidanceRef": "FDA-CONTRACEPTION-2019"
    },
    {
      "id": "obg-postapproval-pregnancy",
      "scope": "section",
      "instruction": "Propose a post-approval pregnancy safety strategy proportionate to expected use in pregnancy: pregnancy exposure registry, complementary claims-based cohort study with an active comparator new-user design, or a justified rationale that existing surveillance suffices. Specify the outcomes (major congenital malformations, spontaneous abortion, preterm birth, small for gestational age) and the power to detect a prespecified effect size.",
      "severity": "major",
      "appliesTo": "1.16",
      "triggerKeywords": [
        "pregnancy registry",
        "post-approval pregnancy",
        "major congenital malformation",
        "observational cohort",
        "risk management plan"
      ],
      "guidanceRef": "FDA-POSTAPPROVAL-PREG-2019"
    }
  ],
  "riskFactors": [
    "Teratogenic or fetotoxic potential that requires a pregnancy prevention program, and the downstream REMS/RMP burden if the risk is severe.",
    "Hormonal class risks - venous thromboembolism, stroke and myocardial infarction, hepatic injury, blood pressure elevation - which have driven withdrawals and boxed warnings and are evaluated against a healthy-population benefit-risk standard, particularly for contraception.",
    "Unopposed estrogenic stimulation producing endometrial hyperplasia or carcinoma, requiring a dedicated 12-month endometrial biopsy safety study for estrogen-containing regimens.",
    "Bone mineral density loss with GnRH agonists/antagonists and other hypoestrogenic therapies, constraining treatment duration in labeling unless an add-back regimen is proven.",
    "Historical reliance on surrogate obstetric endpoints that failed confirmation - the hydroxyprogesterone caproate preterm-birth experience makes reviewers strongly resistant to gestational-age surrogates in place of neonatal outcomes.",
    "Systematic exclusion of pregnant and lactating women from trials, producing labeling with no human data and forcing large post-approval commitments.",
    "Diary-based subjective primary endpoints (hot flash counts, pelvic pain scores, sexual events) with high placebo response, poor electronic-diary compliance and substantial missing data.",
    "Vaginal, intrauterine and long-acting delivery systems whose in vitro release, local tolerability, expulsion/retention performance and condom or lubricant compatibility become critical review issues in Module 3.",
    "Fetal and neonatal outcome ascertainment in obstetric trials, where differing malformation coding systems and short infant follow-up undermine the safety database."
  ],
  "commonGaps": [
    {
      "ctdSection": "1.14.1.3",
      "patterns": [
        "pregnancy category",
        "no risk summary",
        "8.1 not supported",
        "background risk not stated",
        "letter category"
      ],
      "description": "Proposed labeling is not PLLR-compliant: retired pregnancy letter categories persist, the Risk Summary omits indication-specific background risk, or Section 8.1/8.2/8.3 assertions are not traceable to data in Modules 4 and 5.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-PLLR-2014"
    },
    {
      "ctdSection": "4.2.3.5",
      "patterns": [
        "no ppnd",
        "pre- and postnatal not conducted",
        "single species",
        "no exposure margin",
        "fertility study deferred"
      ],
      "description": "ICH S5(R3) reproductive toxicology package is incomplete - missing pre- and postnatal development, embryo-fetal work in only one species, or no exposure multiples relative to the human therapeutic exposure.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-S5R3"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "no lactation study",
        "breast milk not measured",
        "relative infant dose",
        "milk transfer unknown"
      ],
      "description": "No clinical lactation data and no adequate justification for their absence, leaving Section 8.2 with a non-informative statement for a product likely to be used postpartum.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-LACTATION-2019"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "insufficient cycles",
        "fewer than 13 cycles",
        "pearl index confidence",
        "bmi not represented",
        "population not representative"
      ],
      "description": "Contraceptive efficacy database has too few evaluable at-risk cycles or an unrepresentative population (age, BMI, race), so the upper confidence bound on the Pearl Index cannot support the proposed labeling.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-CONTRACEPTION-2019"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no endometrial biopsy",
        "endometrial safety",
        "insufficient biopsies",
        "inadequate tissue"
      ],
      "description": "Estrogen-containing program lacks a 12-month endometrial safety study, or the biopsy dataset has an unacceptable rate of insufficient tissue and no central pathology reading.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-VMS-VVA-2003"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no bmd",
        "bone loss not assessed",
        "dxa not performed",
        "add-back not studied",
        "duration of use"
      ],
      "description": "Hypoestrogenic therapy is proposed for chronic use without centrally read DXA bone mineral density data or without studying the add-back regimen that appears in the proposed dosing section.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-ENDOMETRIOSIS-2021"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "single primary endpoint",
        "co-primary not prespecified",
        "most bothersome symptom not defined",
        "underpowered for both"
      ],
      "description": "Established co-primary endpoint conventions for the indication are collapsed into a single endpoint, or the most bothersome symptom is selected post hoc rather than prospectively per subject.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-VMS-VVA-2003"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "diary compliance",
        "missing diary",
        "bleeding definition differed",
        "reference period not defined"
      ],
      "description": "Diary-derived endpoints are reported without compliance rates, without a prespecified reference-period methodology, or with bleeding/spotting definitions that differ across pooled studies.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E9R1"
    },
    {
      "ctdSection": "1.16",
      "patterns": [
        "no pregnancy registry",
        "no post-approval pregnancy plan",
        "surveillance only",
        "registry feasibility"
      ],
      "description": "No pregnancy exposure registry or alternative post-approval pregnancy safety study is proposed for a product with foreseeable use in pregnancy, and no feasibility assessment is provided.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-PREG-REGISTRY-2002"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "confounding by indication",
        "no active comparator",
        "unadjusted registry",
        "channeling bias"
      ],
      "description": "Observational pregnancy safety data are presented without design controls for confounding by indication - no active-comparator new-user design, no propensity adjustment, no quantitative bias analysis.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMEA-CHMP-313666-2005"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no vte adjudication",
        "thromboembolic events",
        "hepatic monitoring",
        "blood pressure not analyzed"
      ],
      "description": "Hormonal class safety events are reported as investigator terms without independent adjudication or a prespecified search strategy, leaving the class risk unquantified in a healthy-user population.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMEA-CHMP-021-97"
    },
    {
      "ctdSection": "3.2.P.2",
      "patterns": [
        "vaginal ring",
        "in vitro release",
        "local tolerability",
        "condom compatibility",
        "expulsion rate"
      ],
      "description": "For vaginal rings, gels, inserts and intrauterine systems, the pharmaceutical development section omits in vitro release characterization, vaginal irritation/local tolerance data, or compatibility with condoms and concomitant vaginal products.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-M3R2"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "pregnant women excluded",
        "lactating excluded",
        "no justification for exclusion",
        "childbearing potential excluded"
      ],
      "description": "Pregnant and lactating women, or women of childbearing potential, are excluded without the scientific and ethical justification FDA now expects, generating an avoidable evidence gap at labeling.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-PREG-INCLUSION-2018"
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-PLLR-2014",
      "authority": "FDA",
      "title": "Pregnancy, Lactation, and Reproductive Potential: Labeling for Human Prescription Drug and Biological Products - Content and Format (Guidance for Industry, implementing the PLLR final rule, 21 CFR 201.57(c)(9))",
      "why": "Defines the mandatory structure and content of labeling Sections 8.1, 8.2 and 8.3; used to draft Module 1.14 proposed labeling and to map each labeling statement back to supporting nonclinical and clinical data."
    },
    {
      "code": "FDA-PREG-INCLUSION-2018",
      "authority": "FDA",
      "title": "Pregnant Women: Scientific and Ethical Considerations for Inclusion in Clinical Trials (Draft Guidance for Industry, April 2018)",
      "why": "Frames when pregnant women should be enrolled rather than excluded, the ethical framework for inclusion, and the pregnancy-monitoring and infant follow-up procedures written into protocols in Module 5."
    },
    {
      "code": "FDA-LACTATION-2019",
      "authority": "FDA",
      "title": "Clinical Lactation Studies: Considerations for Study Design (Draft Guidance for Industry, May 2019)",
      "why": "Specifies lactation study design, milk and plasma sampling schedules, relative infant dose calculation and infant safety assessment that populate Module 2.7.2 and labeling Section 8.2."
    },
    {
      "code": "FDA-POSTAPPROVAL-PREG-2019",
      "authority": "FDA",
      "title": "Postapproval Pregnancy Safety Studies (Draft Guidance for Industry, May 2019)",
      "why": "Sets expectations for pregnancy registries versus complementary observational cohort studies, outcome definitions and analytic controls for confounding; drives the post-marketing commitments in Module 1.16."
    },
    {
      "code": "FDA-PREG-REGISTRY-2002",
      "authority": "FDA",
      "title": "Establishing Pregnancy Exposure Registries (Guidance for Industry, August 2002)",
      "why": "Operational reference for registry design, enrollment, comparator selection, outcome ascertainment and reporting cadence when a registry is the chosen post-approval pregnancy safety instrument."
    },
    {
      "code": "FDA-CONTRACEPTION-2019",
      "authority": "FDA",
      "title": "Establishing Effectiveness and Safety for Hormonal Drug Products Intended To Prevent Pregnancy (Draft Guidance for Industry, December 2019)",
      "why": "Defines the contraceptive efficacy database - evaluable cycles, at-risk cycle definitions, Pearl Index and life-table analysis, bleeding-pattern methodology, and population representativeness including BMI - underpinning 2.5, 2.7.3 and 5.3.5.1."
    },
    {
      "code": "FDA-ENDOMETRIOSIS-2021",
      "authority": "FDA",
      "title": "Endometriosis: Developing Drugs for Treatment (Draft Guidance for Industry)",
      "why": "Establishes co-primary dysmenorrhea and non-menstrual pelvic pain responder endpoints using validated daily scales, analgesic-use rules, trial duration, and bone mineral density safety requirements for hypoestrogenic agents."
    },
    {
      "code": "FDA-VMS-VVA-2003",
      "authority": "FDA",
      "title": "Estrogen and Estrogen/Progestin Drug Products To Treat Vasomotor Symptoms and Vulvar and Vaginal Atrophy Symptoms - Recommendations for Clinical Evaluation (Draft Guidance for Industry)",
      "why": "Source of the four co-primary vasomotor endpoints (frequency and severity at weeks 4 and 12), the vulvar/vaginal atrophy endpoint set including most bothersome symptom, and the 12-month endometrial biopsy safety expectation."
    },
    {
      "code": "FDA-BV-2019",
      "authority": "FDA",
      "title": "Bacterial Vaginosis: Developing Drugs for Treatment (Guidance for Industry)",
      "why": "Defines the composite clinical cure (Amsel criteria) plus Nugent-score-based therapeutic cure endpoint and the test-of-cure timing used in vaginal infection programs."
    },
    {
      "code": "ICH-S5R3",
      "authority": "ICH",
      "title": "ICH S5(R3) Detection of Reproductive and Developmental Toxicity for Human Pharmaceuticals",
      "why": "Governs the fertility, embryo-fetal development and pre-/postnatal development study package, species selection, exposure-margin calculation and the use of alternative assays that support Sections 8.1 and 8.3 of labeling."
    },
    {
      "code": "ICH-E9R1",
      "authority": "ICH",
      "title": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials",
      "why": "Basis for defining estimands around intercurrent events specific to this area - rescue analgesia, surgical intervention, discontinuation for bleeding, and pregnancy occurring on study - and for the missing-diary-data strategy."
    },
    {
      "code": "ICH-E1",
      "authority": "ICH",
      "title": "ICH E1 The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the minimum long-term exposure database (approximately 100 subjects for 12 months, 1500 total) that reviewers apply strictly to chronic women's health therapies used by otherwise healthy women."
    },
    {
      "code": "EMEA-CHMP-313666-2005",
      "authority": "EMA",
      "title": "Guideline on the Exposure to Medicinal Products During Pregnancy: Need for Post-Authorisation Data (EMEA/CHMP/313666/2005)",
      "why": "EU expectations for collecting and evaluating pregnancy exposure data after authorization, including registry design and integration into the Risk Management Plan."
    },
    {
      "code": "EMEA-CHMP-203927-2005",
      "authority": "EMA",
      "title": "Guideline on Risk Assessment of Medicinal Products on Human Reproduction and Lactation: From Data to Labelling (EMEA/CHMP/203927/2005)",
      "why": "Governs how nonclinical and human reproductive/lactation data are translated into SmPC Sections 4.6 and 5.3 wording, the EU analogue of the PLLR mapping exercise."
    },
    {
      "code": "EMEA-CHMP-021-97",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for Hormone Replacement Therapy of Oestrogen Deficiency Symptoms in Postmenopausal Women (EMEA/CHMP/021/97 Rev. 1)",
      "why": "EU reference for menopausal symptom trial design, endometrial safety requirements, and the long-term cardiovascular and breast safety framing expected in the EU benefit-risk discussion."
    }
  ],
  "reviewerExpectations": [
    "A complete traceability map from Module 4 reproductive toxicology and Module 5 human exposure data to every sentence proposed in labeling Sections 8.1, 8.2 and 8.3 - reviewers routinely reconstruct this map and reject unsupported language.",
    "Prospective, protocol-mandated follow-up of every pregnancy occurring in the development program to outcome, with infant assessment, presented as a standalone listing even when the number of exposures is small.",
    "Centrally read endometrial biopsies with an acceptable adequate-tissue rate and a prespecified hyperplasia/carcinoma case definition for any estrogen-containing regimen.",
    "Independent, blinded adjudication of thromboembolic, cardiovascular and hepatic events for hormonal products, with rates expressed per woman-year and benchmarked against background incidence in comparable healthy populations.",
    "Centrally read DXA bone mineral density with prespecified percent-change thresholds for hypoestrogenic therapies, and duration-of-use labeling that follows directly from the observed bone trajectory and any add-back data.",
    "Validated, fit-for-purpose daily diary instruments with documented content validity in the target population, defined meaningful within-patient change, and reported electronic-diary compliance by arm and visit.",
    "For contraception, a transparent accounting of cycles - screened, entered, evaluable, at-risk, excluded for backup method use - reconcilable to the Pearl Index numerator and denominator, plus efficacy displayed across BMI and age strata.",
    "Explicit justification when women of childbearing potential, pregnant women or lactating women are excluded, and a post-approval plan that closes the resulting evidence gap.",
    "For obstetric indications, neonatal and infant outcomes as co-equal evidence rather than gestational-age surrogates alone, with a prespecified composite neonatal morbidity/mortality definition."
  ],
  "pathwayHints": [
    {
      "pathway": "fast_track",
      "applicability": "Serious obstetric conditions with substantial unmet need - preeclampsia, spontaneous preterm birth, postpartum hemorrhage, severe hyperemesis, postpartum depression - where no adequate therapy exists.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Fast track accelerates interaction, not evidentiary standards; sponsors should use the meetings to align on neonatal outcome definitions and on the maternal-fetal safety database size before Phase 3 starts."
    },
    {
      "pathway": "priority_review",
      "applicability": "Applications offering significant improvement in safety or effectiveness for serious gynecologic or obstetric conditions, including non-hormonal alternatives that avoid established hormonal class risks.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "A safety-superiority claim must be prespecified and adequately powered or supported by a mechanistic and exposure-based argument; post hoc comparisons of adverse event tables will not carry it."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Rare gynecologic and obstetric conditions such as gestational trophoblastic disease, rare disorders of sex development, primary ovarian insufficiency subsets and rare pregnancy-specific disorders.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.2"
      ],
      "reviewerNotes": "Small populations do not relax the reproductive toxicology or pregnancy-labeling requirements; sponsors should plan the ICH S5(R3) package early because it is rarely waivable in this area."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Products with preliminary clinical evidence of substantial improvement on a clinically significant endpoint in serious maternal or fetal conditions.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect intensive early scrutiny of the fetal safety plan and of manufacturing readiness; the compressed timeline often collides with the long-duration safety exposure requirements of ICH E1."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU pathway for seriously debilitating maternal-fetal conditions where comprehensive clinical data cannot yet be generated but positive benefit-risk is demonstrated.",
      "impactedSections": [
        "1.8",
        "2.5",
        "5.3.5.2"
      ],
      "reviewerNotes": "Specific obligations will center on longer-term infant neurodevelopmental follow-up; CHMP expects a feasible, funded plan rather than an intention to collect data opportunistically."
    }
  ],
  "statisticalConsiderations": [
    "Define the estimand for area-specific intercurrent events: rescue analgesic use, surgical intervention (hysterectomy, ablation, laparoscopy), discontinuation for bleeding or intolerable symptoms, initiation of a backup contraceptive method, and pregnancy occurring during treatment - each requires an explicit treatment-policy, composite or hypothetical strategy.",
    "Handle co-primary endpoint sets by requiring all components to succeed at the full alpha and powering the study for the joint probability; do not apply an alpha split to co-primaries, and prespecify the gatekeeping order for the secondary hierarchy.",
    "Prespecify diary-data handling: minimum compliance for evaluability, rules for partial reference periods, and multiple imputation or MMRM under stated missingness assumptions, with tipping-point sensitivity analyses given the high and differential dropout typical of these trials.",
    "For contraceptive efficacy, prespecify at-risk cycle definitions, exclusion rules for cycles with backup method use, the Pearl Index confidence interval method, and a Kaplan-Meier/life-table cumulative pregnancy probability at 13 cycles as a complementary estimate insensitive to differential exposure duration.",
    "Plan subgroup analyses that reviewers will require for labeling - BMI (including BMI >=30), age strata, race and ethnicity, and hepatic/renal function - as prespecified descriptive analyses with adequate representation, not as post hoc explorations.",
    "Justify non-inferiority margins against active comparators using historical evidence of comparator effect and demonstrated assay sensitivity; for cure-rate endpoints in vaginal infection, the margin must be defensible against the placebo cure rate observed in the same population.",
    "Account for high placebo response and regression to the mean in symptom-based indications through run-in periods, prespecified baseline symptom thresholds, and reporting of the placebo arm trajectory alongside the treatment effect.",
    "For post-approval pregnancy safety studies, prespecify the comparator (active comparator new-user preferred), the propensity or disease-risk score model, the malformation coding dictionary and case-validation process, and a quantitative bias analysis for unmeasured confounding, together with the detectable effect size at the planned sample size.",
    "Interim analyses in long-duration obstetric and menopause trials require prespecified alpha spending and a DMC charter with explicit maternal, fetal and neonatal safety stopping rules."
  ],
  "endpointConsiderations": [
    "Contraception: Pearl Index (with 95% CI) among women 18-35 supported by a life-table cumulative pregnancy probability over 13 treatment cycles, with an adequate number of evaluable at-risk cycles and prespecified bleeding-pattern characterization; efficacy must be displayable by BMI stratum for labeling.",
    "Endometriosis: co-primary responder analyses for dysmenorrhea and non-menstrual pelvic pain on a validated daily rating scale, with analgesic use as a prespecified intercurrent event, plus bone mineral density as a duration-limiting safety endpoint for hypoestrogenic agents.",
    "Heavy menstrual bleeding associated with uterine fibroids: menstrual blood loss quantified by the alkaline hematin method with a responder definition combining an absolute threshold and a relative reduction from baseline, supported by amenorrhea rate and hemoglobin change.",
    "Vasomotor symptoms: four co-primary endpoints - change from baseline in frequency and in severity of moderate-to-severe hot flashes at both week 4 and week 12 - with 52 weeks of safety exposure including endometrial biopsy for estrogen-containing regimens.",
    "Genitourinary syndrome of menopause / vulvar and vaginal atrophy: co-primary changes in percent superficial and percent parabasal cells, vaginal pH, and the subject-selected most bothersome symptom, with the most bothersome symptom designated prospectively at baseline.",
    "Infertility and assisted reproduction: live birth rate is the accepted clinical endpoint; biochemical or clinical pregnancy rates are supportive only, and ovarian hyperstimulation syndrome and multiple-gestation rates are co-equal safety endpoints.",
    "Preterm birth and other obstetric indications: neonatal composite morbidity and mortality is the endpoint of record; gestational age at delivery alone is treated as an unvalidated surrogate following the hydroxyprogesterone caproate confirmatory-trial experience.",
    "Vaginal infections: for bacterial vaginosis, clinical cure by Amsel criteria plus therapeutic cure incorporating a normal Nugent score at a defined test-of-cure visit; for vulvovaginal candidiasis, clinical plus mycologic cure with a later relapse assessment.",
    "Female sexual dysfunction / hypoactive sexual desire disorder: co-primary change in satisfying sexual events and in a validated desire domain score, accompanied by a validated distress measure, with a demonstrated meaningful within-patient change threshold.",
    "Endometrial safety endpoint for estrogen-containing products: incidence of endometrial hyperplasia or carcinoma on centrally read biopsy at 12 months, evaluated against a prespecified upper confidence bound rather than a point estimate."
  ],
  "retrievalKeywords": [
    "pllr pregnancy lactation labeling",
    "section 8.1 risk summary",
    "relative infant dose",
    "clinical lactation study",
    "pregnancy exposure registry",
    "major congenital malformation",
    "embryo-fetal development study",
    "pre- and postnatal development",
    "pearl index",
    "life table pregnancy rate",
    "contraceptive efficacy cycles",
    "bleeding and spotting reference period",
    "alkaline hematin menstrual blood loss",
    "uterine fibroids heavy menstrual bleeding",
    "endometriosis pelvic pain responder",
    "gnrh antagonist add-back",
    "bone mineral density dxa",
    "vasomotor symptoms hot flash frequency",
    "vulvovaginal atrophy maturation index",
    "most bothersome symptom",
    "endometrial hyperplasia biopsy",
    "venous thromboembolism hormonal contraception",
    "bacterial vaginosis amsel nugent",
    "live birth rate assisted reproduction",
    "ovarian hyperstimulation syndrome",
    "preterm birth neonatal composite",
    "preeclampsia",
    "postpartum hemorrhage",
    "vaginal ring in vitro release",
    "women of childbearing potential"
  ]
};

export default obstetricsGynecologyProfile;
