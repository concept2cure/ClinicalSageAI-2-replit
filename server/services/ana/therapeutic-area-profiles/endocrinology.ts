/**
 * Endocrinology (Thyroid, Adrenal, Pituitary, Gonadal, Bone/Mineral Metabolism) therapeutic-area profile.
 *
 * Static regulatory knowledge injected into AnA prompt assembly and
 * retrieval scope for projects in this therapeutic area. Advisory: the
 * sponsor owns every clinical and scientific conclusion.
 *
 * @module server/services/ana/therapeutic-area-profiles/endocrinology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const endocrinologyProfile: TherapeuticAreaProfile = {
  "id": "endocrinology",
  "displayName": "Endocrinology (Thyroid, Adrenal, Pituitary, Gonadal, Bone/Mineral Metabolism)",
  "description": "Regulatory profile for endocrine drug development outside of diabetes and obesity: thyroid disorders, adrenal insufficiency and Cushing's syndrome, congenital adrenal hyperplasia, growth hormone deficiency and short stature, hypogonadism and hormone replacement, precocious puberty, osteoporosis and mineral metabolism, and hyperparathyroidism. Reviewed by CDER's Division of General Endocrinology (DGE) and DDLO, and under CHMP endocrine and bone guidelines. These programs are characterized by hormone-replacement pharmacodynamics, narrow therapeutic indices, biomarker-anchored endpoints, long-term skeletal and neoplastic safety, and heavy reliance on dose-titration designs.",
  "contextRules": [
    {
      "id": "endo-2.7.2-pd-titration",
      "scope": "section",
      "instruction": "For hormone replacement and hormone-suppression products, present the PK/PD relationship between exposure and the governing biomarker (TSH/free T4, cortisol or 17-OHP/androstenedione, IGF-1 SDS, testosterone Cmax/Cavg, estradiol) and justify the titration algorithm used in Phase 3 from that relationship. State the target biomarker range, the proportion of subjects achieving it, and the frequency of over-replacement, since over-replacement is the principal safety liability in this area.",
      "severity": "critical",
      "appliesTo": "2.7.2",
      "triggerKeywords": [
        "titration",
        "IGF-1 SDS",
        "free T4",
        "TSH suppression",
        "17-hydroxyprogesterone",
        "testosterone Cavg",
        "over-replacement"
      ],
      "guidanceRef": "ICH E4"
    },
    {
      "id": "endo-2.7.3-biomarker-to-clinical",
      "scope": "section",
      "instruction": "Where the primary endpoint is a hormone concentration or biochemical control measure, explicitly link it to clinical benefit: present the supporting clinical endpoints (height velocity, symptom scores, fracture incidence, adrenal crisis rate, glucocorticoid dose reduction) alongside the biomarker and state the evidentiary basis for the biomarker as a surrogate. Do not present biochemical normalization as self-evidently clinically meaningful.",
      "severity": "critical",
      "appliesTo": "2.7.3",
      "triggerKeywords": [
        "biochemical control",
        "surrogate endpoint",
        "hormone normalization",
        "clinical benefit"
      ]
    },
    {
      "id": "endo-2.7.4-skeletal-safety",
      "scope": "section",
      "instruction": "Include a dedicated skeletal safety subsection for any product affecting sex steroids, glucocorticoid exposure, calcium/phosphate handling, or bone remodeling: DXA-measured BMD at lumbar spine, total hip, and femoral neck; bone turnover markers (CTX, P1NP); adjudicated fractures including atypical femoral fracture and osteonecrosis of the jaw where relevant; and, in pediatrics, bone age advancement and predicted adult height.",
      "severity": "critical",
      "appliesTo": "2.7.4",
      "triggerKeywords": [
        "bone mineral density",
        "DXA",
        "fracture",
        "bone turnover markers",
        "bone age",
        "atypical femoral fracture"
      ],
      "guidanceRef": "EMA CPMP/EWP/552/95 Rev. 2"
    },
    {
      "id": "endo-module4-carcinogenicity-hormonal",
      "scope": "module",
      "instruction": "For chronically administered hormonal agents, present the carcinogenicity, reproductive toxicology, and hormonal-perturbation nonclinical package with explicit human-relevance argumentation for rodent-specific endocrine tumor findings (e.g., rodent thyroid follicular tumors from hepatic enzyme induction, mammary tumors from prolactin differences, osteosarcoma with anabolic bone agents). Link each finding to the proposed labeling, monitoring, or duration limit.",
      "severity": "critical",
      "appliesTo": "4",
      "triggerKeywords": [
        "carcinogenicity",
        "osteosarcoma",
        "rodent thyroid tumors",
        "hormonal perturbation",
        "duration limit"
      ],
      "guidanceRef": "ICH S1B(R1)"
    },
    {
      "id": "endo-5.3.3-hpa-axis",
      "scope": "section",
      "instruction": "For glucocorticoid-containing or glucocorticoid-modifying products, include HPA-axis assessment (ACTH stimulation testing, morning cortisol) with pre-specified criteria for suppression, and document adrenal crisis prevention measures — stress dosing instructions, patient education, and emergency injection kits — as they will appear in labeling and the Risk Management Plan.",
      "severity": "critical",
      "appliesTo": "5.3.3.4",
      "triggerKeywords": [
        "HPA axis suppression",
        "ACTH stimulation",
        "adrenal crisis",
        "stress dosing",
        "cortisol"
      ]
    },
    {
      "id": "endo-module1-pediatric-growth",
      "scope": "module",
      "instruction": "For pediatric endocrine indications (GHD, precocious puberty, CAH, hypothyroidism), state the PSP/PIP agreement, the age strata studied, the extrapolation argument from adults where used, and long-term growth and pubertal follow-up commitments. Endocrine pediatric programs almost always carry a post-marketing final-adult-height or long-term registry obligation.",
      "severity": "major",
      "appliesTo": "1",
      "triggerKeywords": [
        "pediatric investigation plan",
        "final adult height",
        "growth velocity",
        "puberty",
        "extrapolation"
      ],
      "guidanceRef": "ICH E11(R1)"
    },
    {
      "id": "endo-always-assay-standardization",
      "scope": "always",
      "instruction": "Whenever hormone concentrations are reported, state the assay platform, whether it is standardized/traceable (e.g., LC-MS/MS versus immunoassay for testosterone and estradiol; CDC HoSt certification), the lower limit of quantitation, and how assay changes across studies were bridged. Non-standardized immunoassay data at low concentrations is a recurring source of regulatory challenge.",
      "severity": "major",
      "triggerKeywords": [
        "LC-MS/MS",
        "immunoassay",
        "assay standardization",
        "lower limit of quantitation",
        "assay bridging"
      ]
    }
  ],
  "riskFactors": [
    "Over-replacement toxicity: iatrogenic thyrotoxicosis with atrial fibrillation and bone loss, iatrogenic Cushing's syndrome from glucocorticoid over-replacement, and acromegalic features from excessive growth hormone exposure.",
    "Under-replacement and adrenal crisis, a life-threatening event requiring dedicated ascertainment, adjudication, and a patient-education/REMS-like risk minimization strategy.",
    "Hormone-dependent malignancy risk (breast, endometrial, prostate) with estrogen, progestin, and androgen products, requiring long-term surveillance and class labeling.",
    "Cardiovascular and thromboembolic risk with sex-steroid therapy — venous thromboembolism, stroke, and the historical WHI-derived class boxed warning for estrogen products.",
    "Skeletal safety liabilities: osteoporosis from suppressive therapy, atypical femoral fracture and osteonecrosis of the jaw with antiresorptives, rebound vertebral fractures on discontinuation of denosumab-class agents, and rodent osteosarcoma findings with anabolic agents.",
    "Hypercalcemia, hypocalcemia, and phosphate dysregulation in mineral-metabolism programs, requiring intensive laboratory monitoring schedules that carry into labeling.",
    "Growth-plate and pubertal effects in pediatric endocrine therapy, including bone age advancement, compromised final adult height, and effects on fertility.",
    "Immunogenicity and the potential for neutralizing antibodies against recombinant peptide hormones (somatropin, PTH analogs, gonadotropins) causing loss of effect.",
    "Narrow therapeutic index and formulation sensitivity (levothyroxine) where minor potency or dissolution changes have clinical consequences and drive stringent CMC and bioequivalence expectations."
  ],
  "commonGaps": [
    {
      "ctdSection": "2.7.3",
      "patterns": [
        "biomarker only endpoint",
        "no clinical outcome",
        "surrogate not validated",
        "biochemical control without symptom data"
      ],
      "description": "Efficacy rests entirely on hormone normalization with no supporting clinical, functional, or patient-reported endpoint, and no argument establishing the biomarker as a validated or reasonably likely surrogate.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.2",
      "patterns": [
        "titration algorithm not justified",
        "no dose response",
        "single dose regimen",
        "exposure response not characterized",
        "target range not defined"
      ],
      "description": "Titration-to-target Phase 3 design without an exposure-response basis for the algorithm, target range, or maximum dose, leaving the lowest effective dose and the over-replacement boundary unestablished.",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E4"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "no bone mineral density",
        "skeletal safety not assessed",
        "fractures not adjudicated",
        "bone age not monitored",
        "bone turnover markers absent"
      ],
      "description": "Long-term hormonal therapy submitted without DXA BMD, bone turnover markers, adjudicated fracture data, or pediatric bone age monitoring appropriate to the mechanism.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "over-replacement not characterized",
        "supraphysiologic exposure",
        "iatrogenic thyrotoxicosis",
        "hypercortisolism not tabulated",
        "excess hormone events"
      ],
      "description": "Safety analysis fails to quantify the frequency, duration, and consequences of supraphysiologic hormone exposure, which is the mechanism-linked toxicity for essentially all replacement products.",
      "severity": "critical",
      "prefix": true
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "assay not standardized",
        "immunoassay used",
        "lloq inadequate",
        "assay changed between studies",
        "no assay bridging"
      ],
      "description": "Hormone measurements produced by non-standardized immunoassays, with an LLOQ inadequate for the low-concentration range of interest (e.g., pediatric or female testosterone, suppressed estradiol), or assay platform changes between studies without a bridging analysis.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "5.3.5.1",
      "patterns": [
        "single arm study",
        "no concurrent control",
        "historical control not justified",
        "open label efficacy"
      ],
      "description": "Reliance on uncontrolled or open-label designs for endpoints susceptible to observer or regression-to-the-mean bias, without an adequate external-control justification or blinded endpoint assessment.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "2.7.5",
      "patterns": [
        "insufficient long term exposure",
        "less than 12 months data",
        "safety database inadequate for chronic use",
        "no post treatment follow-up"
      ],
      "description": "Lifetime-use endocrine indication supported by short exposure, or no off-treatment follow-up to characterize rebound (e.g., BMD loss after antiresorptive discontinuation, HPA recovery after suppression).",
      "severity": "critical",
      "prefix": true,
      "guidanceRef": "ICH E1"
    },
    {
      "ctdSection": "2.7.4",
      "patterns": [
        "immunogenicity not assessed",
        "neutralizing antibody assay not validated",
        "adas not correlated with efficacy"
      ],
      "description": "Recombinant peptide hormone product submitted without a tiered, validated immunogenicity assay strategy or without correlating ADA status to PK, PD biomarker, and loss of clinical effect.",
      "severity": "major",
      "prefix": true
    },
    {
      "ctdSection": "1.14",
      "patterns": [
        "class labeling not addressed",
        "boxed warning omitted",
        "monitoring schedule not specified",
        "duration of use not limited"
      ],
      "description": "Proposed labeling omits established endocrine class warnings, the laboratory monitoring schedule required to use the product safely, or a mechanism-driven duration-of-use limitation.",
      "severity": "major",
      "prefix": true
    }
  ],
  "guidanceRefs": [
    {
      "code": "ICH E4",
      "authority": "ICH",
      "title": "Dose-Response Information to Support Drug Registration",
      "why": "Central to endocrine programs because hormone replacement requires an established dose-response and a defensible titration algorithm; supports Module 2.7.2 and the Dosage and Administration section."
    },
    {
      "code": "EMA CPMP/EWP/552/95 Rev. 2",
      "authority": "EMA",
      "title": "Guideline on the Evaluation of Medicinal Products in the Treatment of Primary Osteoporosis",
      "why": "Defines EU expectations for fracture endpoints as primary in osteoporosis, the role of BMD and bone turnover markers, required trial duration, bone-quality assessment, and post-treatment follow-up; central to Module 2.5 and 2.7.3 for bone products."
    },
    {
      "code": "FDA Draft Guidance (March 2016), Osteoporosis: Nonclinical Evaluation of Drugs Intended for Treatment",
      "authority": "FDA",
      "title": "Osteoporosis: Nonclinical Evaluation of Drugs Intended for Treatment",
      "why": "Sets the nonclinical bone-quality, biomechanical strength, and carcinogenicity expectations (including osteosarcoma assessment for anabolic agents) that populate Module 2.6 and drive labeling duration limits."
    },
    {
      "code": "EMEA/CHMP/021/97 Rev. 1",
      "authority": "EMA",
      "title": "Guideline on Clinical Investigation of Medicinal Products for Hormone Replacement Therapy of Oestrogen Deficiency Symptoms in Postmenopausal Women",
      "why": "Defines the vasomotor symptom endpoints (frequency and severity of hot flushes), endometrial safety requirements including biopsy, and the class safety statements required in the EU SmPC."
    },
    {
      "code": "FDA Guidance, Estrogen and Estrogen/Progestin Drug Products to Treat Vasomotor Symptoms and Vulvar and Vaginal Atrophy Symptoms — Recommendations for Clinical Evaluation",
      "authority": "FDA",
      "title": "Noncontraceptive Estrogen and Progestin Drug Products — Clinical Evaluation Recommendations",
      "why": "Establishes the co-primary vasomotor endpoints, the 12-week and 52-week design expectations, and the mandatory 12-month endometrial biopsy safety dataset for unopposed estrogen exposure."
    },
    {
      "code": "FDA Guidance, Levothyroxine Sodium Tablets — In Vivo Pharmacokinetic and Bioavailability Studies and In Vitro Dissolution Testing (2000)",
      "authority": "FDA",
      "title": "Levothyroxine Sodium Tablets: In Vivo Pharmacokinetic and Bioavailability Studies and In Vitro Dissolution Testing",
      "why": "Governs the narrow-therapeutic-index bioequivalence, potency specification, and stability expectations for thyroid hormone products in Modules 3.2.P and 5.3.1."
    },
    {
      "code": "ICH E11(R1)",
      "authority": "ICH",
      "title": "Clinical Investigation of Medicinal Products in the Pediatric Population — Addendum",
      "why": "Frames pediatric growth, puberty, and endocrine development study design, the extrapolation framework, and the long-term follow-up obligations that recur in GHD, CAH, and precocious puberty programs."
    },
    {
      "code": "ICH S1B(R1) and ICH S5(R3)",
      "authority": "ICH",
      "title": "Testing for Carcinogenicity of Pharmaceuticals; Detection of Reproductive and Developmental Toxicity for Human Pharmaceuticals",
      "why": "Governs the carcinogenicity and reproductive toxicology packages for hormonally active agents, including human-relevance argumentation for rodent endocrine tumors and effects on fertility and development."
    },
    {
      "code": "ICH E1",
      "authority": "ICH",
      "title": "The Extent of Population Exposure to Assess Clinical Safety for Long-Term Treatment",
      "why": "Endocrine replacement is typically lifelong; the exposure table in Module 2.7.5 must meet or exceed E1 minimums and usually needs multi-year data for skeletal and neoplastic endpoints."
    },
    {
      "code": "EMEA/CHMP/BMWP/94528/2005",
      "authority": "EMA",
      "title": "Guideline on Similar Biological Medicinal Products Containing Recombinant Human Somatropin",
      "why": "Defines the biosimilar comparability, PD endpoint (IGF-1), efficacy (height velocity), and immunogenicity requirements for growth hormone biosimilars in the EU."
    }
  ],
  "reviewerExpectations": [
    "The reviewer expects a clear articulation of the target hormone range, the proportion of subjects maintained within it, and the frequency and duration of excursions above it, because over-replacement is where the harm lies.",
    "The reviewer will assess whether a biochemical primary endpoint is anchored to clinical benefit and will resist approval based on hormone normalization alone in the absence of a recognized surrogate relationship.",
    "The reviewer scrutinizes the analytical method for hormone measurement, expecting LC-MS/MS with documented sensitivity and standardization for sex steroids and low-concentration analytes.",
    "For pediatric endocrine products the reviewer expects growth velocity or height SDS data, bone age monitoring, pubertal staging, and a committed plan for final adult height follow-up.",
    "The reviewer expects the laboratory monitoring schedule proposed in Section 2 and 5 of labeling to be directly derived from the observed frequency and time course of laboratory abnormalities in the trials.",
    "For bone products the reviewer expects fracture (not BMD alone) as the basis for a fracture-reduction claim, with BMD and bone turnover markers as supportive, plus off-treatment data addressing rebound.",
    "The reviewer expects adrenal crisis, thyroid storm, and other endocrine emergencies to be prospectively defined, adjudicated, and reported as rates per patient-year with a risk-minimization plan."
  ],
  "pathwayHints": [
    {
      "pathway": "orphan_drug",
      "applicability": "Congenital adrenal hyperplasia, Cushing's disease, acromegaly, hypoparathyroidism, X-linked hypophosphatemia, primary adrenal insufficiency subsets, and rare forms of growth hormone deficiency and precocious puberty.",
      "impactedSections": [
        "1.3",
        "2.5",
        "2.7.3",
        "5.3.5.1"
      ],
      "reviewerNotes": "Expect small, biomarker-anchored, sometimes randomized-withdrawal designs. The reviewer will require rigorous natural history context, blinded endpoint assessment, and a long-term extension providing multi-year safety in a lifelong-treatment setting."
    },
    {
      "pathway": "breakthrough_therapy",
      "applicability": "Rare endocrine conditions where early data show substantial improvement over available therapy — e.g., agents allowing meaningful glucocorticoid dose reduction in CAH or achieving biochemical control in refractory Cushing's or acromegaly.",
      "impactedSections": [
        "2.5",
        "2.7.3",
        "2.7.4"
      ],
      "reviewerNotes": "Rapid designation should not compress the long-term skeletal, adrenal-recovery, and neoplastic safety database; plan the extension study and registry commitments in parallel with the pivotal trial."
    },
    {
      "pathway": "priority_review",
      "applicability": "Products offering significant improvement in the treatment of serious endocrine conditions (adrenal insufficiency, hypoparathyroidism, severe hypophosphatemia) or carrying a rare pediatric disease priority review voucher.",
      "impactedSections": [
        "1.2",
        "2.5"
      ],
      "reviewerNotes": "The evidentiary standard is unchanged; sponsors should confirm that the pediatric study plan and risk management materials are submission-ready given the shortened clock."
    },
    {
      "pathway": "conditional_marketing_authorization",
      "applicability": "EU pathway for seriously debilitating rare endocrine diseases where comprehensive clinical data are not yet available but the benefit of immediate availability outweighs the residual uncertainty.",
      "impactedSections": [
        "1.8.1",
        "2.5",
        "5.3.5.1"
      ],
      "reviewerNotes": "Specific obligations will require completion of the confirmatory or long-term safety study; state the timelines in the RMP and Module 1.8.2 and expect annual renewal until obligations are discharged."
    }
  ],
  "statisticalConsiderations": [
    "Titration-to-target designs require an estimand that addresses dose changes as part of the treatment regimen rather than as intercurrent events, and the SAP must pre-specify how subjects failing to reach target are classified.",
    "Randomized-withdrawal designs are frequently the only ethical way to demonstrate effect in replacement therapy; pre-specify the run-in stabilization criteria, the withdrawal endpoint (time to loss of biochemical or symptomatic control), and the handling of rescue as a treatment failure.",
    "In small rare-endocrine populations, pre-specify the analysis approach for limited sample size — exact tests, Bayesian borrowing from natural history with a pre-specified prior and sensitivity to prior choice, or n-of-1/crossover designs with adequate washout justified by hormone half-life.",
    "Multiplicity across co-primary symptom endpoints (frequency and severity for vasomotor symptoms), multiple skeletal sites, and dose groups must be controlled with a pre-specified hierarchical procedure; BMD at multiple sites is a common source of uncontrolled multiplicity.",
    "Fracture endpoints require time-to-event analysis with competing risk of death considered, adjudication of radiographic vertebral fractures by a central reader using a quantitative morphometry standard, and pre-specified handling of the semi-quantitative grading.",
    "Longitudinal biomarker endpoints (IGF-1 SDS, free T4, 17-OHP) should be analyzed with mixed models for repeated measures using an unstructured covariance where feasible, with pre-specified handling of diurnal and assay variability.",
    "Missing data in long-duration endocrine trials should use multiple imputation under MAR with tipping-point sensitivity; last-observation-carried-forward is not acceptable given time-dependent skeletal and growth trajectories."
  ],
  "endpointConsiderations": [
    "Osteoporosis: incident vertebral and non-vertebral fracture incidence is the accepted primary endpoint for a fracture-reduction claim; lumbar spine and total hip BMD by DXA are accepted supportive endpoints and may support approval only in restricted settings (e.g., bridging in men or glucocorticoid-induced osteoporosis) with a justified extrapolation.",
    "Growth hormone deficiency: annualized height velocity or change in height SDS over 12 months is the accepted pediatric endpoint, with IGF-1 SDS as the PD/safety anchor and final adult height as the long-term confirmatory measure; in adults, body composition (lean and fat mass) and quality-of-life instruments (QoL-AGHDA) are the accepted endpoints.",
    "Congenital adrenal hyperplasia: androstenedione (and 17-OHP) control together with a clinically meaningful reduction in glucocorticoid dose to physiologic range is the accepted dual construct; androgen control alone without glucocorticoid reduction is generally insufficient.",
    "Cushing's syndrome and acromegaly: normalization of 24-hour urinary free cortisol (or late-night salivary cortisol) and of IGF-1 with GH suppression respectively are the established biochemical endpoints, supported by signs, symptoms, and comorbidity measures.",
    "Hypothyroidism: TSH normalization within the reference range with free T4 in range is the accepted pharmacodynamic endpoint, with symptom scales supportive; narrow-therapeutic-index bioequivalence standards apply to generic and reformulated levothyroxine.",
    "Male hypogonadism: the accepted endpoint set is the proportion of subjects achieving a mean 24-hour serum testosterone concentration within the eugonadal range with pre-specified limits on Cmax outliers, supported by symptomatic and body-composition measures.",
    "Vasomotor symptoms of menopause: co-primary endpoints of change in frequency and change in severity of moderate-to-severe hot flushes at weeks 4 and 12, with 52-week endometrial safety by biopsy for products containing estrogen.",
    "Central precocious puberty: suppression of stimulated LH below a pre-specified threshold, supported by growth velocity normalization, Tanner staging, bone-age-to-chronological-age ratio, and predicted adult height.",
    "Hypoparathyroidism: a composite of serum calcium in the target range with independence from (or substantial reduction of) conventional calcium and active vitamin D therapy, supported by urinary calcium and renal safety measures."
  ],
  "retrievalKeywords": [
    "hormone replacement therapy",
    "tsh free t4 levothyroxine",
    "adrenal insufficiency adrenal crisis",
    "congenital adrenal hyperplasia androstenedione",
    "cushing syndrome urinary free cortisol",
    "acromegaly igf-1",
    "growth hormone deficiency height velocity",
    "final adult height",
    "central precocious puberty gnrh agonist",
    "male hypogonadism testosterone cavg",
    "vasomotor symptoms hot flush",
    "endometrial hyperplasia biopsy",
    "osteoporosis vertebral fracture",
    "bone mineral density dxa",
    "bone turnover markers ctx p1np",
    "atypical femoral fracture osteonecrosis of the jaw",
    "hypoparathyroidism serum calcium",
    "x-linked hypophosphatemia fgf23",
    "hpa axis suppression acth stimulation",
    "lc-ms/ms hormone assay standardization",
    "randomized withdrawal design",
    "bone age advancement",
    "somatropin biosimilar immunogenicity",
    "narrow therapeutic index bioequivalence",
    "igf-1 standard deviation score"
  ]
};

export default endocrinologyProfile;
