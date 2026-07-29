/**
 * Change-control taxonomy — the shared vocabulary for post-approval changes.
 *
 * After a product is approved, every change to the product, process, or
 * labeling must be filed through the correct regulatory vehicle in each
 * market. This module defines the types, catalogs, and predicates that
 * the three server-side classification engines share:
 *
 *   - `server/services/regulatory/change-assessment.ts`
 *       → FDA device 510(k)-change flowchart + EU MDCG significant change
 *   - `server/services/global-ri/post-approval-changes.ts`
 *       → Market × category → vehicle (4 markets × 12 categories)
 *   - `server/services/market-specs/post-submission-changes.ts`
 *       → Flag-driven classifier (US/EU supplement/variation categories)
 *
 * Pure, no DB. Grounded in real regulatory practice:
 *   - FDA 21 CFR 314.70 / 601.12 (drug/biologic supplements)
 *   - FDA "Deciding When to Submit a 510(k) for a Change" (device)
 *   - EU Reg (EC) 1234/2008 (variations)
 *   - EU MDCG 2020-3 (MDR/IVDR significant change)
 *   - PMDA PMD Act Art. 14(9)/(11)
 *   - Health Canada PANDCs guidance
 *
 * @module shared/regulatory/change-control-taxonomy
 */

import type { CanonicalRegion } from './region-identity.js';

// ─── Change scope — what aspect of the product changed ─────────────────────

/**
 * The dimension of the product/process being changed. Shared across device
 * and drug/biologic — the regulatory vehicle depends on which scope is
 * touched and the product's segment.
 */
export type ChangeScope =
  | 'manufacturing_site'       // new or relocated manufacturing site
  | 'manufacturing_process'    // process change (major or minor)
  | 'specification'            // analytical specification change (tightening or relaxation)
  | 'analytical_method'        // change to the test method itself
  | 'shelf_life'               // shelf-life / expiry extension or reduction
  | 'labeling'                 // prescribing information, package insert, carton label
  | 'indication'               // new indication, expanded population, narrowed use
  | 'formulation'              // excipient, strength, or dosage form change
  | 'container_closure'        // primary packaging / container-closure system
  | 'software'                 // software version, algorithm, UI change
  | 'design'                   // device design change (materials, geometry, mechanism)
  | 'sterilisation'            // sterilisation method or validation
  | 'materials';               // patient-contacting or biocompatibility-relevant materials

// ─── Impact tier — how significant is the change? ──────────────────────────

export type ChangeImpactTier =
  | 'major'           // substantial potential to adversely affect S/E/Q
  | 'moderate'        // moderate potential impact
  | 'minor'           // minimal/no impact
  | 'administrative'; // editorial, no technical content change

// ─── Regulatory vehicle categories per market ──────────────────────────────

/** FDA drug/biologic supplement types (21 CFR 314.70 / 601.12). */
export type FdaSupplementCategory =
  | 'pas'            // Prior Approval Supplement
  | 'cbe_30'         // Changes Being Effected in 30 Days
  | 'cbe_0'          // Changes Being Effected (immediate)
  | 'annual_report'; // Annual Report

/** EU variation types (Regulation (EC) 1234/2008). */
export type EuVariationCategory =
  | 'type_ia'     // minor — do and tell (notify within 12 months)
  | 'type_iain'   // minor — immediate notification
  | 'type_ib'     // minor — tell, wait, and do (30-day acknowledgement)
  | 'type_ii'     // major — prior assessment/approval
  | 'extension';  // line extension (new strength/form/route)

/** FDA device change outcomes (510(k) change flowchart). */
export type FdaDeviceChangeOutcome =
  | 'letter_to_file'             // document in a Letter-to-File
  | 'new_510k'                   // a new 510(k) is required
  | 'pma_supplement_or_de_novo'; // may exceed the original clearance

