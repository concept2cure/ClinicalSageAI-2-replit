/**
 * Post-approval changes / variations expert — the right vehicle per market.
 *
 * After a product is approved, every change (manufacturing, specifications,
 * labeling, indication, …) must be filed through the correct regulatory vehicle
 * with the correct reporting category and timing. This service classifies a
 * change into that vehicle per market — the judgement an RA CMC/lifecycle lead
 * makes daily.
 *
 * Markets: FDA (21 CFR 314.70 / 601.12 supplements + Annual Report), EMA
 * (Reg (EC) 1234/2008 variations Type IA/IAIN/IB/II + Extensions), PMDA
 * (partial-change application vs minor-change notification), Health Canada
 * (SNDS / Notifiable Change / Annual Notification).
 *
 * Pure / deterministic — no DB, no IO. The classification is a reference aid;
 * the final reporting category is confirmed against the governing regulation /
 * guidance (and may depend on comparability data not modeled here).
 *
 * @module server/services/global-ri/post-approval-changes
 */

export type ChangeMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA';

export type ChangeCategory =
  | 'manufacturing_site'
  | 'manufacturing_process_major'
  | 'manufacturing_process_minor'
  | 'specification_tightening'
  | 'specification_relaxation'
  | 'analytical_method'
  | 'shelf_life_extension'
  | 'labeling_safety'
  | 'labeling_administrative'
  | 'new_indication'
  | 'formulation_change'
  | 'container_closure';

export interface ChangeVehicle {
  /** The filing vehicle (e.g. 'Prior Approval Supplement', 'Type II variation'). */
  vehicle: string;
  /** The reporting category label (e.g. 'PAS', 'CBE-30', 'Type IB', 'Annual Report'). */
  reportingCategory: string;
  /** Whether the agency must approve before implementation. */
  priorApprovalRequired: boolean;
  /** When the change may be implemented. */
  implementationTiming: string;
  /** Governing citation. */
  citation: string;
}

const FDA: Record<ChangeCategory, ChangeVehicle> = {
  manufacturing_site: { vehicle: 'Prior Approval Supplement', reportingCategory: 'PAS', priorApprovalRequired: true, implementationTiming: 'After FDA approval', citation: '21 CFR 314.70(b)' },
  manufacturing_process_major: { vehicle: 'Prior Approval Supplement', reportingCategory: 'PAS', priorApprovalRequired: true, implementationTiming: 'After FDA approval', citation: '21 CFR 314.70(b)' },
  manufacturing_process_minor: { vehicle: 'Changes Being Effected in 30 Days', reportingCategory: 'CBE-30', priorApprovalRequired: false, implementationTiming: '30 days after FDA receipt (unless FDA objects)', citation: '21 CFR 314.70(c)' },
  specification_tightening: { vehicle: 'Annual Report', reportingCategory: 'Annual Report', priorApprovalRequired: false, implementationTiming: 'Implement; report in the annual report', citation: '21 CFR 314.70(d)' },
  specification_relaxation: { vehicle: 'Prior Approval Supplement', reportingCategory: 'PAS', priorApprovalRequired: true, implementationTiming: 'After FDA approval', citation: '21 CFR 314.70(b)' },
  analytical_method: { vehicle: 'Changes Being Effected in 30 Days', reportingCategory: 'CBE-30', priorApprovalRequired: false, implementationTiming: '30 days after FDA receipt (alternative method, equal/greater assurance)', citation: '21 CFR 314.70(c)' },
  shelf_life_extension: { vehicle: 'Prior Approval Supplement', reportingCategory: 'PAS', priorApprovalRequired: true, implementationTiming: 'After FDA approval (based on real-time stability data)', citation: '21 CFR 314.70(b)' },
  labeling_safety: { vehicle: 'Changes Being Effected (safety)', reportingCategory: 'CBE-0', priorApprovalRequired: false, implementationTiming: 'On submission (safety-related labeling)', citation: '21 CFR 314.70(c)(6)(iii)' },
  labeling_administrative: { vehicle: 'Annual Report', reportingCategory: 'Annual Report', priorApprovalRequired: false, implementationTiming: 'Implement; report in the annual report', citation: '21 CFR 314.70(d)' },
  new_indication: { vehicle: 'Prior Approval Supplement (efficacy)', reportingCategory: 'PAS', priorApprovalRequired: true, implementationTiming: 'After FDA approval', citation: '21 CFR 314.70(b)' },
  formulation_change: { vehicle: 'Prior Approval Supplement', reportingCategory: 'PAS', priorApprovalRequired: true, implementationTiming: 'After FDA approval', citation: '21 CFR 314.70(b)' },
  container_closure: { vehicle: 'Changes Being Effected in 30 Days', reportingCategory: 'CBE-30', priorApprovalRequired: false, implementationTiming: '30 days after FDA receipt', citation: '21 CFR 314.70(c)' },
};

