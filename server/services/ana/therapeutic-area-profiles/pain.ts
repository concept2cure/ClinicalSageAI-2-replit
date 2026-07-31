/**
 * Pain & Analgesia therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/pain
 */
import type { TherapeuticAreaProfile } from './types.js';

export const painProfile: TherapeuticAreaProfile = {
  "id": "pain",
  "displayName": "Pain & Analgesia",
  "description": "Regulatory profile for acute pain, chronic pain (osteoarthritis, chronic low back pain, chronic musculoskeletal pain), neuropathic pain (painful diabetic peripheral neuropathy, postherpetic neuralgia), migraine and headache disorders, and opioid and non-opioid analgesic development, including abuse-deterrent formulations. Programs are reviewed by FDA's Division of Anesthesiology, Addiction Medicine, and Pain Medicine (DAAAP) within the Office of Neuroscience, with mandatory Controlled Substance Staff involvement for scheduled products, and by EMA/CHMP under the neuropathic pain and nociceptive pain guidance framework. The area is defined by patient-reported pain intensity endpoints (NRS/VAS), enormous placebo response, rescue-medication and early-discontinuation intercurrent events that dominate the estimand discussion, the opioid class REMS and the Opioid Analgesic REMS blueprint, abuse-deterrence category claims requiring Category 1-4 evidence, and organ-toxicity liabilities specific to NSAIDs (CV, GI, renal), acetaminophen (hepatic), and opioids (respiratory depression, OIRD, hyperalgesia, dependence).",
  "contextRules": [
    {
      "id": "pain-estimand-rescue",
      "scope": "section",
      "instruction": "Define the estimand per ICH E9(R1) with explicit, pre-specified handling of the intercurrent events that dominate analgesic trials: use of rescue analgesia, dose escalation, treatment discontinuation for inadequate analgesia, and discontinuation for adverse events. State whether rescue use is handled by a composite (rescue = treatment failure), hypothetical, or treatment-policy strategy, and justify why the chosen strategy answers the clinically relevant question. A treatment-policy strategy for rescue that also permits unrestricted rescue medication generally dilutes the effect and must be defended.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "estimand",
        "rescue medication",
        "intercurrent event",
        "treatment failure",
        "discontinuation for lack of efficacy"
      ],
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "id": "pain-primary-endpoint-2743",
      "scope": "section",
      "instruction": "Present the primary efficacy result as change from baseline in pain intensity on an 11-point NRS (or SPID/TOTPAR for acute pain), accompanied by a responder analysis at pre-specified thresholds (>=30% and >=50% reduction), a cumulative proportion of responders (CPR) curve across the full 0-100% response range, and PGIC concordance. FDA reviewers require the CPR curve to judge whether benefit is broad or confined to a subset; a mean-change-only presentation is routinely challenged.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "NRS",
        "pain intensity",
        "responder analysis",
        "30% reduction",
        "50% reduction",
        "cumulative proportion of responders",
        "PGIC"
      ],
      "guidanceRef": "FDA Analgesic Indications: Developing Drugs and Biological Products (draft, Feb 2014)"
    },
    {
      "id": "pain-abuse-deterrence-m5",
      "scope": "module",
      "instruction": "For any opioid or abuse-deterrent formulation claim, organize the abuse-deterrence evidence by FDA's four study categories and state which labeling claims each supports: Category 1 (in vitro manipulation and extraction studies with a comparator), Category 2 (pharmacokinetic studies of manipulated product by intended and non-intended routes), Category 3 (clinical abuse potential studies in recreational users with Drug Liking VAS Emax), and Category 4 (post-marketing epidemiologic data on actual abuse). Do not assert real-world abuse reduction without Category 4 data; Category 1-3 support only 'expected to reduce' language.",
      "severity": "critical",
      "appliesTo": "5",
      "triggerKeywords": [
        "abuse-deterrent",
        "category 1",
        "category 2",
        "category 3",
        "category 4",
        "tamper",
        "extraction",
        "insufflation",
        "drug liking"
      ],
      "guidanceRef": "FDA Abuse-Deterrent Opioids - Evaluation and Labeling (final, Apr 2015)"
    },
    {
      "id": "pain-opioid-safety-2744",
      "scope": "section",
      "instruction": "For opioid products, provide dedicated safety subsections covering: respiratory depression and opioid-induced respiratory depression events with narratives and concomitant CNS-depressant use, sedation, constipation and other GI effects, opioid-induced hyperalgesia, endocrinopathy (hypogonadism, adrenal insufficiency), neonatal opioid withdrawal syndrome exposure data, physical dependence and withdrawal on discontinuation (COWS/SOWS), and misuse/abuse/diversion events systematically collected via a validated instrument (e.g. MAAP/ABUSE checklist or adjudicated event definitions). Cross-reference the Opioid Analgesic REMS obligations in Module 1.16.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "respiratory depression",
        "opioid-induced",
        "hyperalgesia",
        "NOWS",
        "withdrawal",
        "misuse",
        "diversion",
        "REMS"
      ],
      "guidanceRef": "FDA Opioid Analgesic REMS"
    },
    {
      "id": "pain-nsaid-cv-gi-renal",
      "scope": "section",
      "instruction": "For NSAIDs and COX-2 selective agents, present dedicated cardiovascular (adjudicated APTC/MACE events), gastrointestinal (clinically significant upper GI events, endoscopic ulcer data where available), renal (creatinine/eGFR shift tables, edema, hypertension, hyperkalemia), and hepatic safety analyses with exposure-adjusted rates and comparison to an active NSAID comparator where feasible. Address the class labeling language on CV thrombotic events and GI bleeding and state how the product's data inform it.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "NSAID",
        "cardiovascular risk",
        "MACE",
        "GI bleeding",
        "renal function",
        "COX-2",
        "hypertension"
      ]
    },
    {
      "id": "pain-acetaminophen-hepatic",
      "scope": "section",
      "instruction": "Where the product contains acetaminophen or is intended for co-administration with acetaminophen-containing products, present hepatic safety analyses including maximum daily dose exposure, ALT/AST/bilirubin shift tables, Hy's Law case evaluation per the FDA DILI guidance, and the labeling strategy addressing the 325 mg per dosage unit limit and cumulative daily dose warnings.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "acetaminophen",
        "paracetamol",
        "hepatotoxicity",
        "Hy's Law",
        "ALT elevation",
        "maximum daily dose"
      ],
      "guidanceRef": "FDA Drug-Induced Liver Injury: Premarketing Clinical Evaluation (2009)"
    },
    {
      "id": "pain-enrichment-design-5351",
      "scope": "section",
      "instruction": "If an enriched enrollment randomized withdrawal (EERW) design was used, describe the open-label titration/run-in period, the enrichment criteria (response and tolerability thresholds), the number screened versus randomized, and the characteristics of subjects excluded during enrichment. State explicitly that the labeled population and effect size apply to the enriched population, and provide an analysis of the full pre-enrichment cohort where possible. EERW results cannot be presented as if they estimate the effect in a treatment-naive population.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "enriched enrollment",
        "EERW",
        "randomized withdrawal",
        "open-label titration",
        "run-in",
        "enrichment"
      ],
      "guidanceRef": "FDA Enrichment Strategies for Clinical Trials (final, 2019)"
    },
    {
      "id": "pain-acute-pain-model",
      "scope": "section",
      "instruction": "For acute pain, justify the pain model used (dental third-molar extraction, bunionectomy, abdominal/gynecologic surgery, herniorrhaphy) and state why it supports the intended labeled indication. Provide SPID and TOTPAR over the pre-specified interval, time to onset of meaningful pain relief (double-stopwatch method), time to first rescue, and percent of patients requiring rescue. Extrapolation from a single pain model to a broad 'management of acute pain' indication must be argued explicitly and is often narrowed by the division.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "acute pain",
        "SPID",
        "TOTPAR",
        "dental pain model",
        "bunionectomy",
        "time to rescue",
        "onset of analgesia"
      ],
      "guidanceRef": "FDA Analgesic Indications guidance (2014 draft)"
    },
    {
      "id": "pain-neuropathic-etiology",
      "scope": "section",
      "instruction": "For neuropathic pain, do not claim a broad 'neuropathic pain' indication from data in a single etiology. State the specific etiologies studied (e.g. painful diabetic peripheral neuropathy, postherpetic neuralgia) and provide a mechanistic and clinical rationale if broader labeling is sought; EMA's neuropathic pain guideline and FDA both expect etiology-specific evidence or a convincing argument that the mechanism is etiology-independent, supported by data in at least two distinct etiologies.",
      "severity": "major",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "neuropathic pain",
        "diabetic peripheral neuropathy",
        "postherpetic neuralgia",
        "etiology",
        "broad indication"
      ],
      "guidanceRef": "EMA/CHMP/970057/2011 Neuropathic Pain Guideline"
    },
    {
      "id": "pain-chronic-exposure-e1",
      "scope": "section",
      "instruction": "For chronic pain indications, demonstrate ICH E1 compliance in tabular, duration-stratified form (>=1500 exposed, >=300-600 for 6 months, >=100 for 12 months at therapeutic dose). For opioids, present 12-month exposure with the associated misuse, dependence, dose-escalation, and hyperalgesia data over the same period rather than only during the controlled phase.",
      "severity": "major",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "ICH E1",
        "long-term exposure",
        "chronic pain",
        "12-month safety",
        "open-label extension"
      ],
      "guidanceRef": "ICH E1"
    },
    {
      "id": "pain-always-units",
      "scope": "always",
      "instruction": "Report pain outcomes with the scale, anchors, recall period, and administration mode stated (e.g. '11-point NRS, 0 = no pain to 10 = worst pain imaginable, average pain over the past 24 hours, collected by daily e-diary'). Report opioid doses in both product units and morphine milligram equivalents (MME). Always pair treatment differences with two-sided 95% confidence intervals and the responder-rate difference with NNT.",
      "severity": "minor",
      "triggerKeywords": [
        "NRS",
        "VAS",
        "recall period",
        "morphine milligram equivalent",
        "MME",
        "e-diary"
      ]
    }
  ],
  "riskFactors": [
    "Very large and site-variable placebo response in chronic pain trials, compounded by e-diary compliance problems, baseline pain-score inflation to meet entry thresholds, and professional subjects, which together produce assay-sensitivity failures even for effective drugs",
    "Rescue-medication use and high early discontinuation for inadequate analgesia, which make the choice of intercurrent-event strategy determinative of the result and expose naive analyses to reviewer challenge",
    "Opioid class liabilities - respiratory depression (especially with concomitant benzodiazepines or other CNS depressants), physical dependence, opioid use disorder, diversion, neonatal opioid withdrawal syndrome, and opioid-induced hyperalgesia - all of which drive REMS obligations and heavily negotiated labeling",
    "Controlled Substances Act scheduling review by FDA's Controlled Substance Staff and subsequent DEA scheduling, which can gate commercial launch independently of the approval action",
    "Abuse-deterrent labeling claims that outrun the evidence tier: sponsors frequently seek real-world abuse-reduction language supported only by Category 1-3 data",
    "NSAID class risks - cardiovascular thrombotic events, serious GI bleeding, renal impairment, hypertension and heart failure exacerbation - requiring adjudicated CV outcome data and, for some programs, a dedicated CV outcomes trial",
    "Hepatotoxicity risk for acetaminophen-containing combination products, including inadvertent cumulative overdose from multiple OTC and Rx sources",
    "Pediatric analgesia development obligations under PREA/PIP with limited validated pain instruments across age bands (FLACC, FPS-R, NRS) and ethical constraints on placebo controls",
    "Reliance on a single acute-pain surgical model (commonly dental) to support a broad acute-pain indication, which the division routinely narrows at labeling",
    "Chronic pain populations with high psychiatric and substance-use comorbidity that are excluded from trials, creating a mismatch between the studied and the labeled/real-world populations",
    "Missing or poorly documented functional and quality-of-life outcomes, which EMA in particular expects alongside pain intensity for chronic pain claims"
  ],
  "commonGaps": [
    {
      "ctdSection": "2.5",
      "patterns": [
        "estimand not defined",
        "rescue medication not",
        "intercurrent event",
        "no strategy for discontinuation",
        "treatment policy unjustified",
        "itt only"
      ],
      "description": "No ICH E9(R1) estimand, or rescue medication and discontinuation for inadequate analgesia are not assigned explicit intercurrent-event strategies, so the reported treatment effect cannot be interpreted.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "no responder analysis",
        "mean change only",
        "cumulative proportion of responders",
        "cpr curve",
        "30% responder",
        "pgic not"
      ],
      "description": "Efficacy is presented as mean change in pain score only, without responder analyses at >=30% and >=50%, without a cumulative proportion of responders curve, and without PGIC concordance, so clinical meaningfulness is not established.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Analgesic Indications guidance (2014 draft)"
    },
    {
      "ctdSection": "5.3.5.4",
      "patterns": [
        "abuse deterrent claim",
        "category 4 missing",
        "no clinical abuse potential study",
        "insufflation not studied",
        "intravenous route not",
        "tamper resistance unsupported"
      ],
      "description": "Abuse-deterrence claims are asserted beyond the supporting evidence category - e.g. real-world abuse-reduction language without Category 4 post-marketing data, or route-specific claims without Category 2/3 data for that route.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Abuse-Deterrent Opioids - Evaluation and Labeling (2015)"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "respiratory depression not",
        "misuse not collected",
        "withdrawal not assessed",
        "cows",
        "sows",
        "nows",
        "hyperalgesia not",
        "concomitant benzodiazepine"
      ],
      "description": "Opioid-specific safety analyses are absent or incomplete: no systematic misuse/abuse/diversion event collection, no withdrawal assessment on discontinuation, no respiratory depression analysis stratified by concomitant CNS depressant use, or no NOWS exposure information.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA Opioid Analgesic REMS"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "cardiovascular events not adjudicated",
        "mace not",
        "gi bleeding not",
        "renal safety not",
        "blood pressure not analyzed",
        "no active comparator"
      ],
      "description": "NSAID cardiovascular, GI, and renal risks are not characterized with adjudicated events, exposure-adjusted rates, or an active comparator, leaving class labeling language unsupported by product-specific data.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "eerw",
        "enrichment not described",
        "open-label titration",
        "population generalizability",
        "randomized withdrawal population"
      ],
      "description": "An enriched enrollment randomized withdrawal design is used but the enrichment period, exclusion counts, and characteristics of non-enriched subjects are not reported, and results are generalized beyond the enriched population.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA Enrichment Strategies for Clinical Trials (2019)"
    },
    {
      "ctdSection": "5.3.5.3",
      "patterns": [
        "locf",
        "bocf",
        "complete case",
        "no sensitivity analysis",
        "missing data",
        "dropout rate"
      ],
      "description": "Missing data from early discontinuation are handled with LOCF or baseline-observation-carried-forward without MNAR sensitivity or tipping-point analyses, despite discontinuation rates frequently exceeding 30-40% in chronic pain trials.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E9(R1)"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "broad indication",
        "single pain model",
        "dental model only",
        "one etiology",
        "extrapolation not justified",
        "management of pain"
      ],
      "description": "A broad indication (e.g. 'management of pain' or 'neuropathic pain') is sought from data in a single pain model or single etiology, without evidence or a mechanistic argument supporting extrapolation.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "EMA/CHMP/970057/2011"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "ich e1",
        "insufficient exposure",
        "6-month",
        "12-month",
        "open-label extension short",
        "safety database size"
      ],
      "description": "Long-term safety exposure for a chronic pain indication does not meet ICH E1 thresholds, or the 6- and 12-month exposure tables are not stratified by dose and duration at the intended therapeutic dose.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH E1"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "diary compliance",
        "baseline pain verification",
        "site-level analysis",
        "placebo response not",
        "assay sensitivity",
        "professional subject"
      ],
      "description": "Pain diary compliance, entry-criteria baseline pain verification, and site-level placebo-response analysis are not documented, leaving assay sensitivity and data integrity unaddressed.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "function not assessed",
        "womac function",
        "quality of life",
        "bpi interference",
        "roland-morris",
        "secondary endpoint uncontrolled"
      ],
      "description": "Functional and health-related quality-of-life outcomes (e.g. WOMAC function, Roland-Morris, BPI interference, SF-36) are absent or not within a multiplicity-controlled testing family, so EMA's expectation of a functional co-outcome for chronic pain is unmet.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "1.9",
      "patterns": [
        "pediatric plan",
        "prea",
        "pip",
        "flacc",
        "faces pain scale",
        "age-appropriate instrument",
        "pediatric extrapolation"
      ],
      "description": "Pediatric plan for analgesia is missing or lacks age-appropriate validated pain instruments, PK/PD bridging, and a justification for the analgesic efficacy extrapolation approach across age bands.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "5.3.3.4",
      "patterns": [
        "hepatic impairment",
        "renal impairment",
        "cyp2d6",
        "cyp3a4 interaction",
        "food effect",
        "dose adjustment not supported",
        "alcohol dose dumping"
      ],
      "description": "Clinical pharmacology package lacks hepatic/renal impairment data, CYP2D6 or CYP3A4 interaction studies relevant to opioid bioactivation (e.g. codeine, tramadol, oxycodone), or food-effect data for a modified-release formulation, so dosing recommendations are unsupported.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH M12"
    },
    {
      "ctdSection": "3.2.P",
      "patterns": [
        "dose dumping",
        "alcohol",
        "in vitro manipulation",
        "comparator not included",
        "physical barrier",
        "extraction study"
      ],
      "description": "For modified-release or abuse-deterrent formulations, in vitro alcohol-induced dose dumping and mechanical/solvent manipulation data are absent or lack a marketed comparator, undermining both the CMC and the abuse-deterrence sections.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "1.16",
      "patterns": [
        "rems not",
        "opioid analgesic rems",
        "risk management plan",
        "additional risk minimisation",
        "accidental exposure",
        "medication guide"
      ],
      "description": "REMS materials are missing or misaligned with the Opioid Analgesic REMS blueprint, or the RMP does not carry misuse, abuse, addiction, overdose, and accidental exposure as important identified risks with concrete additional risk-minimization measures.",
      "severity": "major",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "FDA-2014-D-0042 (Analgesic Indications: Developing Drugs and Biological Products, draft Feb 2014)",
      "authority": "FDA",
      "title": "Analgesic Indications: Developing Drugs and Biological Products",
      "why": "The primary FDA document for analgesic development: defines acute versus chronic pain indications, acceptable pain-intensity endpoints, responder and cumulative-proportion-of-responders analyses, enriched enrollment designs, and the evidentiary basis for narrow versus broad pain indications; drives Module 2.5 and 5.3.5.1 design justification."
    },
    {
      "code": "FDA Guidance: Abuse-Deterrent Opioids - Evaluation and Labeling (final, Apr 2015)",
      "authority": "FDA",
      "title": "Abuse-Deterrent Opioids - Evaluation and Labeling",
      "why": "Establishes the Category 1-4 evidence framework (in vitro manipulation, PK of manipulated product, clinical abuse potential, post-marketing epidemiology) and the labeling language each category can support; controls what abuse-deterrence claims may appear in Module 1 labeling and how Module 5.3.5.4 is organized."
    },
    {
      "code": "FDA Guidance: Assessment of Abuse Potential of Drugs (final, Jan 2017)",
      "authority": "FDA",
      "title": "Assessment of Abuse Potential of Drugs",
      "why": "Prescribes the nonclinical self-administration and drug-discrimination studies, human abuse potential study design with Drug Liking VAS Emax, abuse-related adverse event collection, and the 8-factor analysis for CSA scheduling of any centrally acting analgesic."
    },
    {
      "code": "ICH E9(R1)",
      "authority": "ICH",
      "title": "Statistical Principles for Clinical Trials - Addendum on Estimands and Sensitivity Analysis",
      "why": "Indispensable in analgesia because rescue medication and discontinuation for inadequate analgesia are pervasive intercurrent events; determines the primary analysis and the required sensitivity framework in Module 2.5 and 5.3.5.3."
    },
    {
      "code": "ICH E1",
      "authority": "ICH",
      "title": "The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions",
      "why": "Sets the long-term exposure minimums that chronic pain programs must document, including the 12-month cohort in which opioid dependence, dose escalation, and hyperalgesia signals emerge."
    },
    {
      "code": "EMA/CHMP/970057/2011",
      "authority": "EMA",
      "title": "Guideline on the Clinical Development of Medicinal Products Intended for the Treatment of Pain",
      "why": "CHMP's controlling document for both nociceptive and neuropathic pain: sets expectations for etiology-specific evidence, pain intensity plus functional co-outcomes, active-comparator/assay-sensitivity considerations, and long-term efficacy maintenance data in the EU dossier."
    },
    {
      "code": "FDA Guidance: Enrichment Strategies for Clinical Trials to Support Approval of Human Drugs and Biological Products (final, Mar 2019)",
      "authority": "FDA",
      "title": "Enrichment Strategies for Clinical Trials",
      "why": "Governs the enriched enrollment randomized withdrawal designs common in chronic and neuropathic pain, and defines how the enriched population constrains the interpretation and labeling of the observed effect."
    },
    {
      "code": "FDA Guidance: Drug-Induced Liver Injury: Premarketing Clinical Evaluation (final, July 2009)",
      "authority": "FDA",
      "title": "Drug-Induced Liver Injury: Premarketing Clinical Evaluation",
      "why": "Required framework for Hy's Law evaluation and hepatic safety presentation, particularly for acetaminophen-containing combination analgesics and for NSAIDs with hepatic signal."
    },
    {
      "code": "FDA Opioid Analgesic REMS (single shared system, most recent modification 2023)",
      "authority": "FDA",
      "title": "Opioid Analgesic Risk Evaluation and Mitigation Strategy",
      "why": "Sets the mandatory REMS obligations - prescriber and patient education content per the FDA Education Blueprint, Medication Guide, and assessment plan - that any opioid analgesic NDA must satisfy in Module 1.16."
    },
    {
      "code": "FDA Guidance: Patient-Reported Outcome Measures: Use in Medical Product Development to Support Labeling Claims (final, Dec 2009) and the PFDD Guidance Series (2020-2023)",
      "authority": "FDA",
      "title": "Patient-Reported Outcome Measures / Patient-Focused Drug Development series",
      "why": "Provides the validation, content-validity, recall-period, and meaningful-within-patient-change evidence FDA requires for NRS/VAS/BPI pain instruments used as primary or labeled endpoints."
    },
    {
      "code": "ICH M12",
      "authority": "ICH",
      "title": "Drug Interaction Studies",
      "why": "Governs the CYP2D6/CYP3A4 interaction assessments critical for opioid prodrugs and metabolized analgesics, and supports dose-adjustment and contraindication language in labeling."
    },
    {
      "code": "ICH E14 / E14-S7B Q&As",
      "authority": "ICH",
      "title": "Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential",
      "why": "Applies to methadone-like agents and other analgesics with hERG liability; supports the cardiac safety section and any dose-related ECG monitoring recommendation in labeling."
    },
    {
      "code": "FDA Guidance: Chronic Pain - Developing Non-Opioid Analgesics (draft, Feb 2022) / Opioid Use Disorder-adjacent DAAAP guidances",
      "authority": "FDA",
      "title": "Development of Non-Opioid Analgesics for Acute Pain (draft, Feb 2022)",
      "why": "Articulates FDA's current expectations for non-opioid acute pain development, including comparative effectiveness framing against opioid standard of care and the evidence needed for opioid-sparing claims."
    },
    {
      "code": "EMA/CHMP/EWP/252/03 Rev. 1 (Guideline on the clinical development of medicinal products for the treatment of migraine)",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for the Treatment of Migraine",
      "why": "Defines EU expectations for acute migraine (pain freedom at 2 hours, most bothersome symptom freedom, sustained response) and preventive migraine (change in monthly migraine days) endpoints, plus medication-overuse headache monitoring."
    }
  ],
  "reviewerExpectations": [
    "DAAAP reviewers expect the cumulative proportion of responders curve as a standard deliverable and will examine whether the drug-placebo separation is distributed across the response range or driven by a small subgroup; they also expect responder analyses at multiple thresholds rather than a single cut-point.",
    "Reviewers focus intensely on how rescue medication and early discontinuation were handled, and will re-analyze under alternative intercurrent-event strategies; an effect that survives only under a treatment-policy strategy with liberal rescue is treated skeptically.",
    "For opioids, the Controlled Substance Staff and DAAAP jointly expect a complete abuse-potential and, where claimed, abuse-deterrence package, with claims tightly matched to the evidence category; sponsors are expected to have agreed the Category 1-3 protocols with FDA before conduct.",
    "Reviewers expect systematic, prospective collection of misuse, abuse, addiction, and diversion events using pre-specified definitions rather than reliance on spontaneously reported MedDRA terms, plus withdrawal assessment on planned discontinuation.",
    "For chronic pain, reviewers expect ICH E1-compliant 12-month exposure with dose-escalation trajectories, and will look for evidence of tolerance, dose creep, and opioid-induced hyperalgesia across the open-label extension.",
    "EMA rapporteurs expect a functional or health-related quality-of-life co-outcome alongside pain intensity for chronic pain claims, and expect maintenance-of-efficacy data over at least 12 weeks (often longer) rather than short-term separation alone.",
    "Reviewers scrutinize the acute-pain model used and typically narrow a broad 'management of acute pain' indication toward the studied setting unless multiple models or convincing extrapolation arguments are provided.",
    "Reviewers examine e-diary compliance, baseline pain-score stability during the run-in, and site-level effect heterogeneity as indicators of data integrity and assay sensitivity; unexplained single-site outliers invite BIMO inspection.",
    "For NSAIDs, reviewers expect blinded, adjudicated cardiovascular event data and product-specific renal and GI safety analyses rather than reliance on class experience."
  ],
  "pathwayHints": [
    {
      "pathway": "fast_track",
      "applicability": "Applies to non-opioid analgesics addressing serious pain conditions where the unmet need is reduction of opioid exposure, and to therapies for severe refractory pain syndromes (e.g. chemotherapy-induced peripheral neuropathy, erythromelalgia, trigeminal neuralgia refractory to standard care).",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "FDA has been receptive to fast track for opioid-alternative analgesics, but the unmet-need argument must be framed in terms of the target pain condition, not merely 'non-opioid'. Rolling review does not relax the ICH E1 chronic-exposure requirement for chronic pain indications."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Realistic where preliminary clinical evidence shows substantial improvement over available therapy for a serious, refractory pain condition with a validated endpoint - for example a novel mechanism producing large, durable effects in refractory neuropathic pain where existing agents provide marginal benefit.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "The comparison must be against available therapy on a clinically significant endpoint; placebo-controlled superiority alone is usually insufficient in pain because approved options exist. FDA will expect an early agreed plan for the confirmatory package and for the long-term safety database."
    },
    {
      "pathway": "priority_review",
      "applicability": "Available where the product would meaningfully improve safety or effectiveness - most credibly an analgesic with efficacy comparable to opioids but without abuse liability or respiratory depression, or a first therapy for a refractory pain syndrome.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "2.7.4"
      ],
      "reviewerNotes": "A safety-improvement claim requires product-specific comparative data (e.g. absence of respiratory depression at supratherapeutic doses, negative human abuse potential study); assertions grounded only in mechanism are typically rejected and can prejudice labeling negotiations."
    },
    {
      "pathway": "orphan_drug",
      "applicability": "Applies to rare pain conditions with US prevalence under 200,000 - e.g. erythromelalgia, small-fiber neuropathy in specific genetic syndromes, complex regional pain syndrome subsets, sickle cell vaso-occlusive crisis pain, and pain of epidermolysis bullosa; not applicable to osteoarthritis, chronic low back pain, or general acute pain.",
      "impactedSections": [
        "1.7",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Designation may justify a smaller safety database with an explicit ICH E1 shortfall discussion and post-marketing commitments, but the endpoint, estimand, and multiplicity rigor are unchanged. Natural-history data are valuable for interpreting single-arm or small randomized data."
    },
    {
      "pathway": "accelerated_approval",
      "applicability": "Rarely applicable in pain because pain intensity is itself the clinical outcome rather than a surrogate; it may be considered where a serious underlying disease with a pain manifestation has a validated surrogate (e.g. disease-modifying therapy in a rare neuropathy), not for symptomatic analgesia.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "5.3.5.1",
        "1.14"
      ],
      "reviewerNotes": "Sponsors should not propose accelerated approval on the basis of short-term pain reduction; FDA will consider that the direct clinical endpoint. If pursued for an underlying-disease surrogate, the confirmatory trial must be underway or enrolling at the time of the application per FDORA."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU pathway usable for seriously debilitating pain conditions with unmet need where comprehensive long-term data are not yet available, most plausibly in rare refractory neuropathic pain syndromes.",
      "impactedSections": [
        "1.0",
        "2.5",
        "2.7.4",
        "1.8.2"
      ],
      "reviewerNotes": "CHMP imposes specific obligations, typically a long-term maintenance-of-efficacy and safety study; the RMP must carry misuse/abuse/dependence (for centrally acting agents) or organ toxicity (for NSAIDs) as important identified risks with concrete additional risk-minimisation measures."
    }
  ],
  "statisticalConsiderations": [
    "Specify the estimand fully per ICH E9(R1): population, variable (e.g. change from baseline to week 12 in weekly mean of daily worst pain NRS), treatment condition, and intercurrent-event strategies. In analgesia the standard defensible approach is a composite strategy treating discontinuation for inadequate analgesia or use of prohibited rescue as treatment failure, or a hypothetical strategy with explicit imputation; the choice must precede unblinding and be stated identically in the SAP, CSR, and Module 2.5.",
    "Primary analyses of continuous pain scores typically use MMRM or, where a composite/failure strategy is used, an ANCOVA on a defined outcome with multiple imputation. Because chronic pain trials commonly lose 30-50% of subjects, pre-specify MNAR sensitivity analyses - control-based multiple imputation (jump-to-reference, copy-increments-in-reference), delta-adjusted imputation, and a tipping-point analysis reporting the delta at which the conclusion reverses. BOCF and LOCF are not acceptable as primary methods.",
    "Present responder analyses as a family: pre-specify >=30% and >=50% reduction responder rates with risk differences, 95% CIs, and NNT, and present the full cumulative proportion of responders curve from 0% to 100% improvement. Responder definitions must handle intercurrent events consistently with the primary estimand (e.g. rescue users counted as non-responders under a composite strategy).",
    "Control family-wise error at two-sided 0.05 across doses and key secondary endpoints (function, PGIC, sleep interference, opioid-sparing) with a pre-specified hierarchical or graphical procedure; only endpoints inside the controlled family may support labeling claims. Opioid-sparing claims in particular require pre-specified, alpha-protected testing and a defensible definition of opioid consumption (MME over a fixed interval).",
    "For acute pain, pre-specify the SPID/TOTPAR summation interval and the handling of rescue - typically last-observation or window-based imputation defined a priori - and analyze time-to-event outcomes (onset of meaningful relief, time to first rescue) with Kaplan-Meier estimates and log-rank/Cox comparisons, censoring rules stated explicitly.",
    "For enriched enrollment randomized withdrawal designs, the primary analysis is usually time to loss of therapeutic response or change in pain from randomization; pre-specify the loss-of-response definition, and report both the enriched-population effect and, where the open-label phase data allow, an analysis anchored to the full screened cohort so reviewers can gauge the enrichment's influence.",
    "Interim analyses require a pre-specified alpha-spending function and an independent DMC with a firewalled charter; adaptive sample-size re-estimation must use a type-I-error-preserving method. In pain programs, futility interims based on placebo response are common and should be described with the exact decision rule.",
    "Pre-specify subgroup analyses (sex, age, race/ethnicity, baseline pain severity, opioid-experienced versus naive, region, pain duration) with forest plots and interaction tests, treating them as descriptive; region-level consistency should follow ICH E17 pre-specified criteria given the heavy use of multiregional pain trials."
  ],
  "endpointConsiderations": [
    "Chronic pain: change from baseline in weekly mean of daily pain intensity on an 11-point NRS (average or worst pain, 24-hour recall, e-diary collected) is the accepted primary endpoint. Caveats: recall period and anchor wording must be fixed and validated; diary compliance thresholds must be pre-specified; and mean change alone is insufficient without responder and CPR analyses.",
    "Acute pain: SPID (summed pain intensity difference) over a defined interval (SPID0-24, SPID0-48) or TOTPAR (total pain relief) is the standard primary endpoint. Secondary endpoints include time to onset of perceptible and meaningful pain relief by the double-stopwatch method, time to first rescue, proportion requiring rescue, and total rescue consumption in MME. Caveat: rescue use directly confounds SPID and must be handled by a pre-specified imputation rule.",
    "Neuropathic pain (PDPN, PHN): change from baseline in weekly mean daily pain NRS at 12 weeks, with >=30%/>=50% responder rates and PGIC as key secondaries. Caveat: efficacy in one etiology does not establish efficacy across neuropathic pain; broad labeling generally requires positive data in at least two distinct etiologies.",
    "Osteoarthritis: WOMAC pain subscale (or NRS) plus WOMAC physical function subscale and Patient Global Assessment - historically a co-primary or hierarchical triad. Caveat: EMA expects both a pain and a function outcome; structural/disease-modification claims require radiographic or MRI endpoints over >=2 years and are a separate, far higher bar.",
    "Chronic low back pain: change in average pain NRS with Roland-Morris Disability Questionnaire or Oswestry Disability Index as the functional co-outcome. Caveat: extremely high placebo response and heterogeneous etiology; enrichment and rigorous baseline verification are usually necessary for assay sensitivity.",
    "Acute migraine: co-primary endpoints of pain freedom at 2 hours post-dose and freedom from the most bothersome associated symptom (photophobia, phonophobia, or nausea) at 2 hours, with sustained pain freedom 2-24/48 hours as key secondary. Caveat: rescue medication use before 2 hours must be handled as treatment failure; a single attack versus multiple attacks design affects the estimand.",
    "Preventive migraine: change from baseline in monthly migraine days (or monthly headache days for chronic migraine) over a defined 4- or 12-week interval, with >=50% responder rate and acute medication days as key secondaries. Caveat: medication-overuse headache subpopulations require separate characterization, and baseline diary periods must demonstrate adequate compliance.",
    "Opioid-sparing: total opioid consumption in morphine milligram equivalents over a fixed postoperative interval, alongside pain intensity to demonstrate that reduced consumption is not achieved at the cost of worse analgesia. Caveat: the claim requires pre-specified, alpha-controlled testing of both consumption and pain; a reduction in consumption with numerically worse pain does not support the claim.",
    "Patient Global Impression of Change (PGIC) is expected as a supportive interpretability anchor in essentially every analgesic program; it is generally not accepted as a stand-alone primary endpoint but is central to defining clinically meaningful within-patient change.",
    "Sleep interference (e.g. BPI sleep interference item, MOS-Sleep), physical function (BPI interference, SF-36 PF), and health-related quality of life may support labeling only if validated for the population, pre-specified, and inside the multiplicity-controlled testing hierarchy."
  ],
  "retrievalKeywords": [
    "numeric rating scale",
    "nrs pain",
    "visual analog scale",
    "spid",
    "totpar",
    "cumulative proportion of responders",
    "30% responder",
    "50% responder",
    "pgic",
    "rescue medication",
    "time to rescue",
    "enriched enrollment randomized withdrawal",
    "eerw",
    "placebo response pain",
    "assay sensitivity",
    "abuse-deterrent formulation",
    "category 1 in vitro manipulation",
    "drug liking emax",
    "human abuse potential",
    "morphine milligram equivalent",
    "opioid-sparing",
    "respiratory depression",
    "opioid-induced hyperalgesia",
    "neonatal opioid withdrawal syndrome",
    "cows",
    "sows",
    "opioid analgesic rems",
    "controlled substance scheduling",
    "nsaid cardiovascular risk",
    "aptc mace",
    "gi bleeding",
    "renal safety nsaid",
    "acetaminophen hepatotoxicity",
    "hy's law",
    "postherpetic neuralgia",
    "painful diabetic peripheral neuropathy",
    "womac",
    "roland-morris",
    "oswestry",
    "monthly migraine days",
    "pain freedom at 2 hours",
    "most bothersome symptom",
    "medication overuse headache",
    "estimand pain",
    "tipping point analysis",
    "alcohol dose dumping",
    "daaap"
  ]
};

export default painProfile;
