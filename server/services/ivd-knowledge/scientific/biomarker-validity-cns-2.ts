/**
 * CNS / neuroscience biomarker corpus — wave 2.
 *
 * Extends biomarker-validity-cns.ts toward oncology-corpus parity with genetic
 * risk/CDx markers, molecular imaging, antibody-defined disease, prion
 * diagnostics, the neurodegeneration ("N") fluid marker, and CNS
 * pharmacogenomics. Same KnowledgeEntry schema and citation discipline.
 *
 * Coverage: APOE ε4 (AD risk + anti-amyloid ARIA stratification), dopamine-
 * transporter imaging (parkinsonian syndromes), AQP4-IgG / MOG-IgG
 * (NMOSD / MOGAD vs MS), CSF 14-3-3 + RT-QuIC (Creutzfeldt-Jakob), CSF total
 * tau (neuronal injury), and CYP2D6 / CYP2C19 pharmacogenomics for psychiatry.
 */

import type { KnowledgeEntry } from '../types';

export const BIOMARKER_VALIDITY_CNS_KNOWLEDGE_2: KnowledgeEntry[] = [
  {
    id: 'bio.cns.apoe',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'APOE ε4 genotype — Alzheimer risk and anti-amyloid ARIA stratification',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'APOE ε4 is the strongest common genetic risk factor for late-onset Alzheimer disease (dose-dependent across ε4 alleles) and now carries a treatment-safety role: ε4 homozygotes have markedly higher ARIA risk on anti-amyloid monoclonal antibodies, making APOE genotyping a labeled risk-stratification step.',
    detail:
      'Apolipoprotein E ε4 is a susceptibility (not deterministic) allele: one ε4 copy raises late-onset AD risk several-fold and two copies substantially more, with earlier average onset, while ε2 is protective. Its scientific validity as a risk marker is well established but probabilistic — it is not diagnostic and historically was not actionable. That changed with anti-amyloid monoclonal antibodies (lecanemab, donanemab): ε4 homozygotes have the highest incidence of amyloid-related imaging abnormalities (ARIA-E/H), so labeling recommends APOE genotyping before treatment to inform the benefit-risk discussion and monitoring intensity — a genuine companion-diagnostic-like role. Predictive/risk genotyping requires appropriate counseling, and results must be interpreted as risk modification, never as a diagnosis.',
    keyPoints: [
      'Strongest common genetic risk factor for late-onset AD (ε4 dose-dependent; ε2 protective).',
      'Risk marker — susceptibility, not deterministic or diagnostic.',
      'ε4 homozygotes have the highest ARIA risk on anti-amyloid mAbs.',
      'Genotyping is a labeled pre-treatment risk-stratification step (CDx-like).',
    ],
    pitfalls: [
      'Reporting APOE ε4 as a diagnosis rather than a risk factor.',
      'Omitting counseling for predictive/risk genotyping.',
    ],
    citations: [
      { label: 'Anti-amyloid mAb labels — APOE genotyping / ARIA risk', source: 'FDA' },
      { label: 'APOE and Alzheimer risk consensus literature', source: 'literature' },
    ],
    related: ['bio.cns.amyloid', 'bio.cns.ptau', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['apoe', 'apoe4', 'genetic-risk', 'alzheimer', 'aria', 'anti-amyloid', 'cdx', 'cns'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.dat-spect',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Dopamine-transporter imaging (DaT-SPECT, ioflupane) — parkinsonian syndromes',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Ioflupane (¹²³I) SPECT imaging of striatal dopamine-transporter density helps distinguish neurodegenerative parkinsonism (Parkinson disease, atypical parkinsonism) from conditions with intact dopaminergic neurons (essential tremor, drug-induced or psychogenic parkinsonism).',
    detail:
      'DaT-SPECT with ioflupane (¹²³I) is an FDA-approved molecular-imaging biomarker of presynaptic striatal dopamine-transporter density. Its established intended use is differential: a reduced (abnormal) scan supports a neurodegenerative parkinsonian syndrome (PD, MSA, PSP), while a normal scan supports a non-degenerative cause such as essential tremor, drug-induced, or psychogenic parkinsonism. Scientific validity is for this differential question — it does NOT distinguish PD from atypical parkinsonian syndromes (all reduce DaT), and it is not a stand-alone diagnosis of PD. Interpretation is qualitative/semi-quantitative and can be confounded by dopaminergic and other medications, which must be accounted for.',
    keyPoints: [
      'Images presynaptic striatal dopamine-transporter density (ioflupane ¹²³I SPECT).',
      'Differentiates neurodegenerative parkinsonism from essential tremor / drug-induced / psychogenic.',
      'Does NOT distinguish PD from atypical parkinsonism (MSA/PSP also reduce DaT).',
      'Confounded by certain medications; not a stand-alone PD diagnosis.',
    ],
    pitfalls: [
      'Using DaT-SPECT to claim a specific PD vs atypical-parkinsonism diagnosis.',
      'Ignoring medication confounders on uptake.',
    ],
    citations: [
      { label: 'Ioflupane (¹²³I) DaT-SPECT FDA labeling / indication', source: 'FDA' },
      { label: 'Movement-disorder guidance on DaT imaging', source: 'consensus' },
    ],
    related: ['bio.cns.asyn-saa', 'sci.ivd.scientific-validity'],
    tags: ['dat-spect', 'datscan', 'ioflupane', 'dopamine-transporter', 'parkinson', 'essential-tremor', 'imaging', 'cns'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.aqp4-mog',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'AQP4-IgG and MOG-IgG — NMOSD / MOGAD differentiation from MS',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Serum AQP4-IgG (cell-based assay) defines neuromyelitis optica spectrum disorder, and MOG-IgG defines MOGAD — distinct antibody-mediated CNS diseases that must be separated from multiple sclerosis because their treatments differ (and some MS therapies worsen NMOSD).',
    detail:
      'Aquaporin-4 IgG is a highly specific serum biomarker that defines NMOSD under the diagnostic criteria; MOG-IgG defines MOG-antibody-associated disease (MOGAD). The clinically critical point — and a clear example of intended-use-specific scientific validity — is that NMOSD and MOGAD are biologically and therapeutically distinct from MS: several MS disease-modifying therapies are ineffective or harmful in NMOSD, and NMOSD has its own approved (complement/IL-6/CD19-directed) therapies, giving these antibodies a treatment-defining role. The required method is a cell-based assay (CBA); older ELISA/tissue methods have lower specificity and can produce misleading low-positive results, so titer and assay format must be reported and interpreted in clinical context (serum preferred over CSF for AQP4).',
    keyPoints: [
      'AQP4-IgG defines NMOSD; MOG-IgG defines MOGAD — distinct from MS.',
      'Treatment-defining: some MS therapies are ineffective/harmful in NMOSD.',
      'Cell-based assay (CBA) is the required method; ELISA/tissue are less specific.',
      'Report assay format and titer; interpret low-positives cautiously.',
    ],
    pitfalls: [
      'Relying on non-CBA methods (false/low positives).',
      'Treating antibody-positive disease as MS (wrong, potentially harmful therapy).',
    ],
    citations: [
      { label: 'International consensus diagnostic criteria for NMOSD', source: 'consensus' },
      { label: 'MOGAD diagnostic criteria', source: 'consensus' },
    ],
    related: ['bio.cns.ocb', 'bio.cns.nfl', 'sci.ivd.scientific-validity'],
    tags: ['aqp4', 'mog', 'nmosd', 'mogad', 'multiple-sclerosis', 'cell-based-assay', 'cns', 'autoimmune'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.cjd-rtquic',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'CSF RT-QuIC and 14-3-3 — Creutzfeldt-Jakob disease (prion)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'CSF real-time quaking-induced conversion (RT-QuIC) detects prion-seeding activity with high specificity for Creutzfeldt-Jakob disease and is now a core diagnostic criterion; CSF 14-3-3 is a sensitive but less specific marker of rapid neuronal injury.',
    detail:
      'RT-QuIC amplifies misfolded prion protein seeds from CSF (and other matrices), yielding a highly specific positive for sporadic CJD; it has been incorporated into updated diagnostic criteria as a core test and largely supersedes older surrogate markers. CSF 14-3-3 protein, by contrast, is a marker of rapid neuronal destruction — sensitive in CJD but non-specific (also elevated in stroke, encephalitis, and other acute injuries), so it supports rather than confirms the diagnosis. The intended-use distinction matters: RT-QuIC is a rule-in (high specificity), 14-3-3 is supportive. As with other seed-amplification assays, RT-QuIC performance depends on protocol standardization and is qualitative.',
    keyPoints: [
      'RT-QuIC detects prion-seeding activity — high specificity, a core CJD criterion.',
      'CSF 14-3-3 is sensitive but non-specific (rapid neuronal injury) — supportive only.',
      'RT-QuIC is rule-in; do not rely on 14-3-3 alone to confirm CJD.',
      'RT-QuIC is qualitative and protocol-dependent.',
    ],
    pitfalls: [
      'Treating a positive 14-3-3 as confirmatory of CJD.',
      'Comparing RT-QuIC results across non-standardized protocols.',
    ],
    citations: [
      { label: 'Updated diagnostic criteria for sporadic CJD (RT-QuIC)', source: 'consensus' },
      { label: 'CSF 14-3-3 performance literature', source: 'literature' },
    ],
    related: ['bio.cns.asyn-saa', 'bio.cns.ttau', 'sci.ivd.scientific-validity'],
    tags: ['rt-quic', '14-3-3', 'prion', 'cjd', 'csf', 'seed-amplification', 'cns'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.ttau',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'CSF total tau (t-tau) — neuronal injury / neurodegeneration ("N")',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'CSF total tau reflects the intensity of neuronal injury and represents the neurodegeneration ("N") axis of the AT(N) framework; it is elevated in AD but is non-specific, rising markedly in acute injury and dramatically in Creutzfeldt-Jakob disease.',
    detail:
      'Total tau (t-tau), distinct from phosphorylated tau, is a marker of the degree of neuronal/axonal injury rather than of a specific pathology — the "N" of AT(N). In Alzheimer disease t-tau is moderately elevated and contributes to the biomarker profile, but its scientific validity is explicitly non-specific: very high t-tau occurs in acute neuronal injury (stroke, hypoxia) and extreme elevations are characteristic of Creutzfeldt-Jakob disease. Intended use is therefore as a measure of neurodegeneration intensity and a supportive component of a multi-marker CSF profile (with Aβ42/40 and p-tau), not a stand-alone diagnostic. Cut-offs are assay/platform specific and the t-tau/Aβ42 ratio is often used to improve AD discrimination.',
    keyPoints: [
      'Marks intensity of neuronal injury — the "N" axis of AT(N).',
      'Elevated in AD but non-specific; very high in acute injury and CJD.',
      'Best used within a multi-marker CSF profile, not alone.',
      'Assay/platform-specific cut-offs; t-tau/Aβ42 ratio aids AD discrimination.',
    ],
    pitfalls: [
      'Interpreting elevated t-tau as AD-specific.',
      'Ignoring extreme t-tau as a clue to CJD.',
    ],
    citations: [
      { label: 'AT(N) framework — neurodegeneration (N) component', source: 'NIA-AA' },
      { label: 'CSF t-tau in AD and CJD literature', source: 'literature' },
    ],
    related: ['bio.cns.amyloid', 'bio.cns.ptau', 'bio.cns.cjd-rtquic', 'sci.ivd.scientific-validity'],
    tags: ['t-tau', 'total-tau', 'csf', 'neurodegeneration', 'atn', 'alzheimer', 'cjd', 'cns'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.pgx-psychiatry',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'CYP2D6 / CYP2C19 pharmacogenomics — psychiatric drug dosing',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'CYP2D6 and CYP2C19 metabolizer status predicts exposure to many antidepressants and antipsychotics; CPIC/DPWG guidelines and several FDA labels translate genotype into dosing or drug-selection guidance (e.g. CYP2C19 for certain SSRIs/TCAs, CYP2D6 for atomoxetine and TCAs).',
    detail:
      'Cytochrome P450 2D6 and 2C19 are major metabolizers of CNS drugs. Genotype predicts a metabolizer phenotype (poor, intermediate, normal, rapid, ultrarapid), which alters drug exposure: poor metabolizers accumulate parent drug (toxicity risk) while ultrarapid metabolizers under-expose (efficacy risk). Scientific validity is strongest as an actionable pharmacogenomic biomarker where guidelines exist — CPIC and DPWG provide gene/drug dosing recommendations, and several FDA labels carry CYP2D6/CYP2C19 information (e.g. CYP2C19 for citalopram/escitalopram and certain TCAs; CYP2D6 for atomoxetine, pimozide, and TCAs). Intended use is dose optimization / drug selection, not diagnosis; the predicted phenotype must account for phenoconversion from interacting drugs, and gene/drug-pair actionability varies (not every psychiatric drug has actionable PGx).',
    keyPoints: [
      'CYP2D6 / CYP2C19 genotype → metabolizer phenotype → drug exposure.',
      'Actionable via CPIC/DPWG guidelines and several FDA labels.',
      'Examples: CYP2C19 (citalopram/escitalopram, some TCAs), CYP2D6 (atomoxetine, TCAs, pimozide).',
      'For dosing/selection — account for drug-interaction phenoconversion; actionability is gene/drug-pair specific.',
    ],
    pitfalls: [
      'Applying PGx dosing to a drug/gene pair without an actionable guideline.',
      'Ignoring phenoconversion from concomitant CYP inhibitors/inducers.',
    ],
    citations: [
      { label: 'CPIC guidelines (CYP2D6/CYP2C19 and CNS drugs)', source: 'CPIC' },
      { label: 'FDA pharmacogenomic labeling (table of biomarkers)', source: 'FDA' },
    ],
    related: ['sci.ivd.scientific-validity'],
    tags: ['pharmacogenomics', 'cyp2d6', 'cyp2c19', 'psychiatry', 'antidepressant', 'antipsychotic', 'cpic', 'cns'],
    lastReviewed: '2026-06-12',
  },
];
