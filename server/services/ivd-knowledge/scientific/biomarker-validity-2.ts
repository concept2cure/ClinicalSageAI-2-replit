/**
 * Per-analyte scientific-validity corpus — wave 2.
 *
 * Extends biomarker-validity.ts with additional oncology targets (fusions,
 * point mutations, hematologic markers) and high-volume clinical-chemistry /
 * core-lab analytes, each with the analyte→condition association, guideline
 * backing, and intended-use/CDx context.
 */

import type { KnowledgeEntry } from '../types';

export const BIOMARKER_VALIDITY_KNOWLEDGE_2: KnowledgeEntry[] = [
  {
    id: 'bio.ros1',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'ROS1 rearrangement — NSCLC targeted therapy',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'ROS1 gene fusions are a validated predictive biomarker for ROS1 inhibitors (crizotinib, entrectinib, repotrectinib) in NSCLC; detected by IHC screen with FISH/NGS confirmation, guideline-mandated at diagnosis of advanced non-squamous disease.',
    detail:
      'ROS1 rearrangements occur in ~1–2% of NSCLC and predict marked benefit from ROS1 tyrosine-kinase inhibitors. Per CAP/IASLC/AMP and NCCN, ROS1 is a required biomarker at diagnosis of advanced non-squamous NSCLC. Because of low prevalence, IHC (D4D6 clone) is commonly used as a sensitive screen, with confirmation by break-apart FISH or (preferably) RNA-based NGS fusion assays, which improve fusion detection. Under IVDR a ROS1 CDx is Class C (Rule 3).',
    keyPoints: [
      'ROS1 fusions predict ROS1-inhibitor benefit in NSCLC (~1–2%).',
      'IHC screen (D4D6) → FISH/RNA-NGS confirmation.',
      'Guideline-mandated at advanced non-squamous NSCLC diagnosis.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'CAP/IASLC/AMP Molecular Testing Guideline for Lung Cancer', source: 'CAP/IASLC/AMP' },
      { label: 'FDA ROS1 inhibitor labels (CDx context)', source: 'FDA' },
    ],
    related: ['bio.alk', 'bio.ntrk', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['ros1', 'nsclc', 'fusion', 'ngs', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.ntrk',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'NTRK fusions — tissue-agnostic TRK-inhibitor selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'NTRK1/2/3 gene fusions predict response to TRK inhibitors (larotrectinib, entrectinib) across tumor types (tissue-agnostic); rare overall but enriched in certain rare tumors, detected by pan-TRK IHC screen and RNA-based NGS confirmation.',
    detail:
      'NTRK gene fusions are oncogenic drivers and the basis of tissue-agnostic approvals for TRK inhibitors. They are rare in common cancers but highly enriched (near-pathognomonic) in some rare tumors (secretory carcinoma, infantile fibrosarcoma). Detection strategy is prevalence-driven: pan-TRK IHC as a screen, confirmed by RNA-based NGS (DNA panels can miss fusions with large/variable introns). NCCN endorses testing where a TRK inhibitor is considered. Under IVDR a CDx is Class C.',
    keyPoints: [
      'NTRK1/2/3 fusions → TRK-inhibitor benefit, tissue-agnostically.',
      'Rare overall; enriched in secretory carcinoma/infantile fibrosarcoma.',
      'Pan-TRK IHC screen → RNA-NGS confirmation (DNA panels miss some fusions).',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'NCCN guidance (NTRK testing); ESMO recommendations', source: 'NCCN/ESMO' },
      { label: 'FDA tissue-agnostic TRK inhibitor approvals', source: 'FDA' },
    ],
    related: ['bio.ros1', 'bio.msi-mmr', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['ntrk', 'trk', 'fusion', 'tissue-agnostic', 'rna-ngs', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.ret',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'RET alterations — NSCLC/thyroid selective RET-inhibitor selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'RET fusions (NSCLC, papillary thyroid) and RET mutations (medullary thyroid) predict benefit from selective RET inhibitors (selpercatinib, pralsetinib); detected by NGS (fusions/mutations), guideline-endorsed.',
    detail:
      'RET gene fusions drive a subset of NSCLC and papillary thyroid cancer, while activating RET point mutations drive most medullary thyroid carcinoma; both predict response to selective RET inhibitors. NGS (RNA-based for fusions; DNA for mutations) is the preferred detection method. NCCN endorses RET testing in advanced NSCLC and thyroid cancers. Under IVDR a RET CDx is Class C.',
    keyPoints: [
      'RET fusions (NSCLC/papillary thyroid) + RET mutations (medullary thyroid) → selective RET inhibitors.',
      'NGS detection (RNA for fusions, DNA for mutations).',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'NCCN NSCLC/Thyroid guidelines (RET testing)', source: 'NCCN' },
      { label: 'FDA selective RET inhibitor labels', source: 'FDA' },
    ],
    related: ['bio.ros1', 'bio.ntrk', 'fda.ivd.cdx'],
    tags: ['ret', 'nsclc', 'thyroid', 'fusion', 'ngs', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.met',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'MET exon 14 skipping / amplification — NSCLC MET-inhibitor selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'MET exon 14 skipping alterations (and MET amplification) predict benefit from MET inhibitors (capmatinib, tepotinib) in NSCLC; exon 14 skipping is best detected by RNA-based NGS, amplification by FISH/NGS copy number.',
    detail:
      'MET exon 14 skipping mutations are oncogenic drivers in ~3–4% of NSCLC and predict response to MET inhibitors; MET amplification is a related but distinct, threshold-dependent biomarker. Detection nuance matters: exon 14 skipping is reliably captured by RNA-based NGS (DNA assays may miss it depending on design), while amplification requires copy-number assessment (FISH or NGS). NCCN endorses MET exon 14 testing in advanced NSCLC. Class C under IVDR.',
    keyPoints: [
      'MET exon 14 skipping (~3–4% NSCLC) + amplification → MET inhibitors.',
      'Exon 14 skipping: RNA-NGS preferred; amplification: FISH/NGS copy number.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'NCCN NSCLC guidelines (MET testing)', source: 'NCCN' },
      { label: 'FDA MET inhibitor labels', source: 'FDA' },
    ],
    related: ['bio.egfr', 'bio.ros1', 'fda.ivd.cdx'],
    tags: ['met', 'exon-14', 'amplification', 'nsclc', 'ngs', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.fgfr',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'FGFR alterations — urothelial / cholangiocarcinoma FGFR-inhibitor selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'FGFR2/3 fusions and mutations predict benefit from FGFR inhibitors (erdafitinib in urothelial carcinoma; pemigatinib/futibatinib for FGFR2-fusion cholangiocarcinoma); detected by NGS, with FDA companion diagnostics.',
    detail:
      'FGFR3 mutations/fusions in urothelial carcinoma and FGFR2 fusions in intrahepatic cholangiocarcinoma are validated predictive biomarkers for FGFR inhibitors. Detection is by DNA/RNA NGS; FDA-approved companion diagnostics exist for the relevant drug-indication pairs. Class C under IVDR.',
    keyPoints: [
      'FGFR3 (urothelial) and FGFR2 fusions (cholangiocarcinoma) → FGFR inhibitors.',
      'NGS detection; approved CDx exist.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'FDA FGFR inhibitor + companion diagnostic labels', source: 'FDA' },
      { label: 'NCCN bladder/biliary guidelines', source: 'NCCN' },
    ],
    related: ['fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['fgfr', 'urothelial', 'cholangiocarcinoma', 'ngs', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.idh',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'IDH1/2 mutations — AML and glioma targeted therapy',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IDH1 and IDH2 mutations predict benefit from IDH inhibitors (ivosidenib, enasidenib) in acute myeloid leukemia and inform glioma classification/therapy; detected by PCR or NGS, with FDA companion diagnostics in AML.',
    detail:
      'Mutations in IDH1 (e.g., R132) and IDH2 (e.g., R140/R172) are validated predictive biomarkers for IDH inhibitors in AML, and are central to the WHO molecular classification and emerging therapy of gliomas. Detection is by PCR or NGS; FDA companion diagnostics support the AML indications. Under IVDR an IDH CDx is Class C.',
    keyPoints: [
      'IDH1/2 mutations → IDH inhibitors in AML; key to glioma classification.',
      'PCR/NGS detection; approved CDx in AML.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'FDA IDH inhibitor + companion diagnostic labels', source: 'FDA' },
      { label: 'WHO classification (glioma IDH status)', source: 'WHO' },
    ],
    related: ['bio.flt3', 'fda.ivd.cdx'],
    tags: ['idh1', 'idh2', 'aml', 'glioma', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.flt3',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'FLT3-ITD / TKD — AML prognosis and FLT3-inhibitor selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'FLT3 internal tandem duplications (ITD) and tyrosine-kinase-domain (TKD) mutations are prognostic in AML and predict benefit from FLT3 inhibitors (midostaurin, gilteritinib); detected by PCR fragment analysis (allelic ratio) and NGS.',
    detail:
      'FLT3-ITD is among the most important prognostic and predictive markers in AML (high allelic-ratio ITD confers poor prognosis and informs transplant decisions), and FLT3-ITD/TKD predict benefit from FLT3 inhibitors. Standard detection is PCR-based fragment-length analysis reporting the ITD allelic ratio, complemented by NGS. An FDA companion diagnostic supports FLT3-inhibitor use. Class C under IVDR.',
    keyPoints: [
      'FLT3-ITD/TKD: prognostic + predictive in AML.',
      'PCR fragment analysis (allelic ratio) + NGS.',
      'Approved CDx; Class C under IVDR.',
    ],
    citations: [
      { label: 'FDA FLT3 inhibitor + CDx labels', source: 'FDA' },
      { label: 'ELN AML recommendations (FLT3-ITD allelic ratio)', source: 'ELN' },
    ],
    related: ['bio.idh', 'fda.ivd.cdx'],
    tags: ['flt3', 'itd', 'aml', 'allelic-ratio', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.jak2',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'JAK2 V617F / CALR / MPL — myeloproliferative neoplasm diagnosis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'JAK2 V617F (and JAK2 exon 12, CALR, MPL) mutations are diagnostic molecular criteria for myeloproliferative neoplasms (polycythemia vera, essential thrombocythemia, myelofibrosis) per WHO; detected by allele-specific PCR and NGS.',
    detail:
      'Driver mutations define MPN diagnosis: JAK2 V617F is present in nearly all polycythemia vera and ~50–60% of ET/MF; JAK2 exon 12, CALR, and MPL mutations cover most JAK2 V617F-negative cases. These are WHO diagnostic criteria. Quantitative allele-specific PCR (with defined sensitivity) and NGS are used; allele burden can inform monitoring. These are diagnostic IVDs rather than CDx in the classic sense.',
    keyPoints: [
      'JAK2 V617F/exon12, CALR, MPL = WHO molecular diagnostic criteria for MPN.',
      'Allele-specific quantitative PCR + NGS; allele burden informs monitoring.',
      'Diagnostic IVD (not a classic CDx).',
    ],
    citations: [
      { label: 'WHO classification of myeloid neoplasms (MPN criteria)', source: 'WHO' },
    ],
    related: ['bio.flt3', 'sci.ivd.scientific-validity'],
    tags: ['jak2', 'calr', 'mpl', 'mpn', 'pcr', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.pik3ca',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'PIK3CA mutations — HR+ breast cancer alpelisib selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'PIK3CA activating mutations predict benefit from the PI3K inhibitor alpelisib in HR+/HER2− advanced breast cancer; detectable in tissue or plasma cfDNA, with FDA companion diagnostics.',
    detail:
      'Activating PIK3CA mutations occur in ~40% of HR+/HER2− breast cancers and predict benefit from alpelisib plus endocrine therapy. Both tissue and plasma cfDNA companion diagnostics are FDA-approved (with the usual rule that a plasma-negative result should reflex to tissue testing). Class C under IVDR.',
    keyPoints: [
      'PIK3CA mutations → alpelisib benefit in HR+/HER2− breast cancer.',
      'Tissue or plasma cfDNA CDx; plasma-negative reflexes to tissue.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'FDA alpelisib + companion diagnostic labels', source: 'FDA' },
      { label: 'NCCN/ASCO breast cancer biomarker guidance', source: 'NCCN/ASCO' },
    ],
    related: ['bio.her2', 'bio.er-pr', 'fda.ivd.cdx'],
    tags: ['pik3ca', 'breast-cancer', 'alpelisib', 'liquid-biopsy', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.er-pr',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'ER / PR (hormone receptors) — breast cancer endocrine therapy',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Estrogen- and progesterone-receptor expression by IHC predicts benefit from endocrine therapy in breast cancer and is a mandatory ASCO/CAP biomarker; the positivity threshold (≥1%, with a 1–10% "low" category) is guideline-defined.',
    detail:
      'ER and PR status by immunohistochemistry are foundational predictive biomarkers determining endocrine-therapy eligibility in breast cancer. ASCO/CAP guidelines define the testing and scoring, set ER positivity at ≥1% of tumor nuclei, and recognize a 1–10% "ER-low positive" category with nuanced clinical implications, plus rigorous pre-analytical (fixation) and assay-validation/QC requirements. ER/PR IHC is a long-established, guideline-mandated CDx-like test. Class C under IVDR.',
    keyPoints: [
      'ER/PR IHC determines endocrine-therapy eligibility (mandatory ASCO/CAP biomarker).',
      'ER positivity ≥1%; 1–10% is "ER-low positive".',
      'Strict pre-analytical (fixation) and QC requirements.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'ASCO/CAP ER/PgR Testing Guideline', source: 'ASCO/CAP' },
    ],
    related: ['bio.her2', 'bio.pik3ca', 'sci.ivd.scientific-validity'],
    tags: ['er', 'pr', 'hormone-receptor', 'breast-cancer', 'ihc', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.procalcitonin',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Procalcitonin (PCT) — bacterial infection / sepsis and antibiotic stewardship',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Procalcitonin rises in systemic bacterial infection and is used to support sepsis assessment and to guide antibiotic initiation/discontinuation (stewardship); interpreted with serial measurements and clinical context, not as a standalone diagnosis.',
    detail:
      'PCT increases in response to bacterial infection and systemic inflammation and is validated to aid the assessment of bacterial infection/sepsis and, importantly, to guide antibiotic therapy duration (PCT-guided stewardship reduces antibiotic exposure). FDA has cleared PCT for these uses. Clinical validity rests on serial/kinetic interpretation and thresholds appropriate to the clinical setting (it is an adjunct, not a standalone diagnostic). Common interferences and non-infectious causes of elevation are labeled limitations.',
    keyPoints: [
      'PCT supports bacterial-infection/sepsis assessment and antibiotic stewardship.',
      'Serial/kinetic interpretation; setting-specific thresholds.',
      'Adjunct to clinical judgment, not standalone diagnosis.',
    ],
    citations: [
      { label: 'FDA-cleared PCT intended uses (sepsis / antibiotic guidance)', source: 'FDA' },
      { label: 'Surviving Sepsis / stewardship literature', source: 'SCCM/IDSA' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.ivd.scientific-validity'],
    tags: ['procalcitonin', 'sepsis', 'stewardship', 'infection'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.d-dimer',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'D-dimer — venous thromboembolism rule-out',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'D-dimer has high sensitivity/NPV for venous thromboembolism and is validated to rule out VTE in patients with low/intermediate pre-test probability; age-adjusted cut-offs improve specificity in older patients.',
    detail:
      'D-dimer is a fibrin-degradation product elevated in thrombosis. Its clinical validity is as a rule-out test: combined with a validated clinical pretest-probability score (Wells/Geneva), a negative high-sensitivity D-dimer safely excludes VTE in low/intermediate-risk patients (high NPV). Specificity is low (many non-thrombotic elevations), so it is not a rule-in test; age-adjusted cut-offs (age×10 µg/L over 50) improve specificity without sacrificing safety. Assay standardization (units, FEU vs DDU) is a known harmonization challenge requiring assay-specific cut-offs.',
    keyPoints: [
      'High-sensitivity D-dimer rules OUT VTE with a low/intermediate pretest probability.',
      'Low specificity — not a rule-in test.',
      'Age-adjusted cut-offs improve specificity in older patients.',
      'Unit/standardization (FEU vs DDU) requires assay-specific cut-offs.',
    ],
    citations: [
      { label: 'ISTH / ACCP VTE diagnostic guidance', source: 'ISTH/ACCP' },
    ],
    related: ['bio.troponin', 'sci.ivd.clinical-performance-metrics'],
    tags: ['d-dimer', 'vte', 'rule-out', 'pretest-probability'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.kidney-function',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Creatinine / cystatin C and eGFR — kidney function (race-free equations)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Serum creatinine and cystatin C estimate glomerular filtration rate via eGFR equations; the 2021 CKD-EPI refit removed the race coefficient, and creatinine assays must be IDMS-traceable for equations to perform correctly.',
    detail:
      'Estimated GFR from serum creatinine (and/or cystatin C) is the core measure of kidney function and CKD staging. Two scientific-validity points dominate: (1) the 2021 CKD-EPI creatinine and creatinine-cystatin equations were refit to remove the race variable (endorsed by NKF/ASN), changing how labs report eGFR; and (2) creatinine results must be standardized/traceable to an isotope-dilution mass spectrometry (IDMS) reference, because the eGFR equations are calibrated to IDMS-traceable creatinine — a direct application of metrological traceability. Cystatin C provides a confirmatory/alternative estimate less affected by muscle mass.',
    keyPoints: [
      'eGFR from creatinine ± cystatin C stages CKD.',
      '2021 CKD-EPI equations removed the race coefficient (NKF/ASN-endorsed).',
      'Creatinine must be IDMS-traceable for eGFR equations to be valid.',
      'Cystatin C is a muscle-mass-independent confirmatory estimate.',
    ],
    citations: [
      { label: 'NKF-ASN Task Force on race-free eGFR; 2021 CKD-EPI equations', source: 'NKF/ASN' },
      { label: 'IFCC/NIST IDMS creatinine standardization', source: 'IFCC/NIST' },
    ],
    related: ['sci.ivd.traceability', 'sci.ivd.reference-intervals', 'ai.bias-equity'],
    tags: ['egfr', 'creatinine', 'cystatin-c', 'ckd', 'idms', 'race-free'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.tsh',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'TSH and thyroid panel — thyroid dysfunction (reflex testing)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Thyroid-stimulating hormone is the first-line, most sensitive test for thyroid dysfunction; abnormal TSH reflexes to free T4 (and T3), with assay-generation sensitivity and method-specific reference intervals central to interpretation.',
    detail:
      'TSH is the validated first-line analyte for detecting thyroid dysfunction owing to the log-linear TSH–free-T4 relationship that amplifies small T4 changes. The standard algorithm reflexes an abnormal TSH to free T4 (and free T3 for hyperthyroidism). Clinical validity depends on third-generation assay sensitivity (functional sensitivity ≤0.01–0.02 mIU/L), method-specific and population-specific reference intervals (pregnancy trimester-specific ranges are a key example), and awareness of interferences (biotin, heterophile antibodies, macro-TSH). These are high-volume immunoassay IVDs.',
    keyPoints: [
      'TSH is the most sensitive first-line thyroid test (log-linear with free T4).',
      'Reflex algorithm: abnormal TSH → free T4 (± T3).',
      'Needs 3rd-gen sensitivity + method/population-specific reference intervals.',
      'Biotin/heterophile/macro-TSH interferences are labeled limitations.',
    ],
    citations: [
      { label: 'ATA / Endocrine Society thyroid testing guidance', source: 'ATA/Endocrine Society' },
    ],
    related: ['sci.ivd.reference-intervals', 'sci.ivd.interference'],
    tags: ['tsh', 'thyroid', 'reflex-testing', 'immunoassay', 'biotin'],
    lastReviewed: '2026-06-09',
  },
];
