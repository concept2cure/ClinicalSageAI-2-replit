/**
 * IVD analytical-performance scientific corpus.
 *
 * Deep, citable entries on the analytical studies that establish an IVD's
 * measurement performance, each with study design, typical acceptance criteria,
 * and common pitfalls. Anchored to the CLSI EP series and ISO traceability/
 * stability standards that FDA recognises and IVDR Annex I/XIII expect.
 *
 * These knowledge entries are the conceptual companion to the executable
 * estimators in server/services/stats/analytical-performance.ts and
 * analytical-performance-extensions.ts.
 */

import type { KnowledgeEntry } from '../types';

export const ANALYTICAL_PERFORMANCE_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'sci.ivd.analytical-performance-overview',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Analytical performance — the measurement-validation framework',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Analytical performance establishes that an assay measures the analyte correctly and reliably: trueness/precision, detection capability (LoB/LoD/LoQ), linearity/measuring range, analytical specificity (interference/cross-reactivity), carry-over, stability, and metrological traceability — independent of any clinical claim.',
    detail:
      'Analytical validation answers "does the assay measure what it claims, accurately and reproducibly?" — separately from clinical validation ("does the measurement mean something clinically?"). The canonical study set: precision/reproducibility (CLSI EP05), trueness/bias via method comparison (EP09) and recovery, detection capability LoB/LoD/LoQ (EP17), linearity and reportable/measuring range (EP06), analytical specificity — interference (EP07) and cross-reactivity, carry-over (EP10-type sequences), high-dose hook for immunoassays, specimen/matrix equivalence and stability (EP25), reference intervals (EP28), and metrological traceability of calibrators/controls (ISO 17511).\n\nA defensible plan pre-specifies acceptance criteria tied to the intended use and the clinical decision points (a tumour-marker threshold demands tight precision at the cut-off; a qualitative infectious test emphasises LoD and specificity). Regulators expect criteria justified before data collection, studies run on the final (production-equivalent) device with multiple lots/operators/instruments where relevant, and results summarised in the 510(k)/De Novo/PMA performance section or the IVDR Performance Evaluation Report.',
    keyPoints: [
      'Analytical ≠ clinical: this layer proves measurement quality, not clinical meaning.',
      'Core studies: EP05, EP06, EP07, EP09, EP10, EP17, EP25, EP28 + ISO 17511 traceability.',
      'Pre-specify acceptance criteria tied to clinical decision points.',
      'Run on production-equivalent device with multi-lot/operator/instrument coverage.',
    ],
    pitfalls: [
      'Setting acceptance criteria after seeing the data.',
      'Validating an engineering build rather than the production-equivalent device.',
    ],
    citations: [
      { label: 'CLSI EP05/EP06/EP07/EP09/EP17/EP25/EP28', source: 'CLSI' },
      { label: 'ISO 17511:2020 (metrological traceability)', source: 'ISO' },
      { label: 'IVDR Annex I §9 & Annex XIII (analytical performance)', source: 'EU' },
    ],
    related: ['sci.ivd.precision', 'sci.ivd.detection-capability', 'sci.ivd.traceability', 'eu.ivdr.performance-evaluation'],
    tags: ['analytical-performance', 'validation', 'clsi', 'iso-17511'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.precision',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Precision and reproducibility (CLSI EP05)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Precision quantifies random error — the closeness of replicate results. EP05 estimates repeatability (within-run) and within-laboratory (total) imprecision via a nested design; reproducibility (EP05-A3) adds between-site/lot variance.',
    detail:
      'CLSI EP05 (current edition EP05-A3) estimates imprecision using a nested ANOVA design — commonly 20 days × 2 runs/day × 2 replicates per sample level — partitioning variance into repeatability (within-run), between-run, between-day, and within-laboratory (total) components, reported as standard deviation and %CV at each tested concentration. Multi-site/multi-lot/multi-operator extension yields reproducibility. Levels are chosen to bracket the measuring range and, critically, to sit at or near clinical decision points where tight precision matters most.\n\nAcceptance criteria are analyte- and use-specific and should be pre-defined, often referencing biological variation (desirable imprecision ≤ 0.5 × within-subject CV) or established assay claims. For qualitative assays, precision is assessed near the cut-off (e.g., C5–C95 interval). Pitfalls include too few days/levels, ignoring lot-to-lot variance, mismatched matrices (using QC material instead of clinical-like samples), and reporting only repeatability while omitting the more demanding within-laboratory and reproducibility estimates that reviewers expect.',
    keyPoints: [
      'EP05 nested design (e.g., 20×2×2) → repeatability + within-lab (total) imprecision.',
      'Report SD and %CV at multiple levels, including clinical decision points.',
      'Reproducibility adds site/lot/operator variance (EP05-A3).',
      'Anchor acceptance criteria to biological variation or validated claims.',
    ],
    criteria: [
      { metric: 'Within-lab %CV (general chemistry)', typical: 'often ≤ 1/2 within-subject biological CV', note: 'analyte-specific; pre-define' },
      { metric: 'Design', typical: '≥20 days, 2 runs/day, 2 replicates, ≥2 levels', note: 'bracket decision points' },
    ],
    pitfalls: [
      'Reporting only within-run precision.',
      'Omitting lot-to-lot/site variance for reproducibility claims.',
    ],
    citations: [
      { label: 'CLSI EP05-A3 (precision evaluation)', source: 'CLSI' },
      { label: 'EFLM biological variation database (criteria source)', source: 'EFLM' },
    ],
    related: ['sci.ivd.analytical-performance-overview', 'sci.ivd.method-comparison'],
    tags: ['precision', 'reproducibility', 'ep05', 'cv', 'imprecision'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.detection-capability',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Detection capability — LoB, LoD, and LoQ (CLSI EP17)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'EP17 defines the Limit of Blank (highest result likely from a blank), Limit of Detection (lowest analyte reliably distinguished from blank), and Limit of Quantitation (lowest analyte measured with stated accuracy/imprecision).',
    detail:
      'CLSI EP17 establishes the low-end performance hierarchy: LoB < LoD ≤ LoQ. LoB is estimated from many blank measurements (LoB = mean_blank + 1.645·SD_blank, parametric approach), representing the 95th percentile of blank results. LoD is the lowest concentration reliably distinguished from the blank, derived from LoB plus a factor of the low-concentration sample SD (LoD = LoB + 1.645·SD_low), so that the false-negative rate at LoD is ~5%. LoQ is the lowest concentration meeting a pre-defined total error/imprecision goal (e.g., ≤20% CV or a bias+imprecision budget) — for many assays LoQ equals or exceeds LoD.\n\nThe study uses multiple blank and low-level samples across reagent lots, days, and instruments. Pitfalls: conflating LoD and LoQ (a qualitative claim needs LoD; a quantitative low-end claim needs LoQ with an accuracy goal), too few blank replicates (EP17 expects substantial n, e.g., ≥60 blank and low-sample measurements across conditions), using purified analyte in buffer rather than the clinical matrix, and claiming a "sensitivity" number without specifying whether it is LoB, LoD, or LoQ.',
    keyPoints: [
      'Hierarchy: LoB < LoD ≤ LoQ.',
      'LoB ≈ mean_blank + 1.645·SD_blank; LoD ≈ LoB + 1.645·SD_low.',
      'LoQ = lowest concentration meeting a pre-set accuracy/imprecision goal.',
      'Use clinical matrix and multiple lots/days/instruments.',
    ],
    criteria: [
      { metric: 'LoB percentile', typical: '95th percentile of blanks (α≈0.05)' },
      { metric: 'LoD false-negative rate', typical: '≈5% (β≈0.05) at the claimed LoD' },
      { metric: 'LoQ goal', typical: 'e.g., total CV ≤20% (assay-specific)' },
    ],
    pitfalls: [
      'Reporting an undifferentiated "analytical sensitivity" without LoB/LoD/LoQ distinction.',
      'Estimating in buffer instead of the intended specimen matrix.',
    ],
    citations: [
      { label: 'CLSI EP17-A2 (detection capability)', source: 'CLSI' },
    ],
    related: ['sci.ivd.analytical-performance-overview', 'sci.ivd.precision', 'sci.ivd.linearity'],
    tags: ['lod', 'lob', 'loq', 'ep17', 'analytical-sensitivity'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.linearity',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Linearity and the measuring/reportable range (CLSI EP06)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'EP06 establishes the interval over which results are directly proportional to analyte concentration, defining the analytical measuring range (AMR); dilution recovery extends it to the clinically reportable range (CRR).',
    detail:
      'CLSI EP06 (current edition EP06-A2/Ed2) assesses linearity by measuring a series of admixtures spanning the claimed range (typically 7–11 levels, replicates each), fitting both linear and higher-order polynomial models, and judging whether nonlinear terms produce a deviation from linearity exceeding a pre-set allowable goal at any level. The interval meeting the goal is the analytical measuring range (AMR) — the span measurable without dilution/concentration. The clinically reportable range (CRR) extends the AMR via validated dilution (and pre-treatment/concentration) with acceptable recovery.\n\nLinearity underpins the upper end of reportable results and dilution protocols. Pitfalls: too few levels or replicates to detect curvature, levels that don\'t actually bracket the claimed limits, using a single sample dilution rather than independently prepared admixtures, ignoring matrix effects at the extremes, and failing to validate dilution recovery (essential when samples above the AMR are diluted into range). For immunoassays, linearity assessment must be paired with high-dose hook evaluation so that very high concentrations are not under-reported.',
    keyPoints: [
      '7–11 admixture levels; compare linear vs polynomial fit against an allowable nonlinearity goal.',
      'AMR = range measurable without dilution; CRR = AMR + validated dilution recovery.',
      'Validate dilution recovery to extend the reportable range.',
      'Pair with high-dose hook checks for immunoassays.',
    ],
    criteria: [
      { metric: 'Levels', typical: '7–11 across the claimed range, replicates each' },
      { metric: 'Deviation from linearity', typical: '≤ pre-set allowable (e.g., ≤10% or within TEa)' },
      { metric: 'Dilution recovery (CRR)', typical: 'typically 80–120%' },
    ],
    pitfalls: [
      'Levels that do not bracket the claimed AMR limits.',
      'Claiming a CRR without validated dilution recovery.',
    ],
    citations: [
      { label: 'CLSI EP06-A2 (linearity)', source: 'CLSI' },
    ],
    related: ['sci.ivd.analytical-performance-overview', 'sci.ivd.detection-capability', 'sci.ivd.interference'],
    tags: ['linearity', 'ep06', 'amr', 'crr', 'reportable-range', 'dilution'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.method-comparison',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Method comparison and bias estimation (CLSI EP09)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'EP09 estimates systematic difference (bias) between the candidate measurement procedure and a comparator/reference across the measuring range using regression (Deming/Passing-Bablok) and Bland-Altman difference plots on patient samples.',
    detail:
      'CLSI EP09 (current EP09c) compares a candidate assay to a comparator (ideally a reference measurement procedure or predicate) using ≥40 patient samples distributed across the measuring range, each measured by both methods (often in duplicate). Because both methods carry error, error-in-variables regression — Deming (constant or proportional error) or non-parametric Passing-Bablok — is used rather than ordinary least squares, yielding slope and intercept with confidence intervals to characterise proportional and constant bias. Bland-Altman plots visualise mean bias and limits of agreement, and bias at clinical decision points is estimated from the regression.\n\nThis study is central to 510(k) substantial-equivalence (candidate vs predicate) and to traceability claims. Pitfalls: too few samples or a narrow concentration spread (samples must populate the whole range, especially near decision points), using OLS instead of Deming/Passing-Bablok, treating QC materials as samples (commutability!), and reporting only a correlation coefficient r (which measures association, not agreement) instead of slope/intercept/bias at decision points.',
    keyPoints: [
      '≥40 patient samples spanning the range; duplicates recommended.',
      'Use Deming or Passing-Bablok (error-in-variables), not OLS.',
      'Report slope/intercept (CI), Bland-Altman bias, and bias at decision points.',
      'r (correlation) is not agreement — do not substitute it.',
    ],
    criteria: [
      { metric: 'Sample count', typical: '≥40 patient samples across the range' },
      { metric: 'Regression', typical: 'Deming / Passing-Bablok with 95% CI on slope & intercept' },
      { metric: 'Bias judgement', typical: 'estimated bias at clinical decision points vs allowable bias' },
    ],
    pitfalls: [
      'Reporting only Pearson r.',
      'Comparator/QC commutability not addressed.',
    ],
    citations: [
      { label: 'CLSI EP09c (method comparison & bias)', source: 'CLSI' },
    ],
    related: ['sci.ivd.precision', 'sci.ivd.traceability', 'fda.ivd.510k-pathway'],
    tags: ['method-comparison', 'ep09', 'bias', 'deming', 'passing-bablok', 'bland-altman'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.interference',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Analytical specificity — interference and cross-reactivity (CLSI EP07/EP37)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Analytical specificity confirms the assay measures only the intended analyte. EP07 quantifies interference (bias from endogenous/exogenous substances) by paired difference testing; cross-reactivity assesses signal from structurally related analytes.',
    detail:
      'CLSI EP07 (interference testing) uses a paired-difference design: aliquots of a sample are spiked with a candidate interferent at a high, clinically relevant test concentration vs an unspiked control, and the difference in measured analyte is the interference bias; substances producing bias beyond the allowable goal are then dose-response characterised to find the concentration at which interference becomes significant. Standard panels cover common endogenous interferents (haemoglobin/haemolysis, bilirubin/icterus, lipids/lipaemia, protein), drugs and metabolites, and assay-specific suspects; CLSI EP37 catalogues interferent test concentrations. Cross-reactivity assesses apparent signal from structurally related molecules (e.g., related hormones, drug metabolites, related pathogens) and, for immunoassays, also covers heterophilic/anti-reagent antibodies, biotin interference, and rheumatoid factor.\n\nPitfalls: testing interferents below clinically encountered concentrations, omitting the dose-response follow-up for flagged substances, ignoring assay-format-specific interferences (biotin in streptavidin-biotin immunoassays; HAMA/heterophiles), and failing to translate findings into IFU limitations/warnings. Hook effect, while a sensitivity phenomenon, is often evaluated alongside specificity for sandwich immunoassays.',
    keyPoints: [
      'Paired-difference design at clinically relevant interferent concentrations (EP07).',
      'Dose-response any interferent exceeding the allowable bias.',
      'Cover haemolysis/icterus/lipaemia + drugs + format-specific (biotin, HAMA, heterophiles).',
      'Translate findings into IFU limitations/warnings.',
    ],
    criteria: [
      { metric: 'Interference threshold', typical: 'bias > allowable (e.g., >10% or > TEa) flags an interferent' },
      { metric: 'Test concentrations', typical: 'high/clinically relevant levels per CLSI EP37' },
    ],
    pitfalls: [
      'Testing below clinically encountered interferent levels.',
      'Missing biotin/HAMA/heterophile interference in immunoassays.',
    ],
    citations: [
      { label: 'CLSI EP07 (interference testing)', source: 'CLSI' },
      { label: 'CLSI EP37 (interferent test concentrations)', source: 'CLSI' },
    ],
    related: ['sci.ivd.analytical-performance-overview', 'sci.ivd.linearity'],
    tags: ['interference', 'cross-reactivity', 'ep07', 'ep37', 'specificity', 'biotin', 'hama'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.traceability',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Metrological traceability and commutability (ISO 17511 / EP30)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'ISO 17511 requires calibrator and control values to be traceable through an unbroken chain to the highest available reference (SI unit, reference measurement procedure, or certified reference material), with stated measurement uncertainty and demonstrated commutability of reference materials.',
    detail:
      'Metrological traceability makes results from different methods/labs comparable and is mandated by IVDR Annex I §9 and expected by FDA. ISO 17511:2020 defines the calibration hierarchy: an end-user result is traceable via the manufacturer\'s working calibrators and selected measurement procedure up to the highest-order reference available — ideally an SI unit realised by a reference measurement procedure (RMP) anchored to a certified reference material (CRM), or, where none exists, an international conventional calibrator/RMP, descending to manufacturer-internal references as the weakest defensible tier. Each step propagates measurement uncertainty to the end-user result.\n\nCommutability (CLSI EP30/IFCC) is the often-missed linchpin: a reference material is commutable only if it behaves like authentic clinical samples across the measurement procedures involved; a non-commutable calibrator/CRM breaks the traceability chain even if the paperwork looks complete. Pitfalls: claiming SI traceability without an actual RMP/CRM, omitting the uncertainty budget, using a non-commutable secondary material, and failing to re-verify traceability across reagent/calibrator lots.',
    keyPoints: [
      'Unbroken chain: end-user result → working calibrator → selected procedure → RMP/CRM → SI.',
      'State and propagate measurement uncertainty at each step.',
      'Commutability (EP30) of reference materials is mandatory, not optional.',
      'Re-verify traceability across calibrator/reagent lots.',
    ],
    pitfalls: [
      'Claiming SI traceability with no RMP/CRM at the top of the chain.',
      'Using a non-commutable calibrator/CRM.',
    ],
    citations: [
      { label: 'ISO 17511:2020 (metrological traceability)', source: 'ISO' },
      { label: 'CLSI EP30 / IFCC (commutability)', source: 'CLSI/IFCC' },
      { label: 'IVDR Annex I §9 (traceability)', source: 'EU' },
    ],
    related: ['sci.ivd.method-comparison', 'sci.ivd.analytical-performance-overview', 'eu.ivdr.gspr'],
    tags: ['traceability', 'iso-17511', 'commutability', 'ep30', 'uncertainty', 'calibrator'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.stability',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Stability — shelf-life, in-use, transport, and specimen stability (CLSI EP25 / ISO 23640)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Stability studies establish claimed shelf-life (real-time), in-use/open-vial and on-board/calibration stability, transport (shipping/thermal-cycling) stability, and specimen stability, using real-time data (definitive) supported by accelerated/Arrhenius models for early estimates.',
    detail:
      'ISO 23640 and CLSI EP25 frame IVD reagent stability. Real-time stability — storing reagents/calibrators/controls at the labelled condition and testing performance over time — is the definitive basis for the shelf-life claim; the claim is the time at which a measured attribute first reaches its specification limit (often estimated by regressing the attribute vs time and projecting to the limit). Accelerated stability (elevated temperatures, modelled by the Arrhenius relationship to estimate the storage-temperature degradation rate) supports interim claims and stress understanding but does not by itself substitute for real-time data at market.\n\nBeyond shelf-life, manufacturers must establish in-use/open-vial stability, on-board and calibration stability on the instrument, transport stability (shipping excursions, freeze-thaw, thermal cycling), and specimen stability (how long, and under what conditions, a patient sample yields a valid result). Pitfalls: relying solely on accelerated data for the marketed shelf-life, too few timepoints to support a regression-based claim, ignoring the in-use/on-board and specimen-stability claims that labs actually depend on, and not bracketing worst-case (oldest reagent + edge storage) conditions.',
    keyPoints: [
      'Real-time data is definitive for shelf-life; accelerated/Arrhenius supports interim claims.',
      'Also establish in-use/open-vial, on-board/calibration, transport, and specimen stability.',
      'Shelf-life = time the attribute first reaches its spec limit (often regression-projected).',
      'Bracket worst-case storage and reagent age.',
    ],
    criteria: [
      { metric: 'Shelf-life basis', typical: 'real-time at labelled condition (accelerated supportive)' },
      { metric: 'Timepoints', typical: 'enough to support a trend/regression to the spec limit' },
    ],
    pitfalls: [
      'Marketing a shelf-life from accelerated data alone.',
      'Omitting specimen and in-use/on-board stability claims.',
    ],
    citations: [
      { label: 'CLSI EP25 (reagent stability)', source: 'CLSI' },
      { label: 'ISO 23640:2011 (stability of IVD reagents)', source: 'ISO' },
    ],
    related: ['sci.ivd.analytical-performance-overview', 'std.iso-23640'],
    tags: ['stability', 'shelf-life', 'ep25', 'iso-23640', 'arrhenius', 'specimen-stability'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.reference-intervals',
    domain: 'scientific',
    topic: 'analytical-performance',
    title: 'Reference intervals and clinical decision limits (CLSI EP28)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Reference intervals describe the expected distribution in a defined healthy population (typically the central 95%); CLSI EP28 covers their establishment (≥120 reference individuals per partition) and transference/verification (≥20 samples) to a new method or population.',
    detail:
      'CLSI EP28 (formerly C28) defines how to establish, transfer, and verify reference intervals. Establishment of a new reference interval uses the non-parametric central-95% approach, requiring at least 120 qualified reference individuals per partition (e.g., per sex/age group) with defined inclusion/exclusion and pre-analytical control. Because de-novo establishment is resource-intensive, EP28 also describes transference (adopting a published/established interval after confirming method comparability) and verification (testing ≥20 reference samples; if no more than 2 of 20 fall outside the candidate interval, it is verified).\n\nReference intervals differ from clinical decision limits (thresholds derived from outcome data, e.g., a diagnostic cut-off or a guideline threshold), which are determined by clinical performance studies and ROC analysis rather than the healthy-population distribution. Pitfalls: undersized or poorly defined reference populations, ignoring partitioning (sex/age/ethnicity) when distributions differ, transferring an interval without confirming analytical comparability, and conflating a reference interval with a clinical decision threshold in the IFU.',
    keyPoints: [
      'Establishment: non-parametric central 95%, ≥120 reference individuals per partition.',
      'Transference/verification: confirm comparability; verify with ≥20 samples (≤2 outside).',
      'Reference interval (healthy distribution) ≠ clinical decision limit (outcome-derived).',
      'Partition by sex/age/etc. where distributions differ.',
    ],
    criteria: [
      { metric: 'Establishment n', typical: '≥120 reference individuals per partition' },
      { metric: 'Verification n', typical: '≥20 samples; ≤2 outside the interval to verify' },
    ],
    pitfalls: [
      'Conflating reference interval with clinical decision threshold.',
      'Skipping partitioning when sex/age distributions differ.',
    ],
    citations: [
      { label: 'CLSI EP28-A3c (reference intervals)', source: 'CLSI' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.ivd.analytical-performance-overview'],
    tags: ['reference-intervals', 'ep28', 'decision-limit', 'partitioning'],
    lastReviewed: '2026-06-09',
  },
];
