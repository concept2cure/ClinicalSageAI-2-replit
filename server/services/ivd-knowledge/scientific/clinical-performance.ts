/**
 * IVD clinical-performance & scientific-validity scientific corpus.
 *
 * Deep, citable entries on the evidence that gives a measurement clinical
 * meaning: diagnostic accuracy metrics and their dependence on prevalence,
 * agreement statistics, ROC/cut-off determination, clinical-study design
 * (incl. STARD), and the scientific-validity (analyte–condition) pillar.
 */

import type { KnowledgeEntry } from '../types';

export const CLINICAL_PERFORMANCE_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'sci.ivd.clinical-performance-metrics',
    domain: 'scientific',
    topic: 'clinical-performance',
    title: 'Diagnostic accuracy metrics — sensitivity, specificity, PPV/NPV, likelihood ratios',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Clinical performance is summarised by sensitivity and specificity (intrinsic to the test), predictive values (PPV/NPV, which depend on prevalence), and likelihood ratios (LR+ = sens/(1−spec), LR− = (1−sens)/spec), all reported with confidence intervals from a 2×2 against a reference standard.',
    detail:
      'Against a clinical reference standard, a binary test yields a 2×2 table (TP, FP, FN, TN). Sensitivity = TP/(TP+FN) and specificity = TN/(TN+FP) are intrinsic properties largely independent of prevalence. Positive and negative predictive values — PPV = TP/(TP+FP), NPV = TN/(TN+FN) — answer the clinically pressing question ("given this result, what is the probability of disease?") but depend strongly on prevalence; the same test has very different PPV in screening (low prevalence) vs. confirmatory (high prevalence) settings, so predictive values must always be reported with the assumed/observed prevalence, ideally via Bayes from likelihood ratios. Likelihood ratios (LR+ = sensitivity/(1−specificity); LR− = (1−sensitivity)/specificity) are prevalence-independent and convert pre-test to post-test odds.\n\nAll estimates require confidence intervals (Wilson or Clopper-Pearson for proportions). When no true gold standard exists, agreement metrics (percent positive/negative agreement vs a comparator, or latent-class/discrepant-analysis approaches) are used and must be transparently labelled as agreement, not accuracy. Pitfalls: reporting PPV/NPV without prevalence, computing CIs with the flawed normal approximation at extremes, using "discrepant analysis" to inflate accuracy, and verification/spectrum bias from a non-representative population.',
    keyPoints: [
      'Sensitivity/specificity are intrinsic; PPV/NPV depend on prevalence.',
      'Likelihood ratios (LR+, LR−) are prevalence-independent and Bayes-friendly.',
      'Always report Wilson/Clopper-Pearson CIs and the prevalence used.',
      'No gold standard ⇒ report agreement (PPA/NPA), not "accuracy".',
    ],
    criteria: [
      { metric: 'Reporting', typical: 'sens, spec, PPV, NPV, LR+, LR− with 95% CIs + prevalence' },
      { metric: 'CI method', typical: 'Wilson or Clopper-Pearson (not normal approximation at extremes)' },
    ],
    pitfalls: [
      'PPV/NPV reported without the prevalence they assume.',
      'Discrepant/“discordant” analysis used to inflate performance.',
      'Spectrum/verification bias from a non-representative population.',
    ],
    citations: [
      { label: 'STARD 2015 (diagnostic accuracy reporting)', source: 'STARD' },
      { label: 'FDA Guidance: Statistical Guidance on Reporting Results from Studies Evaluating Diagnostic Tests', source: 'FDA' },
      { label: 'CLSI EP12 (qualitative test performance)', source: 'CLSI' },
    ],
    related: ['sci.ivd.roc-cutoff', 'sci.ivd.agreement', 'sci.ivd.clinical-study-design', 'sci.ivd.scientific-validity'],
    tags: ['sensitivity', 'specificity', 'ppv', 'npv', 'likelihood-ratio', 'prevalence', 'stard'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.roc-cutoff',
    domain: 'scientific',
    topic: 'clinical-performance',
    title: 'ROC analysis and clinical cut-off determination',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'For quantitative assays with a binary clinical outcome, ROC analysis (AUC and the sensitivity/specificity trade-off across thresholds) characterises discrimination; the clinical cut-off is selected to match the intended use (Youden-optimal, or a fixed sensitivity/specificity), pre-specified and then validated independently.',
    detail:
      'A receiver operating characteristic (ROC) curve plots sensitivity against 1−specificity across all candidate thresholds; the area under the curve (AUC) summarises overall discrimination (0.5 = chance, 1.0 = perfect) and is useful for comparing assays independent of any single cut-off. The clinical decision threshold (cut-off) is then chosen according to the intended use: the Youden index (max sensitivity+specificity−1) gives a balanced optimum, but a rule-out screening test may fix high sensitivity, while a confirmatory test fixes high specificity; cost/benefit and prevalence inform the choice.\n\nCritically, the cut-off should be pre-specified (or derived on a training set) and then its sensitivity/specificity validated on an independent set — choosing the cut-off and reporting its performance on the same data is optimistic (overfitting). Pitfalls: cut-off "shopping" reported without independent validation, AUC reported without the operating point that will actually be used, ignoring the grey zone/equivocal band, and not re-validating the cut-off when the population or pre-analytics change. For CDx, the cut-off must be the one used (or bridged to) in the pivotal therapeutic trial.',
    keyPoints: [
      'AUC summarises discrimination; the cut-off is an intended-use decision.',
      'Youden-optimal vs fixed-sensitivity (rule-out) vs fixed-specificity (confirm).',
      'Pre-specify/train the cut-off, then validate on an independent set.',
      'CDx cut-off must align with (or bridge to) the pivotal trial.',
    ],
    criteria: [
      { metric: 'Discrimination', typical: 'AUC with 95% CI; report the chosen operating point' },
      { metric: 'Validation', typical: 'cut-off performance confirmed on an independent dataset' },
    ],
    pitfalls: [
      'Reporting cut-off performance on the same data used to choose it.',
      'AUC without the actual operating point/cut-off.',
    ],
    citations: [
      { label: 'CLSI GP10 / EP24 (ROC for diagnostic accuracy)', source: 'CLSI' },
      { label: 'FDA Statistical Guidance on Diagnostic Test Studies', source: 'FDA' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.ivd.reference-intervals', 'fda.ivd.cdx'],
    tags: ['roc', 'auc', 'cut-off', 'youden', 'decision-threshold'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.agreement',
    domain: 'scientific',
    topic: 'clinical-performance',
    title: 'Agreement statistics when there is no gold standard (PPA/NPA, kappa)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'When the comparator is an imperfect method rather than a true reference, results are expressed as positive/negative percent agreement (PPA/NPA) and overall percent agreement with Cohen\'s kappa (chance-corrected), explicitly labelled as agreement rather than sensitivity/specificity.',
    detail:
      'Many IVD claims (especially molecular and qualitative assays) lack a true gold standard, so the candidate is compared to a non-reference comparator (a predicate, composite reference, or PCR/sequencing). The correct vocabulary is agreement, not accuracy: positive percent agreement (PPA) and negative percent agreement (NPA) parallel sensitivity/specificity but acknowledge the comparator is imperfect; overall percent agreement (OPA) summarises concordance. Cohen\'s kappa corrects agreement for chance (κ = (po−pe)/(1−pe)); weighted kappa handles ordinal categories. FDA guidance explicitly directs sponsors to use PPA/NPA terminology in this situation and to avoid "discrepant analysis" that resolves disagreements selectively to inflate performance.\n\nPitfalls: presenting PPA/NPA as sensitivity/specificity (implying a gold standard that does not exist), reporting raw agreement without chance-correction where appropriate, using discrepant/discordant resolution, and inadequate handling of equivocal/invalid results in the denominator. A composite reference standard or latent-class analysis can be defensible when pre-specified and transparently described.',
    keyPoints: [
      'No gold standard ⇒ PPA/NPA/OPA, not sensitivity/specificity.',
      'Cohen\'s/weighted kappa corrects agreement for chance.',
      'Avoid discrepant analysis; pre-specify any composite/latent-class reference.',
      'Account for equivocal/invalid results transparently.',
    ],
    criteria: [
      { metric: 'Reporting', typical: 'PPA, NPA, OPA with 95% CIs; kappa where categorical' },
    ],
    pitfalls: [
      'Labelling PPA/NPA as sensitivity/specificity.',
      'Selective discrepant resolution.',
    ],
    citations: [
      { label: 'FDA Statistical Guidance on Diagnostic Test Studies (PPA/NPA)', source: 'FDA' },
      { label: 'CLSI EP12 (user protocol for qualitative tests)', source: 'CLSI' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.ivd.clinical-study-design'],
    tags: ['ppa', 'npa', 'kappa', 'agreement', 'no-gold-standard'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.clinical-study-design',
    domain: 'scientific',
    topic: 'clinical-performance',
    title: 'Clinical performance study design, bias control, and STARD reporting',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'A credible clinical performance study enrolls the intended-use population, defines the reference standard and inclusion/exclusion prospectively, powers for the key metric at its decision point, controls spectrum/verification/review bias, and reports per STARD; IVDR studies follow ISO 20916.',
    detail:
      'Design integrity drives whether clinical performance is believable. Core principles: (1) the study population must mirror the intended-use population and prevalence/spectrum (consecutive or randomly sampled patients presenting with the relevant clinical question, not easy-to-classify extremes); (2) the reference standard and all inclusion/exclusion criteria, the cut-off, and the primary analysis are pre-specified; (3) sample size is justified to estimate the primary metric (e.g., sensitivity at the cut-off) with adequate CI precision; (4) bias is controlled — spectrum bias (unrepresentative case mix), verification/work-up bias (reference standard applied selectively), and review bias (interpreters not blinded). Prospective designs are strongest; archived/biobanked samples can be acceptable if representative and pre-specified.\n\nIVDR clinical performance studies are conducted under Articles 57–77 and Annex XIII Part A/Annex XIV, with specific obligations for interventional studies and use of left-over samples; ISO 20916 provides the methodological standard. Reporting should follow STARD 2015. For CDx, the clinical performance is ideally generated from the pivotal therapeutic trial population, with a bridging study if the trial used a clinical trial assay different from the market device.',
    keyPoints: [
      'Enroll the intended-use population at realistic prevalence/spectrum.',
      'Pre-specify reference standard, criteria, cut-off, and primary analysis.',
      'Power for the key metric at its decision point; control spectrum/verification/review bias.',
      'Report per STARD; IVDR studies follow ISO 20916 and Arts. 57–77.',
    ],
    pitfalls: [
      'Case-control "extreme groups" inflating apparent accuracy (spectrum bias).',
      'Selective application of the reference standard (verification bias).',
      'Unblinded result interpretation (review bias).',
    ],
    citations: [
      { label: 'ISO 20916:2019 (IVD clinical performance studies)', source: 'ISO' },
      { label: 'STARD 2015', source: 'STARD' },
      { label: 'IVDR Arts. 57–77 & Annex XIII/XIV', source: 'EU' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.ivd.roc-cutoff', 'eu.ivdr.performance-evaluation', 'fda.ivd.cdx'],
    tags: ['study-design', 'stard', 'iso-20916', 'spectrum-bias', 'verification-bias'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.scientific-validity',
    domain: 'scientific',
    topic: 'scientific-validity',
    title: 'Scientific validity — the analyte–condition association pillar',
    jurisdictions: ['global', 'EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Scientific validity is the demonstrated association of the measured analyte/marker with the targeted clinical condition or physiological state — the first IVDR performance-evaluation pillar — established from guidelines/consensus, systematic reviews, peer-reviewed studies, or the manufacturer\'s own data.',
    detail:
      'Before analytical and clinical performance even matter, the underlying premise must hold: does the analyte actually relate to the condition the test claims to inform? IVDR Annex XIII Part A §1.2.1 makes scientific validity an explicit, documented requirement, and FDA implicitly requires the same biological/clinical rationale. Evidence is graded by strength: adopted clinical practice guidelines/consensus statements (strongest), systematic reviews/meta-analyses, primary peer-reviewed clinical studies, proof-of-concept/mechanistic studies, and expert opinion (weakest, insufficient alone).\n\nThe scientific validity report assembles and appraises this evidence for the specific intended purpose (the same biomarker may be valid for one condition/population and not another). It is the pillar most often treated as a checkbox, yet notified bodies and FDA increasingly probe it — particularly for novel biomarkers, multi-analyte algorithmic scores, and AI-derived signatures where the biological/clinical basis is less established. Pitfalls: asserting validity by analogy to a different intended use, relying on a single study or on expert opinion alone, and not keeping the report current as the literature evolves (it is a living document updated via PMPF).',
    keyPoints: [
      'Scientific validity = analyte/marker ↔ clinical condition association for the specific intended purpose.',
      'Evidence hierarchy: guidelines/consensus > systematic review > primary studies > PoC > expert opinion.',
      'Required by IVDR Annex XIII Part A; increasingly probed by FDA/NBs.',
      'Living document; keep current via PMPF, especially for novel/AI markers.',
    ],
    pitfalls: [
      'Transferring validity from a different intended use/population by analogy.',
      'Relying on a single study or expert opinion alone.',
    ],
    citations: [
      { label: 'IVDR Annex XIII Part A §1.2.1 (scientific validity)', source: 'EU' },
      { label: 'MDCG 2022-2 (performance evaluation / scientific validity)', source: 'EU (MDCG)' },
    ],
    related: ['eu.ivdr.performance-evaluation', 'sci.ivd.clinical-performance-metrics', 'fda.ivd.cdx'],
    tags: ['scientific-validity', 'biomarker', 'evidence-hierarchy', 'annex-xiii'],
    lastReviewed: '2026-06-09',
  },
];