/** EU MDR/IVDR significant change assessment outcome. */
export type EuDeviceChangeOutcome =
  | 'non_significant'  // change is non-significant
  | 'significant';     // significant → affects transitional provision / NB assessment

/** PMDA change categories (PMD Act Art. 14(9)/(11)). */
export type PmdaChangeCategory =
  | 'partial_change'     // 一部変更承認申請 (prior approval required)
  | 'minor_notification'; // 軽微変更届出 (notify within 30 days)

/** Health Canada change categories (Food and Drug Regulations / PANDCs). */
export type HcChangeCategory =
  | 'snds'               // Supplement to a New Drug Submission (prior approval)
  | 'notifiable_change'  // Notifiable Change (90-day review period)
  | 'annual_notification'; // Annual Notification

/**
 * Union of all regulatory vehicle IDs across markets and segments.
 * Each ID uniquely identifies how a change is filed.
 */
export type RegulatoryVehicleId =
  | FdaSupplementCategory
  | EuVariationCategory
  | FdaDeviceChangeOutcome
  | EuDeviceChangeOutcome
  | PmdaChangeCategory
  | HcChangeCategory;

// ─── Vehicle descriptor ────────────────────────────────────────────────────

export interface RegulatoryVehicle {
  id: RegulatoryVehicleId;
  label: string;
  /** The market this vehicle applies to. */
  market: CanonicalRegion;
  /** Whether the agency must approve before the change is implemented. */
  priorApprovalRequired: boolean;
  /** When the change may be implemented relative to filing. */
  implementationTiming: string;
  /** Governing regulation or guidance citation. */
  citation: string;
  /** Applicable segment: 'drug' | 'device' | 'both'. */
  segment: 'drug' | 'device' | 'both';
}

// ─── Vehicle catalog ────────────────────────────────────────────────────────

