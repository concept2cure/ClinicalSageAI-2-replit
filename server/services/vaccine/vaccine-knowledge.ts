/**
 * Vaccine Development — Deterministic Regulatory-Science Knowledge Engine
 * ============================================================================
 *
 * Pure, closed-form, reproducible TypeScript. NO LLM, NO network, NO database,
 * Shared deterministic input and statistics helpers are reused. Every function
 * returns the same output for the same input. Reference thresholds and conventions come from
 * published regulatory guidance and the peer-reviewed correlates-of-protection
 * literature, with citations attached to every material output.
 *
 * Primary authorities encoded here:
 *   - FDA Guidance for Industry: "Clinical Data Needed to Support the Licensure
 *     of Seasonal Inactivated Influenza Vaccines" (2007) and the general
 *     vaccine clinical development paradigm (Phase 1-3, 21 CFR 601).
 *   - FDA "Development and Licensure of Vaccines to Prevent COVID-19" (2020).
 *   - 21 CFR Part 610 (General Biological Products Standards): potency (610.10),
 *     general safety (610.11), sterility (610.12), identity (610.14),
 *     constituent materials (610.15), adventitious agents.
 *   - 21 CFR Part 600/601 (BLA, establishment/product licensing).
 *   - ICH Q5A(R2) (Viral Safety), Q5B (rDNA expression construct analysis),
 *     Q5C (Stability of biotech products), Q5D (Cell substrates), Q5E
 *     (Comparability after manufacturing changes).
 *   - ICH Q6B (Specifications for biotech products).
 *   - WHO Technical Report Series (TRS) guidelines on nonclinical and clinical
 *     evaluation of vaccines (TRS 927 Annex 1 nonclinical; TRS 924 Annex 1
 *     clinical evaluation; TRS 978/987 lot release), WHO platform guidance.
 *   - EMA "Guideline on clinical evaluation of new vaccines"
 *     (EMEA/CHMP/VWP/164653/2005) and the EMA guideline on quality, nonclinical
 *     and clinical aspects of live recombinant viral vectored vaccines.
 *   - Correlates of protection literature: Plotkin SA & Gilbert PB,
 *     "Nomenclature for immune correlates of protection after vaccination",
 *     Clin Infect Dis 2012; Plotkin SA, "Correlates of protection induced by
 *     vaccination", Clin Vaccine Immunol 2010; Qin L et al., "A framework for
 *     assessing immunological correlates of protection in vaccine trials",
 *     J Infect Dis 2007.
 *
 * IMPORTANT: The numeric thresholds (e.g. influenza HAI titer 1:40, seroconversion
 * definitions, CBER lot-consistency equivalence margins) reflect widely cited
 * regulatory and scientific conventions. They are encoded so a downstream agent
 * can report them verbatim without recomputation. They are decision-support
 * heuristics, not a substitute for an Agency interaction.
 *
 * @module server/services/vaccine/vaccine-knowledge
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

import { ComputationRefusal, refuseUnlessStated } from '../ana-biostats/computation-engine';
import { booleanInputStates, statedNumber, statedOneOf } from '../immunogenicity/immunogenicity-reference';
import { normalQuantile } from '../stats/normal';

type BooleanState = boolean | 'not_stated';

/** Validate optional text through the same refusal boundary as required inputs. */
function validateTextInputs(params: object, fields: readonly string[]): void {
  const values = params as Record<string, unknown>;
  for (const field of fields) {
    const value = values[field];
    if (value == null) continue;
    refuseUnlessStated('vaccine worksheet', [{ field, value,
      ok: typeof value === 'string' && value.trim().length > 0, expected: 'non-empty text' }], 'assessed');
  }
}

