/**
 * CNS / neuroscience biomarker scientific-validity corpus.
 *
 * Extends the oncology biomarker corpus into central-nervous-system indications —
 * the largest therapeutic-area whitespace for the platform. Each entry documents
 * the analyte → clinical-condition association with established intended uses,
 * the guideline/consensus backing, and the assay/interpretation specifics that
 * make scientific validity intended-use specific (the same lesson as oncology:
 * a marker's validity depends on context, cut-off, and matrix).
 *
 * Coverage: Alzheimer's disease (amyloid + tau), neuroaxonal injury (NfL),
 * astrocytic injury (GFAP), multiple sclerosis (CSF oligoclonal bands),
 * Parkinson's / synucleinopathies (α-synuclein seed amplification), and
 * Huntington's disease (HTT CAG repeat).
 */

import type { KnowledgeEntry } from '../types';

export const BIOMARKER_VALIDITY_CNS_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'bio.cns.amyloid',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Amyloid-β (CSF Aβ42/Aβ40, amyloid PET, plasma) — Alzheimer pathology',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Reduced CSF Aβ42 (and the Aβ42/Aβ40 ratio) and positive amyloid PET establish cerebral amyloid pathology — a core AT(N)/2024 AA criterion and an entry requirement for anti-amyloid therapy; plasma Aβ42/40 is an emerging, less-invasive screen.',
    detail:
      'Amyloid-β pathology is the "A" of the AT(N) framework and the revised 2024 Alzheimer Association (AA) biological criteria. It is established by low CSF Aβ42 — better, a low Aβ42/Aβ40 ratio, which corrects for inter-individual total-Aβ production — or by a positive amyloid PET scan (the Aβ42/Aβ40 ratio tracks amyloid PET closely). Scientific validity is strong and guideline-anchored, and amyloid confirmation is a labeled requirement before initiating anti-amyloid monoclonal antibodies (e.g. lecanemab, donanemab), making an amyloid assay a de facto companion/complementary diagnostic for that drug class. Plasma Aβ42/40 has lower fold-change and demands tightly controlled pre-analytics and platform-specific cut-offs, so it is positioned as a triage/screening step that reflexes to CSF or PET confirmation. Cut-offs are assay- and platform-specific and must not be transferred between methods — the same harmonization problem seen with PD-L1 in oncology.',
    keyPoints: [
      'Low CSF Aβ42/Aβ40 or positive amyloid PET defines amyloid ("A") pathology.',
      'Amyloid confirmation is required before anti-amyloid mAb therapy (CDx-like role).',
      'Plasma Aβ42/40 is a triage screen — confirm positives with CSF/PET.',
      'Cut-offs are assay/platform specific; the ratio outperforms Aβ42 alone.',
    ],
    pitfalls: [
      'Transferring a cut-off across platforms/matrices (CSF vs plasma vs PET).',
      'Using Aβ42 alone instead of the Aβ42/Aβ40 ratio.',
      'Ignoring plasma pre-analytic sensitivity (handling, tube type) — a major error source.',
    ],
    citations: [
      { label: 'Alzheimer Association revised diagnostic criteria (2024)', source: 'AA' },
      { label: 'AT(N) biomarker framework (NIA-AA Research Framework)', source: 'NIA-AA' },
      { label: 'Anti-amyloid mAb labels — amyloid-confirmation requirement', source: 'FDA' },
    ],
    related: ['bio.cns.ptau', 'bio.cns.nfl', 'fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['amyloid', 'abeta', 'csf', 'amyloid-pet', 'plasma', 'alzheimer', 'cns', 'atn'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.ptau',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Phosphorylated tau (p-tau181, p-tau217) — Alzheimer tau pathology',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Phosphorylated tau species (p-tau181 and, with higher accuracy, p-tau217) in CSF and plasma track AD tau pathology and amyloid status; plasma p-tau217 now approaches CSF/PET accuracy for identifying AD pathology.',
    detail:
      'Phosphorylated tau is the "T" of AT(N). CSF p-tau181 is long-established; the field has converged on p-tau217 (CSF and plasma) as the strongest fluid marker, with plasma p-tau217 showing accuracy approaching CSF and amyloid PET for detecting AD pathology and predicting progression in symptomatic populations. Scientific validity is intended-use specific: p-tau performs best as a rule-in marker for AD pathology in cognitively impaired patients, and is not validated for population screening of asymptomatic individuals. As with amyloid, results are assay/platform specific (different immunoassay and mass-spec methods report different absolute values), so cut-offs require local/clinical validation and cannot be transferred between assays.',
    keyPoints: [
      'p-tau217 > p-tau181 for accuracy; plasma p-tau217 approaches CSF/PET.',
      'Best validated as rule-in for AD pathology in symptomatic patients.',
      'Not validated for asymptomatic population screening.',
      'Assay/platform-specific cut-offs — require local validation.',
    ],
    pitfalls: [
      'Applying symptomatic-population cut-offs to asymptomatic screening.',
      'Comparing absolute p-tau values across different assays/platforms.',
    ],
    citations: [
      { label: 'AT(N) framework — tau (T) component', source: 'NIA-AA' },
      { label: 'Alzheimer Association revised criteria (2024) — core biomarkers', source: 'AA' },
    ],
    related: ['bio.cns.amyloid', 'bio.cns.nfl', 'sci.ivd.scientific-validity'],
    tags: ['p-tau', 'p-tau217', 'p-tau181', 'tau', 'csf', 'plasma', 'alzheimer', 'cns', 'atn'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.nfl',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Neurofilament light chain (NfL) — neuroaxonal injury (non-specific)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'NfL (CSF and blood) is a sensitive but disease-non-specific marker of neuroaxonal damage, used as a pharmacodynamic / disease-activity and prognostic biomarker across MS, ALS, and neurodegeneration; it rises with age and must be age-adjusted.',
    detail:
      'Neurofilament light chain is released on axonal injury and is measurable in CSF and, via high-sensitivity assays (e.g. Simoa), in blood. Its scientific validity is as a sensitive marker of neuroaxonal damage — but it is explicitly non-specific to any single disease, rising in MS relapses, ALS, traumatic brain injury, and neurodegeneration. That shapes its intended use: NfL is strong as a pharmacodynamic / treatment-response and prognostic biomarker (e.g. tracking disease activity in MS, prognosis in ALS) rather than as a stand-alone diagnostic. NfL increases with normal aging and with renal function and body mass, so interpretation requires age-adjusted reference ranges and awareness of confounders. Cut-offs are assay-specific.',
    keyPoints: [
      'Sensitive marker of neuroaxonal injury — but disease-non-specific.',
      'Best used as pharmacodynamic / disease-activity / prognostic marker, not diagnosis.',
      'Rises with age (and renal function/BMI) — age-adjusted ranges required.',
      'Assay-specific cut-offs (Simoa and others differ).',
    ],
    pitfalls: [
      'Treating an elevated NfL as disease-specific or diagnostic.',
      'Omitting age adjustment and renal/BMI confounders.',
    ],
    citations: [
      { label: 'Consensus reviews on NfL as a neuro biomarker', source: 'consensus' },
      { label: 'NfL in MS disease-activity monitoring', source: 'literature' },
    ],
    related: ['bio.cns.gfap', 'bio.cns.ocb', 'sci.ivd.scientific-validity'],
    tags: ['nfl', 'neurofilament', 'csf', 'plasma', 'ms', 'als', 'neurodegeneration', 'cns', 'pharmacodynamic'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.gfap',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'GFAP — astrocytic injury / reactive astrogliosis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Glial fibrillary acidic protein (plasma/serum) marks reactive astrogliosis; it contributes to acute TBI evaluation (cleared in a multi-marker rule-out) and is an emerging astrocytic marker in Alzheimer and other neurodegeneration.',
    detail:
      'GFAP is an astrocytic cytoskeletal protein released on astroglial injury. In acute traumatic brain injury it is an established component of a cleared blood test (with UCH-L1) used to help rule out the need for CT imaging in mild TBI — an intended use distinct from its emerging role in chronic neurodegeneration, where elevated plasma GFAP associates with amyloid pathology and AD progression. As always, scientific validity is intended-use and matrix specific: the TBI rule-out role and the neurodegeneration disease-activity role rely on different cut-offs, time windows, and platforms. GFAP is frequently interpreted alongside NfL (astrocytic vs axonal injury) to add specificity.',
    keyPoints: [
      'Marks reactive astrogliosis (astrocytic injury).',
      'Part of a cleared blood rule-out (with UCH-L1) in acute mild TBI.',
      'Emerging plasma marker associated with amyloid/AD progression.',
      'Often paired with NfL (astrocytic + axonal) for specificity.',
    ],
    pitfalls: [
      'Conflating the acute-TBI rule-out cut-off with neurodegeneration use.',
      'Interpreting GFAP without a complementary axonal marker.',
    ],
    citations: [
      { label: 'FDA-cleared TBI blood test (GFAP + UCH-L1)', source: 'FDA' },
      { label: 'GFAP in Alzheimer / neurodegeneration literature', source: 'literature' },
    ],
    related: ['bio.cns.nfl', 'bio.cns.amyloid', 'sci.ivd.scientific-validity'],
    tags: ['gfap', 'astrocyte', 'tbi', 'uch-l1', 'plasma', 'alzheimer', 'cns'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.ocb',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'CSF oligoclonal bands / kappa free light chains — multiple sclerosis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'CSF-restricted oligoclonal bands (IgG not present in serum) evidence intrathecal immunoglobulin synthesis and substitute for dissemination-in-time in the McDonald criteria for MS; CSF kappa free light chains are a quantitative, automatable alternative.',
    detail:
      'Oligoclonal bands (OCB) are detected by paired CSF/serum isoelectric focusing with immunofixation; two or more CSF-restricted IgG bands indicate intrathecal synthesis. Under the McDonald diagnostic criteria, CSF-specific OCB can substitute for the dissemination-in-time requirement, giving them a defined, guideline-anchored role in MS diagnosis — a clear example of intended-use-specific scientific validity. The required method is the paired CSF/serum comparison (a serum-matched band is not MS-specific). CSF kappa free light chain (KFLC) index is an emerging quantitative, less operator-dependent alternative with comparable performance. Neither is a stand-alone diagnostic — they are interpreted within the full clinical/MRI criteria.',
    keyPoints: [
      'CSF-restricted OCB (≥2 bands not in serum) = intrathecal IgG synthesis.',
      'Can substitute for dissemination-in-time in the McDonald MS criteria.',
      'Requires paired CSF/serum isoelectric focusing — serum-matched bands do not count.',
      'CSF kappa free light chain index is a quantitative alternative.',
    ],
    pitfalls: [
      'Reading CSF bands without the paired serum comparison.',
      'Treating OCB as a stand-alone MS diagnosis outside the McDonald criteria.',
    ],
    citations: [
      { label: 'McDonald criteria for diagnosis of multiple sclerosis', source: 'consensus' },
      { label: 'Consensus on CSF OCB methodology (paired IEF)', source: 'consensus' },
    ],
    related: ['bio.cns.nfl', 'sci.ivd.scientific-validity'],
    tags: ['oligoclonal-bands', 'ocb', 'kflc', 'csf', 'multiple-sclerosis', 'mcdonald', 'cns'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.asyn-saa',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'α-synuclein seed amplification assay (SAA) — Parkinson / synucleinopathy',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'CSF α-synuclein seed amplification assays (RT-QuIC-type) detect misfolded α-synuclein seeds with high sensitivity/specificity for Lewy-body synucleinopathies, enabling biologically defined Parkinson disease and trial enrichment.',
    detail:
      'α-Synuclein seed amplification assays (SAA; RT-QuIC / PMCA-type) exploit template-directed misfolding to amplify pathological α-synuclein seeds from CSF, yielding a qualitative positive/negative with high reported sensitivity and specificity for Lewy-body synucleinopathies (Parkinson disease, dementia with Lewy bodies). This underpins the shift to a biologically defined / staging approach to Parkinson disease and is increasingly used for clinical-trial enrichment (selecting seed-positive participants). Scientific validity is strongest as a rule-in of synuclein pathology; quantitative kinetic parameters are still being standardized, performance varies by clinical subtype (e.g. lower in some genetic/LRRK2 cases and pure autonomic phenotypes), and assay protocols are not yet fully harmonized across laboratories.',
    keyPoints: [
      'Detects misfolded α-synuclein seeds in CSF (RT-QuIC/PMCA-type).',
      'High sensitivity/specificity for Lewy-body synucleinopathies (PD, DLB).',
      'Enables biologically defined PD and trial enrichment (seed-positive selection).',
      'Performance varies by subtype (e.g. LRRK2); protocols not yet fully harmonized.',
    ],
    pitfalls: [
      'Assuming uniform sensitivity across genetic/clinical subtypes.',
      'Comparing kinetic parameters across non-harmonized assay protocols.',
    ],
    citations: [
      { label: 'α-synuclein SAA validation studies (CSF)', source: 'literature' },
      { label: 'Biological staging proposals for Parkinson disease', source: 'consensus' },
    ],
    related: ['bio.cns.nfl', 'sci.ivd.scientific-validity'],
    tags: ['alpha-synuclein', 'saa', 'rt-quic', 'parkinson', 'dlb', 'csf', 'cns', 'trial-enrichment'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cns.htt-cag',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'HTT CAG repeat expansion — Huntington disease',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'A CAG trinucleotide-repeat expansion in HTT is the deterministic genetic cause of Huntington disease; repeat length confirms diagnosis, informs penetrance (intermediate/reduced-penetrance alleles), and defines eligibility for HTT-lowering trials.',
    detail:
      'Huntington disease is autosomal-dominant and deterministic: a CAG repeat expansion in exon 1 of HTT. Repeat length is the marker — ≥40 is fully penetrant, 36–39 is reduced penetrance, 27–35 is intermediate (not disease-causing but unstable on transmission), and ≤26 is normal. Scientific validity for diagnosis is definitive, and the test carries well-defined intended uses across diagnostic confirmation, predictive (pre-symptomatic) testing (which mandates genetic-counseling protocols), and — increasingly — trial eligibility and stratification for HTT-lowering therapeutics, giving it a companion-diagnostic dimension. Accurate sizing of the expanded allele (and detection of large expansions) requires validated methodology; CAG length correlates inversely with age at onset but does not precisely predict it at the individual level.',
    keyPoints: [
      'CAG expansion in HTT is the deterministic cause; repeat length is the marker.',
      'Penetrance by length: ≥40 full, 36–39 reduced, 27–35 intermediate, ≤26 normal.',
      'Intended uses: diagnostic, predictive (counseling-gated), and trial eligibility (CDx-like).',
      'Length correlates inversely with onset age but is not individually predictive.',
    ],
    pitfalls: [
      'Predicting individual age-at-onset from CAG length.',
      'Predictive testing without the required genetic-counseling protocol.',
      'Mis-sizing large expansions with non-validated methodology.',
    ],
    citations: [
      { label: 'Huntington disease genetic-testing guidelines', source: 'consensus' },
      { label: 'HTT-lowering therapeutic trials — genotype eligibility', source: 'literature' },
    ],
    related: ['fda.ivd.cdx', 'sci.ivd.scientific-validity'],
    tags: ['htt', 'cag-repeat', 'huntington', 'genetic', 'predictive-testing', 'cdx', 'cns'],
    lastReviewed: '2026-06-12',
  },
];
