/**
 * Global Regulatory Intelligence — shared UI taxonomy.
 *
 * Single source of truth for how the global-RI capability surface is GROUPED for
 * navigation/IA. Both the server capabilities index
 * (server/services/global-ri/global-ri-capabilities.ts) and the client UI import
 * these group ids/labels so the navigation can't drift from the backend catalog.
 *
 * This is the data layer for the forthcoming UI kit — it deliberately contains NO
 * components, only the grouping/labelling taxonomy. Zero runtime dependencies
 * (pure data), so it is safe to import from server, client, scripts, and tests.
 *
 * @module shared/constants/global-ri-ui
 */

/** A navigation group for the global-RI capability catalog. */
export interface GlobalRiGroupMeta {
  /** Stable group id (machine key). */
  id: string;
  /** Display label for navigation. */
  label: string;
  /** Sort order in the navigation. */
  order: number;
  /** One-line description of what the group covers. */
  blurb: string;
}

/** The ordered global-RI navigation groups (UI IA). */
export const GLOBAL_RI_GROUPS = [
  { id: 'strategy', label: 'Strategy & Pathway', order: 1, blurb: 'Pathway selection, cross-market strategy brief, dossier legal basis, fees, reliance, and guidance.' },
  { id: 'designations_access', label: 'Designations & Access', order: 2, blurb: 'Orphan/pediatric designations, expedited programs, and pre-approval (expanded) access.' },
  { id: 'clinical', label: 'Clinical & Nonclinical', order: 3, blurb: 'Trial-application requirements, HA meetings, nonclinical (ICH M3), bioequivalence, and evidence standards.' },
  { id: 'quality_cmc', label: 'Quality & CMC', order: 4, blurb: 'Specifications, stability, impurities, and process validation.' },
  { id: 'safety_pv', label: 'Safety & Pharmacovigilance', order: 5, blurb: 'Investigational safety reporting, post-approval pharmacovigilance, and GCP records.' },
  { id: 'submissions', label: 'Submissions & Format', order: 6, blurb: 'Module 1, electronic submission format, labeling, post-approval changes, and inspection readiness.' },
  { id: 'devices_dx', label: 'Devices & Diagnostics', order: 7, blurb: 'Device/IVD classification, combination products, companion diagnostics, and advanced therapies.' },
  { id: 'lifecycle', label: 'Lifecycle & Post-market', order: 8, blurb: 'Exclusivity/LOE, recurring lifecycle obligations, and clinical-trial disclosure.' },
  { id: 'commercial_supply', label: 'Commercial & Supply Chain', order: 9, blurb: 'Promotion, controlled substances, establishment registration, import/export, and distribution (GDP).' },
] as const satisfies readonly GlobalRiGroupMeta[];

/** Closed union of the global-RI group ids. */
export type GlobalRiGroupId = (typeof GLOBAL_RI_GROUPS)[number]['id'];

/** The group ids in display order. */
export const GLOBAL_RI_GROUP_IDS: GlobalRiGroupId[] = GLOBAL_RI_GROUPS.map((g) => g.id);

/** Lookup a group's metadata by id. */
export function getGlobalRiGroup(id: GlobalRiGroupId): GlobalRiGroupMeta | undefined {
  return GLOBAL_RI_GROUPS.find((g) => g.id === id);
}