const EMA: Record<ChangeCategory, ChangeVehicle> = {
  manufacturing_site: { vehicle: 'Type II variation', reportingCategory: 'Type II', priorApprovalRequired: true, implementationTiming: 'After EMA approval', citation: 'Reg (EC) 1234/2008' },
  manufacturing_process_major: { vehicle: 'Type II variation', reportingCategory: 'Type II', priorApprovalRequired: true, implementationTiming: 'After EMA approval', citation: 'Reg (EC) 1234/2008' },
  manufacturing_process_minor: { vehicle: 'Type IB variation', reportingCategory: 'Type IB', priorApprovalRequired: false, implementationTiming: 'After 30-day "tell, wait" period (no objection)', citation: 'Reg (EC) 1234/2008' },
  specification_tightening: { vehicle: 'Type IA variation', reportingCategory: 'Type IA', priorApprovalRequired: false, implementationTiming: 'Implement; notify within 12 months ("do and tell")', citation: 'Reg (EC) 1234/2008' },
  specification_relaxation: { vehicle: 'Type II variation', reportingCategory: 'Type II', priorApprovalRequired: true, implementationTiming: 'After EMA approval', citation: 'Reg (EC) 1234/2008' },
  analytical_method: { vehicle: 'Type IB variation', reportingCategory: 'Type IB', priorApprovalRequired: false, implementationTiming: 'After 30-day "tell, wait" period', citation: 'Reg (EC) 1234/2008' },
  shelf_life_extension: { vehicle: 'Type II variation', reportingCategory: 'Type II', priorApprovalRequired: true, implementationTiming: 'After EMA approval', citation: 'Reg (EC) 1234/2008' },
  labeling_safety: { vehicle: 'Type II variation (safety)', reportingCategory: 'Type II', priorApprovalRequired: true, implementationTiming: 'After EMA approval (urgent safety restrictions handled separately)', citation: 'Reg (EC) 1234/2008' },
  labeling_administrative: { vehicle: 'Type IA variation', reportingCategory: 'Type IA', priorApprovalRequired: false, implementationTiming: 'Implement; notify within 12 months', citation: 'Reg (EC) 1234/2008' },
  new_indication: { vehicle: 'Type II variation (extension of indication)', reportingCategory: 'Type II', priorApprovalRequired: true, implementationTiming: 'After EMA approval', citation: 'Reg (EC) 1234/2008' },
  formulation_change: { vehicle: 'Line Extension', reportingCategory: 'Extension', priorApprovalRequired: true, implementationTiming: 'After EMA approval (new application)', citation: 'Annex I, Reg (EC) 1234/2008' },
  container_closure: { vehicle: 'Type IB variation', reportingCategory: 'Type IB', priorApprovalRequired: false, implementationTiming: 'After 30-day "tell, wait" period', citation: 'Reg (EC) 1234/2008' },
};

