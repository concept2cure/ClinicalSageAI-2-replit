/**
 * Clinical-area science corpus — transfusion/immunohematology, autoimmune
 * serology, allergy, and histocompatibility (HLA).
 *
 * Discipline-specific scientific-validity and methodology entries for IVD
 * classes that carry distinctive risk profiles and validation expectations
 * (several are the highest IVDR risk class).
 */

import type { KnowledgeEntry } from '../types';

export const CLINICAL_AREAS_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'sci.area.immunohematology',
    domain: 'scientific',
    topic: 'clinical-area',
    title: 'Transfusion / immunohematology — blood grouping and compatibility',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'ABO/RhD typing, antibody screening/identification, and crossmatching ensure transfusion compatibility; these are among the highest-risk IVDs (IVDR Class C/D, FDA often licensed biologics/Class III) given the lethal consequences of error.',
    detail:
      'Immunohematology assays determine blood group antigens (ABO, RhD, and extended phenotypes — Kell, Duffy, Kidd, MNS), screen and identify unexpected red-cell alloantibodies, and confirm donor–recipient compatibility (crossmatch). Because an incompatible transfusion can be rapidly fatal, these tests sit at the top of the risk hierarchy: under IVDR, blood grouping is Class C or D (Annex VIII Rules 1–2), and in the US many are licensed under the biologics framework (CBER) with stringent lot release. Validation emphasizes extremely high sensitivity/specificity for antigen detection, control of weak/variant antigens (weak D, ABO subgroups), and avoidance of false compatibility. Molecular blood-group genotyping increasingly supplements serology for complex cases and to resolve discrepancies.',
    keyPoints: [
      'ABO/RhD typing, antibody screen/ID, crossmatch ensure compatibility.',
      'Highest-risk tier: IVDR Class C/D (Rules 1–2); US often CBER-licensed.',
      'Weak/variant antigens (weak D, ABO subgroups) are key validation challenges.',
      'Molecular genotyping supplements serology for complex cases.',
    ],
    citations: [
      { label: 'AABB Standards; IVDR Annex VIII Rules 1–2', source: 'AABB / EU' },
      { label: 'FDA CBER blood-grouping reagent licensing', source: 'FDA' },
    ],
    related: ['eu.ivdr.classification-rules', 'bio.hiv', 'sci.ivd.scientific-validity'],
    tags: ['immunohematology', 'transfusion', 'abo', 'rhd', 'crossmatch', 'class-d'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.area.autoimmune',
    domain: 'scientific',
    topic: 'clinical-area',
    title: 'Autoimmune serology — ANA, ENA, and disease-specific autoantibodies',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Autoantibody tests (ANA by IIF/solid-phase, ENA, anti-dsDNA, ANCA, anti-CCP) support diagnosis of systemic autoimmune diseases; method (IIF vs multiplex solid-phase), titer/pattern interpretation, and pre-test probability dominate clinical validity.',
    detail:
      'Autoimmune serology aids diagnosis of conditions like SLE, rheumatoid arthritis, and vasculitis. The antinuclear antibody (ANA) test illustrates the methodology dependence: indirect immunofluorescence (IIF on HEp-2 cells) remains the reference method (reporting titer and staining pattern per ICAP nomenclature), while multiplex solid-phase immunoassays trade pattern information for throughput and may differ in sensitivity. Because these conditions have modest prevalence, a positive result has limited PPV outside an appropriate clinical context (ANA is positive in many healthy individuals at low titer), so guidelines stress pre-test probability and confirmatory specific autoantibodies (anti-dsDNA, anti-Sm, ENA panel; anti-CCP for RA; ANCA/PR3/MPO for vasculitis). Harmonization and units are ongoing challenges.',
    keyPoints: [
      'ANA by IIF (titer + ICAP pattern) is the reference; solid-phase trades pattern for throughput.',
      'Modest prevalence ⇒ low PPV without clinical context (low-titer ANA common in healthy).',
      'Confirm with specific autoantibodies (dsDNA/Sm/ENA; anti-CCP; ANCA).',
      'Harmonization/units remain a challenge.',
    ],
    citations: [
      { label: 'EULAR/ACR criteria; ICAP ANA pattern nomenclature', source: 'EULAR/ACR/ICAP' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.method.immunoassay-platforms'],
    tags: ['autoimmune', 'ana', 'ena', 'anca', 'anti-ccp', 'iif'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.area.allergy',
    domain: 'scientific',
    topic: 'clinical-area',
    title: 'Allergy diagnostics — specific IgE and component-resolved diagnostics',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Allergen-specific IgE assays quantify sensitization to allergens; clinical validity requires correlation with clinical history (sensitization ≠ allergy), and component-resolved diagnostics (molecular allergens) improve specificity and risk stratification.',
    detail:
      'Specific IgE (sIgE) immunoassays measure antibodies to whole allergen extracts or individual molecular components. The cardinal interpretive principle is that sensitization (detectable sIgE) is necessary but not sufficient for clinical allergy — many sensitized individuals are asymptomatic — so results must be interpreted against clinical history, with sIgE level correlating with (but not deterministic of) the probability of clinical reactivity. Component-resolved diagnostics (CRD) measure IgE to specific allergen molecules (e.g., Ara h 2 for peanut, Omega-5-gliadin), improving specificity, distinguishing genuine sensitization from cross-reactivity (e.g., CCD, pollen-food syndromes), and aiding risk stratification for severe reactions. Standardization to total-IgE and allergen calibration are method considerations.',
    keyPoints: [
      'sIgE measures sensitization — not equivalent to clinical allergy.',
      'Interpret with clinical history; level correlates with (not proves) reactivity.',
      'Component-resolved diagnostics improve specificity and risk stratification.',
      'Calibration/standardization (total IgE, allergen) are method considerations.',
    ],
    citations: [
      { label: 'EAACI molecular allergology / CRD guidance', source: 'EAACI' },
    ],
    related: ['sci.ivd.clinical-performance-metrics', 'sci.method.immunoassay-platforms'],
    tags: ['allergy', 'specific-ige', 'crd', 'sensitization'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'sci.area.hla',
    domain: 'scientific',
    topic: 'clinical-area',
    title: 'Histocompatibility (HLA) — transplant typing, antibody, and pharmacogenetic risk',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'HLA typing and anti-HLA antibody testing govern transplant compatibility and rejection risk; specific HLA alleles also predict severe drug hypersensitivity (e.g., HLA-B*57:01/abacavir, HLA-B*15:02/carbamazepine), a pharmacogenetic CDx-like use.',
    detail:
      'Human leukocyte antigen testing spans solid-organ/stem-cell transplant compatibility (high-resolution HLA typing by NGS/SSO/SSP, donor-specific antibody detection by single-antigen-bead Luminex, and crossmatching) and pharmacogenetic risk prediction. The latter is a validated predictive use: HLA-B*57:01 predicts abacavir hypersensitivity (screening is standard of care before prescribing), HLA-B*15:02 and HLA-A*31:01 predict carbamazepine-induced severe cutaneous adverse reactions, and HLA-B*58:01 predicts allopurinol hypersensitivity. These pharmacogenetic HLA tests function as companion/complementary diagnostics. Validation challenges include the extreme polymorphism of the HLA system (allele ambiguity, null alleles), antibody assay standardization (MFI thresholds), and high-resolution typing accuracy.',
    keyPoints: [
      'HLA typing + donor-specific antibody govern transplant compatibility/rejection.',
      'HLA pharmacogenetics predict severe drug hypersensitivity (B*57:01/abacavir, B*15:02/carbamazepine, B*58:01/allopurinol).',
      'Pharmacogenetic HLA tests act as companion/complementary diagnostics.',
      'Extreme HLA polymorphism + antibody MFI standardization are validation challenges.',
    ],
    citations: [
      { label: 'CPIC pharmacogenetic HLA guidelines; ASHI/EFI standards', source: 'CPIC / ASHI / EFI' },
      { label: 'FDA HLA-B*57:01 / B*15:02 labeling (drug labels)', source: 'FDA' },
    ],
    related: ['bio.brca', 'fda.ivd.cdx', 'sci.ngs.variant-classification', 'sci.ivd.scientific-validity'],
    tags: ['hla', 'transplant', 'pharmacogenetics', 'hypersensitivity', 'abacavir'],
    lastReviewed: '2026-06-09',
  },
];
