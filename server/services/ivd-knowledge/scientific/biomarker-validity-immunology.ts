/**
 * Immunology / inflammation biomarker scientific-validity corpus.
 *
 * Extends the oncology and CNS corpora into immune-mediated inflammatory disease
 * and rheumatology — the second large therapeutic-area expansion. Same
 * KnowledgeEntry schema and citation discipline: each entry documents the
 * analyte → clinical-condition association with established intended uses, the
 * guideline/consensus backing, and the assay/interpretation specifics that make
 * scientific validity intended-use specific.
 *
 * Coverage: TNF/biologic pharmacodynamics (anti-drug antibodies + trough levels),
 * anti-CCP (rheumatoid arthritis), ANCA (vasculitis), thiopurine pharmacogenomics
 * (TPMT/NUDT15), faecal calprotectin (IBD activity), HLA-B*27 (axial
 * spondyloarthritis), and the type-I interferon signature (SLE).
 */

import type { KnowledgeEntry } from '../types';

export const BIOMARKER_VALIDITY_IMMUNOLOGY_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'bio.imm.ada-tdm',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Anti-drug antibodies + drug trough levels — biologic therapeutic drug monitoring',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'For TNF inhibitors and other biologics, measuring serum drug trough concentration and anti-drug antibodies (ADAbs) explains loss of response and guides dose/switch decisions — reactive therapeutic drug monitoring is the evidence-supported use.',
    detail:
      'Immunogenicity is a defining challenge of biologic therapy: patients develop anti-drug antibodies that accelerate clearance and neutralise effect. Measuring the serum drug trough level together with ADAbs distinguishes the mechanisms of secondary loss of response — sub-therapeutic level with high ADAbs (immunogenic failure, favouring a switch within or across class) versus adequate level with no antibody (pharmacodynamic non-response, favouring a mechanism change). Scientific validity is strongest for *reactive* therapeutic drug monitoring (TDM) of anti-TNF agents (infliximab, adalimumab) in IBD and rheumatology; proactive TDM evidence is more mixed and indication-specific. Assays are method-dependent: drug-tolerant vs drug-sensitive ADAb assays disagree, and trough thresholds are assay- and drug-specific — results cannot be transferred between platforms.',
    keyPoints: [
      'Trough level + ADAbs explains secondary loss of response to biologics.',
      'Low level + high ADAbs → immunogenic failure (switch); adequate level + no ADAb → pharmacodynamic (change mechanism).',
      'Reactive TDM of anti-TNF agents is the best-supported use; proactive TDM is indication-specific.',
      'Drug-tolerant vs drug-sensitive ADAb assays and trough thresholds are assay/drug specific.',
    ],
    pitfalls: [
      'Comparing ADAb or trough results across different assay platforms.',
      'Over-extending proactive-TDM claims beyond the indications where they are supported.',
    ],
    citations: [
      { label: 'AGA / ECCO guidance on therapeutic drug monitoring of biologics', source: 'consensus' },
      { label: 'Immunogenicity assay methodology (drug-tolerant ADAb)', source: 'literature' },
    ],
    related: ['bio.imm.calprotectin', 'sci.ivd.scientific-validity'],
    tags: ['anti-drug-antibodies', 'tdm', 'anti-tnf', 'infliximab', 'adalimumab', 'immunogenicity', 'ibd', 'rheumatology', 'immunology'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.imm.anti-ccp',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Anti-CCP (ACPA) — rheumatoid arthritis diagnosis and prognosis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Anti-cyclic-citrullinated-peptide antibodies (ACPA) are highly specific for rheumatoid arthritis, are weighted in the ACR/EULAR classification criteria, and predict erosive, more severe disease — informing early aggressive treatment.',
    detail:
      'Antibodies to citrullinated peptides (anti-CCP / ACPA) are the most specific serological marker for rheumatoid arthritis (specificity ~95%), substantially more specific than rheumatoid factor, and are a weighted component of the 2010 ACR/EULAR RA classification criteria. Their scientific validity is twofold: diagnostic (rule-in for RA in early inflammatory arthritis) and prognostic (ACPA-positive disease is more erosive and progressive, supporting earlier, more aggressive DMARD therapy). They can predate clinical disease by years. Anti-CCP is typically interpreted alongside rheumatoid factor; titres are assay-specific, and a negative result does not exclude RA (seronegative RA exists). Generations of the assay (CCP2/CCP3) differ in performance.',
    keyPoints: [
      'Highly specific (~95%) for RA; more specific than rheumatoid factor.',
      'Weighted in the 2010 ACR/EULAR RA classification criteria.',
      'Prognostic: ACPA-positive disease is more erosive → earlier aggressive therapy.',
      'Seronegative RA exists; a negative result does not exclude the diagnosis.',
    ],
    pitfalls: [
      'Treating a negative anti-CCP as excluding RA.',
      'Comparing titres across assay generations (CCP2 vs CCP3) or platforms.',
    ],
    citations: [
      { label: '2010 ACR/EULAR rheumatoid arthritis classification criteria', source: 'ACR/EULAR' },
      { label: 'ACPA prognostic literature (erosive disease)', source: 'literature' },
    ],
    related: ['bio.imm.hla-b27', 'sci.ivd.scientific-validity'],
    tags: ['anti-ccp', 'acpa', 'rheumatoid-arthritis', 'rheumatoid-factor', 'acr-eular', 'immunology', 'autoimmune'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.imm.anca',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'ANCA (PR3 / MPO) — ANCA-associated vasculitis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Antineutrophil cytoplasmic antibodies to proteinase-3 (PR3) and myeloperoxidase (MPO), measured by antigen-specific immunoassay, support the diagnosis and sub-classification of ANCA-associated vasculitis and increasingly define treatment-relevant subgroups.',
    detail:
      'ANCA testing identifies antibodies against neutrophil granule antigens — PR3 (classically GPA) and MPO (classically MPA/EGPA). Per the revised international consensus, antigen-specific immunoassays for PR3- and MPO-ANCA are now the recommended primary method (replacing indirect immunofluorescence screening), with high diagnostic value in the appropriate clinical context. Scientific validity is for diagnosis and, increasingly, for biologically meaningful classification: PR3- vs MPO-ANCA distinguish subgroups that differ in genetics, relapse risk, and treatment response better than the older clinical syndromes. ANCA should be ordered on clinical suspicion (not as an indiscriminate screen, where positive predictive value falls), and serial titres have limited validity for predicting relapse on their own.',
    keyPoints: [
      'Antigen-specific PR3/MPO immunoassays are the recommended primary method (over IIF screening).',
      'PR3- vs MPO-ANCA define biologically distinct subgroups (genetics, relapse, treatment).',
      'Order on clinical suspicion — indiscriminate screening lowers positive predictive value.',
      'Serial titres alone have limited validity for relapse prediction.',
    ],
    pitfalls: [
      'Using ANCA as a broad screen, degrading positive predictive value.',
      'Relying on titre changes alone to drive treatment for relapse.',
    ],
    citations: [
      { label: 'Revised international consensus on ANCA testing (antigen-specific assays)', source: 'consensus' },
      { label: 'PR3 vs MPO subgroup genetics/outcomes literature', source: 'literature' },
    ],
    related: ['sci.ivd.scientific-validity'],
    tags: ['anca', 'pr3', 'mpo', 'vasculitis', 'gpa', 'mpa', 'immunology', 'autoimmune'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.imm.thiopurine-pgx',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'TPMT / NUDT15 pharmacogenomics — thiopurine dosing',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'TPMT and NUDT15 genotype (or TPMT enzyme activity) predicts the risk of life-threatening myelosuppression from thiopurines (azathioprine, mercaptopurine); pre-treatment testing with CPIC/FDA-labeled dose guidance is an established actionable pharmacogenomic use.',
    detail:
      'Thiopurines are widely used immunosuppressants (IBD, autoimmune disease, leukaemia). Patients with reduced-function TPMT or NUDT15 alleles accumulate toxic thioguanine nucleotides and are at high risk of severe, potentially fatal myelosuppression at standard doses. Pre-treatment determination of TPMT and NUDT15 status — by genotype or, for TPMT, enzyme activity — is a guideline-actionable pharmacogenomic biomarker: CPIC provides explicit genotype-to-dose recommendations, and FDA labeling references TPMT/NUDT15. NUDT15 variants are particularly important in East Asian and Hispanic populations, where TPMT variants are rarer — so testing both is required for equitable risk prediction. Intended use is dose individualisation / avoidance, not diagnosis; normal status reduces but does not eliminate the need for blood-count monitoring.',
    keyPoints: [
      'Reduced-function TPMT/NUDT15 → high risk of severe thiopurine myelosuppression.',
      'Pre-treatment testing with CPIC/FDA dose guidance is guideline-actionable.',
      'NUDT15 matters especially in East Asian/Hispanic populations (TPMT rarer there) — test both.',
      'Normal status reduces but does not remove the need for CBC monitoring.',
    ],
    pitfalls: [
      'Testing TPMT only and missing NUDT15 risk in non-European ancestries.',
      'Treating a normal result as removing the need for blood-count monitoring.',
    ],
    citations: [
      { label: 'CPIC guideline for thiopurines and TPMT/NUDT15', source: 'CPIC' },
      { label: 'FDA thiopurine labeling (TPMT/NUDT15)', source: 'FDA' },
    ],
    related: ['bio.imm.calprotectin', 'sci.ivd.scientific-validity'],
    tags: ['tpmt', 'nudt15', 'thiopurine', 'azathioprine', 'pharmacogenomics', 'cpic', 'immunology'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.imm.calprotectin',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Faecal calprotectin — intestinal inflammation / IBD activity',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Faecal calprotectin is a non-invasive marker of neutrophilic intestinal inflammation used to distinguish IBD from functional bowel disease, monitor disease activity, and predict relapse — reducing the need for endoscopy.',
    detail:
      'Calprotectin, released from neutrophils into the gut lumen during mucosal inflammation, is measured in stool as a quantitative marker of intestinal inflammation. Its established intended uses are: triage of patients with bowel symptoms (low values make inflammatory bowel disease unlikely and support a functional diagnosis without colonoscopy), monitoring of disease activity and mucosal healing in known IBD, and prediction of relapse (a rising level often precedes clinical flare). Scientific validity is for *inflammation*, not aetiology — it is elevated in infection, NSAID enteropathy, and malignancy too, so it is non-specific to IBD and interpreted in context. Cut-offs are assay-specific and intended-use specific (a triage cut-off differs from a remission-monitoring cut-off), and pre-analytical factors (sampling, extraction) materially affect results.',
    keyPoints: [
      'Non-invasive marker of neutrophilic intestinal inflammation.',
      'Uses: IBD-vs-functional triage, activity/mucosal-healing monitoring, relapse prediction.',
      'Marks inflammation, not cause — also raised by infection, NSAIDs, malignancy.',
      'Cut-offs are assay- and intended-use specific; pre-analytics matter.',
    ],
    pitfalls: [
      'Treating an elevated calprotectin as specific for IBD.',
      'Applying a triage cut-off to remission monitoring (or across assays).',
    ],
    citations: [
      { label: 'ECCO / NICE guidance on faecal calprotectin in IBD', source: 'consensus' },
      { label: 'Calprotectin relapse-prediction literature', source: 'literature' },
    ],
    related: ['bio.imm.ada-tdm', 'bio.imm.thiopurine-pgx', 'sci.ivd.scientific-validity'],
    tags: ['calprotectin', 'ibd', 'crohns', 'ulcerative-colitis', 'inflammation', 'immunology'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.imm.hla-b27',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'HLA-B*27 — axial spondyloarthritis',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'HLA-B*27 is strongly associated with axial spondyloarthritis (including ankylosing spondylitis) and is a weighted item in the ASAS classification criteria, but its interpretation depends heavily on pre-test probability and background population prevalence.',
    detail:
      'HLA-B*27 is the strongest genetic association in axial spondyloarthritis (axSpA); a large majority of ankylosing spondylitis patients carry it, and it is a weighted criterion in the ASAS classification for axSpA, contributing to diagnosis when imaging is equivocal. Its scientific validity is intrinsically Bayesian: because B*27 is also carried by a substantial minority of healthy people (population prevalence varies widely by ancestry), a positive result is informative only against an appropriate pre-test probability — it is a supportive classifier in patients with inflammatory back pain, not a stand-alone diagnostic or a population screen. Most B*27-positive individuals never develop disease. Testing is most useful where clinical features and imaging leave diagnostic uncertainty.',
    keyPoints: [
      'Strongest genetic association in axial spondyloarthritis; weighted in ASAS criteria.',
      'Interpretation is Bayesian — depends on pre-test probability and population prevalence.',
      'Supportive classifier in inflammatory back pain, not a stand-alone diagnostic or screen.',
      'Most B*27-positive people never develop disease.',
    ],
    pitfalls: [
      'Using HLA-B*27 as a population screen or stand-alone diagnostic.',
      'Ignoring ancestry-dependent background prevalence when interpreting a positive.',
    ],
    citations: [
      { label: 'ASAS classification criteria for axial spondyloarthritis', source: 'ASAS' },
      { label: 'HLA-B*27 epidemiology and pre-test-probability literature', source: 'literature' },
    ],
    related: ['bio.imm.anti-ccp', 'sci.ivd.scientific-validity'],
    tags: ['hla-b27', 'axial-spondyloarthritis', 'ankylosing-spondylitis', 'asas', 'hla', 'immunology'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.imm.ifn-signature',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Type-I interferon gene signature — SLE and interferonopathies',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'A type-I interferon-stimulated gene expression signature is elevated in a large fraction of systemic lupus erythematosus patients and defines an interferon-high subgroup relevant to disease activity and to anti-interferon (e.g. anifrolumab) therapy response.',
    detail:
      'Many systemic autoimmune diseases — notably SLE — show an upregulated type-I interferon (IFN) signature: a panel of interferon-stimulated genes whose expression marks IFN pathway activation. Its scientific validity is as a stratification and pharmacodynamic biomarker rather than a diagnostic: an IFN-high subgroup tends to have more active disease and is the rational target population for type-I-IFN-pathway therapeutics (the IFN receptor antibody anifrolumab), and the signature falls with effective pathway blockade (a pharmacodynamic readout). The signature is not specific to one disease (it appears across lupus, dermatomyositis, Sjögren, and the monogenic interferonopathies), gene-panel composition and scoring are not fully harmonised across assays, and it fluctuates with disease activity — so it is interpreted as a pathway/stratification marker, not a fixed trait.',
    keyPoints: [
      'Elevated type-I IFN gene signature marks an IFN-high subgroup of SLE.',
      'Stratification + pharmacodynamic biomarker for anti-type-I-IFN therapy (anifrolumab), not a diagnostic.',
      'Not disease-specific (lupus, dermatomyositis, Sjögren, interferonopathies).',
      'Gene-panel/scoring not fully harmonised; the signature fluctuates with activity.',
    ],
    pitfalls: [
      'Treating the IFN signature as diagnostic of a single disease.',
      'Comparing scores across non-harmonised gene panels/assays.',
    ],
    citations: [
      { label: 'Type-I interferon signature in SLE — stratification literature', source: 'literature' },
      { label: 'Anifrolumab programme — IFN pathway pharmacodynamics', source: 'literature' },
    ],
    related: ['sci.ivd.scientific-validity'],
    tags: ['interferon-signature', 'type-i-ifn', 'sle', 'lupus', 'anifrolumab', 'interferonopathy', 'immunology', 'autoimmune'],
    lastReviewed: '2026-06-12',
  },
];