function major(citation: string): ChangeVehicle {
  return { vehicle: 'Partial change approval application (一部変更承認申請)', reportingCategory: 'Partial change application', priorApprovalRequired: true, implementationTiming: 'After PMDA/MHLW approval', citation };
}
function minor(citation: string): ChangeVehicle {
  return { vehicle: 'Minor change notification (軽微変更届出)', reportingCategory: 'Minor change notification', priorApprovalRequired: false, implementationTiming: 'Notify within 30 days of the change', citation };
}
const PMDA_CIT = 'PMD Act Art. 14(9)/(11)';
const PMDA: Record<ChangeCategory, ChangeVehicle> = {
  manufacturing_site: major(PMDA_CIT),
  manufacturing_process_major: major(PMDA_CIT),
  manufacturing_process_minor: minor(PMDA_CIT),
  specification_tightening: minor(PMDA_CIT),
  specification_relaxation: major(PMDA_CIT),
  analytical_method: minor(PMDA_CIT),
  shelf_life_extension: major(PMDA_CIT),
  labeling_safety: major(PMDA_CIT),
  labeling_administrative: minor(PMDA_CIT),
  new_indication: major(PMDA_CIT),
  formulation_change: major(PMDA_CIT),
  container_closure: minor(PMDA_CIT),
};

const HC_CIT = 'Food and Drug Regulations (post-NOC changes) / HC PANDCs guidance';
function hcSnds(): ChangeVehicle {
  return { vehicle: 'Supplement to a New Drug Submission (SNDS)', reportingCategory: 'SNDS', priorApprovalRequired: true, implementationTiming: 'After Health Canada approval', citation: HC_CIT };
}
function hcNotifiable(): ChangeVehicle {
  return { vehicle: 'Notifiable Change', reportingCategory: 'Notifiable Change', priorApprovalRequired: false, implementationTiming: 'After the 90-day review period (no objection)', citation: HC_CIT };
}
function hcAnnual(): ChangeVehicle {
  return { vehicle: 'Annual Notification', reportingCategory: 'Annual Notification', priorApprovalRequired: false, implementationTiming: 'Implement; record in the annual notification', citation: HC_CIT };
}
const HEALTH_CANADA: Record<ChangeCategory, ChangeVehicle> = {
  manufacturing_site: hcSnds(),
  manufacturing_process_major: hcSnds(),
  manufacturing_process_minor: hcNotifiable(),
  specification_tightening: hcAnnual(),
  specification_relaxation: hcSnds(),
  analytical_method: hcNotifiable(),
  shelf_life_extension: hcSnds(),
  labeling_safety: hcSnds(),
  labeling_administrative: hcAnnual(),
  new_indication: hcSnds(),
  formulation_change: hcSnds(),
  container_closure: hcNotifiable(),
};

const CHANGE_VEHICLES: Record<ChangeMarket, Record<ChangeCategory, ChangeVehicle>> = {
  FDA, EMA, PMDA, HEALTH_CANADA,
};

export interface ChangeClassificationInput {
  market: ChangeMarket;
  category: ChangeCategory;
}

export interface ChangeClassification {
  market: ChangeMarket;
  category: ChangeCategory;
  vehicle: ChangeVehicle;
  notes: string[];
}

/**
 * Classify a post-approval change into the correct regulatory vehicle for the
 * market. Pure / deterministic. Throws for an unmodeled market/category.
 */
export function classifyChange(input: ChangeClassificationInput): ChangeClassification {
  const byMarket = CHANGE_VEHICLES[input.market];
  if (!byMarket) throw new Error(`No change vehicles modeled for market "${input.market}".`);
  const vehicle = byMarket[input.category];
  if (!vehicle) throw new Error(`Unknown change category "${input.category}".`);
  return {
    market: input.market,
    category: input.category,
    vehicle,
    notes: [
      'Reporting category is indicative; the final category depends on comparability data and the governing regulation/guidance.',
      vehicle.priorApprovalRequired
        ? 'Prior approval required — do not implement before the agency grants approval.'
        : 'Self-implementing within the stated timing unless the agency objects.',
    ],
  };
}

/** List the modeled change vehicles for a market (all categories). */
export function getChangeVehicles(market: ChangeMarket): Record<ChangeCategory, ChangeVehicle> | null {
  return CHANGE_VEHICLES[market] ?? null;
}

/** The set of modeled change categories. */
export const CHANGE_CATEGORIES: ChangeCategory[] = Object.keys(FDA) as ChangeCategory[];
