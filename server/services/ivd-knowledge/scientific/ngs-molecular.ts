/**
 * NGS / molecular-diagnostics science corpus.
 *
 * Deep, citable entries on validating next-generation-sequencing and molecular
 * IVDs: panel validation, bioinformatics-pipeline validation, reference
 * materials/ground truth, somatic vs germline variant classification, liquid
 * biopsy (ctDNA), and minimal/measurable residual disease (MRD).
 */

import type { KnowledgeEntry } from '../types';

export const NGS_MOLECULAR_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'sci.ngs.panel-validation',
    domain: 'scientific',
    topic: 'ngs-molecular',
    title: 'NGS oncopanel validation — analytical validation of sequencing assays',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Validating an NGS panel requires establishing accuracy, sensitivity/LoD by variant type (SNV, indel, CNV, fusion), specificity, reproducibility, and limit of detection at defined variant allele fractions, across the full reportable range of genomic regions — guided by AMP/CAP and FDA/NYSDOH frameworks.',
    detail:
      'NGS assays are multi-analyte by nature, so validation must be stratified by variant class: single-nucleotide variants, insertions/deletions, copy-number variants, and structural variants/fusions each have distinct performance. Key parameters: accuracy (concordance vs orthogonal/reference), analytical sensitivity expressed as limit of detection at a variant allele fraction (e.g., 5% VAF for tissue tumor panels, far lower for ctDNA), analytical specificity/false-positive rate, reproducibility/repeatability across runs/operators/instruments, and coverage/quality thresholds (depth, uniformity) defining the reportable range. The AMP/CAP joint guideline and FDA (plus NY State CLEP) frameworks structure these expectations; FDA has also recognized tumor-profiling test approaches and reference databases. Validation must define what is and is not reportable (regions below quality thresholds) and how indeterminate results are handled.',
    keyPoints: [
      'Validate by variant class: SNV, indel, CNV, fusion (distinct performance each).',
      'LoD expressed at a variant allele fraction; depth/uniformity define reportable range.',
      'Accuracy vs orthogonal/reference; specificity/false-positive rate; reproducibility.',
      'AMP/CAP + FDA/NYSDOH frameworks; define non-reportable regions explicitly.',
    ],
    pitfalls: [
      'Reporting a single "sensitivity" without stratifying by variant type and VAF.',
      'Not defining coverage/quality thresholds for the reportable range.',
    ],
    citations: [
      { label: 'AMP/CAP Guideline: Validation of NGS-based oncology panels', source: 'AMP/CAP' },
      { label: 'FDA NGS oncopanel / tumor profiling considerations', source: 'FDA' },
    ],
    related: ['sci.ngs.bioinformatics', 'sci.ngs.reference-materials', 'sci.ivd.detection-capability', 'bio.tmb'],
    tags: ['ngs', 'oncopanel', 'vaf', 'validation', 'amp-cap'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ngs.bioinformatics',
    domain: 'scientific',
    topic: 'ngs-molecular',
    title: 'Bioinformatics-pipeline validation and version control',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx', 'samd'],
    summary:
      'The bioinformatics pipeline (alignment, variant calling, annotation, filtering) is part of the device and must be validated, version-controlled, and change-managed; pipeline changes can alter results and may themselves require revalidation.',
    detail:
      'For an NGS IVD the "wet" assay and the "dry" bioinformatics pipeline are inseparable — the pipeline (read trimming, alignment, variant calling, annotation, tiering, and filtering thresholds) materially determines the reported result. AMP/CAP bioinformatics guidance and FDA software expectations require the pipeline to be validated as part of the assay, with documented reference datasets, defined performance per variant class, configuration/version control of tools and databases (genome build, transcript set, population/clinical databases), and change management: a change to a caller, parameter, or annotation source can shift results and may require revalidation (and, for marketed devices, a change assessment). This is where IEC 62304 software lifecycle and the FDA PCCP concept intersect with molecular diagnostics.',
    keyPoints: [
      'The pipeline is part of the device and must be validated.',
      'Version-control tools + databases (genome build, transcripts, variant DBs).',
      'Pipeline/parameter/annotation changes can alter results → revalidation/change assessment.',
      'Intersects IEC 62304 lifecycle and FDA PCCP.',
    ],
    citations: [
      { label: 'AMP/CAP/ACMG bioinformatics pipeline validation guidance', source: 'AMP/CAP/ACMG' },
      { label: 'IEC 62304 (software lifecycle); FDA PCCP', source: 'IEC/FDA' },
    ],
    related: ['sci.ngs.panel-validation', 'std.iec-62304', 'legal.ivd.change-significant', 'ai.fda-aiml'],
    tags: ['bioinformatics', 'pipeline', 'variant-calling', 'version-control', 'ngs'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ngs.reference-materials',
    domain: 'scientific',
    topic: 'ngs-molecular',
    title: 'Reference materials and ground truth for sequencing (GIAB, reference samples)',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'NGS validation and QC rely on well-characterized reference materials with known truth sets — NIST Genome-in-a-Bottle (GIAB), Seraseq/contrived controls, and reference cell lines — to benchmark accuracy and monitor performance over time.',
    detail:
      'Establishing accuracy for NGS requires a trustworthy "truth set." Resources include NIST/GIAB consortium reference genomes (with high-confidence variant calls and confident regions), engineered/contrived reference materials (e.g., Seraseq) spiking known variants at defined allele fractions for LoD and fusion/CNV benchmarking, and characterized cell lines (Coriell). FDA has supported reference databases and the precisionFDA truth challenges. Good practice uses GIAB-type materials for germline accuracy and contrived/cell-line materials with defined VAFs for somatic/ctDNA sensitivity, plus run-level controls for ongoing QC. Commutability of reference materials with clinical specimens remains a consideration (as in ISO 17511/EP30).',
    keyPoints: [
      'GIAB/NIST truth sets for germline accuracy + confident regions.',
      'Contrived materials (e.g., Seraseq) with defined VAFs for somatic/ctDNA LoD, fusions, CNV.',
      'Cell lines (Coriell) and run controls for ongoing QC.',
      'Commutability with clinical specimens still matters.',
    ],
    citations: [
      { label: 'NIST Genome in a Bottle (GIAB) consortium', source: 'NIST' },
      { label: 'precisionFDA truth challenges; reference material programs', source: 'FDA' },
    ],
    related: ['sci.ngs.panel-validation', 'sci.ivd.traceability', 'sci.ngs.ctdna'],
    tags: ['reference-materials', 'giab', 'ground-truth', 'seraseq', 'ngs'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ngs.variant-classification',
    domain: 'scientific',
    topic: 'ngs-molecular',
    title: 'Variant classification — germline (ACMG/AMP) vs somatic (AMP/ASCO/CAP tiers)',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Interpreting sequence variants uses distinct frameworks: ACMG/AMP pathogenicity criteria for germline variants (pathogenic → benign, with VUS) and the AMP/ASCO/CAP four-tier system for somatic variants by clinical actionability — a key source of result variability.',
    detail:
      'Reported NGS results depend on classification frameworks. For germline variants, the ACMG/AMP 2015 guideline combines evidence criteria (population, computational, functional, segregation) into five categories: pathogenic, likely pathogenic, variant of uncertain significance (VUS), likely benign, benign. For somatic variants in cancer, the AMP/ASCO/CAP 2017 guideline tiers variants by clinical significance: Tier I (strong clinical significance), Tier II (potential), Tier III (unknown significance), Tier IV (benign/likely benign). Consistent, evidence-based classification (and transparent VUS handling) is essential because the same variant can be reported differently across labs — a major harmonization and quality issue with direct clinical impact, and a documented limitation to manage in IVD intended-use and labeling.',
    keyPoints: [
      'Germline: ACMG/AMP 5 categories (P/LP/VUS/LB/B).',
      'Somatic: AMP/ASCO/CAP 4 tiers by clinical actionability.',
      'Classification variability across labs is a key quality/harmonization risk.',
      'Transparent VUS handling is essential and a labeled limitation.',
    ],
    citations: [
      { label: 'ACMG/AMP variant interpretation guideline (2015)', source: 'ACMG/AMP' },
      { label: 'AMP/ASCO/CAP somatic variant interpretation (2017)', source: 'AMP/ASCO/CAP' },
    ],
    related: ['bio.brca', 'sci.ngs.panel-validation', 'sci.ivd.scientific-validity'],
    tags: ['variant-classification', 'acmg', 'amp-asco-cap', 'vus', 'germline', 'somatic'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ngs.ctdna',
    domain: 'scientific',
    topic: 'ngs-molecular',
    title: 'Liquid biopsy (ctDNA) — analytical and clinical considerations',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Circulating-tumor-DNA assays detect tumor variants in plasma at very low allele fractions; they require ultra-low LoD, control of pre-analytics and clonal-hematopoiesis false positives, and the rule that a negative plasma result does not exclude an alteration (reflex to tissue).',
    detail:
      'ctDNA "liquid biopsy" enables minimally invasive tumor genotyping but is analytically demanding. Tumor DNA is a small, variable fraction of total cell-free DNA, so assays need very low limits of detection (often <0.1–0.5% VAF) with error-suppression (e.g., UMIs). Pre-analytics are critical: blood-collection tube type, time-to-processing, and plasma separation strongly affect cfDNA yield/quality. A major specificity challenge is clonal hematopoiesis of indeterminate potential (CHIP) — white-blood-cell-derived variants that masquerade as tumor signals (paired WBC sequencing mitigates this). Clinically, ctDNA is validated for genotyping (e.g., EGFR, PIK3CA CDx) with the cardinal caveat that low tumor shed means a negative plasma result must reflex to tissue. FDA has approved plasma-based companion diagnostics with these constraints in labeling.',
    keyPoints: [
      'ctDNA needs ultra-low LoD (<0.1–0.5% VAF) + error suppression (UMIs).',
      'Pre-analytics (tube, time-to-spin) strongly affect cfDNA quality.',
      'Clonal hematopoiesis (CHIP) causes false positives — paired WBC mitigates.',
      'Negative plasma must reflex to tissue (low shed ≠ true negative).',
    ],
    pitfalls: [
      'Reporting CHIP variants as tumor-derived.',
      'Treating a plasma-negative result as a true negative.',
    ],
    citations: [
      { label: 'IASLC / ASCO liquid-biopsy recommendations', source: 'IASLC/ASCO' },
      { label: 'FDA plasma-based companion diagnostic approvals', source: 'FDA' },
    ],
    related: ['bio.egfr', 'bio.pik3ca', 'sci.ngs.mrd', 'sci.ivd.detection-capability'],
    tags: ['ctdna', 'liquid-biopsy', 'cfdna', 'chip', 'lod', 'ngs'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ngs.mrd',
    domain: 'scientific',
    topic: 'ngs-molecular',
    title: 'Measurable/minimal residual disease (MRD) testing',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'MRD assays detect very low residual tumor burden after therapy (by NGS, multiparameter flow, or tumor-informed ctDNA) for prognosis and monitoring; intended use (prognostic vs predictive vs monitoring) and ultra-low LoD with longitudinal interpretation are central to validity.',
    detail:
      'MRD quantifies residual disease below morphologic detection and is established in hematologic malignancies (NGS/flow MRD in ALL, multiple myeloma) and emerging in solid tumors (tumor-informed ctDNA MRD in colorectal and others). Key validity considerations: an extremely low limit of detection (e.g., 10⁻⁶ for some hematologic MRD), a clearly defined intended use (prognostic stratification, monitoring/relapse prediction, or treatment-response guidance — each with different evidence needs), longitudinal/kinetic interpretation rather than a single threshold, and tumor-informed (bespoke panel from the patient\'s tumor) vs tumor-naïve designs with different sensitivity/turnaround trade-offs. Regulatory status spans LDTs and FDA-cleared assays; intended-use precision and analytical LoD validation dominate the evidence package.',
    keyPoints: [
      'Detects residual disease below morphologic limits (NGS/flow/ctDNA).',
      'Ultra-low LoD (down to ~10⁻⁶ for some hematologic MRD).',
      'Define intended use precisely: prognostic vs monitoring vs predictive.',
      'Tumor-informed vs tumor-naïve designs trade sensitivity/turnaround.',
    ],
    citations: [
      { label: 'NCCN/consensus MRD guidance (ALL, myeloma); ctDNA MRD literature', source: 'NCCN/consensus' },
    ],
    related: ['sci.ngs.ctdna', 'sci.ivd.detection-capability', 'sci.ivd.clinical-study-design'],
    tags: ['mrd', 'residual-disease', 'ctdna', 'flow', 'lod', 'ngs'],
    lastReviewed: '2026-06-09',
  },
];
