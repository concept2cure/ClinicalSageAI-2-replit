/**
 * Pre-analytical, biobanking, and microbiology science corpus.
 *
 * The specimen-side and microbiology-specific science that underpins valid IVD
 * results: pre-analytical variables and specimen handling, molecular
 * pre-analytics standards, biobanking, antimicrobial-susceptibility breakpoints,
 * and syndromic molecular panels.
 */

import type { KnowledgeEntry } from '../types';

export const PREANALYTICAL_MICRO_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'sci.ivd.preanalytical',
    domain: 'scientific',
    topic: 'pre-analytical',
    title: 'Pre-analytical variables and specimen handling',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'The pre-analytical phase (collection, handling, transport, processing, storage) is the largest source of laboratory error; specimen type, anticoagulant/additive, time-to-processing, temperature, and stability must be validated and specified in the IFU.',
    detail:
      'Most laboratory errors arise before the analytical step. Pre-analytical determinants include patient preparation (fasting, posture, time of day), specimen type and collection device (serum vs plasma; tube additive/anticoagulant — EDTA, citrate, heparin), order of draw, hemolysis/icterus/lipemia, time and temperature from collection to processing, centrifugation, and storage/freeze-thaw. Each can bias results, so an IVD must validate acceptable specimen types and conditions (specimen-equivalence and stability studies) and state them as IFU requirements and limitations. CLSI documents (e.g., GP41 venipuncture, GP44 serum/plasma processing, H21 coagulation specimens) standardize practice; molecular tests have their own pre-analytics (below).',
    keyPoints: [
      'Pre-analytical phase is the dominant error source.',
      'Validate specimen types, additives, time/temperature, and stability.',
      'Specify acceptable specimens + limitations in the IFU.',
      'CLSI GP41/GP44/H21 standardize collection/processing.',
    ],
    pitfalls: [
      'Claiming a specimen type/additive not covered by an equivalence study.',
      'Ignoring hemolysis/time-to-spin effects established in interference/stability work.',
    ],
    citations: [
      { label: 'CLSI GP41 / GP44 / H21 (specimen collection & processing)', source: 'CLSI' },
    ],
    related: ['sci.ivd.stability', 'sci.ivd.interference', 'label.fda.809-10-package-insert'],
    tags: ['pre-analytical', 'specimen', 'anticoagulant', 'hemolysis', 'handling'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.molecular-preanalytics',
    domain: 'scientific',
    topic: 'pre-analytical',
    title: 'Molecular pre-analytics — nucleic-acid integrity (ISO 20184/20186/4307)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Molecular assays are acutely sensitive to specimen handling that degrades nucleic acids; the ISO 20184/20186 series and CEN/CLSI guidance specify pre-analytical requirements for DNA/RNA from tissue, blood, and other matrices.',
    detail:
      'Nucleic-acid-based IVDs depend on RNA/DNA integrity, which degrades rapidly under poor handling. The ISO 20184 (frozen/FFPE tissue) and ISO 20186 (venous whole blood — cellular RNA, ccfDNA, cellular DNA) series, plus ISO 4307 (saliva) and related CEN technical specifications, define pre-analytical requirements: collection, stabilization, time/temperature limits, and extraction considerations to preserve analyte integrity. FFPE introduces its own artefacts (formalin-induced deamination causing C>T artefacts) that affect low-VAF variant calling. For ctDNA, specialized stabilizing tubes and rapid plasma separation are required (see liquid-biopsy entry). Specifying and validating these molecular pre-analytics is essential for reproducible sequencing/PCR results.',
    keyPoints: [
      'RNA/DNA integrity is highly handling-sensitive.',
      'ISO 20184 (tissue), ISO 20186 (blood: RNA/ccfDNA/DNA), ISO 4307 (saliva).',
      'FFPE deamination causes C>T artefacts affecting low-VAF calls.',
      'ctDNA needs stabilizing tubes + rapid plasma separation.',
    ],
    citations: [
      { label: 'ISO 20184 / ISO 20186 / ISO 4307 (molecular pre-analytics)', source: 'ISO' },
    ],
    related: ['sci.ngs.ctdna', 'sci.ngs.panel-validation', 'sci.ivd.preanalytical'],
    tags: ['molecular-preanalytics', 'iso-20186', 'ffpe', 'rna-integrity', 'ccfdna'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.ivd.biobanking',
    domain: 'scientific',
    topic: 'pre-analytical',
    title: 'Biobanking for IVD evidence — ISO 20387 and sample provenance',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IVD analytical/clinical studies often rely on banked human specimens; ISO 20387 sets biobanking competence requirements, and the validity of left-over/archived-sample studies depends on documented provenance, consent, characterization, and representativeness.',
    detail:
      'Banked specimens are a backbone of IVD development (analytical validation, clinical performance, CDx bridging). ISO 20387 specifies general requirements for biobanking competence and consistent operation (collection, processing, storage, traceability, quality). For evidence to be defensible, samples need documented chain-of-custody/provenance, appropriate informed consent for the intended research/regulatory use (intersecting GDPR/HIPAA), characterization (the reference/clinical truth), and demonstrated representativeness of the intended-use population (to avoid spectrum bias). IVDR clinical performance studies have specific provisions for the use of left-over samples; FDA likewise accepts banked-sample studies when representative and pre-specified.',
    keyPoints: [
      'ISO 20387 = biobanking competence/quality requirements.',
      'Need provenance/chain-of-custody, consent, characterization, representativeness.',
      'Left-over-sample studies have specific IVDR provisions; FDA accepts if representative.',
      'Intersects GDPR/HIPAA consent for secondary use.',
    ],
    citations: [
      { label: 'ISO 20387:2018 (biobanking)', source: 'ISO' },
      { label: 'IVDR Annex XIII / Art. 57-77 (use of left-over samples)', source: 'EU' },
    ],
    related: ['sci.ivd.clinical-study-design', 'legal.ivd.data-privacy', 'fda.ivd.cdx'],
    tags: ['biobanking', 'iso-20387', 'provenance', 'consent', 'left-over-samples'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.micro.ast-breakpoints',
    domain: 'scientific',
    topic: 'microbiology',
    title: 'Antimicrobial susceptibility testing (AST) and breakpoints (CLSI M100 / EUCAST)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'AST determines whether an organism is susceptible/resistant via MIC or zone diameter interpreted against breakpoints set by CLSI (M100, US) or EUCAST (Europe); breakpoints evolve, and FDA-recognized breakpoints (STIC) govern US device labeling.',
    detail:
      'Antimicrobial susceptibility testing reports an organism\'s likely response to antimicrobials, expressed as minimum inhibitory concentration (MIC) or disk-diffusion zone diameter, categorized (Susceptible / Susceptible-dose-dependent / Intermediate / Resistant) against interpretive breakpoints. CLSI M100 (US) and EUCAST (Europe) publish and regularly update breakpoints based on PK/PD, microbiological, and clinical data; a notable wrinkle is that breakpoints change over time, creating a gap between FDA-cleared device labeling and current CLSI/EUCAST values. The US addressed this via FDA-recognized breakpoints and the "Susceptibility Test Interpretive Criteria" (STIC) website and the recognition of CLSI breakpoints, letting labs use updated criteria. AST device validation must address organism/antimicrobial ranges, QC strains, reproducibility, and essential/categorical agreement vs a reference method.',
    keyPoints: [
      'AST = MIC or zone interpreted via breakpoints (S/SDD/I/R).',
      'CLSI M100 (US) and EUCAST (EU) set + frequently update breakpoints.',
      'FDA-recognized breakpoints/STIC bridge device-label vs current criteria.',
      'Validation: organism/drug ranges, QC strains, essential/categorical agreement.',
    ],
    pitfalls: [
      'Using outdated on-label breakpoints when CLSI/EUCAST have changed.',
    ],
    citations: [
      { label: 'CLSI M100 (AST breakpoints)', source: 'CLSI' },
      { label: 'EUCAST breakpoint tables', source: 'EUCAST' },
      { label: 'FDA Susceptibility Test Interpretive Criteria (STIC)', source: 'FDA' },
    ],
    related: ['sci.micro.syndromic-panels', 'sci.ivd.method-comparison', 'fda.ivd.special-controls-and-standards'],
    tags: ['ast', 'mic', 'breakpoints', 'clsi-m100', 'eucast', 'microbiology'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.micro.syndromic-panels',
    domain: 'scientific',
    topic: 'microbiology',
    title: 'Syndromic multiplex molecular panels — respiratory/GI/meningitis/sepsis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Multiplex PCR syndromic panels simultaneously detect many pathogens from one specimen; their validity hinges on per-target sensitivity/specificity, the high false-positive risk of low-prevalence targets, and antimicrobial-stewardship-aware interpretation.',
    detail:
      'Syndromic panels (e.g., respiratory, gastrointestinal, meningitis/encephalitis, blood-culture-identification with resistance markers) test for dozens of targets at once, improving speed and breadth. Their validation and interpretation are dominated by two issues: per-target performance must be established individually (sensitivity, specificity, LoD per organism), and — because predictive value depends on prevalence — even a specific assay yields many false positives for very-low-prevalence targets, so results require clinical correlation (colonization vs infection) and stewardship-aware use to avoid over-treatment. Detection of resistance genes (e.g., mecA, KPC, CTX-M) indicates genotype, not phenotypic susceptibility, so it complements but does not replace AST. FDA clearance typically attaches per-target performance and interpretive limitations in labeling.',
    keyPoints: [
      'Multiplex panels detect many pathogens from one specimen (fast, broad).',
      'Validate per-target performance (sens/spec/LoD per organism).',
      'Low-prevalence targets ⇒ many false positives → clinical correlation/stewardship.',
      'Resistance-gene detection ≠ phenotypic AST (genotype only).',
    ],
    citations: [
      { label: 'IDSA diagnostics guidance; FDA syndromic panel clearances', source: 'IDSA/FDA' },
    ],
    related: ['sci.micro.ast-breakpoints', 'sci.ivd.clinical-performance-metrics', 'bio.procalcitonin'],
    tags: ['syndromic-panel', 'multiplex-pcr', 'stewardship', 'resistance-genes', 'microbiology'],
    lastReviewed: '2026-06-09',
  },
];
