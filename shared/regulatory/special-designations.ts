/**
 * Special-designations & expedited-programs taxonomy — the shared vocabulary
 * for orphan, pediatric, breakthrough, and other accelerated regulatory
 * programs across markets and segments.
 *
 * Three server-side engines model designation eligibility and advisory:
 *
 *   - `server/services/global-ri/special-designations.ts`
 *       → Orphan + pediatric eligibility assessment (FDA/EMA/PMDA)
 *   - `server/services/global-ri/pediatric-requirements.ts`
 *       → Pediatric study-plan obligations (iPSP, PIP, PMDA voluntary)
 *   - `server/services/ana/special-designations.ts`
 *       → AnA advisory (eligibility, benefits, evidence, pitfalls)
 *
 * Each uses its own ad-hoc type vocabulary (`Market`, `PediatricMarket`,
 * `DesignationJurisdiction`). This module provides the shared, canonical
 * taxonomy that workspace-config and project-map consume — and that AnA
 * grounds her "you may qualify for X" guidance in.
 *
 * Pure, no DB. Grounded in real regulatory programs:
 *   - FDA: Orphan Drug Act; PREA/BPCA; FD&C Act §506 (BTD/FTD/AA/PR);
 *     21st Century Cures Act §3033 (RMAT); FD&C Act §515B (Breakthrough Device)
 *   - EMA: Reg (EC) 141/2000 (orphan); Reg (EC) 1901/2006 (PIP/PUMA);
 *     PRIME scheme; Reg (EC) 507/2006 (conditional MA); Reg (EC) 726/2004
 *     Art 14(9) (accelerated assessment)
 *   - PMDA: Pharmaceutical Affairs Act (orphan); SAKIGAKE; conditional/
 *     emergency approval pathways
 *
 * @module shared/regulatory/special-designations
 */

import type { CanonicalRegion } from './region-identity.js';

// ─── Designation program IDs ────────────────────────────────────────────────

/**
 * Canonical ID for every special designation / expedited program across
 * markets and segments. Each maps 1:1 to a real regulatory program.
 */
export type DesignationProgramId =
  // FDA drug/biologic
  | 'fda_orphan'               // Orphan Drug Designation (ODD)
  | 'fda_fast_track'           // Fast Track Designation (FTD)
  | 'fda_breakthrough_therapy' // Breakthrough Therapy Designation (BTD)
  | 'fda_accelerated_approval' // Accelerated Approval pathway
  | 'fda_priority_review'      // Priority Review designation
  | 'fda_rmat'                 // Regenerative Medicine Advanced Therapy
  | 'fda_prea'                 // Pediatric Research Equity Act (iPSP)
  | 'fda_bpca'                 // Best Pharmaceuticals for Children Act
  // FDA device
  | 'fda_breakthrough_device'  // Breakthrough Device Designation
  | 'fda_hde'                  // Humanitarian Device Exemption
  // EMA
  | 'ema_orphan'               // Orphan Designation (COMP)
  | 'ema_prime'                // PRIority MEdicines (PRIME)
  | 'ema_conditional_ma'       // Conditional Marketing Authorisation
  | 'ema_accelerated_assessment' // Accelerated Assessment
  | 'ema_pip'                  // Paediatric Investigation Plan
  | 'ema_puma'                 // Paediatric-Use Marketing Authorisation
  // PMDA
  | 'pmda_orphan'              // PMDA/MHLW Orphan Designation
  | 'pmda_sakigake'            // SAKIGAKE Designation (先駆け審査指定制度)
  | 'pmda_conditional_approval'; // Conditional/early approval pathway

// ─── Program category ───────────────────────────────────────────────────────

export type DesignationCategory =
  | 'orphan'        // rare-disease incentive programs
  | 'pediatric'     // pediatric development obligations/incentives
  | 'expedited'     // development/review acceleration programs
  | 'device_special'; // device-specific special pathways

// ─── Segment applicability ──────────────────────────────────────────────────

export type DesignationSegment = 'drug' | 'biologic' | 'device' | 'all';

// ─── Program descriptor ─────────────────────────────────────────────────────

