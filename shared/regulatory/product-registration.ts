/**
 * Product / Registration spine — the level above the project.
 *
 * Regulatory affairs is product- and portfolio-centric; the rest of the platform
 * is project/submission-centric. A product lives for decades across an original
 * application plus many supplements / variations / renewals, in EVERY market,
 * carrying a registration STATUS per market and a living core data sheet. There
 * was no entity above the project to represent that.
 *
 * This is the spine: a `Product` (the molecule / biologic / device) owns a
 * `Registration` per market; each registration moves through a lifecycle that
 * specific filings advance. Pure contract (no DB) — the same disciplined pattern
 * as the program model. Persistence + UI hang off these types later.
 *
 * @module shared/regulatory/product-registration
 */

import { resolveToRegistryEntry } from './submission-type-bridge.js';
import type { ClientSegmentId } from './client-segments.js';
import { segmentForProductClasses } from './client-segments.js';
import type { CanonicalRegion } from './region-identity.js';
import type { ProductClass } from './document-taxonomy.js';

// ─── Product ─────────────────────────────────────────────────────────────────

export interface Product {
  /** Stable product id. */
  id: string;
  /** Display name (proprietary or development name). */
  name: string;
  /** The client segment this product belongs to. */
  segment: ClientSegmentId;
  /** Product classes (e.g. ['biologic'], ['medical_device']). */
  productClasses: ProductClass[];
}

// ─── Registration lifecycle (per product × market) ───────────────────────────

/**
 * A registration's state in one market. Grounded in real RA: an application is
 * developed, submitted, reviewed (clock running), and either approved or returned
 * with a deficiency (CRL / RTF / AI / NSE / major deficiency); post-approval it
 * can be suspended, withdrawn, or expire without renewal.
 */
export type RegistrationStatus =
  | 'not_started'
  | 'in_development'  // building the dossier (pre-submission)
  | 'submitted'      // filed to the agency
  | 'under_review'   // agency reviewing — statutory clock running
  | 'deficiency'     // CRL / RTF / AI / NSE / major deficiency — response required
  | 'approved'       // marketing authorization granted
  | 'suspended'      // registration suspended post-approval
  | 'withdrawn'      // application or registration withdrawn
  | 'expired';       // lapsed — no renewal

/** Valid transitions of the registration lifecycle. */
export const REGISTRATION_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  not_started: ['in_development'],
  in_development: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'withdrawn'],
  under_review: ['approved', 'deficiency', 'withdrawn'],
  deficiency: ['submitted', 'withdrawn'], // respond → re-enters review
  approved: ['suspended', 'withdrawn', 'expired'],
  suspended: ['approved', 'withdrawn'], // reinstated or withdrawn
  withdrawn: [],
  expired: ['in_development'], // re-registration
};

/** Whether a registration may move directly from one status to another. */
export function canTransition(from: RegistrationStatus, to: RegistrationStatus): boolean {
  return REGISTRATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** A registration is live (on-market) only when approved. */
export function isOnMarket(status: RegistrationStatus): boolean {
  return status === 'approved';
}

export interface Registration {
  productId: string;
  /** Market this registration is for. */
  market: CanonicalRegion;
  status: RegistrationStatus;
  /** The registry id of the application that established it (when known). */
  applicationType?: string;
}

// ─── Filing → registration event ─────────────────────────────────────────────

/**
 * What a filing DOES to a registration. A registration's history is a sequence
 * of these events — original application, then variations / renewals / periodic
 * reports over the product's life. Investigational filings (IND/CTA) authorize
 * trials and do not create a marketing registration.
 */
export type RegistrationEvent =
  | 'initial_application' // original marketing application (creates the registration)
  | 'variation'           // supplement / variation to an existing registration
  | 'renewal'
  | 'amendment'           // amendment to a still-pending application
  | 'periodic_report'     // annual report / PSUR / PBRER
  | 'investigational'     // IND / CTA — trial authorization, not a marketing registration
  | 'withdrawal';

/**
 * The registration event a filing type represents, from its lifecycle stage and
 * application family. Returns null for unknown selections.
 */
export function registrationEventForFiling(need: string): RegistrationEvent | null {
  const entry = resolveToRegistryEntry((need ?? '').trim());
  if (!entry) return null;

  const family = entry.applicationFamily;
  const stage = entry.stage;

  if (family === 'clinical_trial') return 'investigational';
  if (family === 'variation' || family === 'supplement' || stage === 'supplement') return 'variation';
  if (family === 'renewal' || stage === 'renewal') return 'renewal';
  if (stage === 'amendment') return 'amendment';
  if (family === 'safety_report' || stage === 'annual_report') return 'periodic_report';
  if (stage === 'withdrawal') return 'withdrawal';

  // device_clearance / device_approval / marketing_authorization at the initial stage.
  if (
    family === 'marketing_authorization' ||
    family === 'device_approval' ||
    family === 'device_clearance'
  ) {
    return 'initial_application';
  }
  return null;
}

// ─── Product helpers + portfolio rollup ──────────────────────────────────────

/** Build a product descriptor from its product classes (segment is derived). */
export function buildProduct(input: {
  id: string;
  name: string;
  productClasses: ProductClass[];
}): Product | null {
  const segment = segmentForProductClasses(input.productClasses);
  if (!segment) return null;
  return { id: input.id, name: input.name, segment, productClasses: input.productClasses };
}

export interface PortfolioRollup {
  total: number;
  byStatus: Record<RegistrationStatus, number>;
  /** Markets where the product is on-market (approved). */
  marketsApproved: CanonicalRegion[];
  /** Markets with an application in flight (development → review → deficiency). */
  marketsInFlight: CanonicalRegion[];
}

const IN_FLIGHT: ReadonlySet<RegistrationStatus> = new Set<RegistrationStatus>([
  'in_development',
  'submitted',
  'under_review',
  'deficiency',
]);

/** Roll a product's per-market registrations up into a portfolio view. */
export function rollupPortfolio(registrations: Registration[]): PortfolioRollup {
  const byStatus = {
    not_started: 0, in_development: 0, submitted: 0, under_review: 0,
    deficiency: 0, approved: 0, suspended: 0, withdrawn: 0, expired: 0,
  } as Record<RegistrationStatus, number>;

  const marketsApproved: CanonicalRegion[] = [];
  const marketsInFlight: CanonicalRegion[] = [];

  for (const r of registrations) {
    byStatus[r.status] += 1;
    if (isOnMarket(r.status)) marketsApproved.push(r.market);
    else if (IN_FLIGHT.has(r.status)) marketsInFlight.push(r.market);
  }

  return { total: registrations.length, byStatus, marketsApproved, marketsInFlight };
}

export default {
  REGISTRATION_TRANSITIONS,
  canTransition,
  isOnMarket,
  registrationEventForFiling,
  buildProduct,
  rollupPortfolio,
};
