/**
 * Per-analyte / per-biomarker scientific-validity corpus.
 *
 * Each entry documents the analyte → clinical-condition association (the IVDR
 * Annex XIII Part A "scientific validity" pillar) for a specific marker, with
 * its established intended uses, the guideline/consensus backing that grades the
 * evidence, and the companion-diagnostic context where relevant. These are the
 * concrete, citable building blocks behind sci.ivd.scientific-validity.
 */

import type { KnowledgeEntry } from '../types';

export const BIOMARKER_VALIDITY_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'bio.pd-l1',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'PD-L1 expression — immunotherapy patient selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'PD-L1 protein expression by IHC predicts benefit from PD-1/PD-L1 checkpoint inhibitors across several tumor types; it is the archetypal companion/complementary diagnostic, with assay- and scoring-specific cut-offs (TPS, CPS, IC).',
    detail:
      'Programmed death-ligand 1 (PD-L1) expression, measured by immunohistochemistry, is associated with response to immune-checkpoint inhibitors (pembrolizumab, atezolizumab, nivolumab, etc.). The scientific validity is well established and guideline-endorsed (NCCN, ASCO, CAP) for NSCLC and several other indications. The complexity is that PD-L1 is scored differently by assay/indication — Tumor Proportion Score (TPS) in NSCLC, Combined Positive Score (CPS) in gastric/cervical/head-and-neck/urothelial, and immune-cell (IC) scoring — each tied to a specific antibody clone (22C3, 28-8, SP142, SP263) and platform, creating the well-known "PD-L1 assay harmonization" problem. Several PD-L1 IHC assays are FDA-approved companion (or complementary) diagnostics for specific drug-indication pairs, and under IVDR a PD-L1 CDx is Class C (Annex VIII Rule 3).',
    keyPoints: [
      'PD-L1 IHC predicts checkpoint-inhibitor benefit (guideline-endorsed).',
      'Scoring differs by indication: TPS (NSCLC), CPS (GC/cervical/HNSCC/urothelial), IC.',
      'Cut-offs are antibody-clone and platform specific (22C3/28-8/SP142/SP263).',
      'Archetypal CDx/complementary Dx; Class C under IVDR Rule 3.',
    ],
    pitfalls: [
      'Treating PD-L1 assays as interchangeable across clones/platforms/scoring.',
      'Applying an NSCLC TPS cut-off to a CPS indication.',
    ],
    citations: [
      { label: 'NCCN/ASCO/CAP guidance on PD-L1 testing', source: 'NCCN/ASCO/CAP' },
      { label: 'FDA-approved PD-L1 companion diagnostics (drug labels)', source: 'FDA' },
      { label: 'Blueprint PD-L1 IHC Assay Comparison Project', source: 'IASLC' },
    ],
    related: ['fda.ivd.cdx', 'eu.ivdr.companion-diagnostics', 'sci.ivd.scientific-validity', 'bio.tmb'],
    tags: ['pd-l1', 'immunotherapy', 'ihc', 'cdx', 'tps', 'cps', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.her2',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'HER2 (ERBB2) — breast/gastric targeted therapy selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'HER2 overexpression/amplification predicts benefit from HER2-targeted therapy (trastuzumab, pertuzumab, T-DM1, T-DXd) in breast and gastric/GEJ cancer; tested by IHC with reflex ISH, per ASCO/CAP scoring algorithms, and now including a "HER2-low" category.',
    detail:
      'Human epidermal growth factor receptor 2 (HER2/ERBB2) overexpression or gene amplification is a validated predictive biomarker for HER2-directed therapy. The ASCO/CAP guidelines define the testing algorithm: IHC 0/1+/2+/3+, with IHC 2+ (equivocal) reflexed to in-situ hybridization (ISH) for HER2/CEP17 ratio and copy number. Scientific validity is decades-deep and guideline-mandated for invasive breast cancer and HER2-positive gastric/gastroesophageal-junction adenocarcinoma. The advent of trastuzumab deruxtecan (T-DXd) created a clinically actionable "HER2-low" category (IHC 1+ or 2+/ISH-negative), shifting how the same assay output is interpreted — a reminder that scientific validity is intended-use specific. HER2 IHC/ISH assays are established FDA companion diagnostics; under IVDR a HER2 CDx is Class C (Rule 3).',
    keyPoints: [
      'HER2 overexpression/amplification predicts HER2-targeted therapy benefit.',
      'ASCO/CAP algorithm: IHC 0/1+/2+/3+ with IHC 2+ reflexed to ISH.',
      '"HER2-low" (IHC 1+ or 2+/ISH−) is now actionable for T-DXd.',
      'Established CDx; Class C under IVDR Rule 3.',
    ],
    pitfalls: [
      'Not reflexing IHC 2+ to ISH.',
      'Applying classic "HER2-positive" logic when a HER2-low claim is intended.',
    ],
    citations: [
      { label: 'ASCO/CAP HER2 Testing Guideline (breast)', source: 'ASCO/CAP' },
      { label: 'CAP HER2 (gastric) guidance', source: 'CAP' },
      { label: 'FDA HER2 companion diagnostics (drug labels)', source: 'FDA' },
    ],
    related: ['fda.ivd.cdx', 'eu.ivdr.companion-diagnostics', 'sci.ivd.scientific-validity'],
    tags: ['her2', 'erbb2', 'breast-cancer', 'gastric-cancer', 'ihc', 'ish', 'cdx', 'her2-low'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.egfr',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'EGFR mutations — NSCLC tyrosine-kinase-inhibitor selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Activating EGFR mutations (exon 19 deletions, L858R) predict response to EGFR TKIs in NSCLC; T790M predicts osimertinib benefit after resistance. Detectable in tissue or plasma cfDNA (liquid biopsy), with guideline-mandated testing at diagnosis.',
    detail:
      'Epidermal growth factor receptor (EGFR) activating mutations — most commonly exon 19 deletions and the exon 21 L858R substitution — are validated predictive biomarkers for first-line EGFR tyrosine-kinase inhibitors (osimertinib and earlier-generation TKIs) in non-small-cell lung cancer. The resistance mutation T790M predicts benefit from osimertinib. Testing is guideline-mandated (NCCN, IASLC/CAP/AMP molecular testing guideline) for advanced non-squamous NSCLC at diagnosis. EGFR is detectable in tumor tissue and, increasingly, in plasma circulating tumor DNA (cfDNA "liquid biopsy"), which has its own sensitivity/LoD considerations (a negative plasma result does not exclude the mutation — reflex to tissue). Multiple EGFR assays (PCR and NGS) are FDA companion diagnostics; under IVDR an EGFR CDx is Class C.',
    keyPoints: [
      'Exon 19 del / L858R predict first-line EGFR-TKI benefit; T790M → osimertinib.',
      'Guideline-mandated at NSCLC diagnosis (NCCN, CAP/IASLC/AMP).',
      'Tissue or plasma cfDNA; negative plasma must reflex to tissue.',
      'PCR and NGS CDx assays exist; Class C under IVDR.',
    ],
    pitfalls: [
      'Treating a negative liquid-biopsy result as a true negative without tissue reflex.',
      'Inadequate LoD for low-allele-frequency plasma variants.',
    ],
    citations: [
      { label: 'CAP/IASLC/AMP Molecular Testing Guideline for Lung Cancer', source: 'CAP/IASLC/AMP' },
      { label: 'NCCN NSCLC Guidelines (biomarker testing)', source: 'NCCN' },
      { label: 'FDA EGFR companion diagnostics (drug labels)', source: 'FDA' },
    ],
    related: ['fda.ivd.cdx', 'bio.alk', 'sci.ivd.detection-capability', 'sci.ivd.scientific-validity'],
    tags: ['egfr', 'nsclc', 'tki', 'liquid-biopsy', 'cfdna', 't790m', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.alk',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'ALK rearrangement — NSCLC ALK-inhibitor selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'ALK gene rearrangements predict response to ALK inhibitors (alectinib, crizotinib, lorlatinib) in NSCLC; detected by IHC (screen), FISH, RT-PCR, or NGS, and guideline-mandated at diagnosis of advanced non-squamous disease.',
    detail:
      'Anaplastic lymphoma kinase (ALK) gene rearrangements/fusions (e.g., EML4-ALK) are validated predictive biomarkers for ALK tyrosine-kinase inhibitors in NSCLC. Detection methods include IHC (high-sensitivity screening with validated clones, e.g., D5F3, which is itself an approved CDx), break-apart FISH, RT-PCR, and NGS fusion panels; CAP/IASLC/AMP and NCCN guidelines establish ALK as a required biomarker at diagnosis of advanced non-squamous NSCLC. Scientific validity is robust and the IHC-FISH concordance is high for validated assays. Under IVDR an ALK CDx is Class C.',
    keyPoints: [
      'ALK fusions predict ALK-inhibitor benefit in NSCLC.',
      'IHC (D5F3) screen, FISH/RT-PCR/NGS confirm; guideline-mandated at diagnosis.',
      'Validated IHC is an accepted standalone CDx in many settings.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'CAP/IASLC/AMP Molecular Testing Guideline for Lung Cancer', source: 'CAP/IASLC/AMP' },
      { label: 'FDA ALK companion diagnostics (drug labels)', source: 'FDA' },
    ],
    related: ['bio.egfr', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['alk', 'nsclc', 'fusion', 'ihc', 'fish', 'ngs', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.kras',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'KRAS/NRAS — colorectal anti-EGFR exclusion and KRAS G12C targeting',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'RAS (KRAS/NRAS) mutations predict lack of benefit from anti-EGFR antibodies (cetuximab/panitumumab) in metastatic colorectal cancer (a negative-selection biomarker), while the specific KRAS G12C mutation is a positive predictive biomarker for KRAS G12C inhibitors.',
    detail:
      'RAS mutation status has dual scientific validity. In metastatic colorectal cancer, activating mutations in KRAS/NRAS (exons 2/3/4) predict resistance to anti-EGFR monoclonal antibodies — a negative (exclusionary) selection biomarker mandated by NCCN/ESMO before using cetuximab or panitumumab. Separately, the specific KRAS p.G12C variant is a positive predictive biomarker for KRAS G12C inhibitors (sotorasib, adagrasib) in NSCLC and CRC. The same gene therefore supports opposite decision logics depending on intended use — a clear illustration that scientific validity is intended-use and variant specific. RAS testing uses PCR or NGS; G12C-specific CDx assays are FDA-approved; under IVDR these are Class C.',
    keyPoints: [
      'KRAS/NRAS mutation → resistance to anti-EGFR mAbs in mCRC (exclusionary).',
      'KRAS G12C → benefit from G12C inhibitors (positive selection) in NSCLC/CRC.',
      'Same gene, opposite decision logic by intended use/variant.',
      'PCR/NGS; G12C CDx exist; Class C under IVDR.',
    ],
    pitfalls: [
      'Conflating broad RAS exclusion with the variant-specific G12C selection claim.',
    ],
    citations: [
      { label: 'NCCN/ESMO Colorectal Guidelines (RAS testing)', source: 'NCCN/ESMO' },
      { label: 'FDA KRAS G12C companion diagnostics (drug labels)', source: 'FDA' },
    ],
    related: ['bio.braf', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['kras', 'nras', 'colorectal', 'g12c', 'anti-egfr', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.braf',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'BRAF V600 — melanoma/CRC/NSCLC targeted therapy selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'BRAF V600E/K mutations predict response to BRAF/MEK inhibitor combinations in melanoma, NSCLC, and anaplastic thyroid cancer, and (with anti-EGFR) in colorectal cancer; a validated, guideline-mandated predictive biomarker.',
    detail:
      'BRAF V600 mutations (predominantly V600E) are validated predictive biomarkers for BRAF-targeted therapy (e.g., dabrafenib+trametinib, encorafenib combinations). Tumor-context matters: BRAF/MEK inhibition is effective in melanoma, NSCLC, and anaplastic thyroid cancer, whereas in colorectal cancer single-agent BRAF inhibition is ineffective and the validated regimen combines a BRAF inhibitor with anti-EGFR therapy — again showing intended-use-specific validity. Detection is by PCR or NGS (and VE1 IHC as a screen in some settings). Guideline-endorsed (NCCN/ESMO); BRAF V600 CDx assays are FDA-approved; Class C under IVDR.',
    keyPoints: [
      'BRAF V600E/K predicts BRAF/MEK-inhibitor benefit (melanoma/NSCLC/ATC).',
      'CRC requires BRAF inhibitor + anti-EGFR (context-specific).',
      'PCR/NGS (VE1 IHC screen); guideline-mandated.',
      'Class C under IVDR.',
    ],
    citations: [
      { label: 'NCCN/ESMO guidelines (BRAF testing)', source: 'NCCN/ESMO' },
      { label: 'FDA BRAF V600 companion diagnostics (drug labels)', source: 'FDA' },
    ],
    related: ['bio.kras', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['braf', 'v600', 'melanoma', 'colorectal', 'nsclc', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.brca',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'BRCA1/2 and HRD — PARP-inhibitor selection and hereditary risk',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'BRCA1/2 pathogenic variants (germline or somatic) and homologous-recombination deficiency (HRD) predict benefit from PARP inhibitors in ovarian, breast, prostate, and pancreatic cancer; germline BRCA also defines hereditary cancer risk (a distinct intended use).',
    detail:
      'BRCA1/2 has two validated, separable intended uses. As a predictive biomarker, germline or somatic BRCA1/2 pathogenic variants — and more broadly homologous-recombination deficiency (HRD, often a composite of BRCA status plus genomic-scar/LOH scores) — predict response to PARP inhibitors (olaparib, niraparib, rucaparib, talazoparib) across ovarian, HER2-negative breast, metastatic castration-resistant prostate, and pancreatic cancers. As a risk biomarker, germline BRCA1/2 variants define hereditary breast-and-ovarian-cancer (HBOC) syndrome, informing screening/prophylaxis (a different regulatory and counseling context, often involving genetic counseling and, in the US, distinct considerations for germline testing). Detection is by NGS with careful classification of variants (ACMG/AMP). PARP-inhibitor CDx assays (BRCA and HRD) are FDA-approved; under IVDR these genetic/CDx tests are Class C (Rule 3).',
    keyPoints: [
      'BRCA1/2 / HRD predict PARP-inhibitor benefit (ovarian/breast/prostate/pancreatic).',
      'Germline BRCA also defines hereditary (HBOC) cancer risk — distinct intended use.',
      'NGS with ACMG/AMP variant classification; HRD adds genomic-scar scoring.',
      'CDx and genetic tests are Class C under IVDR Rule 3.',
    ],
    pitfalls: [
      'Confusing the germline-risk intended use with the somatic/HRD predictive CDx use.',
      'Variant-classification errors (VUS handling) altering clinical action.',
    ],
    citations: [
      { label: 'NCCN guidelines (genetic/familial high-risk + PARP biomarkers)', source: 'NCCN' },
      { label: 'ACMG/AMP variant interpretation guideline', source: 'ACMG/AMP' },
      { label: 'FDA BRCA/HRD companion diagnostics (drug labels)', source: 'FDA' },
    ],
    related: ['fda.ivd.cdx', 'legal.ivd.data-privacy', 'sci.ivd.scientific-validity', 'bio.msi-mmr'],
    tags: ['brca', 'hrd', 'parp-inhibitor', 'germline', 'hboc', 'ngs', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.msi-mmr',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'MSI-H / dMMR — tissue-agnostic immunotherapy selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Microsatellite instability-high (MSI-H) or mismatch-repair deficiency (dMMR) predicts benefit from PD-1 inhibitors across tumor types (a tissue-agnostic indication) and also screens for Lynch syndrome; detected by PCR, NGS, or MMR-protein IHC.',
    detail:
      'MSI-H/dMMR is a validated, guideline-endorsed predictive biomarker and the basis of one of the first tissue-agnostic drug approvals (pembrolizumab for MSI-H/dMMR solid tumors). Mismatch-repair deficiency is detected by immunohistochemistry for the four MMR proteins (MLH1, MSH2, MSH6, PMS2) or by molecular microsatellite-instability testing (PCR panels or NGS). The same testing also screens for Lynch syndrome (hereditary cancer predisposition), a distinct intended use that may trigger germline confirmation and counseling. MSI/dMMR CDx assays are FDA-approved; under IVDR these are Class C. The tissue-agnostic nature makes intended-use definition and pan-tumor validation central to the evidence package.',
    keyPoints: [
      'MSI-H/dMMR predicts PD-1-inhibitor benefit tissue-agnostically.',
      'Detected by MMR-protein IHC or MSI molecular testing (PCR/NGS).',
      'Also screens for Lynch syndrome (distinct germline intended use).',
      'Class C under IVDR; pan-tumor validation is key.',
    ],
    citations: [
      { label: 'NCCN guidelines (MSI/dMMR testing; Lynch screening)', source: 'NCCN' },
      { label: 'FDA tissue-agnostic MSI-H/dMMR approvals (drug labels)', source: 'FDA' },
    ],
    related: ['bio.tmb', 'bio.pd-l1', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['msi', 'dmmr', 'tissue-agnostic', 'immunotherapy', 'lynch', 'ihc', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.tmb',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Tumor mutational burden (TMB) — immunotherapy selection',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'High tumor mutational burden (TMB-high, commonly ≥10 mutations/Mb on a validated panel) predicts benefit from PD-1 inhibition and supports a tissue-agnostic indication, but TMB harmonization across NGS panels is a known analytical challenge.',
    detail:
      'Tumor mutational burden quantifies somatic mutations per megabase from large NGS panels and is a validated predictive biomarker (pembrolizumab has a tissue-agnostic TMB-high indication, with a commonly used cut-off of ≥10 mutations/Mb on the approved companion assay). Its scientific validity is established but its analytical comparability is not: TMB values depend heavily on panel size, bioinformatic pipeline, variant-filtering (germline subtraction, synonymous inclusion), and calibration to whole-exome sequencing — the "Friends of Cancer Research" TMB harmonization effort exists precisely because cross-assay TMB is not interchangeable. Thus TMB is a strong case where scientific validity must be paired with rigorous assay-specific analytical validation and cut-off justification. TMB CDx is FDA-approved; Class C under IVDR.',
    keyPoints: [
      'TMB-high (often ≥10 mut/Mb on the validated panel) predicts PD-1-inhibitor benefit.',
      'Supports a tissue-agnostic indication.',
      'Cross-panel TMB is NOT interchangeable (harmonization problem).',
      'Validity must pair with assay-specific analytical validation + cut-off justification.',
    ],
    pitfalls: [
      'Porting a TMB cut-off across NGS panels/pipelines.',
      'Ignoring germline-subtraction and panel-size effects on the score.',
    ],
    citations: [
      { label: 'Friends of Cancer Research TMB Harmonization Project', source: 'Friends of Cancer Research' },
      { label: 'FDA TMB-high tissue-agnostic approval (drug label)', source: 'FDA' },
    ],
    related: ['bio.msi-mmr', 'bio.pd-l1', 'sci.ivd.scientific-validity', 'sci.ivd.roc-cutoff'],
    tags: ['tmb', 'immunotherapy', 'ngs', 'tissue-agnostic', 'harmonization', 'cdx', 'oncology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.troponin',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'High-sensitivity cardiac troponin (hs-cTn) — acute myocardial infarction',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'High-sensitivity cardiac troponin I/T is the central biomarker for diagnosing acute myocardial infarction; rapid (0/1h or 0/2h) rule-in/rule-out algorithms are guideline-endorsed and depend on the 99th-percentile upper reference limit and sex-specific cut-offs.',
    detail:
      'Cardiac troponin (cTnI/cTnT) is the preferred biomarker for myocardial injury and, in the right clinical context with a rising/falling pattern, acute myocardial infarction (Fourth Universal Definition of MI). High-sensitivity assays detect troponin in a large fraction of healthy individuals, enabling accelerated 0/1-hour and 0/2-hour rule-in/rule-out algorithms endorsed by ESC and used in US practice. Scientific validity is exceptionally strong, but clinical use is critically dependent on assay-specific decision thresholds: the 99th-percentile upper reference limit (URL), sex-specific cut-offs, and the assay\'s limit of detection. This makes the reference-interval/decision-limit work (and assay-specific validation) inseparable from the clinical claim. hs-cTn assays are regulated IVDs (typically moderate/high complexity; class B/C considerations under IVDR depending on intended use).',
    keyPoints: [
      'hs-cTnI/T is the central biomarker for myocardial injury/AMI.',
      'Enables guideline-endorsed 0/1h and 0/2h rule-in/rule-out algorithms.',
      'Depends on the 99th-percentile URL, sex-specific cut-offs, and LoD.',
      'Decision-limit/reference-interval work is inseparable from the claim.',
    ],
    citations: [
      { label: 'Fourth Universal Definition of Myocardial Infarction', source: 'ESC/ACC/AHA/WHF' },
      { label: 'ESC guidelines (0/1h hs-cTn algorithms)', source: 'ESC' },
      { label: 'IFCC hs-cTn analytical recommendations', source: 'IFCC' },
    ],
    related: ['sci.ivd.reference-intervals', 'sci.ivd.detection-capability', 'sci.ivd.scientific-validity'],
    tags: ['troponin', 'hs-ctn', 'myocardial-infarction', 'cardiac', 'decision-limit', '99th-percentile'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.hba1c',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'HbA1c — diabetes diagnosis and glycemic monitoring',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Glycated hemoglobin (HbA1c) reflects average glycemia over ~3 months; it is guideline-endorsed for diabetes diagnosis (≥6.5%) and monitoring, and is the textbook example of a biomarker whose validity rests on rigorous metrological standardization (IFCC/NGSP).',
    detail:
      'HbA1c is a validated biomarker for both diagnosis of diabetes (ADA/WHO threshold ≥6.5% / 48 mmol/mol, with caveats) and long-term glycemic monitoring. Its scientific validity is inseparable from standardization: the NGSP (US) and IFCC reference systems harmonize HbA1c results across methods so that a value means the same thing everywhere — a direct, real-world demonstration of ISO 17511 metrological traceability and commutability in action. Clinical interpretation must account for conditions that alter red-cell turnover or hemoglobin variants (anemias, hemoglobinopathies, pregnancy), which are standard IFU limitations. HbA1c assays are widely cleared IVDs and many are CLIA-categorized for various settings including some point-of-care/waived devices.',
    keyPoints: [
      'HbA1c ≥6.5% supports diabetes diagnosis; also the standard monitoring marker.',
      'Validity depends on IFCC/NGSP standardization (traceability + commutability).',
      'Hemoglobinopathies/altered RBC turnover are key IFU limitations.',
      'Available across lab and some POC/waived platforms.',
    ],
    pitfalls: [
      'Ignoring hemoglobin-variant and red-cell-turnover interferences.',
      'Assuming method comparability without NGSP/IFCC traceability.',
    ],
    citations: [
      { label: 'ADA Standards of Care; WHO HbA1c diagnostic criteria', source: 'ADA/WHO' },
      { label: 'NGSP / IFCC HbA1c standardization', source: 'NGSP/IFCC' },
    ],
    related: ['sci.ivd.traceability', 'sci.ivd.interference', 'sci.ivd.scientific-validity'],
    tags: ['hba1c', 'diabetes', 'standardization', 'ngsp', 'ifcc', 'traceability'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.natriuretic-peptides',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'BNP / NT-proBNP — heart failure diagnosis and prognosis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'B-type natriuretic peptide (BNP) and its N-terminal pro-peptide (NT-proBNP) are validated biomarkers for diagnosing and ruling out heart failure and for prognosis; interpretation uses age-adjusted cut-offs and accounts for renal function and obesity.',
    detail:
      'BNP and NT-proBNP rise with myocardial wall stress and are guideline-endorsed (ESC, ACC/AHA/HFSA) for the diagnosis and exclusion of heart failure in patients with dyspnea, and for risk stratification/prognosis. Their high negative predictive value makes them strong rule-out tests. Clinical interpretation requires age-adjusted thresholds (especially for NT-proBNP) and awareness of confounders — renal impairment raises levels, obesity lowers them, and atrial fibrillation affects interpretation — all standard IFU considerations. BNP and NT-proBNP are not interchangeable (different analytes, cut-offs, and assay standardization), reinforcing assay-specific validation. These are widely cleared IVDs.',
    keyPoints: [
      'BNP/NT-proBNP diagnose and (strongly) rule out heart failure; inform prognosis.',
      'Use age-adjusted cut-offs; account for renal function, obesity, AF.',
      'BNP and NT-proBNP are distinct analytes — not interchangeable.',
      'High NPV makes them effective rule-out tests.',
    ],
    citations: [
      { label: 'ESC and ACC/AHA/HFSA heart-failure guidelines', source: 'ESC/ACC/AHA/HFSA' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.ivd.scientific-validity'],
    tags: ['bnp', 'nt-probnp', 'heart-failure', 'natriuretic-peptide', 'rule-out'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.hpv',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'High-risk HPV — cervical cancer screening',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'High-risk human papillomavirus (hrHPV) DNA/mRNA detection is a validated primary cervical-cancer screening test, with guideline-endorsed primary-HPV and co-testing strategies and genotype-specific (HPV 16/18) risk stratification.',
    detail:
      'Persistent infection with high-risk HPV genotypes is the necessary cause of cervical cancer, giving hrHPV testing exceptionally strong scientific validity for cervical screening. Major guidelines (WHO, USPSTF, ASCCP) endorse primary HPV screening (and co-testing with cytology), with partial genotyping (HPV 16 and 18 reported separately) used for risk-based management because 16/18 carry the highest cancer risk. hrHPV assays are higher-risk screening IVDs — FDA approvals for primary screening required large clinical validation, and under IVDR a screening test for an agent causing cancer falls in Class C (Rule 3). The intended use (primary screening vs triage vs co-test) materially changes the validation and claim.',
    keyPoints: [
      'hrHPV is the necessary cause of cervical cancer — very strong validity.',
      'Guideline-endorsed for primary screening and co-testing.',
      'HPV 16/18 partial genotyping drives risk-based management.',
      'Screening for a cancer-causing agent ⇒ Class C under IVDR Rule 3.',
    ],
    citations: [
      { label: 'WHO / USPSTF / ASCCP cervical screening guidelines', source: 'WHO/USPSTF/ASCCP' },
      { label: 'FDA primary HPV screening approvals', source: 'FDA' },
    ],
    related: ['eu.ivdr.classification-rules', 'sci.ivd.clinical-study-design', 'sci.ivd.scientific-validity'],
    tags: ['hpv', 'cervical-cancer', 'screening', 'genotyping', 'infectious'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'bio.hiv',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'HIV diagnostics — Ag/Ab detection and viral load (highest-risk IVD class)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'HIV antigen/antibody combination assays diagnose infection (with the CDC/APHL testing algorithm), while HIV-1 RNA viral load guides treatment monitoring. These are the archetypal highest-risk IVDs — IVDR Class D and historically among the most stringently regulated.',
    detail:
      'HIV testing spans two intended uses with deep scientific validity. The 4th-generation HIV-1/2 antigen/antibody combination immunoassay detects p24 antigen and antibodies for earlier diagnosis, interpreted within the CDC/APHL laboratory testing algorithm (initial Ag/Ab, then HIV-1/2 antibody differentiation, then HIV-1 NAT for discordant results). HIV-1 RNA viral load (quantitative NAT) guides antiretroviral treatment monitoring and confirms diagnosis in early/acute infection. Because they detect a transmissible agent causing life-threatening disease and are used in blood screening, HIV assays are the canonical IVDR Class D devices (Annex VIII Rule 1) — requiring EU reference-laboratory batch verification and the most stringent conformity assessment — and are correspondingly high-scrutiny in the US.',
    keyPoints: [
      '4th-gen Ag/Ab combo detects p24 + antibodies (earlier diagnosis); CDC/APHL algorithm.',
      'HIV-1 RNA viral load monitors treatment and confirms acute infection.',
      'Transmissible agent + blood screening ⇒ IVDR Class D (Rule 1).',
      'Class D adds EU reference-lab batch verification.',
    ],
    citations: [
      { label: 'CDC/APHL HIV laboratory testing algorithm', source: 'CDC/APHL' },
      { label: 'IVDR Annex VIII Rule 1 (Class D)', source: 'EU' },
    ],
    related: ['eu.ivdr.classification-rules', 'sci.ivd.detection-capability', 'sci.ivd.scientific-validity'],
    tags: ['hiv', 'viral-load', 'ag-ab', 'class-d', 'infectious', 'blood-screening'],
    lastReviewed: '2026-06-09',
  },
];
