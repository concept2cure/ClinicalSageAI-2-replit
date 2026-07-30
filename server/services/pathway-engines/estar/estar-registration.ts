/**
 * eSTAR client registration & eligibility model.
 *
 * Before a client can file into eSTAR they must register with FDA and hold the
 * accounts eSTAR filing depends on. This module models those prerequisites and,
 * given what a client has registered, computes which eSTAR submissions they are
 * eligible to file and what is still blocking the rest. It is the "clients must
 * register for this" half of the eSTAR capability: the catalog says what *can* be
 * filed; this says what *this client* can file today and why.
 *
 * Registration prerequisites modeled (per FDA electronic-submission requirements):
 *   - FDA Electronic Submissions Gateway (ESG) account — the transport channel for
 *     eCopy/eSTAR to CDRH/CBER.
 *   - CDRH Customer Collaboration Portal (CCP) account — where CDRH eSTARs and
 *     Q-Subs are submitted and tracked.
 *   - Organization identity (DUNS / FEI) — required on the eSTAR administrative page.
 *   - Signed-and-current MDUFA small-business or standard fee account, for the
 *     user-fee-bearing pathways (510(k), De Novo, PMA). Fee-exempt request types
 *     (Q-Sub, 513(g), IDE) do not gate on it.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network. The client's
 * registration state is passed in; nothing is persisted or inferred beyond it.
 * A submission the client cannot yet file is reported with its blockers, never
 * silently marked available.
 *
 * @module server/services/pathway-engines/estar/estar-registration
 */

import {
  ESTAR_CATALOG,
  getCatalogEntry,
  type EstarCatalogEntry,
  type EstarCatalogKey,
} from './estar-catalog';

/** A registration prerequisite a client must satisfy to file (some) eSTARs. */
export type EstarRegistrationRequirement =
  | 'fda_esg_account'
  | 'cdrh_portal_account'
  | 'organization_identity'
  | 'mdufa_fee_account';

export interface EstarRegistrationRequirementInfo {
  id: EstarRegistrationRequirement;
  label: string;
  description: string;
  /**
   * When true, only the user-fee-bearing pathways (510(k)/De Novo/PMA) require it;
   * fee-exempt request types (Q-Sub, IDE, 513(g)) are eligible without it.
   */
  feeBearingOnly: boolean;
}

export const ESTAR_REGISTRATION_REQUIREMENTS: EstarRegistrationRequirementInfo[] = [
  {
    id: 'fda_esg_account',
    label: 'FDA Electronic Submissions Gateway (ESG) account',
    description: 'The secure transport channel for electronic submissions to CDRH/CBER (WebTrader or AS2).',
    feeBearingOnly: false,
  },
  {
    id: 'cdrh_portal_account',
    label: 'CDRH Customer Collaboration Portal (CCP) account',
    description: 'The portal where CDRH eSTAR submissions and Q-Submissions are uploaded and tracked.',
    feeBearingOnly: false,
  },
  {
    id: 'organization_identity',
    label: 'Organization identity (DUNS / FEI)',
    description: 'The registered organization identifiers required on the eSTAR administrative page.',
    feeBearingOnly: false,
  },
  {
    id: 'mdufa_fee_account',
    label: 'MDUFA user-fee account (standard or small-business)',
    description: 'A current user-fee account/payment identifier required for fee-bearing marketing submissions.',
    feeBearingOnly: true,
  },
];

/** The requirements that gate a fee-bearing marketing pathway (510(k)/De Novo/PMA). */
const FEE_BEARING_PROGRAM_TYPES = new Set(['510k', 'de_novo', 'pma']);

/** A client's eSTAR registration state — which prerequisites they currently hold. */
export interface EstarClientRegistration {
  /** Stable client / organization identifier (opaque to this module). */
  clientId: string;
  /** Requirements the client has satisfied. */
  satisfied: EstarRegistrationRequirement[];
  /** Device variants the client is set up to file. Defaults to both when omitted. */
  variants?: Array<'device' | 'ivd'>;
}

/** Which registration requirements a given catalog entry depends on. */
export function requirementsForEntry(entry: EstarCatalogEntry): EstarRegistrationRequirement[] {
  const feeBearing = FEE_BEARING_PROGRAM_TYPES.has(entry.programType);
  return ESTAR_REGISTRATION_REQUIREMENTS.filter(
    (r) => !r.feeBearingOnly || feeBearing,
  ).map((r) => r.id);
}

export interface EstarSubmissionEligibility {
  key: EstarCatalogKey;
  label: string;
  /** True when the client holds every requirement this submission needs. */
  eligible: boolean;
  /** Requirements this submission needs. */
  required: EstarRegistrationRequirement[];
  /** Requirements still missing (empty when eligible). */
  missing: EstarRegistrationRequirement[];
}

export interface EstarEligibilityReport {
  clientId: string;
  /** True only when the client can file every catalog submission for its variants. */
  fullyRegistered: boolean;
  /** Per-submission eligibility across the catalog (variant-filtered). */
  submissions: EstarSubmissionEligibility[];
  /** Keys the client can file today. */
  eligibleKeys: EstarCatalogKey[];
  /** Union of requirements still missing anywhere (empty when fully registered). */
  missingRequirements: EstarRegistrationRequirement[];
}

/**
 * Assess which eSTAR submissions a client can file given its registration state.
 * Variant-filtered: only catalog entries applicable to the client's variants are
 * assessed. A submission is eligible only when every requirement it depends on is
 * satisfied — missing requirements are reported, never waved through.
 */
export function assessClientEstarEligibility(
  registration: EstarClientRegistration,
): EstarEligibilityReport {
  const satisfied = new Set(registration.satisfied);
  const variants = registration.variants ?? ['device', 'ivd'];
  const variantSet = new Set(variants);

  const applicable = ESTAR_CATALOG.filter((e) =>
    e.appliesToVariants.some((v) => variantSet.has(v)),
  );

  const submissions: EstarSubmissionEligibility[] = applicable.map((entry) => {
    const required = requirementsForEntry(entry);
    const missing = required.filter((r) => !satisfied.has(r));
    return {
      key: entry.key,
      label: entry.label,
      eligible: missing.length === 0,
      required,
      missing,
    };
  });

  const eligibleKeys = submissions.filter((s) => s.eligible).map((s) => s.key);
  const missingRequirements = [...new Set(submissions.flatMap((s) => s.missing))];

  return {
    clientId: registration.clientId,
    fullyRegistered: submissions.every((s) => s.eligible) && submissions.length > 0,
    submissions,
    eligibleKeys,
    missingRequirements,
  };
}

/** Eligibility for a single catalog key given a client's registration. */
export function canFile(
  registration: EstarClientRegistration,
  key: EstarCatalogKey,
): EstarSubmissionEligibility | undefined {
  const entry = getCatalogEntry(key);
  if (!entry) return undefined;
  const satisfied = new Set(registration.satisfied);
  const required = requirementsForEntry(entry);
  const missing = required.filter((r) => !satisfied.has(r));
  return { key, label: entry.label, eligible: missing.length === 0, required, missing };
}

export default {
  ESTAR_REGISTRATION_REQUIREMENTS,
  requirementsForEntry,
  assessClientEstarEligibility,
  canFile,
};
