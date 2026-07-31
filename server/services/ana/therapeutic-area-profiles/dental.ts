/**
 * Dental & Oral Health therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/dental
 */
import type { TherapeuticAreaProfile } from './types.js';

export const dentalProfile: TherapeuticAreaProfile = {
  "id": "dental",
  "displayName": "Dental & Oral Health",
  "description": "Regulatory profile for drug products acting in or delivered to the oral cavity: anticaries agents (fluoride and non-fluoride), antiplaque/antigingivitis rinses and dentifrices, locally delivered antimicrobials for periodontitis, dentin hypersensitivity products, oral mucositis and aphthous ulcer therapies, oral candidiasis and odontogenic infection treatments, xerostomia agents, dental local anesthetics, and acute dental pain analgesics. Development spans OTC monograph, 505(b)(2) and NDA routes; the defining technical issues are examiner-scored clustered site-level data, oral-route local tolerance and systemic absorption, and prominent pediatric exposure. Reviewed in the US primarily by CDER's Division of Dermatology and Dentistry (with Anesthesiology/Analgesia and Anti-Infective divisions for pain and infection indications).",
  "contextRules": [
    {
      "id": "dent-clustering",
      "scope": "section",
      "instruction": "Analyze oral endpoints with the subject as the unit of inference. Where teeth, sites or surfaces contribute multiple measurements, use mixed models or GEE with a subject-level random effect and state the correlation structure; never present site counts as independent observations or compute p-values on pooled sites.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "site level",
        "per tooth",
        "per surface",
        "number of sites",
        "bleeding sites",
        "clustered"
      ],
      "guidanceRef": "ICH-E9R1"
    },
    {
      "id": "dent-examiner-calibration",
      "scope": "section",
      "instruction": "Each clinical study report must document examiner training and calibration: the calibration exercise, intra- and inter-examiner reproducibility statistics (weighted kappa or ICC), the rule that a given subject is scored by the same masked examiner throughout, and the separation of the scoring examiner from any treatment-administering personnel.",
      "severity": "critical",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "examiner calibration",
        "kappa",
        "reproducibility",
        "masked examiner",
        "intra-examiner"
      ],
      "guidanceRef": "ICH-E6R3"
    },
    {
      "id": "dent-gingivitis-design",
      "scope": "section",
      "instruction": "Antiplaque/antigingivitis programs must justify a minimum six-month treatment duration with evaluations at approximately three and six months, a standardized dental prophylaxis to establish baseline, whole-mouth index scoring, and two independent studies. Report both the gingival index and a bleeding measure; plaque reduction alone does not support a gingivitis claim.",
      "severity": "critical",
      "appliesTo": "2.5",
      "triggerKeywords": [
        "gingivitis",
        "plaque index",
        "gingival index",
        "bleeding on probing",
        "six month",
        "prophylaxis"
      ],
      "guidanceRef": "CFR-356"
    },
    {
      "id": "dent-oral-safety",
      "scope": "section",
      "instruction": "Present an oral local safety section covering soft-tissue examination findings, extrinsic tooth and restoration staining, calculus formation, taste alteration and dysgeusia, oral burning, mucosal ulceration, and effects on the oral microbiome for long-term antimicrobials. Grade staining with a validated index rather than narrative description.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "tooth staining",
        "calculus",
        "dysgeusia",
        "taste alteration",
        "oral mucosal",
        "soft tissue examination"
      ],
      "guidanceRef": "CFR-356"
    },
    {
      "id": "dent-systemic-exposure-oral",
      "scope": "section",
      "instruction": "Quantify systemic exposure from oromucosal or intraoral administration, including the swallowed fraction and its contribution to total exposure, in adults and in the youngest intended pediatric age group. For fluoride products, express exposure against age-specific ingestion thresholds relevant to dental fluorosis.",
      "severity": "major",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "swallowed fraction",
        "systemic absorption",
        "oromucosal",
        "salivary concentration",
        "fluoride ingestion",
        "fluorosis"
      ],
      "guidanceRef": "CFR-355"
    },
    {
      "id": "dent-nonclinical-oral-route",
      "scope": "section",
      "instruction": "Include oral mucosal irritation and sensitization studies using the intended formulation and contact duration, plus genotoxicity for locally applied agents and appropriate repeat-dose toxicology by a route that produces the relevant local and systemic exposure; justify any reliance on prior systemic data for a new oromucosal presentation.",
      "severity": "major",
      "appliesTo": "4.2.3",
      "triggerKeywords": [
        "mucosal irritation",
        "sensitization",
        "hamster cheek pouch",
        "local tolerance",
        "genotoxicity"
      ],
      "guidanceRef": "FDA-ALT-ROUTE-2015"
    },
    {
      "id": "dent-quality-oral",
      "scope": "module",
      "instruction": "Module 3 must address dental-specific quality attributes: total versus free/soluble fluoride ion assay and content uniformity, pH and buffering, viscosity and oral retention, abrasivity for dentifrices, alcohol and sweetener content, preservative effectiveness, in vitro release for gels, varnishes and intrapocket delivery systems, and compatibility with dental materials and restorations.",
      "severity": "critical",
      "appliesTo": "3",
      "triggerKeywords": [
        "free fluoride",
        "soluble fluoride",
        "abrasivity",
        "varnish",
        "intrapocket",
        "viscosity",
        "in vitro release",
        "palatability"
      ],
      "guidanceRef": "EMA-PAED-QUALITY-2013"
    },
    {
      "id": "dent-pediatric-fluoride",
      "scope": "section",
      "instruction": "Because caries prevention is a predominantly pediatric indication, state the pediatric development plan explicitly, including age-appropriate formulation and palatability, dosing by age and weight, accidental-ingestion risk assessment, packaging and warning language, and any extrapolation of adult efficacy with its justification.",
      "severity": "critical",
      "appliesTo": "1.9",
      "triggerKeywords": [
        "pediatric",
        "children",
        "accidental ingestion",
        "child-resistant",
        "palatability",
        "age-appropriate"
      ],
      "guidanceRef": "ICH-E11R1"
    },
    {
      "id": "dent-pain-model",
      "scope": "section",
      "instruction": "For acute dental pain, describe the third-molar extraction model precisely: number and impaction class of teeth removed, anesthesia and sedation regimen, baseline pain intensity entry threshold, timing of first dose relative to anesthetic offset, rescue medication rules, and the derivation of SPID/TOTPAR with a prespecified handling of post-rescue scores.",
      "severity": "major",
      "appliesTo": "5.3.5.1",
      "triggerKeywords": [
        "third molar",
        "impaction",
        "spid",
        "totpar",
        "rescue medication",
        "pain intensity difference"
      ],
      "guidanceRef": "FDA-ANALGESIC-2014"
    },
    {
      "id": "dent-abuse-potential",
      "scope": "section",
      "instruction": "Any centrally acting analgesic developed in a dental pain model must include an abuse-potential assessment package - receptor and animal data, human abuse potential study or justification for its absence, adverse events of special interest for euphoria and drug liking, and a proposed scheduling recommendation with supporting benefit-risk framing.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "abuse potential",
        "drug liking",
        "scheduling",
        "opioid",
        "euphoria",
        "dependence"
      ],
      "guidanceRef": "FDA-ABUSE-2017"
    }
  ],
  "riskFactors": [
    "Site- and tooth-level measurements that are statistically dependent within a subject, producing inflated significance if analyzed as independent - the single most frequent methodological criticism in this area.",
    "Subjective examiner-scored indices (gingival, plaque, staining, Schiff sensitivity) with meaningful intra- and inter-examiner variability, requiring calibration evidence that many programs fail to document.",
    "Very high placebo and prophylaxis-related response in dentin hypersensitivity and gingivitis trials, driven by the Hawthorne effect and improved oral hygiene during study participation.",
    "Pediatric exposure and accidental ingestion risk for fluoride and other intraoral products, including dental fluorosis from cumulative childhood exposure and acute toxicity from overingestion.",
    "Long trial duration for caries endpoints (two to three years) with attrition, changing background fluoride exposure, and the ethical impossibility of a true no-fluoride control in most populations.",
    "Extrinsic tooth and restoration staining, calculus formation and taste disturbance with cationic antiseptics, which frequently constrain labeling and long-term use even when efficacy is demonstrated.",
    "Antimicrobial resistance and oral microbiome disruption with sustained use of intraoral antimicrobials, an increasing focus of both FDA and EMA review.",
    "Development of centrally acting analgesics in the dental pain model, where abuse potential, opioid-sparing claims and scheduling dominate the benefit-risk assessment.",
    "Regulatory pathway ambiguity between OTC monograph drug, prescription drug, cosmetic and dental device classifications for products such as varnishes, remineralizing agents and whitening/desensitizing systems."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "site level analysis",
        "per tooth analysis",
        "sites treated as independent",
        "no clustering adjustment",
        "number of bleeding sites"
      ],
      "description": "Efficacy is analyzed at the site, tooth or surface level without adjustment for within-subject clustering, so reported confidence intervals and p-values are not interpretable.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E9R1"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "no examiner calibration",
        "reproducibility not reported",
        "kappa not provided",
        "multiple examiners",
        "examiner not masked"
      ],
      "description": "Examiner training, masking and intra-/inter-examiner reproducibility are undocumented, undermining the reliability of every index-based endpoint in the study.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E6R3"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "duration less than six months",
        "three month study",
        "single evaluation",
        "no prophylaxis",
        "single pivotal study"
      ],
      "description": "Antigingivitis or antiplaque program is shorter than six months, has only one post-baseline evaluation, omits the baseline prophylaxis, or rests on a single study rather than two independent trials.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "CFR-356"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no oral soft tissue examination",
        "staining not assessed",
        "calculus not measured",
        "taste not evaluated",
        "no mucosal findings"
      ],
      "description": "Oral local tolerability - soft-tissue examination, extrinsic staining, calculus, taste alteration, mucosal burning - is not systematically collected, leaving known class effects unquantified for labeling.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "CFR-356"
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "no systemic pk",
        "swallowed fraction",
        "absorption not characterized",
        "salivary levels only",
        "no pediatric exposure"
      ],
      "description": "Systemic exposure from intraoral administration, including the swallowed fraction and pediatric exposure per body weight, is asserted to be negligible without measurement.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "CFR-355"
    },
    {
      "ctdSection": "4.2.3",
      "patterns": [
        "no mucosal irritation",
        "no local tolerance",
        "systemic route only",
        "sensitization not assessed"
      ],
      "description": "Nonclinical package lacks oral mucosal irritation and sensitization studies with the actual formulation and contact time, or relies entirely on toxicology conducted by a different route.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-ALT-ROUTE-2015"
    },
    {
      "ctdSection": "3.2.P.5",
      "patterns": [
        "free fluoride not assayed",
        "total fluoride only",
        "abrasivity",
        "in vitro release not provided",
        "preservative effectiveness"
      ],
      "description": "Specification omits dental-specific quality attributes - free/soluble fluoride ion, abrasivity, pH, viscosity/retention, in vitro release for varnishes and intrapocket systems, or antimicrobial effectiveness testing.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "EMA-PAED-QUALITY-2013"
    },
    {
      "ctdSection": "1.9",
      "patterns": [
        "no pediatric plan",
        "pediatric waiver",
        "children not studied",
        "accidental ingestion",
        "fluorosis risk"
      ],
      "description": "Pediatric development plan is absent or waived without justification for an indication whose principal population is children, and accidental-ingestion/fluorosis risk mitigation is not addressed in packaging or labeling.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH-E11R1"
    },
    {
      "ctdSection": "2.5",
      "patterns": [
        "placebo control only",
        "no positive control",
        "assay sensitivity",
        "non-inferiority margin not justified",
        "fluoride control"
      ],
      "description": "Comparator strategy is inadequate: a placebo-only design where an effective standard exists, or a non-inferiority comparison against a fluoride or antiseptic control without a justified margin and assay-sensitivity argument.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E10"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no abuse potential",
        "drug liking not assessed",
        "scheduling not proposed",
        "opioid sparing claim"
      ],
      "description": "A centrally acting analgesic evaluated in the dental pain model is submitted without an abuse-potential assessment or scheduling recommendation, or an opioid-sparing claim is made without a prespecified supporting endpoint.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "FDA-ABUSE-2017"
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "crossover carryover",
        "washout not justified",
        "period effect",
        "hypersensitivity crossover"
      ],
      "description": "Crossover designs in dentin hypersensitivity or local anesthesia are used without an adequate washout justification or a test for period and carryover effects.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "ICH-E9R1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "resistance not evaluated",
        "microbiome",
        "susceptibility not tested",
        "long term antimicrobial"
      ],
      "description": "Chronic or repeated intraoral antimicrobial use is proposed without evaluation of emergent resistance or shifts in oral flora and without susceptibility monitoring.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "WHO-ORAL-HEALTH-2023"
    },
    {
      "ctdSection": "5.3.1",
      "patterns": [
        "bioequivalence waiver",
        "locally acting",
        "in vitro only",
        "no clinical endpoint be"
      ],
      "description": "For a locally acting generic or 505(b)(2) oral product, equivalence rests on in vitro data alone without a clinical endpoint bioequivalence study or an adequate justification for the in vitro approach.",
      "severity": "major",
      "prefix": true,
      "guidanceRef": "FDA-PSG-ORAL-LOCAL"
    }
  ],
  "guidanceRefs": [
    {
      "code": "CFR-355",
      "authority": "FDA",
      "title": "21 CFR Part 355 - Anticaries Drug Products for Over-the-Counter Human Use",
      "why": "Defines permitted fluoride active ingredients, concentrations, dosage forms, labeling and required warnings for anticaries products; the baseline against which any new anticaries claim or non-monograph formulation is assessed."
    },
    {
      "code": "CFR-356",
      "authority": "FDA",
      "title": "21 CFR Part 356 - Oral Health Care Drug Products for Over-the-Counter Human Use",
      "why": "Governs oral health care drug products including antigingivitis/antiplaque and oral mucosal injury categories, and sets the labeling and claim framework that a prescription or NDA oral-health product must be positioned against."
    },
    {
      "code": "FDA-ANALGESIC-2014",
      "authority": "FDA",
      "title": "Analgesic Indications: Developing Drug and Biological Products (Draft Guidance for Industry, February 2014)",
      "why": "Frames acute pain trial design including the dental impaction pain model, entry pain thresholds, rescue medication handling, and the derivation and interpretation of SPID/TOTPAR endpoints used in Module 2.7.3."
    },
    {
      "code": "FDA-ABUSE-2017",
      "authority": "FDA",
      "title": "Assessment of Abuse Potential of Drugs (Guidance for Industry, January 2017)",
      "why": "Specifies the nonclinical and human abuse potential package and scheduling recommendation required for any centrally acting analgesic developed for dental pain, feeding Modules 2.7.4 and 1.14."
    },
    {
      "code": "FDA-ALT-ROUTE-2015",
      "authority": "FDA",
      "title": "Nonclinical Safety Evaluation of Reformulated Drug Products and Products Intended for Administration by an Alternative Route (Guidance for Industry, October 2015)",
      "why": "Scopes oral mucosal local tolerance, irritation and sensitization studies and defines when existing systemic toxicology can bridge to a new oromucosal or intraoral presentation in Module 4.2.3."
    },
    {
      "code": "FDA-PSG-ORAL-LOCAL",
      "authority": "FDA",
      "title": "Product-Specific Guidances for Generic Drug Development - locally acting oral/oromucosal products (e.g., chlorhexidine gluconate oral rinse, doxycycline hyclate periodontal system)",
      "why": "Establishes the equivalence approach for locally acting intraoral products, including when a clinical endpoint bioequivalence study is required versus an in vitro/comparative formulation approach, for 505(b)(2) and ANDA strategies."
    },
    {
      "code": "ICH-E9R1",
      "authority": "ICH",
      "title": "ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials",
      "why": "Basis for defining estimands around dental intercurrent events - tooth extraction, restorative or periodontal intervention, rescue analgesia, professional prophylaxis - and for the clustering and missing-data strategy in the SAP."
    },
    {
      "code": "ICH-E10",
      "authority": "ICH",
      "title": "ICH E10 Choice of Control Group and Related Issues in Clinical Trials",
      "why": "Governs comparator selection where withholding fluoride or standard periodontal therapy is not acceptable, including three-arm designs and the assay-sensitivity argument required for non-inferiority claims."
    },
    {
      "code": "ICH-E11R1",
      "authority": "ICH",
      "title": "ICH E11(R1) Clinical Investigation of Medicinal Products in the Pediatric Population",
      "why": "Frames the pediatric plan for caries prevention, fluoride dosing by age, age-appropriate formulation and palatability, and extrapolation of adult efficacy - central because the primary population for anticaries products is children."
    },
    {
      "code": "ICH-E6R3",
      "authority": "ICH",
      "title": "ICH E6(R3) Good Clinical Practice",
      "why": "Provides the quality-by-design and data-reliability framework used to justify examiner calibration, masking of assessors, and monitoring of index-based subjective endpoint data in dental trials."
    },
    {
      "code": "EMA-PAED-QUALITY-2013",
      "authority": "EMA",
      "title": "Guideline on Pharmaceutical Development of Medicines for Paediatric Use (EMA/CHMP/QWP/805880/2012 Rev. 2)",
      "why": "EU reference for palatability, excipient acceptability (sweeteners, ethanol, benzyl alcohol), dosing device accuracy and age-appropriate oral dosage form design for pediatric dental products in Module 3.2.P.2."
    },
    {
      "code": "EMA-EXCIPIENTS-ANNEX",
      "authority": "EMA",
      "title": "Excipients in the Labelling and Package Leaflet of Medicinal Products for Human Use (EMA/CHMP/302620/2017 and its Annex)",
      "why": "Determines mandatory excipient warnings for oral and oromucosal formulations - ethanol, sorbitol, sodium, benzyl alcohol, propylene glycol - that must appear in the EU product information."
    },
    {
      "code": "WHO-ORAL-HEALTH-2023",
      "authority": "WHO",
      "title": "WHO Global Strategy and Action Plan on Oral Health 2023-2030 (WHA76.2) and related WHO guidance on fluoride use",
      "why": "Provides the public health framing for caries prevention, fluoride exposure limits and antimicrobial stewardship in oral care that supports the benefit-risk narrative and global development strategy in Module 2.5."
    },
    {
      "code": "HC-NNHPD-ORAL",
      "authority": "HC",
      "title": "Health Canada Natural and Non-prescription Health Products Directorate - Oral Health Products Monograph",
      "why": "Defines Canadian permitted actives, concentrations, claims and warnings for fluoride and oral health products; used to align a single global formulation and labeling set across FDA, EMA and Health Canada."
    }
  ],
  "reviewerExpectations": [
    "A statistical analysis plan that names the subject as the unit of inference and specifies the mixed-model or GEE approach for clustered tooth- and site-level data, with the correlation structure and covariance estimator stated a priori.",
    "Documented examiner calibration with reported reproducibility statistics, one masked examiner per subject across all visits, and separation of scoring from treatment administration.",
    "For antigingivitis and antiplaque claims, six months of treatment with evaluations at approximately three and six months, a standardized baseline prophylaxis, whole-mouth scoring, and replication across two adequate and well-controlled studies.",
    "Systematic oral local tolerability data - soft-tissue examination, validated staining index, calculus scoring, taste and dysgeusia reporting - rather than narrative safety text, because these findings drive labeling limitations.",
    "Measured systemic exposure from the intraoral route including the swallowed fraction, with pediatric exposure expressed per body weight and compared against fluorosis and acute toxicity thresholds for fluoride products.",
    "A dental-specific Module 3 package: free/soluble fluoride ion assay in addition to total fluoride, abrasivity for dentifrices, in vitro release for varnishes and intrapocket delivery systems, and demonstrated compatibility with dental restorative materials.",
    "An explicit pediatric development plan with age-appropriate palatable formulations, accidental-ingestion risk mitigation, packaging controls and clear caregiver warnings.",
    "For acute dental pain, a fully specified third-molar extraction model with prespecified rescue rules and post-rescue score handling, plus a complete abuse-potential and scheduling package for centrally acting agents.",
    "For chronic intraoral antimicrobials, evidence on emergent resistance and oral microbiome shifts, with a stewardship-consistent duration-of-use recommendation in labeling."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Rare conditions with major oral manifestations - severe recurrent aphthous ulceration in Behcet syndrome, hypophosphatasia dental disease, epidermolysis bullosa oral involvement, Sjogren-associated severe xerostomia, and radiation- or chemotherapy-induced severe oral mucositis in defined populations.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.3",
        "5.3.5.2"
      ],
      "reviewerNotes": "Reviewers still expect masked, calibrated oral assessment and subject-level analysis; small sample size increases rather than reduces the importance of demonstrating examiner reliability and prespecified endpoint definitions."
    },
    {
      "pathway": "fast_track",
      "applicability": "Prevention or treatment of severe oral mucositis in patients receiving myeloablative conditioning or head-and-neck chemoradiation, where the condition is serious and available therapy is inadequate.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Use early interactions to fix the mucositis grading scale, the assessment schedule relative to the conditioning or radiation regimen, and the handling of death and treatment interruption as intercurrent events."
    },
    {
      "pathway": "priority_review",
      "applicability": "Products offering a significant improvement in safety or effectiveness for serious oral disease, notably non-opioid analgesics for acute dental pain that reduce opioid exposure, or therapies for severe oral mucositis.",
      "impactedSections": [
        "1.2",
        "2.5",
        "2.7.4"
      ],
      "reviewerNotes": "An opioid-sparing or reduced-abuse-liability claim must be supported by a prespecified endpoint and a complete human abuse potential package; comparative adverse event tabulations alone will not support it."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Preliminary clinical evidence of substantial improvement over available therapy for a serious oral condition such as severe mucositis, refractory oral candidiasis in immunocompromised patients, or aggressive periodontitis with systemic consequences.",
      "impactedSections": [
        "1.2",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "The compressed timeline makes the dental-specific Module 3 package - free fluoride ion, in vitro release, local tolerance, dental material compatibility - the usual critical path; start it before Phase 3."
    }
  ],
  "statisticalConsiderations": [
    "Treat the subject as the unit of randomization and inference; model clustered tooth, site and surface measurements with subject-level random effects (mixed models) or GEE with robust standard errors, and prespecify the covariance structure - failure to do so is the most common statistical deficiency cited in this area.",
    "Prespecify examiner calibration standards and report intra- and inter-examiner reproducibility (weighted kappa or ICC); consider examiner as a fixed or random effect and include a sensitivity analysis excluding examiners who fail calibration criteria.",
    "Define the estimand around dental intercurrent events - tooth extraction or loss, restorative or surgical periodontal intervention, professional prophylaxis, rescue analgesic use, antibiotic use for an unrelated infection - and prespecify treatment-policy versus composite strategies.",
    "Control the high placebo and Hawthorne response in gingivitis and dentin hypersensitivity trials through a standardized baseline prophylaxis, a run-in period, prespecified minimum baseline severity for entry, and reporting of the control-arm trajectory alongside the treatment difference.",
    "Justify non-inferiority margins against fluoride or antiseptic active controls with historical evidence of the comparator effect and a demonstrated assay-sensitivity argument, preferably in a three-arm design where a placebo or low-dose arm is ethically acceptable.",
    "Handle long-duration caries trials (two to three years) with prespecified attrition assumptions, MMRM or multiple imputation for missing increments, and covariate adjustment for baseline caries experience and background fluoride exposure.",
    "Control multiplicity across the several indices routinely collected in dental studies (gingival index, bleeding index, plaque index, staining, sensitivity scales) by naming a single primary index with a fixed-sequence hierarchy for the remainder.",
    "For crossover designs in dentin hypersensitivity and local anesthesia, justify the washout period pharmacologically and clinically, and prespecify tests for period and carryover effects with a parallel-group sensitivity analysis of first-period data only.",
    "For acute dental pain, prespecify the imputation rule for post-rescue pain scores (last observation before rescue, baseline observation carried forward, or a windowed approach) since SPID and TOTPAR conclusions are highly sensitive to this choice."
  ],
  "endpointConsiderations": [
    "Caries: net DMFS/DMFT increment over two to three years, or lesion arrest/reversal scored with a validated system such as ICDAS; superiority against a no-fluoride control is generally not ethical, so most programs require an active-controlled non-inferiority or add-on superiority design.",
    "Gingivitis: whole-mouth Loe-Silness or modified gingival index together with a bleeding measure (bleeding on probing or bleeding sites), assessed at approximately three and six months after a standardized prophylaxis, with plaque index (Turesky-modified Quigley-Hein) as supportive rather than sufficient.",
    "Periodontitis: clinical attachment level gain and probing pocket depth reduction as co-equal measures, supported by bleeding on probing and radiographic bone level; responder definitions based on a clinically meaningful attachment gain threshold strengthen interpretation, and tooth loss is the ultimate but generally impractical outcome.",
    "Dentin hypersensitivity: Schiff Air Index and tactile (Yeaple probe) thresholds with a patient-reported visual analogue or numeric scale, typically over eight weeks; the very large placebo response makes a validated stimulus protocol and entry severity threshold essential.",
    "Oral mucositis: incidence and duration of WHO grade 3-4 mucositis or an equivalent validated scale, complemented by a patient-reported mouth and throat soreness measure and by opioid analgesic use and inability to take oral nutrition as functional consequences.",
    "Oral candidiasis and odontogenic infection: clinical cure plus mycologic or microbiologic eradication at end of therapy with a later relapse or sustained-response assessment, together with susceptibility data for the isolated organisms.",
    "Xerostomia and salivary hypofunction: unstimulated whole salivary flow rate as the objective measure, which must be paired with a validated patient-reported dry mouth measure because flow rate alone correlates imperfectly with symptom relief.",
    "Acute dental pain: SPID and TOTPAR over defined intervals (commonly 0-8 and 0-24 hours) from the third-molar extraction model, with time to onset of meaningful pain relief, time to rescue medication and proportion requiring rescue as key supportive endpoints.",
    "Dental local anesthesia: success of pulpal anesthesia confirmed by electric pulp testing or absence of pain on instrumentation, onset and duration of soft-tissue and pulpal anesthesia, and the proportion requiring supplemental injection.",
    "Oral health-related quality of life instruments (OHIP-14 and similar) require fit-for-purpose validation and a justified meaningful within-patient change threshold before supporting a labeling claim; they are typically supportive rather than primary."
  ],
  "retrievalKeywords": [
    "dmfs dmft caries increment",
    "icdas caries scoring",
    "fluoride varnish",
    "free soluble fluoride ion",
    "dental fluorosis",
    "gingival index loe-silness",
    "turesky plaque index",
    "bleeding on probing",
    "clinical attachment level",
    "probing pocket depth",
    "intrapocket delivery system",
    "chlorhexidine oral rinse",
    "extrinsic tooth staining",
    "calculus formation",
    "dentin hypersensitivity schiff index",
    "yeaple probe tactile threshold",
    "oral mucositis who grade",
    "recurrent aphthous ulcer",
    "oral candidiasis clinical mycologic cure",
    "unstimulated salivary flow rate",
    "xerostomia",
    "third molar extraction pain model",
    "spid totpar",
    "dental local anesthesia electric pulp test",
    "examiner calibration kappa",
    "site level clustering gee",
    "oral mucosal irritation",
    "dentifrice abrasivity",
    "oral microbiome antimicrobial resistance",
    "ohip-14 oral health quality of life"
  ]
};

export default dentalProfile;