function referenceNotes(framework: unknown): AdvisoryNote[] {
  return framework == null ? [{ severity: 'info', message:
    'No framework was stated; FDA citations are the engine reference default, not a recorded project jurisdiction.' }] : [];
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 0. Shared types
// ════════════════════════════════════════════════════════════════════════════

/** Vaccine technology platforms recognized by this engine. */
export type VaccinePlatform =
  | 'mrna'
  | 'viral_vector'
  | 'protein_subunit'
  | 'live_attenuated'
  | 'inactivated'
  | 'conjugate'
  | 'vlp'
  | 'dna';

/** Regulatory framework selector. */
export type RegFramework = 'fda' | 'ema' | 'who' | 'ich';

/** A single citation reference. */
export interface Citation {
  /** Short authority label, e.g. "21 CFR 610.10". */
  source: string;
  /** Human-readable title or description of the cited material. */
  title: string;
  /** What in the output this citation supports. */
  relevance: string;
}

/** Severity for advisory notes. */
export type NoteSeverity = 'info' | 'recommendation' | 'caution' | 'critical';

/** A structured advisory note attached to an assessment. */
export interface AdvisoryNote {
  severity: NoteSeverity;
  message: string;
}

/** Common envelope fields shared by every engine output. */
export interface EngineMeta {
  engine: string;
  deterministic: true;
  framework: RegFramework;
  citations: Citation[];
  notes: AdvisoryNote[];
}

// Helper: normalize a free-text platform string to a VaccinePlatform.
function normalizePlatform(raw: string): VaccinePlatform {
  refuseUnlessStated('vaccine worksheet', [{ field: 'platform', value: raw,
    ok: typeof raw === 'string' && raw.trim().length > 0, expected: 'a recognized vaccine platform' }], 'assessed');
  const value = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases: Array<[RegExp, VaccinePlatform]> = [
    [/\b(mrna|messenger rna|messengerrna|sarna|self amplifying|selfamplifying)\b/, 'mrna'],
    [/\b(viral vector|adenovirus|adenoviral|ad26|ad5|chad(?:ox[0-9]+)?|r?vsv|mva)\b/, 'viral_vector'],
    [/\b(conjugate|glycoconjugate|polysaccharide protein|polysaccharideprotein)\b/, 'conjugate'],
    [/\b(vlp|virus like particle|viruslikeparticle)\b/, 'vlp'],
    [/\b(subunit|protein|peptide)\b/, 'protein_subunit'],
    [/\b(live attenuated|liveattenuated|attenuated|live)\b/, 'live_attenuated'],
    [/\b(inactivated|killed|whole virion|wholevirion|split)\b/, 'inactivated'],
    [/\b(dna|plasmid)\b/, 'dna'],
  ];
  const match = aliases.find(([pattern]) => pattern.test(value));
  if (match) return match[1];
  throw new ComputationRefusal('invalid_input', 'platform is not recognized; state mrna, viral_vector, protein_subunit, live_attenuated, inactivated, conjugate, vlp or dna.', 'platform');
}

// Helper: normalize framework.
function normalizeFramework(raw: string | undefined): RegFramework {
  return statedOneOf('framework', typeof raw === 'string' ? raw.trim().toLowerCase() : raw,
    ['fda', 'ema', 'who', 'ich'] as const) ?? 'fda';
}

// Helper: human label for a platform.
function platformLabel(p: VaccinePlatform): string {
  switch (p) {
    case 'mrna':
      return 'mRNA (lipid-nanoparticle-formulated messenger RNA)';
    case 'viral_vector':
      return 'Viral vector (replication-deficient or replication-competent)';
    case 'protein_subunit':
      return 'Protein subunit / recombinant protein';
    case 'live_attenuated':
      return 'Live-attenuated';
    case 'inactivated':
      return 'Inactivated (whole-virion, split, or subunit-inactivated)';
    case 'conjugate':
      return 'Polysaccharide-protein conjugate';
    case 'vlp':
      return 'Virus-like particle (VLP)';
    case 'dna':
      return 'Plasmid DNA';
    default:
      return 'Unknown platform';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1. Citation registry
// ════════════════════════════════════════════════════════════════════════════
//
// A single curated registry so every function cites verbatim, consistent
// authority strings. Keyed by a stable internal id.

interface CitationEntry extends Citation {
  id: string;
}

const CITATION_REGISTRY: CitationEntry[] = [
  {
    id: 'cfr610_10',
    source: '21 CFR 610.10',
    title: 'General Biological Products Standards — Potency',
    relevance: 'Each lot of a biological product must be tested for potency by an in vitro or in vivo test, or both.',
  },
  {
    id: 'cfr610_11',
    source: '21 CFR 610.11',
    title: 'General Biological Products Standards — General safety test (and 610.11a egg-pathogen)',
    relevance: 'General safety testing requirements; many product-class exemptions now apply.',
  },
  {
    id: 'cfr610_12',
    source: '21 CFR 610.12',
    title: 'Sterility',
    relevance: 'Sterility testing requirements for each lot of final container material.',
  },
  {
    id: 'cfr610_13',
    source: '21 CFR 610.13',
    title: 'Purity (residual moisture, pyrogenicity)',
    relevance: 'Tests for purity including residual moisture and absence of pyrogenic substances.',
  },
  {
    id: 'cfr610_14',
    source: '21 CFR 610.14',
    title: 'Identity',
    relevance: 'Product identity testing by physical/chemical/serological means specific to the product.',
  },
  {
    id: 'cfr610_15',
    source: '21 CFR 610.15',
    title: 'Constituent materials — adjuvants, preservatives, extraneous protein',
    relevance: 'Limits and justification for adjuvants, preservatives, and added substances.',
  },
  {
    id: 'cfr600_3',
    source: '21 CFR 600.3',
    title: 'Definitions (biological product, trivalent, etc.)',
    relevance: 'Definitional baseline for biological products and constituents.',
  },
  {
    id: 'cfr601_2',
    source: '21 CFR 601.2',
    title: 'Applications for biologics licenses (BLA)',
    relevance: 'BLA content and the manufacturing/quality information required for licensure.',
  },
  {
    id: 'cfr601_25',
    source: '21 CFR 601.25',
    title: 'Review procedures / safety & effectiveness standard',
    relevance: 'Standard of safety and effectiveness for biological products.',
  },
  {
    id: 'ichq5a',
    source: 'ICH Q5A(R2)',
    title: 'Viral Safety Evaluation of Biotechnology Products Derived from Cell Lines of Human or Animal Origin',
    relevance: 'Viral clearance/inactivation evaluation; applies to cell-substrate and vector products.',
  },
  {
    id: 'ichq5b',
    source: 'ICH Q5B',
    title: 'Analysis of the Expression Construct in Cells Used for Production of r-DNA Derived Protein Products',
    relevance: 'Genetic stability and expression construct characterization.',
  },
  {
    id: 'ichq5c',
    source: 'ICH Q5C',
    title: 'Stability Testing of Biotechnological/Biological Products',
    relevance: 'Real-time and accelerated stability study design and shelf-life assignment.',
  },
  {
    id: 'ichq5d',
    source: 'ICH Q5D',
    title: 'Derivation and Characterisation of Cell Substrates Used for Production of Biotechnological/Biological Products',
    relevance: 'Master/working cell bank characterization and qualification.',
  },
  {
    id: 'ichq5e',
    source: 'ICH Q5E',
    title: 'Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process',
    relevance: 'Comparability exercise design after manufacturing changes.',
  },
  {
    id: 'ichq6b',
    source: 'ICH Q6B',
    title: 'Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products',
    relevance: 'Specification setting for drug substance and drug product.',
  },
  {
    id: 'fda_covid2020',
    source: 'FDA Guidance (June 2020)',
    title: 'Development and Licensure of Vaccines to Prevent COVID-19',
    relevance: 'Efficacy success criterion (point estimate ≥50%, lower bound of CI >30%) and safety follow-up expectations.',
  },
  {
    id: 'fda_flu2007',
    source: 'FDA Guidance (2007)',
    title: 'Clinical Data Needed to Support the Licensure of Seasonal Inactivated Influenza Vaccines',
    relevance: 'Seroconversion and seroprotection (HAI 1:40) immunogenicity criteria for accelerated approval.',
  },
  {
    id: 'fda_acceladult',
    source: '21 CFR 601 Subpart E',
    title: 'Accelerated approval of biological products for serious or life-threatening illnesses',
    relevance: 'Surrogate-endpoint (immunogenicity) basis for accelerated approval with confirmatory studies.',
  },
  {
    id: 'who_trs924',
    source: 'WHO TRS 924, Annex 1',
    title: 'Guidelines on clinical evaluation of vaccines: regulatory expectations',
    relevance: 'Phased clinical development, immunobridging, and lot-to-lot consistency expectations.',
  },
  {
    id: 'who_trs927',
    source: 'WHO TRS 927, Annex 1',
    title: 'WHO guidelines on nonclinical evaluation of vaccines',
    relevance: 'Nonclinical immunogenicity/toxicology package supporting first-in-human studies.',
  },
  {
    id: 'who_lotrelease',
    source: 'WHO TRS 978, Annex 2 / TRS 987',
    title: 'Guidelines for independent lot release of vaccines by regulatory authorities',
    relevance: 'Lot release, consistency, and potency expectations.',
  },
  {
    id: 'who_platform',
    source: 'WHO Platform Technology guidance',
    title: 'Considerations for prototype pathogen / platform-based vaccine development',
    relevance: 'Leveraging platform prior knowledge across products.',
  },
  {
    id: 'ema_clinical',
    source: 'EMA EMEA/CHMP/VWP/164653/2005',
    title: 'Guideline on clinical evaluation of new vaccines',
    relevance: 'EU clinical immunogenicity/efficacy expectations and immunobridging.',
  },
  {
    id: 'ema_vector',
    source: 'EMA Guideline on live recombinant viral vectored vaccines',
    title: 'Quality, nonclinical and clinical aspects of live recombinant viral vectored vaccines',
    relevance: 'Vector-specific shedding, biodistribution, and pre-existing immunity considerations.',
  },
  {
    id: 'plotkin2010',
    source: 'Plotkin SA, Clin Vaccine Immunol 2010;17:1055',
    title: 'Correlates of protection induced by vaccination',
    relevance: 'Defining and validating immune correlates of protection.',
  },
  {
    id: 'plotkin_gilbert2012',
    source: 'Plotkin SA & Gilbert PB, Clin Infect Dis 2012;54:1615',
    title: 'Nomenclature for immune correlates of protection after vaccination',
    relevance: 'Mechanistic vs non-mechanistic CoP; absolute vs relative correlate distinctions.',
  },
  {
    id: 'qin2007',
    source: 'Qin L et al., J Infect Dis 2007;196:1304',
    title: 'A framework for assessing immunological correlates of protection in vaccine trials',
    relevance: 'Statistical framework (Prentice criteria) for validating surrogate endpoints.',
  },
  {
    id: 'fda_peds',
    source: 'FDA / PREA (21 USC 355c) & 21 CFR 601.27',
    title: 'Pediatric studies of vaccines (Pediatric Research Equity Act)',
    relevance: 'Pediatric assessment requirement and age de-escalation.',
  },
  {
    id: 'fda_pregnancy',
    source: 'FDA Guidance — Pregnant Women: Scientific and Ethical Considerations',
    title: 'Inclusion of pregnant women in clinical research / maternal immunization',
    relevance: 'Maternal immunization design and DART nonclinical expectations.',
  },
  {
    id: 'who_npv',
    source: 'WHO Position / Nonclinical Vaccine guidance (DART)',
    title: 'Developmental and reproductive toxicity for vaccines intended for women of childbearing potential',
    relevance: 'DART study expectations prior to enrolling pregnant participants.',
  },
];

// Helper: pull a Citation by id (drops the internal id field).
function cite(...ids: string[]): Citation[] {
  const out: Citation[] = [];
  for (const id of ids) {
    const entry = CITATION_REGISTRY.find((c: CitationEntry) => c.id === id);
    if (entry) {
      out.push({ source: entry.source, title: entry.title, relevance: entry.relevance });
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2. Platform knowledge tables
// ════════════════════════════════════════════════════════════════════════════

interface PlatformProfile {
  platform: VaccinePlatform;
  drugSubstance: string;
  drugProduct: string;
  typicalAdjuvant: string;
  potencyAssayParadigm: string;
  keyCmcRisks: string[];
  coldChain: string;
  viralSafetyApplicable: boolean;
  cellSubstrateRequired: boolean;
  priorKnowledgeStrength: 'high' | 'moderate' | 'emerging';
  platformMasterFileEligible: boolean;
  developmentImplications: string[];
}

const PLATFORM_PROFILES: PlatformProfile[] = [
  {
    platform: 'mrna',
    drugSubstance: 'In-vitro-transcribed, capped, nucleoside-modified mRNA encoding the target antigen (purified from DNA template by IVT, DNase, and chromatography).',
    drugProduct: 'mRNA encapsulated in a lipid nanoparticle (ionizable lipid, helper phospholipid, cholesterol, PEG-lipid); buffered, often lyophilized or frozen liquid.',
    typicalAdjuvant: 'None added — the LNP and innate sensing of the RNA provide self-adjuvanting activity; nucleoside modification tunes innate activation.',
    potencyAssayParadigm: 'In-vitro expression potency: transfect a cell line, quantify expressed antigen (ELISA/flow) and/or RNA integrity (capillary electrophoresis) and encapsulation efficiency.',
    keyCmcRisks: [
      'RNA integrity and 5\' cap content',
      'Lipid impurities and N-oxidation / reactive lipid species forming with the API',
      'LNP particle size, polydispersity, and encapsulation efficiency',
      'dsRNA content as a process-related impurity',
      'Residual DNA template and residual solvents',
    ],
    coldChain: 'Frozen (−20 to −90 C) typical for liquid; refrigerated/RT possible with lyophilization or thermostabilization.',
    viralSafetyApplicable: false,
    cellSubstrateRequired: false,
    priorKnowledgeStrength: 'moderate',
    platformMasterFileEligible: true,
    developmentImplications: [
      'Sequence change to a new antigen can leverage prior platform safety/CMC knowledge, shortening time to FIH.',
      'Process is largely sequence-independent: a Platform/Vaccine Master File can carry LNP and IVT process data across products.',
      'Reactogenicity (fever, myalgia) is dose-limiting; dose-finding must balance immunogenicity vs tolerability.',
      'Stability/cold-chain is the dominant CMC and access risk.',
    ],
  },
  {
    platform: 'viral_vector',
    drugSubstance: 'Recombinant viral vector (e.g. adenovirus, MVA, VSV) carrying the transgene, produced in a qualified packaging/permissive cell line and purified by chromatography/ultracentrifugation.',
    drugProduct: 'Buffered viral-vector suspension with stabilizers; liquid frozen or lyophilized.',
    typicalAdjuvant: 'None — the vector backbone provides innate stimulation; replication-deficient designs trade immunogenicity for safety.',
    potencyAssayParadigm: 'Infectious titer (e.g. TCID50, plaque, or qPCR-based infectivity), transgene expression, and particle-to-infectivity ratio.',
    keyCmcRisks: [
      'Replication-competent vector (RCA/RCV) presence',
      'Vector genetic stability / transgene integrity (ICH Q5B analog)',
      'Cell-substrate-derived adventitious agents (ICH Q5A/Q5D)',
      'Particle-to-infectivity ratio and aggregation',
      'Host-cell protein and host-cell/residual DNA',
    ],
    coldChain: 'Frozen typical; some lyophilized formats refrigerator-stable.',
    viralSafetyApplicable: true,
    cellSubstrateRequired: true,
    priorKnowledgeStrength: 'moderate',
    platformMasterFileEligible: true,
    developmentImplications: [
      'Anti-vector (pre-existing) immunity can blunt response; heterologous prime-boost or rare serotypes mitigate this.',
      'Shedding and biodistribution studies are expected per EMA viral-vectored guideline.',
      'Replication-competent contaminant testing is a release-critical specification.',
      'Platform prior knowledge (same backbone, new transgene) supports an abbreviated nonclinical package.',
    ],
  },
  {
    platform: 'protein_subunit',
    drugSubstance: 'Recombinant antigen protein expressed in a qualified cell line (CHO, insect/baculovirus, yeast, E. coli) and purified to defined specifications.',
    drugProduct: 'Purified antigen (often nanoparticle-displayed) co-formulated with an adjuvant; liquid refrigerated.',
    typicalAdjuvant: 'Aluminium salts, AS01/AS03/AS04 (with MPL/QS-21), MF59 (squalene emulsion), or CpG 1018.',
    potencyAssayParadigm: 'Antigen content/quantity by immunoassay (ELISA/SRID) plus antigenicity (epitope-binding mAb) confirming correct conformation; in-vivo potency where required.',
    keyCmcRisks: [
      'Higher-order structure / conformational epitope integrity',
      'Glycosylation and post-translational modification consistency',
      'Adjuvant adsorption / antigen-adjuvant interaction stability',
      'Host-cell protein and host-cell DNA',
      'Aggregation and degradation products',
    ],
    coldChain: 'Refrigerated (2–8 C); do-not-freeze for aluminium-adjuvanted products.',
    viralSafetyApplicable: true,
    cellSubstrateRequired: true,
    priorKnowledgeStrength: 'high',
    platformMasterFileEligible: true,
    developmentImplications: [
      'Best-characterized, lowest-novelty platform; expression-system and adjuvant prior knowledge are extensive.',
      'Adjuvant selection materially changes immunogenicity, reactogenicity, and the nonclinical package.',
      'Generally non-replicating and well tolerated; suited to special populations.',
      'Antigen-adjuvant compatibility and adsorption are central CMC questions.',
    ],
  },
  {
    platform: 'live_attenuated',
    drugSubstance: 'Attenuated organism (defined passage history or rationally attenuated) propagated in a qualified substrate.',
    drugProduct: 'Lyophilized live organism with stabilizers, reconstituted before use.',
    typicalAdjuvant: 'None — replication in the host provides robust, often durable, immunity.',
    potencyAssayParadigm: 'Live infectious titer (CCID50/PFU) as the potency measure; loss of titer is the primary stability-indicating attribute.',
    keyCmcRisks: [
      'Genetic stability / reversion to virulence',
      'Adventitious agents from substrate (ICH Q5A/Q5D)',
      'Live-titer loss on storage (stability-limiting)',
      'Neurovirulence / attenuation phenotype maintenance',
      'Seed-lot system control (master/working seed)',
    ],
    coldChain: 'Stringent cold chain; lyophilized but heat-labile after reconstitution.',
    viralSafetyApplicable: true,
    cellSubstrateRequired: true,
    priorKnowledgeStrength: 'high',
    platformMasterFileEligible: false,
    developmentImplications: [
      'Reversion-to-virulence and shedding/transmissibility are the defining safety questions.',
      'Contraindicated in many immunocompromised and pregnant populations.',
      'Strong, durable, often single-dose immunity is the key advantage.',
      'Seed-lot system and genetic stability dominate CMC; platform prior knowledge is product-specific.',
    ],
  },
  {
    platform: 'inactivated',
    drugSubstance: 'Whole organism (or split/subunit thereof) grown in a qualified substrate then chemically/physically inactivated (e.g. β-propiolactone, formaldehyde).',
    drugProduct: 'Inactivated antigen, often aluminium-adjuvanted; liquid refrigerated.',
    typicalAdjuvant: 'Aluminium salts most common; squalene emulsions for some products.',
    potencyAssayParadigm: 'Antigen content (e.g. SRID for influenza HA) and/or in-vivo immunogenicity; completeness-of-inactivation testing as a safety release test.',
    keyCmcRisks: [
      'Completeness and consistency of inactivation (safety-critical)',
      'Antigen integrity through inactivation',
      'Adjuvant adsorption stability',
      'Adventitious agents from substrate',
      'Endotoxin / process residuals',
    ],
    coldChain: 'Refrigerated (2–8 C); do-not-freeze for adjuvanted products.',
    viralSafetyApplicable: true,
    cellSubstrateRequired: true,
    priorKnowledgeStrength: 'high',
    platformMasterFileEligible: false,
    developmentImplications: [
      'Completeness-of-inactivation is a release-critical, safety-defining specification.',
      'Well-established platform with strong regulatory precedent (influenza, polio, hepatitis A).',
      'Generally requires multi-dose priming and periodic boosting.',
      'Non-replicating; broadly usable across special populations.',
    ],
  },
  {
    platform: 'conjugate',
    drugSubstance: 'Capsular polysaccharide chemically conjugated to a carrier protein (e.g. CRM197, tetanus/diphtheria toxoid) to confer T-cell-dependent immunity.',
    drugProduct: 'Conjugate(s), often multivalent, with or without aluminium adjuvant; liquid refrigerated.',
    typicalAdjuvant: 'Aluminium phosphate in some products; many are unadjuvanted.',
    potencyAssayParadigm: 'Polysaccharide content, free vs conjugated saccharide ratio, conjugation/saccharide-to-protein ratio, and molecular-size distribution; in-vitro/immunoassay potency.',
    keyCmcRisks: [
      'Free (unconjugated) saccharide level',
      'Saccharide-to-protein ratio and conjugation consistency',
      'Molecular-size distribution of the conjugate',
      'Carrier-induced epitopic suppression in multivalent/multiproduct schedules',
      'Polysaccharide identity/integrity per serotype',
    ],
    coldChain: 'Refrigerated (2–8 C); do-not-freeze.',
    viralSafetyApplicable: false,
    cellSubstrateRequired: true,
    priorKnowledgeStrength: 'high',
    platformMasterFileEligible: true,
    developmentImplications: [
      'Converts T-independent polysaccharide response to a T-dependent response, enabling infant immunogenicity and memory.',
      'Multivalency raises per-serotype consistency and carrier-suppression questions.',
      'Opsonophagocytic activity (OPA) is the workhorse functional immunogenicity assay.',
      'Carrier-protein and conjugation-chemistry prior knowledge transfers across serotypes/products.',
    ],
  },
  {
    platform: 'vlp',
    drugSubstance: 'Self-assembling viral structural proteins forming non-infectious virus-like particles, expressed in a qualified cell system.',
    drugProduct: 'VLPs, often aluminium- or emulsion-adjuvanted; liquid refrigerated.',
    typicalAdjuvant: 'Aluminium salts or AS04; some unadjuvanted.',
    potencyAssayParadigm: 'Antigen content plus particle integrity/assembly and antigenicity by conformation-dependent mAb binding.',
    keyCmcRisks: [
      'Particle assembly and integrity',
      'Conformational epitope presentation',
      'Host-cell protein/DNA',
      'Aggregation',
      'Adjuvant adsorption stability',
    ],
    coldChain: 'Refrigerated (2–8 C); do-not-freeze for adjuvanted products.',
    viralSafetyApplicable: true,
    cellSubstrateRequired: true,
    priorKnowledgeStrength: 'high',
    platformMasterFileEligible: true,
    developmentImplications: [
      'Non-infectious but highly immunogenic via repetitive epitope display.',
      'Particle assembly/integrity is the central CMC attribute.',
      'Established precedent (HPV, hepatitis B surface antigen).',
      'Non-replicating; suitable for broad populations.',
    ],
  },
  {
    platform: 'dna',
    drugSubstance: 'Plasmid DNA encoding the antigen, produced in a bacterial host and purified to remove endotoxin and host residuals.',
    drugProduct: 'Plasmid DNA in buffer, sometimes with delivery enhancers; delivered by injection ± electroporation.',
    typicalAdjuvant: 'Molecular adjuvants (encoded cytokines) or delivery devices (electroporation) rather than classical adjuvants.',
    potencyAssayParadigm: 'In-vitro transfection/expression potency; supercoiled fraction and plasmid integrity as quality attributes.',
    keyCmcRisks: [
      'Supercoiled vs relaxed/linear plasmid fraction',
      'Residual host-cell DNA/RNA and endotoxin',
      'Genomic integration risk (theoretical)',
      'Plasmid identity/sequence integrity',
      'Antibiotic-resistance-marker considerations',
    ],
    coldChain: 'Refrigerated to RT; comparatively thermostable.',
    viralSafetyApplicable: false,
    cellSubstrateRequired: false,
    priorKnowledgeStrength: 'emerging',
    platformMasterFileEligible: true,
    developmentImplications: [
      'Sequence-agnostic process supports platform leverage.',
      'Integration risk and delivery efficiency are the defining questions.',
      'Thermostability is a comparative advantage.',
      'Delivery device (electroporation) often co-developed.',
    ],
  },
];

function getPlatformProfile(p: VaccinePlatform): PlatformProfile {
  const found = PLATFORM_PROFILES.find((x: PlatformProfile) => x.platform === p);
  // PLATFORM_PROFILES is exhaustive over VaccinePlatform; fall back defensively.
  return found ?? PLATFORM_PROFILES[2];
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3. designVaccineCMC
// ════════════════════════════════════════════════════════════════════════════

export interface DesignVaccineCMCParams {
  platform: string;
  antigenName?: string;
  indication?: string;
  multivalent?: boolean;
  numberOfValences?: number;
  adjuvanted?: boolean;
  adjuvantName?: string;
  lyophilized?: boolean;
  framework?: string;
}

export interface CmcModule {
  module: string;
  expectations: string[];
  ichReferences: string[];
}

export interface PotencyAssayPlan {
  paradigm: string;
  releaseTests: string[];
  stabilityIndicating: string[];
  referenceStandardStrategy: string;
}

export interface StabilityPlan {
  designConditions: string[];
  storageRecommendation: string;
  shelfLifeApproach: string;
  ichReference: string;
}

export interface DesignVaccineCMCResult extends EngineMeta {
  inputStates: Record<string, BooleanState>;
  valences: number | null;
  platformReference: PlatformProfile & { basis: 'reference_only' };
  platform: VaccinePlatform;
  platformLabel: string;
  drugSubstance: string;
  drugProduct: string | null;
  adjuvantStrategy: {
    adjuvanted: boolean | null;
    recommendedAdjuvant: string | null;
    constituentMaterialControls: string;
  };
  cmcModules: CmcModule[];
  potencyAssay: PotencyAssayPlan;
  stability: StabilityPlan;
  referenceStandards: string[];
  cellSubstrateExpectations: string[];
  viralSafetyExpectations: string[];
  keyCmcRisks: string[];
  comparabilityGuidance: string;
}

/**
 * Build a platform-tailored CMC development plan: drug substance / drug product
 * definitions, adjuvant strategy, potency-assay paradigm, stability program,
 * reference standards, and the applicable ICH Q5 / 21 CFR 610 expectations.
 */
export function designVaccineCMC(params: DesignVaccineCMCParams): DesignVaccineCMCResult {
  const platform = normalizePlatform(params.platform);
  const framework = normalizeFramework(params.framework);
  const profile = getPlatformProfile(platform);
  const notes = referenceNotes(params.framework);
  validateTextInputs(params, ['antigenName', 'indication', 'adjuvantName']);
  const inputStates = booleanInputStates(params, ['multivalent', 'adjuvanted', 'lyophilized']);
  const count = statedNumber('numberOfValences', params.numberOfValences,
    value => Number.isSafeInteger(value) && value >= 1, 'a positive integer');
  if (count !== undefined && ((inputStates.multivalent === false && count !== 1)
      || (inputStates.multivalent === true && count < 2))) {
    throw new ComputationRefusal('invalid_input', 'numberOfValences contradicts the stated multivalent flag.', 'numberOfValences');
  }

  const valences = count ?? (inputStates.multivalent === false ? 1 : null);

  // Adjuvant strategy.
  const adjuvanted = inputStates.adjuvanted === 'not_stated' ? null : inputStates.adjuvanted;
  if (adjuvanted === false && params.adjuvantName != null) throw new ComputationRefusal('invalid_input',
    'adjuvantName contradicts the stated absence of an added adjuvant.', 'adjuvantName');
  const lyophilized = inputStates.lyophilized;
  const recommendedAdjuvant = adjuvanted
    ? params.adjuvantName ?? null : null;
  const drugProduct = [inputStates.multivalent, inputStates.adjuvanted, lyophilized].includes('not_stated') || valences === null
    ? null : `${platformLabel(platform)} presentation (stated): ${valences} valence(s), ${adjuvanted ? 'adjuvanted' : 'without added adjuvant'}, ${lyophilized ? 'lyophilized' : 'liquid'}.`;
  if (adjuvanted) {
    notes.push({
      severity: 'recommendation',
      message:
        'Adjuvant is a constituent material under 21 CFR 610.15 — justify amount, demonstrate it does not adversely affect safety, and control adsorption/association of antigen to adjuvant as a stability-indicating attribute.',
    });
  }

  // CMC modules (3.2.S / 3.2.P expectations).
  const cmcModules: CmcModule[] = [
    {
      module: '3.2.S Drug Substance',
      expectations: [
        `Define the drug substance: ${profile.drugSubstance}`,
        'Establish the seed/cell-bank or template-control system and characterize per ICH Q5B/Q5D as applicable.',
        'Control process-related and product-related impurities with justified acceptance criteria (ICH Q6B).',
        'Demonstrate manufacturing-process consistency across the consistency lots.',
      ],
      ichReferences: profile.cellSubstrateRequired
        ? ['ICH Q5B', 'ICH Q5D', 'ICH Q6B']
        : ['ICH Q5B', 'ICH Q6B'],
    },
    {
      module: '3.2.P Drug Product',
      expectations: [
        drugProduct === null ? 'Product presentation not assessed: state valence, adjuvant and lyophilization facts.' : `Define the drug product from the stated presentation: ${drugProduct}`,
        valences === null ? 'Valence count was not stated; assess valence-specific controls when the formulation is defined.' : valences > 1
          ? `Multivalent product (${valences} valences): control each valence's identity, content, and potency and the consistency of the blend.`
          : 'Monovalent product: control identity, content, and potency of the single antigen.',
        adjuvanted === null ? 'Adjuvant status was not stated; assess constituent-material controls when it is known.' : adjuvanted
          ? `Added adjuvant (${recommendedAdjuvant ?? 'name not stated'}): control content, adsorption/association and stability (21 CFR 610.15).`
          : 'No added adjuvant was stated; confirm the product’s actual immune-stimulation evidence separately.',
        lyophilized === 'not_stated' ? 'Presentation was not stated; liquid or lyophilized controls remain to be assessed.' : lyophilized
          ? 'Lyophilized presentation: control residual moisture (21 CFR 610.13), reconstitution time, and in-use stability.'
          : 'Liquid presentation: control container-closure integrity and freeze sensitivity.',
      ],
      ichReferences: ['ICH Q6B', 'ICH Q5C'],
    },
    {
      module: 'Lot release tests (21 CFR 610)',
      expectations: [
        'Potency (21 CFR 610.10).',
        'Sterility (21 CFR 610.12).',
        'Identity (21 CFR 610.14).',
        'Purity including endotoxin/pyrogen (21 CFR 610.13).',
        'Constituent materials — adjuvant/preservative limits (21 CFR 610.15).',
        platform === 'inactivated' || platform === 'live_attenuated'
          ? 'Completeness-of-inactivation (inactivated) or attenuation-phenotype / titer (live) as a release-critical test.'
          : 'General safety as applicable (21 CFR 610.11), noting modern product-class exemptions.',
      ],
      ichReferences: ['ICH Q6B'],
    },
  ];

  // Potency assay plan.
  const potencyAssay: PotencyAssayPlan = {
    paradigm: profile.potencyAssayParadigm,
    releaseTests: [
      'Potency per 21 CFR 610.10 — quantitative, validated, and tied to the clinically qualified material.',
      platform === 'conjugate'
        ? 'Free vs conjugated saccharide, saccharide-to-protein ratio, and molecular-size distribution as conjugate-defining attributes.'
        : 'Antigen content/quantity by a validated immunoassay or physicochemical method.',
      platform === 'mrna'
        ? 'RNA integrity, 5′-cap content, and encapsulation efficiency as product-defining attributes.'
        : 'Antigenicity (conformation-sensitive binding) to confirm the immunologically relevant structure.',
    ],
    stabilityIndicating: profile.keyCmcRisks.slice(0, 3),
    referenceStandardStrategy:
      'Qualify a primary in-house reference standard from a representative, clinically linked lot; bridge working standards to it and re-qualify on a defined schedule (ICH Q6B). For influenza HA, align potency to the SRID antigen reference reagents.',
  };

  // Stability plan (ICH Q5C).
  const stability: StabilityPlan = {
    designConditions: [
      'Real-time/real-condition at the intended storage temperature (primary basis for shelf life).',
      'Accelerated and, where informative, stress conditions to characterize degradation pathways.',
      lyophilized === 'not_stated' ? 'Presentation was not stated; assess presentation-specific in-use and transport conditions when known.' : lyophilized
        ? 'In-use / post-reconstitution stability for lyophilized presentations.'
        : 'Freeze-thaw and in-use stability for liquid presentations.',
      'Photostability and transport/excursion (e.g. shipping) studies as applicable.',
    ],
    storageRecommendation: `Platform reference only; product storage is not established here: ${profile.coldChain}`,
    shelfLifeApproach:
      'Assign shelf life from real-time data using stability-indicating potency; do not extrapolate beyond supported data without ICH Q5C-consistent justification.',
    ichReference: 'ICH Q5C',
  };

  const referenceStandards = [
    'Primary in-house reference standard linked to clinically evaluated material.',
    'Working reference standards bridged to the primary standard.',
    platform === 'inactivated' && (params.indication ?? '').toLowerCase().includes('flu')
      ? 'WHO/EDQM/USP SRID antigen and antiserum reference reagents for influenza HA potency.'
      : 'International/compendial standards where available (e.g. WHO International Standards).',
  ];

  const cellSubstrateExpectations = profile.cellSubstrateRequired
    ? [
        'Two-tiered seed/cell-bank system (master + working) characterized and qualified per ICH Q5D.',
        'Identity, genetic stability, and freedom-from-adventitious-agents testing of banks.',
        'Define and justify the limit of in-vitro cell age / generation number.',
      ]
    : ['Cell substrate not central to this platform; control the production template/host and residuals instead.'];

  const viralSafetyExpectations = profile.viralSafetyApplicable
    ? [
        'Adventitious-agent testing of substrate and unprocessed bulk (ICH Q5A(R2)).',
        platform === 'live_attenuated'
          ? 'Live product — no inactivation/clearance step; rely on substrate testing, seed control, and genetic stability.'
          : 'Where a clearance/inactivation step exists, evaluate viral clearance per ICH Q5A(R2).',
      ]
    : ['Classical viral-safety clearance evaluation not applicable; control template/residuals and bioburden instead.'];

  notes.push({
    severity: 'info',
    message:
      'Manufacturing changes during development should be bridged with an ICH Q5E comparability exercise so clinical data remain interpretable across the changed process.',
  });

  return {
    engine: 'designVaccineCMC',
    deterministic: true,
    framework,
    inputStates,
    valences,
    platformReference: { ...profile, basis: 'reference_only' },
    platform,
    platformLabel: platformLabel(platform),
    drugSubstance: `Platform reference definition: ${profile.drugSubstance}`,
    drugProduct,
    adjuvantStrategy: {
      adjuvanted,
      recommendedAdjuvant,
      constituentMaterialControls:
        'Per 21 CFR 610.15: justify each constituent (adjuvant, preservative, stabilizer), keep within established limits, and demonstrate no adverse safety impact.',
    },
    cmcModules,
    potencyAssay,
    stability,
    referenceStandards,
    cellSubstrateExpectations,
    viralSafetyExpectations,
    keyCmcRisks: profile.keyCmcRisks,
    comparabilityGuidance:
      'Apply ICH Q5E for any pre- or post-licensure manufacturing change: predefine quality attributes, compare against the prior process, and add bridging clinical/immunogenicity data only if quality comparability is not sufficient.',
    citations: cite(
      'cfr610_10',
      'cfr610_12',
      'cfr610_13',
      'cfr610_14',
      'cfr610_15',
      'ichq5a',
      'ichq5b',
      'ichq5c',
      'ichq5d',
      'ichq5e',
      'ichq6b',
      framework === 'who' ? 'who_lotrelease' : 'cfr601_2',
    ),
    notes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4. assessCorrelateOfProtection
// ════════════════════════════════════════════════════════════════════════════

export interface AssessCorrelateOfProtectionParams {
  pathogen?: string;
  immuneMarker?: string;
  proposedThreshold?: string;
  protectionMechanismKnown?: boolean;
  markerDirectlyProtective?: boolean;
  hasEfficacyDataLinkingMarker?: boolean;
  intendedUse?: 'accelerated_approval' | 'immunobridging' | 'lot_release' | 'strain_change';
  framework?: string;
}

export type CoPType =
  | 'mechanistic_absolute'
  | 'mechanistic_relative'
  | 'nonmechanistic_absolute'
  | 'nonmechanistic_relative'
  | 'no_established_correlate';

export interface KnownCorrelate {
  pathogen: string;
  marker: string;
  threshold: string;
  type: CoPType;
  note: string;
}

const KNOWN_CORRELATES: KnownCorrelate[] = [
  {
    pathogen: 'influenza',
    marker: 'Hemagglutination-inhibition (HAI) antibody titer',
    threshold: 'HAI ≥ 1:40 associated with ~50% protection (a relative, population-level correlate)',
    type: 'nonmechanistic_relative',
    note: 'HAI 1:40 is a widely used regulatory benchmark, not a mechanistic absolute threshold; protection is continuous.',
  },
  {
    pathogen: 'hepatitis b',
    marker: 'Anti-HBs antibody concentration',
    threshold: 'Anti-HBs ≥ 10 mIU/mL accepted as protective',
    type: 'mechanistic_absolute',
    note: 'Anti-HBs is a mechanistic correlate with a broadly accepted absolute protective threshold.',
  },
  {
    pathogen: 'measles',
    marker: 'Plaque-reduction neutralization (PRN) antibody',
    threshold: 'Neutralizing antibody ≥ ~120 mIU/mL associated with protection',
    type: 'mechanistic_absolute',
    note: 'Neutralizing antibody is mechanistic for measles.',
  },
  {
    pathogen: 'pneumococcal',
    marker: 'Opsonophagocytic activity (OPA) and IgG by ELISA',
    threshold: 'Anti-capsular IgG ≥ 0.35 µg/mL (infant conjugate reference) with OPA confirmation',
    type: 'nonmechanistic_relative',
    note: 'Serotype-specific; 0.35 µg/mL is a pooled non-mechanistic reference, OPA is the functional correlate.',
  },
  {
    pathogen: 'meningococcal',
    marker: 'Serum bactericidal antibody (SBA / hSBA)',
    threshold: 'SBA titer ≥ 1:4 (hSBA) or ≥ 1:8 (rSBA) accepted as protective',
    type: 'mechanistic_absolute',
    note: 'SBA is a mechanistic, functional correlate of protection for meningococcus.',
  },
  {
    pathogen: 'diphtheria',
    marker: 'Antitoxin (neutralizing) antibody',
    threshold: 'Antitoxin ≥ 0.01–0.1 IU/mL protective range',
    type: 'mechanistic_absolute',
    note: 'Toxin-neutralizing antibody is mechanistic.',
  },
  {
    pathogen: 'tetanus',
    marker: 'Antitoxin (neutralizing) antibody',
    threshold: 'Antitoxin ≥ 0.01–0.1 IU/mL protective range',
    type: 'mechanistic_absolute',
    note: 'Toxin-neutralizing antibody is mechanistic.',
  },
  {
    pathogen: 'rabies',
    marker: 'Rapid fluorescent focus inhibition test (RFFIT) neutralizing antibody',
    threshold: 'Neutralizing antibody ≥ 0.5 IU/mL (WHO benchmark)',
    type: 'mechanistic_absolute',
    note: 'Neutralizing antibody is mechanistic for rabies.',
  },
  {
    pathogen: 'hpv',
    marker: 'Type-specific neutralizing / binding antibody',
    threshold: 'No universally agreed protective threshold; high seroconversion used for bridging',
    type: 'nonmechanistic_relative',
    note: 'Antibody is presumed protective but no defined absolute threshold is established.',
  },
];

function classifyCoP(
  mechanismKnown: boolean,
  directlyProtective: boolean,
): CoPType {
  if (mechanismKnown && directlyProtective) return 'mechanistic_absolute';
  if (mechanismKnown && !directlyProtective) return 'mechanistic_relative';
  if (!mechanismKnown && directlyProtective) return 'nonmechanistic_absolute';
  return 'nonmechanistic_relative';
}

function copTypeLabel(t: CoPType | 'not_assessed'): string {
  switch (t) {
    case 'mechanistic_absolute':
      return 'Mechanistic CoP, absolute (the marker is causally protective and a defined threshold predicts protection).';
    case 'mechanistic_relative':
      return 'Mechanistic CoP, relative (the marker is causally protective but protection is a continuous function of titer).';
    case 'nonmechanistic_absolute':
      return 'Non-mechanistic CoP, absolute (the marker tracks a defined protective threshold without being the protective effector).';
    case 'nonmechanistic_relative':
      return 'Non-mechanistic CoP, relative (the marker correlates with protection on a continuum but is not the effector).';
    case 'no_established_correlate':
      return 'No established correlate of protection — efficacy must be demonstrated clinically.';
    case 'not_assessed':
      return 'Not assessed: both classification facts must be stated.';
    default:
      return 'Unclassified.';
  }
}

export interface AssessCorrelateOfProtectionResult extends EngineMeta {
  inputStates: Record<string, BooleanState>;
  pathogen: string;
  immuneMarker: string | null;
  matchedKnownCorrelate: (KnownCorrelate & { basis: 'reference_only' }) | null;
  copType: CoPType | 'not_assessed';
  copTypeExplanation: string;
  thresholdAssessment: string | null;
  surrogateEndpointUsability: string;
  prenticeCriteria: string[];
  bridgingApplications: string[];
  intendedUseAssessment: string | null;
  validationGaps: string[];
}

/**
 * Classify a proposed correlate of protection (mechanistic vs non-mechanistic,
 * absolute vs relative), assess threshold/surrogate-endpoint usability against
 * the Prentice/Qin framework, and describe bridging applications.
 */
export function assessCorrelateOfProtection(
  params: AssessCorrelateOfProtectionParams,
): AssessCorrelateOfProtectionResult {
  const framework = normalizeFramework(params.framework);
  const notes = referenceNotes(params.framework);
  validateTextInputs(params, ['pathogen', 'immuneMarker', 'proposedThreshold']);
  const inputStates = booleanInputStates(params, ['protectionMechanismKnown', 'markerDirectlyProtective', 'hasEfficacyDataLinkingMarker']);
  const pathogen = params.pathogen ?? 'unspecified';
  const matched = KNOWN_CORRELATES.find(c => pathogen.toLowerCase().includes(c.pathogen)) ?? null;
  const immuneMarker = params.immuneMarker ?? null;
  const proposedThreshold = params.proposedThreshold ?? null;
  const mechanism = inputStates.protectionMechanismKnown;
  const protective = inputStates.markerDirectlyProtective;
  const copType = mechanism === 'not_stated' || protective === 'not_stated'
    ? 'not_assessed' : classifyCoP(mechanism, protective);
  const hasLink = inputStates.hasEfficacyDataLinkingMarker;
  const surrogateEndpointUsability = hasLink === false
    ? 'Not supported by the stated absence of an efficacy-data link; bridging or surrogate use cannot be endorsed here.'
    : 'Not assessed: stated classification/linkage flags and a reference entry do not establish assay validation, the Prentice criteria or agency acceptance of a surrogate.';
  const intendedUse = statedOneOf('intendedUse', params.intendedUse,
    ['accelerated_approval', 'immunobridging', 'lot_release', 'strain_change'] as const);
  const useReferences = {
    accelerated_approval: 'Reference only: accelerated approval requires a surrogate reasonably likely to predict clinical benefit and confirmatory evidence. Eligibility is not assessed here.',
    immunobridging: 'Reference only: immunobridging needs justified margins, an accepted marker and assay, and adequate source/comparator evidence; feasibility is not determined here.',
    lot_release: 'Reference only: a lot-release marker supports potency/consistency rather than a clinical protection claim; align with 21 CFR 610.10.',
    strain_change: 'Reference only: strain-change approaches depend on accepted assays, thresholds and authority-specific requirements; no waiver of efficacy studies is determined here.',
  };
  const validationGaps = ['Assay validation, source evidence, the Prentice criteria and intended-use acceptance are not assessed by this worksheet.'];
  if (hasLink === 'not_stated') validationGaps.push('hasEfficacyDataLinkingMarker was not stated; its presence or absence cannot be assumed.');
  if (hasLink === false) validationGaps.push('An efficacy-data link was explicitly ruled out in the stated inputs.');
  if (proposedThreshold === null) validationGaps.push('proposedThreshold was not stated; no actual threshold is assessed.');
  if (copType === 'not_assessed') validationGaps.push('State protectionMechanismKnown and markerDirectlyProtective to classify the stated marker.');
  notes.push({ severity: 'info', message: 'Known correlates are reference profiles only; they do not supply product marker, threshold, classification or efficacy-link facts.' });
  return {
    engine: 'assessCorrelateOfProtection', deterministic: true, framework, inputStates,
    pathogen, immuneMarker, matchedKnownCorrelate: matched ? { ...matched, basis: 'reference_only' } : null,
    copType, copTypeExplanation: copTypeLabel(copType),
    thresholdAssessment: proposedThreshold === null ? null : `Stated proposed threshold: ${proposedThreshold}. Validation is not assessed.`,
    surrogateEndpointUsability,
    prenticeCriteria: [
      'Prentice 1: the marker is correlated with clinical outcome.',
      'Prentice 2: the vaccine affects the marker.',
      'Prentice 3: the vaccine affects the clinical outcome.',
      'Prentice 4: the marker fully captures the vaccine effect on outcome.',
    ],
    bridgingApplications: [
      'Reference application: lot-to-lot consistency.', 'Reference application: manufacturing-change comparability.',
      'Reference application: age/population extrapolation.', 'Reference application: strain change with an accepted assay/threshold.',
    ],
    intendedUseAssessment: intendedUse === undefined ? null : useReferences[intendedUse], validationGaps,
    citations: cite('plotkin2010', 'plotkin_gilbert2012', 'qin2007',
      intendedUse === 'accelerated_approval' ? 'fda_acceladult' : 'ema_clinical', framework === 'who' ? 'who_trs924' : 'fda_flu2007'),
    notes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5. designVaccineClinicalProgram
// ════════════════════════════════════════════════════════════════════════════

export interface DesignVaccineClinicalProgramParams {
  pathogen?: string;
  platform: string;
  hasEstablishedCorrelate?: boolean;
  efficacyFeasible?: boolean;
  targetPopulation?: 'adults' | 'pediatric' | 'elderly' | 'maternal' | 'all_ages';
  noveltyIsHigh?: boolean;
  diseaseSeriousness?: 'routine' | 'serious' | 'pandemic';
  framework?: string;
}

export interface ClinicalPhasePlan {
  basis: 'reference_only';
  phase: string;
  objectives: string[];
  typicalSampleSize: string;
  endpoints: string[];
}

export interface ImmunogenicityEndpointSet {
  primary: string[];
  definitions: string[];
}

export interface DesignVaccineClinicalProgramResult extends EngineMeta {
  inputStates: Record<string, BooleanState>;
  pathwayAssessment: 'assessed' | 'not_assessed';
  platform: VaccinePlatform;
  pathogen: string;
  efficacyVsImmunobridging: string;
  efficacySuccessCriterion: string;
  phases: ClinicalPhasePlan[];
  immunogenicityEndpoints: ImmunogenicityEndpointSet;
  safetyDatabaseExpectation: string | null;
  safetyFollowUpDuration: string;
  lotConsistencyExpectation: string;
  acceleratedApprovalEligibility: null;
  acceleratedApprovalReference: string;
}

/**
 * Lay out a phased clinical development program: Phase 1-3 objectives,
 * immunogenicity endpoint definitions (seroconversion, GMT, seroresponse),
 * the efficacy-vs-immunobridging decision, safety database size, and the
 * lot-to-lot consistency requirement.
 */
export function designVaccineClinicalProgram(
  params: DesignVaccineClinicalProgramParams,
): DesignVaccineClinicalProgramResult {
  const platform = normalizePlatform(params.platform);
  const framework = normalizeFramework(params.framework);
  const notes = referenceNotes(params.framework);
  validateTextInputs(params, ['pathogen']);
  const inputStates = booleanInputStates(params, ['hasEstablishedCorrelate', 'efficacyFeasible', 'noveltyIsHigh']);
  statedOneOf('targetPopulation', params.targetPopulation, ['adults', 'pediatric', 'elderly', 'maternal', 'all_ages']);
  const pathogen = (params.pathogen ?? 'unspecified').trim();
  const seriousness = statedOneOf('diseaseSeriousness', params.diseaseSeriousness, ['routine', 'serious', 'pandemic']);

  const hasCorrelate = inputStates.hasEstablishedCorrelate;
  const efficacyFeasible = inputStates.efficacyFeasible;
  const pathwayAssessment = [hasCorrelate, efficacyFeasible].includes('not_stated') ? 'not_assessed' : 'assessed';
  const bridgingSelected = pathwayAssessment === 'assessed' && hasCorrelate === true && efficacyFeasible === false;
  const phase3Unresolved = pathwayAssessment === 'not_assessed' || (hasCorrelate === false && efficacyFeasible === false);
  const phase3NextStep = pathwayAssessment === 'not_assessed'
    ? 'State the pathway prerequisites before selecting a Phase 3 objective.'
    : 'The stated facts do not select a supported routine Phase 3 pathway; assess alternative evidence and agency requirements before choosing an endpoint.';

  // Efficacy vs immunobridging decision.
  let efficacyVsImmunobridging: string;
  if (pathwayAssessment === 'not_assessed') {
    efficacyVsImmunobridging = 'Not assessed: state hasEstablishedCorrelate and efficacyFeasible before selecting a pathway or Phase 3 endpoint.';
  } else if (bridgingSelected) {
    efficacyVsImmunobridging =
      'Reference immunobridging pathway: a correlate and infeasible field-efficacy trial were stated. Consider marker-based bridging only if the actual assay, source/target evidence and agency expectations support it; licensing is not determined here.';
  } else if (hasCorrelate === true && efficacyFeasible === true) {
    efficacyVsImmunobridging =
      'Either pathway viable: a correlate exists but efficacy is feasible — a confirmatory efficacy trial is the most robust basis; immunobridging is acceptable for line extensions and population bridges.';
  } else if (hasCorrelate === false && efficacyFeasible === true) {
    efficacyVsImmunobridging =
      'Clinical efficacy required: no validated correlate exists, so a Phase 3 efficacy endpoint (laboratory-confirmed disease) is needed for licensure.';
  } else {
    efficacyVsImmunobridging =
      'Challenge: no correlate and efficacy not feasible — consider a controlled human infection model, an Animal Rule pathway (where applicable), or accelerated approval on a reasonably-likely-to-predict surrogate with confirmatory commitments.';
    notes.push({
      severity: 'caution',
      message:
        'Neither a validated correlate nor a feasible field-efficacy trial is available — early Agency engagement on the evidentiary pathway is essential.',
    });
  }

  // Efficacy success criterion (COVID-19 guidance convention as a reference benchmark).
  const efficacySuccessCriterion =
    'Reference success criterion (FDA COVID-19 paradigm): point estimate of vaccine efficacy ≥ 50% with the lower bound of the (≥) 95% CI > 30%. Pathogen-specific criteria may differ; pre-specify with the Agency.';

  // Phased plan.
  const phases: ClinicalPhasePlan[] = [
    {
      basis: 'reference_only',
      phase: 'Phase 1 (first-in-human / safety & dose-ranging)',
      objectives: [
        'Initial safety and reactogenicity.',
        'Dose and schedule exploration.',
        'Preliminary immunogenicity to inform dose selection.',
      ],
      typicalSampleSize: '20–100 healthy adults',
      endpoints: ['Solicited/unsolicited adverse events', 'Immunogenicity (GMT, seroconversion) by dose'],
    },
    {
      basis: 'reference_only',
      phase: 'Phase 2 (dose confirmation / expanded safety)',
      objectives: [
        'Confirm dose, schedule, and formulation (including adjuvant).',
        'Characterize immunogenicity across the target population.',
        'Expanded safety to detect less-common events.',
      ],
      typicalSampleSize: 'Several hundred participants',
      endpoints: ['Immunogenicity (GMT, GMR, seroresponse/seroconversion rates)', 'Safety/reactogenicity'],
    },
    {
      basis: 'reference_only',
      phase:
        phase3Unresolved ? 'Phase 3 (evidentiary pathway not assessed)' : bridgingSelected
          ? 'Phase 3 (immunobridging / consistency / large safety)'
          : 'Phase 3 (efficacy / large safety)',
      objectives:
        phase3Unresolved ? [phase3NextStep, 'Plan lot consistency and safety evidence.'] : bridgingSelected
          ? [
              'Demonstrate immunogenicity meeting the pre-specified marker criterion.',
              'Demonstrate manufacturing lot-to-lot consistency.',
              'Accrue the safety database.',
            ]
          : [
              'Demonstrate vaccine efficacy against laboratory-confirmed disease.',
              'Demonstrate lot-to-lot consistency.',
              'Accrue the pre-specified safety database.',
            ],
      typicalSampleSize:
        seriousness === undefined ? 'Not assessed: diseaseSeriousness was not stated.' : seriousness === 'pandemic'
          ? 'Tens of thousands for a pre-licensure efficacy/safety database'
          : 'Thousands to tens of thousands depending on endpoint',
      endpoints:
        phase3Unresolved ? ['Pathway-specific endpoint not assessed', 'Lot consistency (reference)', 'Safety (reference)'] : bridgingSelected
          ? ['Immunogenicity non-inferiority/superiority', 'Lot consistency', 'Safety']
          : ['Vaccine efficacy (attack-rate reduction)', 'Lot consistency', 'Safety'],
    },
  ];

  // Immunogenicity endpoint definitions.
  const immunogenicityEndpoints: ImmunogenicityEndpointSet = {
    primary: [
      'Geometric mean titer (GMT) / geometric mean concentration (GMC) post-vaccination.',
      'Geometric mean ratio (GMR) of post- to pre-vaccination or test-to-comparator.',
      'Seroconversion rate.',
      'Seroresponse rate.',
      'Seroprotection rate (where a protective threshold is defined).',
    ],
    definitions: [
      'Seroconversion: a pre-defined rise from baseline — classically a ≥4-fold rise in titer (and, for influenza HAI, from <1:10 to ≥1:40 or a ≥4-fold rise from a detectable baseline).',
      'Seroresponse: a pre-specified threshold rise (often ≥4-fold) used when a protective cutoff is not defined.',
      'Seroprotection: proportion achieving the defined protective threshold (e.g. HAI ≥1:40 for influenza; anti-HBs ≥10 mIU/mL for hepatitis B).',
      'GMT/GMC: geometric mean of individual titers/concentrations, reported with a 2-sided CI.',
    ],
  };

  // Safety database expectation (ICH E1 / vaccine convention).
  let safetyDatabaseExpectation: string | null;
  if (seriousness === undefined) {
    safetyDatabaseExpectation = null;
  } else if (seriousness === 'pandemic') {
    safetyDatabaseExpectation =
      'Large pre-licensure safety database (commonly tens of thousands) to characterize uncommon events; consult FDA COVID-19 guidance expectations (e.g. a median follow-up benchmark for serious/medically attended events).';
  } else {
    safetyDatabaseExpectation =
      'Prophylactic vaccines for healthy populations generally require a sizable safety database (often ≥3,000 vaccinated, scaled to the indication and rare-event sensitivity) to support a favorable benefit-risk profile.';
  }

  const safetyFollowUpDuration =
    'Solicited reactogenicity ~7 days; unsolicited AEs ~28 days post each dose; serious/medically attended AEs and AESIs typically followed 6–12 months (or longer for novel platforms).';

  const lotConsistencyExpectation =
    'Demonstrate consistency of ≥3 consecutive manufacturing lots by an equivalence design on the immunogenicity readout (and key potency attributes) — a standard pre-licensure requirement (WHO TRS 924; EMA clinical-evaluation guideline).';

  const acceleratedApprovalReference = 'Reference only: accelerated approval depends on applicable legal criteria, an acceptable surrogate reasonably likely to predict benefit and confirmatory commitments. These inputs do not determine product eligibility.';

  if (inputStates.noveltyIsHigh === 'not_stated') {
    notes.push({ severity: 'caution', message: 'noveltyIsHigh was not stated; novelty-specific safety follow-up is not assessed.' });
  } else if (inputStates.noveltyIsHigh === true) {
    notes.push({
      severity: 'recommendation',
      message:
        'High-novelty platform — extend safety follow-up, intensify AESI monitoring, and align the pharmacovigilance plan early.',
    });
  }

  return {
    engine: 'designVaccineClinicalProgram',
    deterministic: true,
    framework,
    inputStates,
    pathwayAssessment,
    platform,
    pathogen,
    efficacyVsImmunobridging,
    efficacySuccessCriterion,
    phases,
    immunogenicityEndpoints,
    safetyDatabaseExpectation,
    safetyFollowUpDuration,
    lotConsistencyExpectation,
    acceleratedApprovalEligibility: null,
    acceleratedApprovalReference,
    citations: cite(
      'fda_covid2020',
      'fda_flu2007',
      'fda_acceladult',
      framework === 'ema' ? 'ema_clinical' : 'who_trs924',
      'cfr601_25',
    ),
    notes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 6. assessLotConsistency
// ════════════════════════════════════════════════════════════════════════════

export interface AssessLotConsistencyParams {
  numberOfLots?: number;
  immunogenicityMarker?: string;
  expectedGMT?: number;
  assumedSdLog?: number;
  equivalenceMarginLower?: number;
  equivalenceMarginUpper?: number;
  targetPower?: number;
  framework?: string;
}

export interface LotConsistencyResult extends EngineMeta {
  defaultsApplied: string[];
  numberOfLots: number;
  design: string;
  equivalenceMarginGMTRatio: { lower: number; upper: number };
  pairwiseComparisons: string[];
  perGroupSampleSizeEstimate: number;
  totalSampleSizeEstimate: number;
  potencyConsistencyExpectation: string;
  immunogenicityReadout: string;
  acceptanceLogic: string;
  assumptions: string[];
}

/**
 * Design a 3-lot consistency / equivalence study: equivalence margins on the
 * GMT ratio, pairwise-comparison structure, a closed-form per-group sample-size
 * estimate, and the potency/immunogenicity acceptance logic.
 */
export function assessLotConsistency(
  params: AssessLotConsistencyParams,
): LotConsistencyResult {
  const framework = normalizeFramework(params.framework);
  const notes = referenceNotes(params.framework);
  validateTextInputs(params, ['immunogenicityMarker']);
  statedNumber('expectedGMT', params.expectedGMT, value => value > 0, 'a finite positive number');
  const defaultsApplied = ['numberOfLots', 'assumedSdLog', 'equivalenceMarginLower', 'equivalenceMarginUpper', 'targetPower']
    .filter(field => params[field as keyof AssessLotConsistencyParams] == null);

  const numberOfLots = statedNumber('numberOfLots', params.numberOfLots,
    value => Number.isInteger(value) && value >= 2 && value <= 5, 'an integer from 2 to 5') ?? 3;

  // Conventional equivalence margin on the GMT ratio: 0.5 to 2.0 (i.e. two-fold).
  const lower = statedNumber('equivalenceMarginLower', params.equivalenceMarginLower, value => value > 0 && value < 1, 'a finite ratio between 0 and 1') ?? 0.5;
  const upper = statedNumber('equivalenceMarginUpper', params.equivalenceMarginUpper, value => value > 1, 'a finite ratio above 1') ?? 2;
  if (Math.abs(lower * upper - 1) > 1e-8) throw new ComputationRefusal('invalid_input',
    'This planning approximation supports reciprocal log-symmetric margins only; equivalenceMarginLower must equal 1 / equivalenceMarginUpper.', 'equivalenceMarginLower');

  const power = statedNumber('targetPower', params.targetPower, value => value >= 0.5 && value <= 0.99, 'a finite power from 0.5 to 0.99') ?? 0.9;
  // SD of log-transformed titers (natural log). 0.7–0.75 is a common assumption.
  const sdLog = statedNumber('assumedSdLog', params.assumedSdLog, value => value > 0, 'a finite positive number') ?? 0.75;

  // Pairwise equivalence comparisons among lots.
  const pairwiseComparisons: string[] = [];
  for (let i = 1; i <= numberOfLots; i++) {
    for (let j = i + 1; j <= numberOfLots; j++) {
      pairwiseComparisons.push(`Lot ${i} vs Lot ${j}: two one-sided tests (TOST) on the GMT ratio.`);
    }
  }

  // Closed-form per-group sample size for a TOST equivalence on log-GMT,
  // assuming true ratio = 1 (worst case at margin midpoint in log space).
  // n per group ≈ 2 * sdLog^2 * (z_{1-alpha} + z_{1-beta/2})^2 / (ln(upper))^2
  const zAlpha = normalQuantile(0.95); // one-sided alpha = 0.05
  const zBetaHalf = normalQuantile(1 - (1 - power) / 2);
  const delta = Math.log(upper); // log of the upper margin (symmetric in log space)
  const perGroupRaw =
    (2 * sdLog * sdLog * Math.pow(zAlpha + zBetaHalf, 2)) / (delta * delta);
  const perGroup = Math.ceil(perGroupRaw);
  const totalSampleSize = perGroup * numberOfLots;
  if (!Number.isSafeInteger(totalSampleSize) || totalSampleSize <= 0) throw new ComputationRefusal('invalid_input',
    'The planning estimate is outside the supported finite integer range; review SD, margins and power.', 'assumedSdLog');

  if (numberOfLots < 3) {
    notes.push({
      severity: 'caution',
      message:
        'Fewer than 3 lots requested — the conventional pre-licensure expectation is ≥3 consecutive lots; <3 is unlikely to satisfy regulators.',
    });
  }

  notes.push({
    severity: 'info',
    message:
      'Equivalence (two one-sided tests) on the GMT ratio is the standard analysis; consistency is concluded only if every pairwise CI lies within the margin.',
  });

  return {
    engine: 'assessLotConsistency',
    deterministic: true,
    framework,
    defaultsApplied,
    numberOfLots,
    design: `Randomized, parallel-group equivalence study of ${numberOfLots} consecutive manufacturing lots, immunogenicity measured after the same schedule, analyzed by pairwise TOST on the GMT ratio.`,
    equivalenceMarginGMTRatio: { lower, upper },
    pairwiseComparisons,
    perGroupSampleSizeEstimate: perGroup,
    totalSampleSizeEstimate: totalSampleSize,
    potencyConsistencyExpectation:
      'Demonstrate consistency of release potency (21 CFR 610.10) and key quality attributes across the same lots; immunogenicity equivalence complements, but does not replace, CMC consistency.',
    immunogenicityReadout:
      params.immunogenicityMarker ??
      'Primary functional immunogenicity marker (e.g. neutralizing antibody GMT, SBA, OPA, or HAI as appropriate).',
    acceptanceLogic:
      'Conclude lot consistency if, for every pairwise comparison, the two-sided CI for the GMT ratio lies entirely within the pre-specified equivalence margin.',
    assumptions: [
      `Assumed within-group SD of log-titers (natural log): ${sdLog}.`,
      `Target power: ${power} per pairwise comparison.`,
      `One-sided alpha 0.05 per TOST bound; GMT-ratio margin ${lower}–${upper}.`,
      'Assumes true GMT ratio = 1 (lots truly identical); non-unity ratios increase required n.',
      'Sample-size estimate is a planning approximation; confirm with the final statistical analysis plan.',
    ],
    citations: cite(
      framework === 'ema' ? 'ema_clinical' : 'who_trs924',
      'who_lotrelease',
      'cfr610_10',
      'ichq6b',
    ),
    notes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 7. assessVaccinePlatform
// ════════════════════════════════════════════════════════════════════════════

export interface AssessVaccinePlatformParams {
  platform: string;
  priorLicensedProductOnPlatform?: boolean;
  sameBackboneDifferentAntigen?: boolean;
  intendedPopulation?: 'general' | 'immunocompromised' | 'pregnant' | 'pediatric' | 'elderly';
  framework?: string;
}

export interface AssessVaccinePlatformResult extends EngineMeta {
  inputStates: Record<string, BooleanState>;
  platformReference: PlatformProfile & { basis: 'reference_only' };
  platform: VaccinePlatform;
  platformLabel: string;
  developmentImplications: string[];
  priorKnowledgeStrength: 'high' | 'moderate' | 'emerging' | 'not_assessed';
  priorKnowledgeLeverage: string[];
  platformMasterFileEligible: boolean | null;
  platformMasterFileGuidance: string;
  nonclinicalLeverage: string | null;
  cmcLeverage: string | null;
  populationSuitability: string | null;
  keyPlatformRisks: string[];
}

/**
 * Assess a vaccine technology platform: development implications, how prior
 * platform knowledge can be leveraged (including a Vaccine/Platform Master
 * File), and the population-suitability and key-risk profile.
 */
export function assessVaccinePlatform(
  params: AssessVaccinePlatformParams,
): AssessVaccinePlatformResult {
  const platform = normalizePlatform(params.platform);
  const framework = normalizeFramework(params.framework);
  const profile = getPlatformProfile(platform);
  const notes = referenceNotes(params.framework);
  const inputStates = booleanInputStates(params, ['priorLicensedProductOnPlatform', 'sameBackboneDifferentAntigen']);

  const priorProduct = inputStates.priorLicensedProductOnPlatform;
  const sameBackbone = inputStates.sameBackboneDifferentAntigen;

  // Prior-knowledge leverage.
  const priorKnowledgeLeverage: string[] = [];
  if (priorProduct === true) {
    priorKnowledgeLeverage.push('A prior licensed product was stated; assess whether its accessible safety/CMC evidence can be referenced for this product.');
  }
  if (sameBackbone === true) {
    priorKnowledgeLeverage.push('Same backbone was stated; consider process/method leverage only after the actual platform and product evidence supports it.');
  }
  if (priorKnowledgeLeverage.length === 0) {
    priorKnowledgeLeverage.push([priorProduct, sameBackbone].includes('not_stated')
      ? 'Prior-product/backbone evidence was not fully stated; leverage is not assessed.'
      : 'Both encoded reuse bases were explicitly ruled out; other possible source evidence is not assessed.');
  }

  // Population suitability.
  const population = statedOneOf('intendedPopulation', params.intendedPopulation, ['general', 'immunocompromised', 'pregnant', 'pediatric', 'elderly']);
  let populationSuitability: string | null;
  const replicating = platform === 'live_attenuated';
  if (population === undefined) {
    populationSuitability = null;
  } else if ((population === 'immunocompromised' || population === 'pregnant') && platform === 'live_attenuated') {
    populationSuitability =
      'Caution: live-attenuated products are generally contraindicated in immunocompromised and pregnant populations due to replication/reversion risk — prefer a non-replicating platform.';
    notes.push({
      severity: 'critical',
      message:
        'Live-attenuated platform proposed for an immunocompromised/pregnant population — reconsider platform choice; non-replicating platforms are preferred.',
    });
  } else if (population === 'immunocompromised' && platform === 'viral_vector') {
    populationSuitability =
      'Caution: replication-competent vectors are problematic in immunocompromised hosts; replication-deficient vectors may be acceptable with justification.';
  } else if (platform === 'viral_vector') {
    populationSuitability = 'Reference only: viral vectors may be replication competent or deficient; establish the actual vector properties before assessing population suitability.';
  } else if (!replicating) {
    populationSuitability =
      'Non-replicating platform — generally suitable across special populations subject to standard benefit-risk and population-specific data.';
  } else {
    populationSuitability =
      'Replicating platform — confirm shedding/transmissibility and reversion controls before broadening to vulnerable populations.';
  }

  const platformMasterFileGuidance = 'Platform reference potential is not product eligibility. Confirm the legal route, actual shared process, accessible supporting evidence and agency expectations before proposing master-file reuse.';

  notes.push({
    severity: 'info',
    message:
      'Platform prior knowledge accelerates but does not eliminate product-specific work — the antigen, dose, and population always require dedicated immunogenicity and safety data.',
  });

  return {
    engine: 'assessVaccinePlatform',
    deterministic: true,
    framework,
    inputStates,
    platformReference: { ...profile, basis: 'reference_only' },
    platform,
    platformLabel: platformLabel(platform),
    developmentImplications: profile.developmentImplications,
    priorKnowledgeStrength: 'not_assessed',
    priorKnowledgeLeverage,
    platformMasterFileEligible: null,
    platformMasterFileGuidance,
    nonclinicalLeverage: sameBackbone === 'not_stated' ? null : sameBackbone
      ? 'Conditional reference: assess whether established platform toxicology can support antigen-specific bridging; no reduced package is approved here.'
      : 'No same-backbone reuse was stated; assess the actual product-specific nonclinical package and any other source evidence.',
    cmcLeverage: sameBackbone === 'not_stated' ? null : 'Reference: verify actual process/method comparability and product-specific identity, content and potency before reusing CMC evidence.',
    populationSuitability,
    keyPlatformRisks: profile.keyCmcRisks,
    citations: cite(
      'who_platform',
      'who_trs927',
      framework === 'ema' && (platform === 'viral_vector') ? 'ema_vector' : 'ichq5e',
      'cfr601_2',
    ),
    notes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 8. planVaccineSpecialPopulations
// ════════════════════════════════════════════════════════════════════════════

export interface PlanVaccineSpecialPopulationsParams {
  population: 'pediatric' | 'pregnancy' | 'elderly' | 'immunocompromised' | 'all';
  platform?: string;
  adultDataAvailable?: boolean;
  hasCorrelate?: boolean;
  diseaseSeriousness?: 'routine' | 'serious' | 'pandemic';
  framework?: string;
}

export interface PopulationStrategy {
  population: string;
  strategy: string[];
  dosing: string;
  endpoint: string | null;
  safetyConsiderations: string[];
  cautions: string[];
}

export interface PlanVaccineSpecialPopulationsResult extends EngineMeta {
  inputStates: Record<string, BooleanState>;
  platform: VaccinePlatform | 'not_stated';
  requested: string;
  strategies: PopulationStrategy[];
  ageDeEscalationApproach: string;
  maternalImmunizationApproach: string;
  bridgingApproach: string | null;
}

function pediatricStrategy(
  platform: VaccinePlatform | undefined,
  adultData: BooleanState,
  hasCorrelate: BooleanState,
): PopulationStrategy {
  const cautions: string[] = [];
  if (platform === 'live_attenuated') {
    cautions.push('Screen for immunodeficiency in infants before live-attenuated administration.');
  }
  return {
    population: 'Pediatric',
    strategy: [
      'Age de-escalation: study older children/adolescents first, then step down to younger ages and infants as safety accrues (PREA / 21 CFR 601.27).',
      adultData === 'not_stated' ? 'adultDataAvailable was not stated; the pediatric source-data strategy is not assessed.' : adultData
        ? hasCorrelate === true ? 'Conditional reference: assess immunobridging from actual adult/adolescent evidence against the stated correlate.'
          : 'Adult data were stated as available; population bridging remains to be assessed against an acceptable marker and source evidence.'
        : 'Generate de-novo pediatric immunogenicity (and efficacy where no correlate exists).',
      'Co-administration and EPI-schedule compatibility studies for infant vaccines.',
    ],
    dosing:
      'Dose may differ from adults; justify the pediatric dose by immunogenicity/reactogenicity dose-ranging rather than assuming the adult dose.',
    endpoint: hasCorrelate === 'not_stated' ? null : hasCorrelate
      ? adultData === true ? 'Reference endpoint: immunogenicity non-inferiority against an established correlate/benchmark with adequate source evidence.'
        : 'Reference marker endpoint; population bridging is not assessed without source evidence.'
      : 'Immunogenicity, supported by efficacy where a correlate is unavailable.',
    safetyConsiderations: [
      'Age-appropriate reactogenicity (fever assessment, febrile seizure monitoring in young children).',
      'Adequate pediatric safety database per age stratum.',
    ],
    cautions,
  };
}

function pregnancyStrategy(
  platform: VaccinePlatform | undefined,
  hasCorrelate: BooleanState,
): PopulationStrategy {
  const cautions: string[] = [];
  if (platform === 'live_attenuated') cautions.push('Live-attenuated products are generally avoided in pregnancy; assess product-specific maternal safety and platform choice.');
  if (platform === 'viral_vector') cautions.push('Viral-vector replication status was not stated; establish actual replication properties before assessing maternal platform safety.');
  return {
    population: 'Pregnancy / maternal immunization',
    strategy: [
      'Complete DART (developmental and reproductive toxicology) before enrolling pregnant participants (WHO/FDA expectations).',
      'Goal of maternal immunization is transplacental transfer of antibody to protect the young infant (e.g. RSV, Tdap, influenza precedents).',
      'Pre-specify gestational-age window for vaccination to optimize transfer and infant protection.',
    ],
    dosing: 'Dose not assessed: justify the maternal dose from product-specific evidence; adult-equivalent dosing is not inferred.',
    endpoint: hasCorrelate === 'not_stated' ? null : hasCorrelate
      ? 'Maternal and cord/infant antibody (transfer ratio) against the correlate, ± infant clinical endpoint.'
      : 'Infant clinical disease endpoint where no correlate exists, with maternal/infant immunogenicity.',
    safetyConsiderations: [
      'Maternal safety plus pregnancy and infant outcomes (registry/long-term follow-up).',
      'Monitor obstetric and neonatal outcomes as AESIs.',
    ],
    cautions,
  };
}

function elderlyStrategy(platform: VaccinePlatform | undefined): PopulationStrategy {
  return {
    population: 'Elderly (immunosenescence)',
    strategy: [
      'Account for immunosenescence — responses are typically lower; adjuvanted or high-dose formulations may be needed (e.g. high-dose / adjuvanted influenza precedents).',
      'Evaluate the formulation specifically in older adults rather than extrapolating from younger adults.',
    ],
    dosing:
      platform === undefined ? 'Platform-specific dose strategy is not assessed until the platform and product evidence are stated.' : platform === 'protein_subunit' || platform === 'inactivated'
        ? 'Consider an adjuvanted or higher-antigen-dose formulation to overcome reduced responsiveness.'
        : 'Confirm the dose drives adequate immunogenicity in older adults; a higher dose may be warranted.',
    endpoint: 'Immunogenicity in the elderly stratum, with efficacy where the burden/feasibility supports it.',
    safetyConsiderations: [
      'Comorbidity-aware safety monitoring.',
      'Reactogenicity may be lower but tolerability still characterized.',
    ],
    cautions: [],
  };
}

function immunocompromisedStrategy(platform: VaccinePlatform | undefined): PopulationStrategy {
  const cautions: string[] = [];
  if (platform === 'live_attenuated') {
    cautions.push('Live-attenuated products are generally contraindicated in significant immunocompromise.');
  }
  if (platform === 'viral_vector') {
    cautions.push('Replication-competent vectors are problematic; use replication-deficient vectors with justification.');
  }
  return {
    population: 'Immunocompromised',
    strategy: [
      'Prefer non-replicating platforms.',
      'Expect blunted responses — additional/booster doses or higher antigen content may be required.',
      'Study the specific immunocompromising condition(s) rather than generalizing.',
    ],
    dosing: 'Additional primary doses and/or boosters are commonly required to reach adequate immunogenicity.',
    endpoint: 'Immunogenicity within the specific immunocompromised stratum; clinical endpoint where feasible.',
    safetyConsiderations: [
      'Safety in the context of underlying disease and concomitant immunosuppression.',
    ],
    cautions,
  };
}

/**
 * Build special-population vaccine strategies (pediatric, pregnancy/maternal,
 * elderly, immunocompromised): age de-escalation, maternal immunization,
 * dosing, endpoints, and platform cautions.
 */
export function planVaccineSpecialPopulations(
  params: PlanVaccineSpecialPopulationsParams,
): PlanVaccineSpecialPopulationsResult {
  const framework = normalizeFramework(params.framework);
  const platform = params.platform == null ? undefined : normalizePlatform(params.platform);
  const inputStates = booleanInputStates(params, ['adultDataAvailable', 'hasCorrelate']);
  const adultData = inputStates.adultDataAvailable;
  const hasCorrelate = inputStates.hasCorrelate;
  statedOneOf('diseaseSeriousness', params.diseaseSeriousness, ['routine', 'serious', 'pandemic']);
  const population = statedOneOf('population', params.population, ['pediatric', 'pregnancy', 'elderly', 'immunocompromised', 'all']);
  refuseUnlessStated('planVaccineSpecialPopulations', [{ field: 'population', value: params.population,
    ok: population !== undefined, expected: 'pediatric, pregnancy, elderly, immunocompromised or all' }], 'planned');
  const notes = referenceNotes(params.framework);
  if (platform === undefined) notes.push({ severity: 'caution', message: 'platform was not stated; platform-specific dosing, contraindications and population safety are not assessed.' });

  const wanted: PopulationStrategy[] = [];
  const want = population!;
  if (want === 'pediatric' || want === 'all') wanted.push(pediatricStrategy(platform, adultData, hasCorrelate));
  if (want === 'pregnancy' || want === 'all') wanted.push(pregnancyStrategy(platform, hasCorrelate));
  if (want === 'elderly' || want === 'all') wanted.push(elderlyStrategy(platform));
  if (want === 'immunocompromised' || want === 'all') wanted.push(immunocompromisedStrategy(platform));

  // Surface any platform/population safety conflicts as notes.
  for (const s of wanted) {
    for (const c of s.cautions) {
      notes.push({ severity: 'caution', message: `${s.population}: ${c}` });
    }
  }

  if ((platform as VaccinePlatform) === 'live_attenuated' && (want === 'immunocompromised' || want === 'pregnancy')) {
    notes.push({
      severity: 'critical',
      message:
        'Live-attenuated platform selected for a contraindicated population (immunocompromised/pregnant) — strongly reconsider platform choice.',
    });
  }

  return {
    engine: 'planVaccineSpecialPopulations',
    deterministic: true,
    framework,
    inputStates,
    platform: platform ?? 'not_stated',
    requested: want,
    strategies: wanted,
    ageDeEscalationApproach:
      'Age de-escalation: begin in the oldest pediatric stratum (or adolescents/adults), then step down to progressively younger ages and finally infants only after the prior stratum’s safety and immunogenicity support it (PREA / 21 CFR 601.27).',
    maternalImmunizationApproach:
      'Maternal immunization: complete DART first, vaccinate in a pre-specified gestational window with a non-replicating product, and measure transplacental antibody transfer (cord/infant titers) plus infant clinical protection.',
    bridgingApproach: hasCorrelate === 'not_stated' || (hasCorrelate === true && ['pediatric', 'all'].includes(want) && adultData !== true) ? null : hasCorrelate
      ? 'Conditional reference: assess marker-based population bridging only with adequate source/comparator evidence, an accepted assay and justified margins.'
      : 'Without a correlate, special populations generally need their own immunogenicity and, where feasible, clinical/efficacy data.',
    citations: cite(
      'fda_peds',
      'fda_pregnancy',
      'who_npv',
      framework === 'ema' ? 'ema_clinical' : 'who_trs924',
    ),
    notes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 9. Module self-description (deterministic metadata)
// ════════════════════════════════════════════════════════════════════════════

export interface VaccineEngineDescriptor {
  name: string;
  summary: string;
  primaryCitations: string[];
}

export const VACCINE_ENGINES: VaccineEngineDescriptor[] = [
  {
    name: 'designVaccineCMC',
    summary: 'Platform-tailored CMC plan: drug substance/product, adjuvant, potency, stability, reference standards, ICH Q5.',
    primaryCitations: ['21 CFR 610', 'ICH Q5A-Q5E', 'ICH Q6B'],
  },
  {
    name: 'assessCorrelateOfProtection',
    summary: 'Classify and validate a correlate of protection; surrogate-endpoint and bridging usability.',
    primaryCitations: ['Plotkin & Gilbert 2012', 'Qin 2007', '21 CFR 601 Subpart E'],
  },
  {
    name: 'designVaccineClinicalProgram',
    summary: 'Phased clinical program with immunogenicity endpoints, efficacy vs immunobridging, safety database, lot consistency.',
    primaryCitations: ['FDA COVID-19 2020', 'FDA influenza 2007', 'WHO TRS 924'],
  },
  {
    name: 'assessLotConsistency',
    summary: '3-lot equivalence design with GMT-ratio margins and sample-size estimate.',
    primaryCitations: ['WHO TRS 924', 'WHO lot release', '21 CFR 610.10'],
  },
  {
    name: 'assessVaccinePlatform',
    summary: 'Platform assessment, prior-knowledge leverage, and platform master file eligibility.',
    primaryCitations: ['WHO platform guidance', 'WHO TRS 927', 'ICH Q5E'],
  },
  {
    name: 'planVaccineSpecialPopulations',
    summary: 'Pediatric/pregnancy/elderly/immunocompromised strategy: age de-escalation, maternal immunization, dosing.',
    primaryCitations: ['PREA / 21 CFR 601.27', 'FDA pregnancy guidance', 'WHO TRS 924'],
  },
];