const VEHICLES: RegulatoryVehicle[] = [
  // FDA drug/biologic supplements
  { id: 'pas', label: 'Prior Approval Supplement (PAS)', market: 'US', priorApprovalRequired: true, implementationTiming: 'After FDA approval', citation: '21 CFR 314.70(b) / 601.12(b)', segment: 'drug' },
  { id: 'cbe_30', label: 'Changes Being Effected in 30 Days (CBE-30)', market: 'US', priorApprovalRequired: false, implementationTiming: '30 days after FDA receipt (unless FDA objects)', citation: '21 CFR 314.70(c) / 601.12(c)', segment: 'drug' },
  { id: 'cbe_0', label: 'Changes Being Effected (CBE-0)', market: 'US', priorApprovalRequired: false, implementationTiming: 'Immediately upon FDA receipt', citation: '21 CFR 314.70(c)(6) / 601.12(c)(5)', segment: 'drug' },
  { id: 'annual_report', label: 'Annual Report', market: 'US', priorApprovalRequired: false, implementationTiming: 'Implement; report in the annual report', citation: '21 CFR 314.70(d) / 601.12(d)', segment: 'drug' },

  // EU variations
  { id: 'type_ia', label: 'Type IA Minor Variation', market: 'EU', priorApprovalRequired: false, implementationTiming: 'Do and tell (notify within 12 months)', citation: 'Reg (EC) 1234/2008', segment: 'drug' },
  { id: 'type_iain', label: 'Type IAIN Minor Variation (Immediate Notification)', market: 'EU', priorApprovalRequired: false, implementationTiming: 'Implement; notify immediately', citation: 'Reg (EC) 1234/2008', segment: 'drug' },
  { id: 'type_ib', label: 'Type IB Minor Variation', market: 'EU', priorApprovalRequired: false, implementationTiming: 'Tell, wait, and do (30-day acknowledgement)', citation: 'Reg (EC) 1234/2008', segment: 'drug' },
  { id: 'type_ii', label: 'Type II Major Variation', market: 'EU', priorApprovalRequired: true, implementationTiming: 'After EMA assessment/approval (60/90 days)', citation: 'Reg (EC) 1234/2008', segment: 'drug' },
  { id: 'extension', label: 'Line Extension', market: 'EU', priorApprovalRequired: true, implementationTiming: 'After EMA approval (assessed as new MAA scope)', citation: 'Reg (EC) 1234/2008 Annex I', segment: 'drug' },

  // FDA device
  { id: 'letter_to_file', label: 'Letter-to-File', market: 'US', priorApprovalRequired: false, implementationTiming: 'Document rationale; no submission required', citation: 'FDA "Deciding When to Submit a 510(k) for a Change" (2017)', segment: 'device' },
  { id: 'new_510k', label: 'New 510(k)', market: 'US', priorApprovalRequired: true, implementationTiming: 'After FDA clearance', citation: 'FDA "Deciding When to Submit a 510(k) for a Change" (2017)', segment: 'device' },
  { id: 'pma_supplement_or_de_novo', label: 'PMA Supplement or De Novo', market: 'US', priorApprovalRequired: true, implementationTiming: 'After FDA approval (may exceed 510(k) pathway)', citation: '21 CFR 814 / FD&C Act §513(f)(2)', segment: 'device' },

  // EU device (MDR/IVDR)
  { id: 'non_significant', label: 'Non-Significant Change', market: 'EU', priorApprovalRequired: false, implementationTiming: 'Document in technical file; no NB re-assessment', citation: 'EU MDCG 2020-3 / MDR Article 120, IVDR Article 110(3)', segment: 'device' },
  { id: 'significant', label: 'Significant Change', market: 'EU', priorApprovalRequired: true, implementationTiming: 'Notified Body assessment required before implementation', citation: 'EU MDCG 2020-3 / MDR Article 120, IVDR Article 110(3)', segment: 'device' },

  // PMDA
  { id: 'partial_change', label: 'Partial Change Application (一部変更承認申請)', market: 'JP', priorApprovalRequired: true, implementationTiming: 'After PMDA/MHLW approval', citation: 'PMD Act Art. 14(9)/(11)', segment: 'drug' },
  { id: 'minor_notification', label: 'Minor Change Notification (軽微変更届出)', market: 'JP', priorApprovalRequired: false, implementationTiming: 'Notify within 30 days of the change', citation: 'PMD Act Art. 14(9)/(11)', segment: 'drug' },

  // Health Canada
  { id: 'snds', label: 'Supplement to a New Drug Submission (SNDS)', market: 'CA', priorApprovalRequired: true, implementationTiming: 'After Health Canada approval', citation: 'Food and Drug Regulations / HC PANDCs guidance', segment: 'drug' },
  { id: 'notifiable_change', label: 'Notifiable Change', market: 'CA', priorApprovalRequired: false, implementationTiming: '90-day review period (no objection)', citation: 'Food and Drug Regulations / HC PANDCs guidance', segment: 'drug' },
  { id: 'annual_notification', label: 'Annual Notification', market: 'CA', priorApprovalRequired: false, implementationTiming: 'Implement; record in the annual notification', citation: 'Food and Drug Regulations / HC PANDCs guidance', segment: 'drug' },
];

const BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

// ─── Lookups ────────────────────────────────────────────────────────────────

export function getVehicle(id: RegulatoryVehicleId): RegulatoryVehicle | undefined {
  return BY_ID.get(id);
}

export function vehiclesForMarket(market: CanonicalRegion): RegulatoryVehicle[] {
  return VEHICLES.filter((v) => v.market === market);
}

export function vehiclesForSegment(segment: 'drug' | 'device'): RegulatoryVehicle[] {
  return VEHICLES.filter((v) => v.segment === segment || v.segment === 'both');
}

export function allVehicles(): readonly RegulatoryVehicle[] {
  return VEHICLES;
}

// ─── Predicates ─────────────────────────────────────────────────────────────

