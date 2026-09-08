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
    facilityName: i.siteName ?? undefined,
    facilityAddress: i.siteAddress ?? undefined,
    irbNameAddress: composeAddress([i.irbName, i.irbAddress]),
    irbName: i.irbName ?? undefined,
    irbAddress: i.irbAddress ?? undefined,
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

// ---------------------------------------------------------------------------
// The program record → form context
// ---------------------------------------------------------------------------

/**
 * The facts a `regulatory_programs` row and its organisation hold about a
 * filing. Structurally satisfied by the row the IND forms route reads.
 */
export interface ProgramFormFacts {
  /** `organizations.name` — the sponsor of record in this data model. */
  sponsorName?: string | null;
  /** `regulatory_programs.product_name`. */
  productName?: string | null;
  /** `regulatory_programs.indication`. */
  indication?: string | null;
  /** `regulatory_programs.application_number` — the AGENCY-assigned number. */
  applicationNumber?: string | null;
  /** `regulatory_programs.program_type` (IND / NDA / BLA / MAA / …). */
  programType?: string | null;
}

/**
 * Program types whose agency number has a box on these forms, and the token
 * Form 356h's `application_type` field accepts for each. A program type absent
 * here (MAA, 510K, CER, …) contributes NO number: the FDA drug forms have no
 * box for a foreign application number, and writing one into the NDA/BLA box
 * would be a false statement on a signed form.
 */
const FORM_APPLICATION_TYPE: Record<string, 'NDA' | 'ANDA' | 'BLA'> = {
  NDA: 'NDA',
  ANDA: 'ANDA',
  BLA: 'BLA',
};

/** Trimmed text, or null — a blank cell is absent, not a value. */
function present(value: string | null | undefined): string | null {
  const t = typeof value === 'string' ? value.trim() : '';
  return t.length > 0 ? t : null;
}

/**
 * Map the open program's record onto the form builders' metadata.
 *
 * This is what makes the Module 1 forms read the database instead of a typist:
 * the sponsor, the product, the indication and the agency number are held once,
 * on the program, and every form takes them from there. The mapping is pure and
 * OMITS what the record does not hold — an absent value must reach the builders
 * as absent so `missingRequired` stays the server's honest verdict, which an
 * empty string would defeat.
 *
 * The number is routed by program type, never by shape: an IND's number is the
 * IND number (Form 1571 box 1), an NDA/ANDA/BLA's is the application number
 * (Form 356h). Putting one in the other's box would misstate the filing.
 */
export function programToFormMetadata(program: ProgramFormFacts): Partial<IndProjectMetadata> {
  const meta: Partial<IndProjectMetadata> = {};

  const sponsorName = present(program.sponsorName);
  if (sponsorName) meta.sponsorName = sponsorName;

  const drugName = present(program.productName);
  if (drugName) meta.drugName = drugName;

  const indication = present(program.indication);
  if (indication) meta.indication = indication;

  const programType = (present(program.programType) ?? '').toUpperCase();
  const applicationNumber = present(program.applicationNumber);
  if (programType === 'IND') {
    // NULL until the agency assigns one — an original IND has no number yet,
    // and box 1 of the 1571 is correctly blank on that filing.
    if (applicationNumber) meta.indNumber = applicationNumber;
  } else if (FORM_APPLICATION_TYPE[programType]) {
    meta.applicationType = FORM_APPLICATION_TYPE[programType];
    if (applicationNumber) meta.applicationNumber = applicationNumber;
  }

  return meta;
}