export interface DesignationProgram {
  id: DesignationProgramId;
  label: string;
  category: DesignationCategory;
  region: CanonicalRegion;
  segment: DesignationSegment;
  /** The statutory or regulatory basis. */
  basis: string;
  /** Plain-language eligibility criteria. */
  eligibility: string;
  /** Key benefits / incentives the program confers. */
  incentives: string[];
  /** Whether the designation is mandatory (e.g. PREA) vs voluntary. */
  mandatory: boolean;
  /** Whether the program accelerates the review timeline. */
  acceleratesReview: boolean;
  /** Whether the program grants market exclusivity. */
  grantsExclusivity: boolean;
  /** Duration of exclusivity in years, if applicable. */
  exclusivityYears: number | null;
  /** The document-registry type ID for the designation application (if cataloged). */
  registryTypeId: string | null;
}

// ─── Program catalog ────────────────────────────────────────────────────────

const PROGRAMS: DesignationProgram[] = [
  // ── FDA drug/biologic ─────────────────────────────────────────────────
  {
    id: 'fda_orphan',
    label: 'Orphan Drug Designation (ODD)',
    category: 'orphan',
    region: 'US',
    segment: 'drug',
    basis: 'Orphan Drug Act; 21 CFR 316',
    eligibility: 'Disease or condition affecting fewer than 200,000 persons in the US, or no reasonable expectation of recovering development/marketing costs from US sales.',
    incentives: ['7 years of orphan-drug exclusivity upon approval', 'Tax credits for qualified clinical trials (25%)', 'PDUFA fee waiver', 'FDA grant funding eligibility'],
    mandatory: false,
    acceleratesReview: false,
    grantsExclusivity: true,
    exclusivityYears: 7,
    registryTypeId: 'US_ORPHAN',
  },
  {
    id: 'fda_fast_track',
    label: 'Fast Track Designation (FTD)',
    category: 'expedited',
    region: 'US',
    segment: 'drug',
    basis: 'FD&C Act §506(b)',
    eligibility: 'Drug treating a serious condition AND nonclinical/clinical data demonstrate potential to address an unmet medical need.',
    incentives: ['More frequent FDA interactions', 'Rolling review of the application', 'Eligibility for Accelerated Approval and Priority Review if criteria met'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: 'US_FAST_TRACK',
  },
  {
    id: 'fda_breakthrough_therapy',
    label: 'Breakthrough Therapy Designation (BTD)',
    category: 'expedited',
    region: 'US',
    segment: 'drug',
    basis: 'FD&C Act §506(a) (FDASIA 2012)',
    eligibility: 'Drug treating a serious condition AND preliminary clinical evidence of substantial improvement over available therapy on a clinically significant endpoint.',
    incentives: ['All Fast Track features', 'Intensive FDA guidance from Phase 1', 'Organizational commitment with senior manager involvement', 'Potential for shorter development timelines'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: 'US_BTD',
  },
  {
    id: 'fda_accelerated_approval',
    label: 'Accelerated Approval',
    category: 'expedited',
    region: 'US',
    segment: 'drug',
    basis: 'FD&C Act §506(c); 21 CFR 314 subpart H / 601 subpart E',
    eligibility: 'Drug treating a serious condition with meaningful advantage AND effect on a surrogate/intermediate clinical endpoint reasonably likely to predict clinical benefit.',
    incentives: ['Approval on surrogate/intermediate endpoint — earlier market access', 'Confirmatory (Phase 4) trial required post-approval'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: 'US_ACCEL_APPROVAL',
  },
  {
    id: 'fda_priority_review',
    label: 'Priority Review',
    category: 'expedited',
    region: 'US',
    segment: 'drug',
    basis: 'PDUFA; FDA Expedited Programs guidance',
    eligibility: 'Application for a drug that, if approved, would significantly improve the safety or effectiveness of treatment, diagnosis, or prevention of a serious condition.',
    incentives: ['6-month review goal (vs 10 months standard PDUFA clock)'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
  {
    id: 'fda_rmat',
    label: 'Regenerative Medicine Advanced Therapy (RMAT)',
    category: 'expedited',
    region: 'US',
    segment: 'biologic',
    basis: '21st Century Cures Act §3033; FD&C Act §506(g)',
    eligibility: 'Cell therapy, therapeutic tissue engineering product, human cell/tissue product, or combination product using such therapies, intended for serious conditions AND preliminary clinical evidence of potential to address unmet need.',
    incentives: ['All Fast Track and Breakthrough features', 'Potential for Priority Review', 'Eligibility for accelerated approval', 'Early interactions for manufacturing discussions'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: 'US_RMAT',
  },
  {
    id: 'fda_prea',
    label: 'Pediatric Research Equity Act (PREA)',
    category: 'pediatric',
    region: 'US',
    segment: 'drug',
    basis: 'PREA (21 USC 355c)',
    eligibility: 'NDA/BLA (or supplement) for a new active ingredient, new indication, new dosage form, new dosing regimen, or new route of administration — unless a full or partial waiver or deferral is granted.',
    incentives: ['Mandatory — not an incentive program', 'Waiver and deferral mechanisms available'],
    mandatory: true,
    acceleratesReview: false,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
  {
    id: 'fda_bpca',
    label: 'Best Pharmaceuticals for Children Act (BPCA)',
    category: 'pediatric',
    region: 'US',
    segment: 'drug',
    basis: 'BPCA (21 USC 355a)',
    eligibility: 'Voluntary — FDA issues a Written Request to the sponsor for pediatric studies.',
    incentives: ['6 months of pediatric exclusivity upon completion of requested studies'],
    mandatory: false,
    acceleratesReview: false,
    grantsExclusivity: true,
    exclusivityYears: 0.5,
    registryTypeId: null,
  },
  // ── FDA device ────────────────────────────────────────────────────────
  {
    id: 'fda_breakthrough_device',
    label: 'Breakthrough Device Designation',
    category: 'device_special',
    region: 'US',
    segment: 'device',
    basis: 'FD&C Act §515B (21st Century Cures Act)',
    eligibility: 'Device providing more effective treatment or diagnosis of life-threatening or irreversibly debilitating conditions AND (1) represents breakthrough technology, (2) no approved/cleared alternatives, (3) offers significant advantages, or (4) otherwise in patient interest.',
    incentives: ['Priority review and pre-market interactions', 'Sprint discussions with senior review staff', 'Data Development Plan agreement', 'Prioritized manufacturing review'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: 'US_BREAKTHROUGH_DEVICE',
  },
  {
    id: 'fda_hde',
    label: 'Humanitarian Device Exemption (HDE)',
    category: 'device_special',
    region: 'US',
    segment: 'device',
    basis: 'FD&C Act §520(m); 21 CFR 814 subpart H',
    eligibility: 'Device intended for a condition affecting fewer than 8,000 individuals per year in the US. Requires Humanitarian Use Device (HUD) designation first.',
    incentives: ['Exemption from effectiveness requirements (probable benefit, not effectiveness)', 'Reduced clinical evidence burden', 'Annual distribution reporting'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
  // ── EMA ────────────────────────────────────────────────────────────────
  {
    id: 'ema_orphan',
    label: 'Orphan Designation (EMA/COMP)',
    category: 'orphan',
    region: 'EU',
    segment: 'drug',
    basis: 'Regulation (EC) No 141/2000',
    eligibility: 'Life-threatening or chronically debilitating condition with prevalence ≤5 in 10,000 in the EU, AND either no satisfactory authorized method exists or significant benefit over existing methods.',
    incentives: ['10 years of market exclusivity', 'Protocol assistance (scientific advice at reduced fees)', 'Fee reductions for regulatory procedures', 'EU-funded research grants eligibility'],
    mandatory: false,
    acceleratesReview: false,
    grantsExclusivity: true,
    exclusivityYears: 10,
    registryTypeId: 'EU_ORPHAN',
  },
  {
    id: 'ema_prime',
    label: 'PRIME — PRIority MEdicines',
    category: 'expedited',
    region: 'EU',
    segment: 'drug',
    basis: 'EMA PRIME scheme',
    eligibility: 'Medicine targeting an unmet medical need with preliminary clinical evidence of potential to offer major therapeutic advantage.',
    incentives: ['Early and enhanced EMA dialogue', 'CHMP rapporteur appointed early', 'Potential eligibility for accelerated assessment', 'Fee reductions for scientific advice'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: 'EU_PRIME',
  },
  {
    id: 'ema_conditional_ma',
    label: 'Conditional Marketing Authorisation',
    category: 'expedited',
    region: 'EU',
    segment: 'drug',
    basis: 'Regulation (EC) 507/2006',
    eligibility: 'Seriously debilitating or life-threatening disease with unmet need, positive benefit-risk on available (less comprehensive) data, and benefit of immediate availability outweighs the risk from less-complete data.',
    incentives: ['Earlier authorization on less-complete data', 'Annual renewal with specific obligations to provide comprehensive data', 'Conversion to full MA when data is complete'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
  {
    id: 'ema_accelerated_assessment',
    label: 'Accelerated Assessment (EMA)',
    category: 'expedited',
    region: 'EU',
    segment: 'drug',
    basis: 'Regulation (EC) 726/2004 Art. 14(9)',
    eligibility: 'Product of major interest for public health and therapeutic innovation.',
    incentives: ['Reduced CHMP review timetable (150 vs 210 active days)'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
  {
    id: 'ema_pip',
    label: 'Paediatric Investigation Plan (PIP)',
    category: 'pediatric',
    region: 'EU',
    segment: 'drug',
    basis: 'Regulation (EC) No 1901/2006',
    eligibility: 'Required for marketing-authorisation applications and certain line extensions — unless covered by a class waiver, product-specific waiver, or deferral.',
    incentives: ['Mandatory — not an incentive program', '6-month SPC extension for completed agreed PIP', 'PUMA pathway for off-patent pediatric products', 'Waiver and deferral mechanisms available'],
    mandatory: true,
    acceleratesReview: false,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
  {
    id: 'ema_puma',
    label: 'Paediatric-Use Marketing Authorisation (PUMA)',
    category: 'pediatric',
    region: 'EU',
    segment: 'drug',
    basis: 'Regulation (EC) No 1901/2006',
    eligibility: 'Off-patent medicinal product exclusively developed for use in the pediatric population based on an agreed PIP.',
    incentives: ['10 years of data/market protection for the pediatric-only product', 'Separate authorization from the reference product'],
    mandatory: false,
    acceleratesReview: false,
    grantsExclusivity: true,
    exclusivityYears: 10,
    registryTypeId: null,
  },
  // ── PMDA ──────────────────────────────────────────────────────────────
  {
    id: 'pmda_orphan',
    label: 'PMDA/MHLW Orphan Drug Designation',
    category: 'orphan',
    region: 'JP',
    segment: 'drug',
    basis: 'Pharmaceutical Affairs Act (Japan); MHLW orphan designation criteria',
    eligibility: 'Disease affecting fewer than 50,000 patients in Japan AND high medical need (severe disease with no satisfactory alternative therapy).',
    incentives: ['10 years of re-examination period (extended from standard)', 'Tax credits for R&D costs', 'Priority review', 'PMDA consultation fee reductions'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: true,
    exclusivityYears: 10,
    registryTypeId: null,
  },
  {
    id: 'pmda_sakigake',
    label: 'SAKIGAKE Designation (先駆け審査指定制度)',
    category: 'expedited',
    region: 'JP',
    segment: 'all',
    basis: 'PMDA SAKIGAKE Designation System (2015, codified 2019)',
    eligibility: 'Innovative drug/device/regenerative medicine product addressing serious disease with no satisfactory alternative AND first developed/applied in Japan.',
    incentives: ['Priority consultation and pre-application consultation within 30 days', 'Substantial review time reduction (target 6 months vs 12 months)', 'Dedicated review team assignment', 'Rolling review eligibility'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
  {
    id: 'pmda_conditional_approval',
    label: 'Conditional/Early Approval (PMDA)',
    category: 'expedited',
    region: 'JP',
    segment: 'drug',
    basis: 'PMD Act (amended 2019); MHLW conditional early-approval system',
    eligibility: 'Drug/regenerative product for serious disease with no alternative, where confirmatory trials are difficult and exploratory data suggest efficacy.',
    incentives: ['Approval based on limited (exploratory) efficacy data', 'Post-market confirmation required (real-world evidence acceptable)', 'Conditional status until confirmation is complete'],
    mandatory: false,
    acceleratesReview: true,
    grantsExclusivity: false,
    exclusivityYears: null,
    registryTypeId: null,
  },
];

const BY_ID = new Map(PROGRAMS.map((p) => [p.id, p]));

// ─── Lookups ────────────────────────────────────────────────────────────────

export function getProgram(id: DesignationProgramId): DesignationProgram | undefined {
  return BY_ID.get(id);
}

export function allPrograms(): readonly DesignationProgram[] {
  return PROGRAMS;
}

export function programsForRegion(region: CanonicalRegion): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.region === region);
}

export function programsForCategory(category: DesignationCategory): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.category === category);
}

export function programsForSegment(segment: 'drug' | 'biologic' | 'device'): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.segment === segment || p.segment === 'all');
}

export function orphanPrograms(): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.category === 'orphan');
}

export function expeditedPrograms(): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.category === 'expedited');
}

export function pediatricPrograms(): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.category === 'pediatric');
}

// ─── Predicates ─────────────────────────────────────────────────────────────

export function isMandatory(id: DesignationProgramId): boolean {
  return BY_ID.get(id)?.mandatory ?? false;
}

export function acceleratesReview(id: DesignationProgramId): boolean {
  return BY_ID.get(id)?.acceleratesReview ?? false;
}

export function grantsExclusivity(id: DesignationProgramId): boolean {
  return BY_ID.get(id)?.grantsExclusivity ?? false;
}

/** Programs that accelerate the review timeline for a given region. */
export function expeditedProgramsForRegion(region: CanonicalRegion): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.region === region && p.acceleratesReview);
}

/** Programs that grant market exclusivity for a given region. */
export function exclusivityProgramsForRegion(region: CanonicalRegion): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.region === region && p.grantsExclusivity);
}

/**
 * Mandatory obligations that attach to a drug/biologic program in a region.
 * These are programs the sponsor cannot opt out of (e.g. PREA, PIP).
 */
export function mandatoryObligationsForRegion(region: CanonicalRegion): DesignationProgram[] {
  return PROGRAMS.filter((p) => p.region === region && p.mandatory);
}

/**
 * Whether any orphan program exists for a given region (helps gate orphan
 * eligibility assessment in the UI).
 */
export function hasOrphanProgram(region: CanonicalRegion): boolean {
  return PROGRAMS.some((p) => p.region === region && p.category === 'orphan');
}

/**
 * Whether a region has a mandatory pediatric obligation (PREA for US, PIP
 * for EU). PMDA encourages but does not mandate.
 */
export function hasMandatoryPediatric(region: CanonicalRegion): boolean {
  return PROGRAMS.some((p) => p.region === region && p.category === 'pediatric' && p.mandatory);
}

// ─── Designation strategy ───────────────────────────────────────────────────

/**
 * The set of programs potentially applicable to a drug/biologic filing in
 * a region. Used by workspace-config to decide which designation-related
 * services to surface.
 */
export function applicableProgramsForFiling(
  region: CanonicalRegion,
  segment: 'drug' | 'biologic' | 'device',
): DesignationProgram[] {
  return PROGRAMS.filter(
    (p) => p.region === region && (p.segment === segment || p.segment === 'all'),
  );
}

// ─── Combinability rules ────────────────────────────────────────────────────

/**
 * FDA expedited programs can be combined. This is the canonical combinability
 * set — all four can be held simultaneously for the same product.
 */
export const FDA_COMBINABLE_EXPEDITED: DesignationProgramId[] = [
  'fda_fast_track',
  'fda_breakthrough_therapy',
  'fda_accelerated_approval',
  'fda_priority_review',
];

/**
 * Whether two FDA designations can be held simultaneously.
 * All four expedited programs are combinable with each other and with orphan.
 * RMAT is combinable with all expedited programs.
 */
export function areFdaCombinablePrograms(a: DesignationProgramId, b: DesignationProgramId): boolean {
  const combinable = new Set<DesignationProgramId>([
    ...FDA_COMBINABLE_EXPEDITED,
    'fda_orphan',
    'fda_rmat',
  ]);
  return combinable.has(a) && combinable.has(b) && a !== b;
}

export default {
  getProgram,
  allPrograms,
  programsForRegion,
  programsForCategory,
  programsForSegment,
  orphanPrograms,
  expeditedPrograms,
  pediatricPrograms,
  isMandatory,
  acceleratesReview,
  grantsExclusivity,
  expeditedProgramsForRegion,
  exclusivityProgramsForRegion,
  mandatoryObligationsForRegion,
  hasOrphanProgram,
  hasMandatoryPediatric,
  applicableProgramsForFiling,
  areFdaCombinablePrograms,
};