/** Whether a vehicle allows the change to be implemented before agency approval. */
export function isSelfImplementing(id: RegulatoryVehicleId): boolean {
  const v = BY_ID.get(id);
  return v ? !v.priorApprovalRequired : false;
}

/** FDA supplement category for a given impact tier (drug/biologic). */
export function fdaSupplementForImpact(
  impact: ChangeImpactTier,
  immediateSafety: boolean = false,
): FdaSupplementCategory {
  if (impact === 'major') return 'pas';
  if (immediateSafety) return 'cbe_0';
  if (impact === 'moderate') return 'cbe_30';
  return 'annual_report';
}

/** EU variation category for a given impact tier (drug). */
export function euVariationForImpact(
  impact: ChangeImpactTier,
  scopeExtension: boolean = false,
  immediateNotification: boolean = false,
): EuVariationCategory {
  if (scopeExtension) return 'extension';
  if (impact === 'major') return 'type_ii';
  if (impact === 'moderate') return 'type_ib';
  if (immediateNotification) return 'type_iain';
  return 'type_ia';
}

// ─── Impact → scope heuristic ──────────────────────────────────────────────

/**
 * Heuristic impact tier for a change scope. This is a starting point — the
 * actual tier depends on comparability data, risk assessment, and the
 * governing guidance. Always conservative (over-classifies) so the user
 * down-classifies with evidence.
 */
const SCOPE_DEFAULT_IMPACT: Record<ChangeScope, ChangeImpactTier> = {
  manufacturing_site: 'major',
  manufacturing_process: 'moderate',
  specification: 'moderate',
  analytical_method: 'moderate',
  shelf_life: 'major',
  labeling: 'moderate',
  indication: 'major',
  formulation: 'major',
  container_closure: 'moderate',
  software: 'moderate',
  design: 'moderate',
  sterilisation: 'major',
  materials: 'major',
};

export function defaultImpactForScope(scope: ChangeScope): ChangeImpactTier {
  return SCOPE_DEFAULT_IMPACT[scope];
}

// ─── Change record shape (what a project tracks) ───────────────────────────

/**
 * A proposed or implemented change tracked at the project level. This is
 * the shape that the compliance calendar, project map, and workspace apps
 * operate on. Persistence wraps this with DB columns.
 */
export interface TrackedChange {
  id: string;
  productId: string;
  market: CanonicalRegion;
  scope: ChangeScope;
  impact: ChangeImpactTier;
  description: string;
  /** The assessed vehicle (filled in by the classification engine). */
  vehicleId: RegulatoryVehicleId | null;
  /** Current status. */
  status: TrackedChangeStatus;
  /** Whether the change has been implemented in production. */
  implemented: boolean;
  /** ISO date the change was assessed. */
  assessedDate?: string;
  /** ISO date the submission was filed (if applicable). */
  filedDate?: string;
  /** ISO date the agency approved (if prior-approval required). */
  approvedDate?: string;
}

export type TrackedChangeStatus =
  | 'draft'        // change is being characterized
  | 'assessed'     // impact + vehicle determined
  | 'filed'        // submission sent to agency
  | 'approved'     // agency approved (for prior-approval vehicles)
  | 'implemented'  // change implemented in production
  | 'closed';      // complete — filed or documented

export const TRACKED_CHANGE_TRANSITIONS: Record<TrackedChangeStatus, TrackedChangeStatus[]> = {
  draft: ['assessed'],
  assessed: ['filed', 'implemented'],
  filed: ['approved', 'closed'],
  approved: ['implemented', 'closed'],
  implemented: ['closed'],
  closed: [],
};

export function canAdvanceChange(from: TrackedChangeStatus, to: TrackedChangeStatus): boolean {
  return TRACKED_CHANGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export default {
  getVehicle,
  vehiclesForMarket,
  vehiclesForSegment,
  allVehicles,
  isSelfImplementing,
  fdaSupplementForImpact,
  euVariationForImpact,
  defaultImpactForScope,
  canAdvanceChange,
};
