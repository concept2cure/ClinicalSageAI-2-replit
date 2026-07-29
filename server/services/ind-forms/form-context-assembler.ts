/**
 * Master data → FDA form context.
 *
 * Maps the sponsor / US-agent / investigator registry records (shared/schema/
 * ind-master-data) onto the form builders' input shapes (IndProjectMetadata +
 * SponsorInfo / AgentInfo / InvestigatorInfo), so 1571/1572/3674/3454/3455 can
 * be auto-populated straight from the registries instead of re-typed.
 *
 * Pure / deterministic (record → info). The route that loads the records and
 * generates the PDF lives in ind-forms.routes.ts.
 */

import type {
  Sponsor,
  RegulatoryAgent,
  Investigator,
  SubInvestigator,
} from '@shared/schema/ind-master-data';
import type {
  IndProjectMetadata,
  SponsorInfo,
  AgentInfo,
  InvestigatorInfo,
} from './ind-form-data-builders';
import { composeAddress, fullName } from '../ind-common/format';

/** Map a sponsor record to the form builders' SponsorInfo. */
export function sponsorToInfo(s: Sponsor): SponsorInfo {
  return {
    name: s.name,
    address: composeAddress([s.addressLine1, s.addressLine2, s.city, s.stateProvince, s.postalCode, s.country]),
    contactName: s.contactName ?? undefined,
    contactPhone: s.contactPhone ?? undefined,
    contactEmail: s.contactEmail ?? undefined,
    authorizedRepName: s.signatoryName ?? undefined,
    authorizedRepTitle: s.signatoryTitle ?? undefined,
  };
}

/** Map a US-agent record to the form builders' AgentInfo. */
export function agentToInfo(a: RegulatoryAgent): AgentInfo {
  return {
    name: a.name,
    address: composeAddress([a.addressLine1, a.addressLine2, a.city, a.stateProvince, a.postalCode, a.country]),
    phone: a.contactPhone ?? undefined,
  };
}

/** Map an investigator record to the form builders' InvestigatorInfo (1572/3454/3455). */
export function investigatorToInfo(i: Investigator): InvestigatorInfo {
  const subs = (i.subInvestigators as SubInvestigator[] | null | undefined) ?? [];
  return {
    name: fullName(i.firstName, i.lastName, i.credentials),
    qualifications: i.cvDocumentRef ?? undefined,
    facilityNameAddress: composeAddress([i.siteName, i.siteAddress]),
    irbNameAddress: composeAddress([i.irbName, i.irbAddress]),
    subInvestigators: subs
      .map((s) => (s.credentials ? `${s.name}, ${s.credentials}` : s.name))
      .filter((n) => n.length > 0),
  };
}

export interface FormContextRecords {
  sponsor?: Sponsor | null;
  agent?: RegulatoryAgent | null;
  investigators?: Investigator[];
  /** Project-level fields (drug name, indication, phase, …) not held in master data. */
  overrides?: Partial<IndProjectMetadata>;
}

/**
 * Assemble IndProjectMetadata from loaded registry records plus caller overrides.
 * Overrides win over the derived values, so a route can layer project-specific
 * fields (drugName, indication, studyPhase, certification basis) on top.
 */
export function assembleFormMetadata(records: FormContextRecords): IndProjectMetadata {
  const sponsor = records.sponsor ? sponsorToInfo(records.sponsor) : undefined;
  const agent = records.agent ? agentToInfo(records.agent) : undefined;
  const investigators = (records.investigators ?? []).map(investigatorToInfo);

  const base: IndProjectMetadata = {
    sponsorName: sponsor?.name,
    sponsor,
    agent,
    investigators: investigators.length > 0 ? investigators : undefined,
  };

  return { ...base, ...(records.overrides ?? {}) };
}
