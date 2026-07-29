/**
 * Vaccine Development — Deterministic Regulatory-Science Knowledge Engine
 * ============================================================================
 *
 * Pure, closed-form, reproducible TypeScript. NO LLM, NO network, NO database,
 * NO imports from other services. Every function returns the same output for the
 * same input. All thresholds, margins, and recommendations are grounded in
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

// Helper: clamp a number to a range (deterministic).
function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// Helper: round to N decimals deterministically.
function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

// Helper: normalize a free-text platform string to a VaccinePlatform.
function normalizePlatform(raw: string): VaccinePlatform {
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (s.includes('mrna') || s.includes('messengerrna') || s.includes('sarna') || s.includes('selfamplifying')) {
    return 'mrna';
  }
  if (s.includes('vector') || s.includes('adeno') || s.includes('ad26') || s.includes('ad5') || s.includes('chad') || s.includes('vsv') || s.includes('mva')) {
    return 'viral_vector';
  }
  if (s.includes('conjugate') || s.includes('glycoconjugate') || s.includes('polysaccharideprotein')) {
    return 'conjugate';
  }
  if (s.includes('vlp') || s.includes('viruslikeparticle')) {
    return 'vlp';
  }
  if (s.includes('subunit') || s.includes('protein') || s.includes('recombinant') || s.includes('peptide')) {
    return 'protein_subunit';
  }
  if (s.includes('liveattenuated') || s.includes('attenuated') || s.includes('live')) {
    return 'live_attenuated';
  }
  if (s.includes('inactivated') || s.includes('killed') || s.includes('wholevirion') || s.includes('split')) {
    return 'inactivated';
  }
  if (s.includes('dna') || s.includes('plasmid')) {
    return 'dna';
  }
  // Default to protein subunit as the most generic, best-characterized case.
  return 'protein_subunit';
}

// Helper: normalize framework.
function normalizeFramework(raw: string | undefined): RegFramework {
  if (!raw) return 'fda';
  const s = raw.toLowerCase();
  if (s.startsWith('em')) return 'ema';
  if (s.startsWith('wh')) return 'who';
  if (s.startsWith('ic')) return 'ich';
  return 'fda';
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
  platform: VaccinePlatform;
  platformLabel: string;
  drugSubstance: string;
  drugProduct: string;
  adjuvantStrategy: {
    adjuvanted: boolean;
    recommendedAdjuvant: string;
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
  const notes: AdvisoryNote[] = [];

  const valences = params.multivalent
    ? Math.max(2, params.numberOfValences ?? 2)
    : 1;

  // Adjuvant strategy.
  const adjuvanted =
    params.adjuvanted ??
    (platform === 'protein_subunit' || platform === 'inactivated' || platform === 'vlp');
  const recommendedAdjuvant = adjuvanted
    ? params.adjuvantName ?? profile.typicalAdjuvant
    : 'None (self-adjuvanting / not required for this platform)';
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
        `Define the drug product: ${profile.drugProduct}`,
        valences > 1
          ? `Multivalent product (${valences} valences): control each valence's identity, content, and potency and the consistency of the blend.`
          : 'Monovalent product: control identity, content, and potency of the single antigen.',
        adjuvanted
          ? `Adjuvant (${recommendedAdjuvant}): control content, adsorption/association, and stability of the antigen-adjuvant complex (21 CFR 610.15).`
          : 'No added adjuvant: confirm absence and justify self-adjuvanting mechanism where relevant.',
        params.lyophilized ?? profile.coldChain.includes('lyophil')
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
      params.lyophilized ?? profile.coldChain.includes('lyophil')
        ? 'In-use / post-reconstitution stability for lyophilized presentations.'
        : 'Freeze-thaw and in-use stability for liquid presentations.',
      'Photostability and transport/excursion (e.g. shipping) studies as applicable.',
    ],
    storageRecommendation: profile.coldChain,
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
    platform,
    platformLabel: platformLabel(platform),
    drugSubstance: profile.drugSubstance,
    drugProduct: profile.drugProduct,
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

function copTypeLabel(t: CoPType): string {
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
    default:
      return 'Unclassified.';
  }
}

export interface AssessCorrelateOfProtectionResult extends EngineMeta {
  pathogen: string;
  immuneMarker: string;
  matchedKnownCorrelate: KnownCorrelate | null;
  copType: CoPType;
  copTypeExplanation: string;
  thresholdAssessment: string;
  surrogateEndpointUsability: string;
  prenticeCriteria: string[];
  bridgingApplications: string[];
  intendedUseAssessment: string;
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
  const notes: AdvisoryNote[] = [];
  const pathogen = (params.pathogen ?? 'unspecified').trim();
  const pathogenKey = pathogen.toLowerCase();

  const matched =
    KNOWN_CORRELATES.find((c: KnownCorrelate) => pathogenKey.includes(c.pathogen)) ?? null;

  const immuneMarker =
    params.immuneMarker ?? matched?.marker ?? 'Unspecified immune marker';

  // Determine CoP type.
  let copType: CoPType;
  if (
    params.protectionMechanismKnown === undefined &&
    params.markerDirectlyProtective === undefined &&
    matched
  ) {
    copType = matched.type;
  } else if (
    params.protectionMechanismKnown === undefined &&
    params.markerDirectlyProtective === undefined &&
    !matched
  ) {
    copType = 'no_established_correlate';
  } else {
    copType = classifyCoP(
      params.protectionMechanismKnown ?? false,
      params.markerDirectlyProtective ?? false,
    );
  }

  const proposedThreshold =
    params.proposedThreshold ?? matched?.threshold ?? 'No threshold proposed';

  // Prentice criteria for surrogate validation (Qin et al. 2007 / Prentice 1989).
  const prenticeCriteria = [
    'Prentice 1: the marker is correlated with clinical outcome.',
    'Prentice 2: the vaccine affects the marker.',
    'Prentice 3: the vaccine affects the clinical outcome.',
    'Prentice 4 (full surrogacy): the marker fully captures (mediates) the vaccine effect on outcome.',
  ];

  // Surrogate endpoint usability.
  let surrogateEndpointUsability: string;
  const hasLink = params.hasEfficacyDataLinkingMarker ?? Boolean(matched);
  if ((copType as CoPType) === 'no_established_correlate') {
    surrogateEndpointUsability =
      'Not usable as a surrogate endpoint — no validated correlate exists. A clinical efficacy endpoint is required.';
    notes.push({
      severity: 'caution',
      message:
        'Without a validated correlate, immunogenicity may support dose-finding but cannot substitute for an efficacy endpoint at licensure.',
    });
  } else if (hasLink && (copType === 'mechanistic_absolute' || copType === 'nonmechanistic_absolute')) {
    surrogateEndpointUsability =
      'Potentially usable as a surrogate/co-primary endpoint where a threshold is defined and linked to efficacy; strongest case under accelerated approval (21 CFR 601 Subpart E) with a confirmatory study.';
  } else {
    surrogateEndpointUsability =
      'Usable for relative/bridging inference (continuous titer-protection relationship) but a single pass/fail threshold is not fully validated; use as supportive evidence with efficacy or robust immunobridging.';
  }

  // Bridging applications.
  const bridgingApplications = [
    'Lot-to-lot consistency (immunogenicity readout against a defined marker).',
    'Manufacturing-change comparability (immunobridging under ICH Q5E).',
    'Age/population extrapolation (immunobridge efficacy from a studied to an unstudied population).',
    'Strain change (e.g. influenza) where the assay and threshold are established.',
  ];

  // Intended use assessment.
  const intendedUse = params.intendedUse ?? 'immunobridging';
  let intendedUseAssessment: string;
  switch (intendedUse) {
    case 'accelerated_approval':
      intendedUseAssessment =
        'Accelerated approval on an immune-marker surrogate is acceptable when the marker is reasonably likely to predict clinical benefit; a confirmatory effectiveness study is required post-approval (21 CFR 601 Subpart E).';
      break;
    case 'immunobridging':
      intendedUseAssessment =
        'Immunobridging requires a pre-specified non-inferiority/equivalence margin on the marker (e.g. GMT ratio and seroresponse difference) between the bridged and reference groups.';
      break;
    case 'lot_release':
      intendedUseAssessment =
        'For lot release, the marker supports potency/consistency rather than a clinical protection claim; align with 21 CFR 610.10 and lot-release guidance.';
      break;
    case 'strain_change':
      intendedUseAssessment =
        'For strain change, an established assay/threshold (e.g. influenza HAI) permits immunogenicity-only updates without new efficacy trials.';
      break;
    default:
      intendedUseAssessment = 'General supportive use of the correlate.';
  }

  // Validation gaps.
  const validationGaps: string[] = [];
  if (!hasLink) {
    validationGaps.push('No efficacy dataset linking the marker to clinical protection (Prentice 1/3/4 unmet).');
  }
  if ((proposedThreshold || '').toLowerCase().includes('no threshold') || (proposedThreshold || '').toLowerCase().includes('no universally')) {
    validationGaps.push('No defined/validated protective threshold for a pass-fail decision.');
  }
  if (copType === 'nonmechanistic_relative' || copType === 'nonmechanistic_absolute') {
    validationGaps.push('Non-mechanistic marker — risks residual confounding; assay standardization and a reference serum are essential.');
  }
  if (validationGaps.length === 0) {
    validationGaps.push('No major gaps identified for the stated use; confirm assay validation and reference-standard traceability.');
  }

  notes.push({
    severity: 'info',
    message:
      'Distinguish absolute correlates (a defined titer predicts protection in an individual) from relative/population correlates (protection rises with titer without a clean cutoff) per Plotkin & Gilbert (2012).',
  });

  return {
    engine: 'assessCorrelateOfProtection',
    deterministic: true,
    framework,
    pathogen,
    immuneMarker,
    matchedKnownCorrelate: matched,
    copType,
    copTypeExplanation: copTypeLabel(copType),
    thresholdAssessment: `Proposed/known threshold: ${proposedThreshold}.`,
    surrogateEndpointUsability,
    prenticeCriteria,
    bridgingApplications,
    intendedUseAssessment,
    validationGaps,
    citations: cite(
      'plotkin2010',
      'plotkin_gilbert2012',
      'qin2007',
      intendedUse === 'accelerated_approval' ? 'fda_acceladult' : 'ema_clinical',
      framework === 'who' ? 'who_trs924' : 'fda_flu2007',
    ),
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
  platform: VaccinePlatform;
  pathogen: string;
  efficacyVsImmunobridging: string;
  efficacySuccessCriterion: string;
  phases: ClinicalPhasePlan[];
  immunogenicityEndpoints: ImmunogenicityEndpointSet;
  safetyDatabaseExpectation: string;
  safetyFollowUpDuration: string;
  lotConsistencyExpectation: string;
  acceleratedApprovalEligibility: string;
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
  const notes: AdvisoryNote[] = [];
  const pathogen = (params.pathogen ?? 'unspecified').trim();
  const seriousness = params.diseaseSeriousness ?? 'serious';

  const hasCorrelate = params.hasEstablishedCorrelate ?? false;
  const efficacyFeasible = params.efficacyFeasible ?? true;

  // Efficacy vs immunobridging decision.
  let efficacyVsImmunobridging: string;
  if (hasCorrelate && !efficacyFeasible) {
    efficacyVsImmunobridging =
      'Immunobridging pathway: an established correlate exists and a field-efficacy trial is impractical — license on immunogenicity non-inferiority/superiority against a validated marker, with confirmatory effectiveness as available.';
  } else if (hasCorrelate && efficacyFeasible) {
    efficacyVsImmunobridging =
      'Either pathway viable: a correlate exists but efficacy is feasible — a confirmatory efficacy trial is the most robust basis; immunobridging is acceptable for line extensions and population bridges.';
  } else if (!hasCorrelate && efficacyFeasible) {
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
      phase:
        hasCorrelate && !efficacyFeasible
          ? 'Phase 3 (immunobridging / consistency / large safety)'
          : 'Phase 3 (efficacy / large safety)',
      objectives:
        hasCorrelate && !efficacyFeasible
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
        seriousness === 'pandemic'
          ? 'Tens of thousands for a pre-licensure efficacy/safety database'
          : 'Thousands to tens of thousands depending on endpoint',
      endpoints:
        hasCorrelate && !efficacyFeasible
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
  let safetyDatabaseExpectation: string;
  if (seriousness === 'pandemic') {
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

  // Accelerated approval eligibility.
  let acceleratedApprovalEligibility: string;
  if (seriousness !== 'routine' && hasCorrelate) {
    acceleratedApprovalEligibility =
      'Eligible: serious indication with a surrogate reasonably likely to predict benefit supports accelerated approval (21 CFR 601 Subpart E) with a confirmatory study commitment.';
  } else {
    acceleratedApprovalEligibility =
      'Accelerated approval less applicable: either the indication is routine or no qualifying surrogate exists; plan for traditional approval on a clinical endpoint.';
  }

  if (params.noveltyIsHigh) {
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
    platform,
    pathogen,
    efficacyVsImmunobridging,
    efficacySuccessCriterion,
    phases,
    immunogenicityEndpoints,
    safetyDatabaseExpectation,
    safetyFollowUpDuration,
    lotConsistencyExpectation,
    acceleratedApprovalEligibility,
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
  const notes: AdvisoryNote[] = [];

  const numberOfLots = clamp(Math.round(params.numberOfLots ?? 3), 2, 5);

  // Conventional equivalence margin on the GMT ratio: 0.5 to 2.0 (i.e. two-fold).
  const lower = params.equivalenceMarginLower ?? 0.5;
  const upper = params.equivalenceMarginUpper ?? 2.0;

  const power = clamp(params.targetPower ?? 0.9, 0.5, 0.99);
  // SD of log-transformed titers (natural log). 0.7–0.75 is a common assumption.
  const sdLog = params.assumedSdLog ?? 0.75;

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
  const zAlpha = 1.6449; // one-sided alpha = 0.05
  const zBetaHalf = inverseNormal(1 - (1 - power) / 2);
  const delta = Math.log(upper); // log of the upper margin (symmetric in log space)
  const perGroupRaw =
    (2 * sdLog * sdLog * Math.pow(zAlpha + zBetaHalf, 2)) / (delta * delta);
  const perGroup = Math.ceil(perGroupRaw);
  const totalSampleSize = perGroup * numberOfLots;

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
    numberOfLots,
    design: `Randomized, parallel-group equivalence study of ${numberOfLots} consecutive manufacturing lots, immunogenicity measured after the same schedule, analyzed by pairwise TOST on the GMT ratio.`,
    equivalenceMarginGMTRatio: { lower: roundTo(lower, 3), upper: roundTo(upper, 3) },
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
      `Target power: ${roundTo(power, 2)} per pairwise comparison.`,
      `One-sided alpha 0.05 per TOST bound; GMT-ratio margin ${roundTo(lower, 2)}–${roundTo(upper, 2)} (two-fold).`,
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

// Helper: rational approximation of the inverse standard normal CDF
// (Acklam / Beasley-Springer-style), deterministic.
function inverseNormal(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Coefficients.
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
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
  platform: VaccinePlatform;
  platformLabel: string;
  developmentImplications: string[];
  priorKnowledgeStrength: 'high' | 'moderate' | 'emerging';
  priorKnowledgeLeverage: string[];
  platformMasterFileEligible: boolean;
  platformMasterFileGuidance: string;
  nonclinicalLeverage: string;
  cmcLeverage: string;
  populationSuitability: string;
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
  const notes: AdvisoryNote[] = [];

  const priorProduct = params.priorLicensedProductOnPlatform ?? false;
  const sameBackbone = params.sameBackboneDifferentAntigen ?? false;

  // Prior-knowledge leverage.
  const priorKnowledgeLeverage: string[] = [];
  if (priorProduct) {
    priorKnowledgeLeverage.push('A licensed product on this platform anchors the safety database and CMC characterization that can be referenced.');
  }
  if (sameBackbone) {
    priorKnowledgeLeverage.push('Same backbone with a new antigen/transgene/sequence — leverage platform process, analytical methods, and (largely) the nonclinical toxicology package; focus new work on the antigen-specific attributes.');
  }
  if (profile.platformMasterFileEligible) {
    priorKnowledgeLeverage.push('Platform process and analytics can be captured in a Vaccine/Platform Master File and referenced across products.');
  }
  if (priorKnowledgeLeverage.length === 0) {
    priorKnowledgeLeverage.push('No prior-product leverage assumed — treat as a de-novo development with the full nonclinical and CMC package.');
  }

  // Population suitability.
  const population = params.intendedPopulation ?? 'general';
  let populationSuitability: string;
  const replicating = platform === 'live_attenuated' || platform === 'viral_vector';
  if ((population === 'immunocompromised' || population === 'pregnant') && platform === 'live_attenuated') {
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
  } else if (!replicating) {
    populationSuitability =
      'Non-replicating platform — generally suitable across special populations subject to standard benefit-risk and population-specific data.';
  } else {
    populationSuitability =
      'Replicating platform — confirm shedding/transmissibility and reversion controls before broadening to vulnerable populations.';
  }

  const platformMasterFileGuidance = profile.platformMasterFileEligible
    ? 'Eligible for a Vaccine/Platform Master File: register the sequence-independent process, analytical methods, and platform safety knowledge once and cross-reference it in each product application to compress timelines.'
    : 'Not well suited to a platform master file: this platform is largely product-specific (seed lots, attenuation, inactivation), so most CMC and nonclinical work is generated per product.';

  notes.push({
    severity: 'info',
    message:
      'Platform prior knowledge accelerates but does not eliminate product-specific work — the antigen, dose, and population always require dedicated immunogenicity and safety data.',
  });

  return {
    engine: 'assessVaccinePlatform',
    deterministic: true,
    framework,
    platform,
    platformLabel: platformLabel(platform),
    developmentImplications: profile.developmentImplications,
    priorKnowledgeStrength: profile.priorKnowledgeStrength,
    priorKnowledgeLeverage,
    platformMasterFileEligible: profile.platformMasterFileEligible,
    platformMasterFileGuidance,
    nonclinicalLeverage: sameBackbone
      ? 'Same-backbone leverage: a reduced antigen-specific nonclinical package (immunogenicity + targeted toxicology) is often acceptable where platform toxicology is established (WHO TRS 927).'
      : 'Full nonclinical package (immunogenicity, repeat-dose toxicology, biodistribution/shedding for vectors, DART where applicable) per WHO TRS 927.',
    cmcLeverage: profile.platformMasterFileEligible
      ? 'CMC leverage: sequence/antigen-independent process and analytical methods transfer across products; re-verify product-specific identity, content, and potency.'
      : 'CMC leverage limited: product-specific seed/inactivation/attenuation controls dominate and must be generated per product.',
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
  endpoint: string;
  safetyConsiderations: string[];
  cautions: string[];
}

export interface PlanVaccineSpecialPopulationsResult extends EngineMeta {
  requested: string;
  strategies: PopulationStrategy[];
  ageDeEscalationApproach: string;
  maternalImmunizationApproach: string;
  bridgingApproach: string;
}

function pediatricStrategy(
  platform: VaccinePlatform,
  adultData: boolean,
  hasCorrelate: boolean,
): PopulationStrategy {
  const cautions: string[] = [];
  if (platform === 'live_attenuated') {
    cautions.push('Screen for immunodeficiency in infants before live-attenuated administration.');
  }
  return {
    population: 'Pediatric',
    strategy: [
      'Age de-escalation: study older children/adolescents first, then step down to younger ages and infants as safety accrues (PREA / 21 CFR 601.27).',
      adultData
        ? 'Immunobridge from adult/adolescent immunogenicity where a correlate or robust marker exists.'
        : 'Generate de-novo pediatric immunogenicity (and efficacy where no correlate exists).',
      'Co-administration and EPI-schedule compatibility studies for infant vaccines.',
    ],
    dosing:
      'Dose may differ from adults; justify the pediatric dose by immunogenicity/reactogenicity dose-ranging rather than assuming the adult dose.',
    endpoint: hasCorrelate
      ? 'Immunogenicity non-inferiority against the established correlate/benchmark.'
      : 'Immunogenicity, supported by efficacy where a correlate is unavailable.',
    safetyConsiderations: [
      'Age-appropriate reactogenicity (fever assessment, febrile seizure monitoring in young children).',
      'Adequate pediatric safety database per age stratum.',
    ],
    cautions,
  };
}

function pregnancyStrategy(
  platform: VaccinePlatform,
  hasCorrelate: boolean,
): PopulationStrategy {
  const cautions: string[] = [];
  if (platform === 'live_attenuated' || platform === 'viral_vector') {
    cautions.push('Live/replicating platforms are generally avoided in pregnancy — prefer non-replicating products for maternal immunization.');
  }
  return {
    population: 'Pregnancy / maternal immunization',
    strategy: [
      'Complete DART (developmental and reproductive toxicology) before enrolling pregnant participants (WHO/FDA expectations).',
      'Goal of maternal immunization is transplacental transfer of antibody to protect the young infant (e.g. RSV, Tdap, influenza precedents).',
      'Pre-specify gestational-age window for vaccination to optimize transfer and infant protection.',
    ],
    dosing: 'Typically the adult dose; timing in pregnancy is the key design variable.',
    endpoint: hasCorrelate
      ? 'Maternal and cord/infant antibody (transfer ratio) against the correlate, ± infant clinical endpoint.'
      : 'Infant clinical disease endpoint where no correlate exists, with maternal/infant immunogenicity.',
    safetyConsiderations: [
      'Maternal safety plus pregnancy and infant outcomes (registry/long-term follow-up).',
      'Monitor obstetric and neonatal outcomes as AESIs.',
    ],
    cautions,
  };
}

function elderlyStrategy(platform: VaccinePlatform): PopulationStrategy {
  return {
    population: 'Elderly (immunosenescence)',
    strategy: [
      'Account for immunosenescence — responses are typically lower; adjuvanted or high-dose formulations may be needed (e.g. high-dose / adjuvanted influenza precedents).',
      'Evaluate the formulation specifically in older adults rather than extrapolating from younger adults.',
    ],
    dosing:
      platform === 'protein_subunit' || platform === 'inactivated'
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

function immunocompromisedStrategy(platform: VaccinePlatform): PopulationStrategy {
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
  const platform = params.platform ? normalizePlatform(params.platform) : 'protein_subunit';
  const adultData = params.adultDataAvailable ?? false;
  const hasCorrelate = params.hasCorrelate ?? false;
  const notes: AdvisoryNote[] = [];

  const wanted: PopulationStrategy[] = [];
  const want = params.population;
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
    requested: want,
    strategies: wanted,
    ageDeEscalationApproach:
      'Age de-escalation: begin in the oldest pediatric stratum (or adolescents/adults), then step down to progressively younger ages and finally infants only after the prior stratum’s safety and immunogenicity support it (PREA / 21 CFR 601.27).',
    maternalImmunizationApproach:
      'Maternal immunization: complete DART first, vaccinate in a pre-specified gestational window with a non-replicating product, and measure transplacental antibody transfer (cord/infant titers) plus infant clinical protection.',
    bridgingApproach: hasCorrelate
      ? 'With an established correlate, bridge across populations by immunogenicity non-inferiority against the marker.'
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
