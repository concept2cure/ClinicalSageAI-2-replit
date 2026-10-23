/**
 * The canonical recorded application and applicant identity for sequence
 * compile, export, transmit and orchestrator runs. DUNS/contact facts live once
 * in ind_sponsors; regulatory_programs explicitly selects that sponsor.
 * A bound registry name is authoritative. Only an unbound legacy read uses
 * organizations.name. FDA packages require the binding and complete facts;
 * dry-run placeholders are minted only by dryRunPackageIdentity below.
 */
import {
  fdaIdentifierProblems,
  sameRegulatoryContact,
  usableContactField,
  usableIdentifier,
  type RegulatoryContactValues,
} from './regulatory-identifiers';
import type { FdaApplicantContact } from '../submission-gateways/ectd-packager/types';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';

export interface PackageIdentityQueryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export interface RecordedPackageIdentity {
  programId: string | null;
  applicationNumber: string | null;
  /** The explicit ind_sponsors record, distinct from its packaged DUNS. */
  applicantSponsorId: string | null;
  applicantName: string | null;
  /** FDA DUNS only; never reinterpret it as an EMA/PMDA identifier. */
  applicantId: string | null;
  contact: RegulatoryContactValues;
  /**
   * Set when the submission is for a market other than its project's home
   * market (decision P-44): `applicationNumber` is then the number recorded on
   * that submission, never the project's. Absent for the home market and for
   * a read by project.
   */
  market?: { region: string };
  /** The project's primary agency, which names its home market (P-44). Not a package fact. */
  homeAgency?: string | null;
  /** Runtime diagnosis only: unresolved ownership withholds every application number. */
  marketResolutionProblem?: string;
}

/** Versioned captured facts carried by the existing governed package binding. */
export interface RecordedPackageIdentitySnapshot {
  version: 1;
  identity: RecordedPackageIdentity;
}

export type PackageIdentityField =
  | 'applicationNumber' | 'applicantName' | 'applicantSponsorId' | 'applicantId'
  | 'contact' | 'contact.name' | 'contact.phone' | 'contact.email';

export class PackageIdentityMissingError extends Error {
  readonly code = 'PACKAGE_IDENTITY_MISSING' as const;
  constructor(readonly missing: PackageIdentityField[], message: string) {
    super(message);
    this.name = 'PackageIdentityMissingError';
  }
}

/** Capture package facts by value; FDA-only facts have no non-US meaning. */
export function recordedPackageIdentitySnapshot(
  identity: RecordedPackageIdentity,
  options: { region?: string | null } = {},
): RecordedPackageIdentitySnapshot {
  const region = canonicalRegionOf(options.region ?? '');
  // Default/FDA capture preserves the original version-1 bytes. A default
  // clone of an already projected capture also retains its canonical nulls.
  const nonUs = region !== undefined && region !== 'US';
  const contact: Partial<RegulatoryContactValues> = nonUs ? {} : identity.contact ?? {};
  return {
    version: 1,
    identity: {
      programId: identity.programId ?? null,
      applicationNumber: identity.applicationNumber ?? null,
      applicantSponsorId: identity.applicantSponsorId ?? null,
      applicantName: identity.applicantName ?? null,
      applicantId: nonUs ? null : identity.applicantId ?? null,
      contact: {
        name: contact.name ?? null,
        phone: contact.phone ?? null,
        email: contact.email ?? null,
      },
    },
  };
}

/** Intact historical snapshots without identity proof do not cover release identity. */
export function sameRecordedPackageIdentitySnapshot(
  a: RecordedPackageIdentitySnapshot | null | undefined,
  b: RecordedPackageIdentitySnapshot | null | undefined,
): boolean {
  if (a?.version !== 1 || b?.version !== 1 || !a.identity || !b.identity) return false;
  const fields = ['programId', 'applicationNumber', 'applicantSponsorId', 'applicantName', 'applicantId'] as const;
  const isValue = (v: unknown) => v === null || typeof v === 'string';
  if (!fields.every((field) => isValue(a.identity[field]) && isValue(b.identity[field]) && a.identity[field] === b.identity[field])) return false;
  const ac = a.identity.contact;
  const bc = b.identity.contact;
  if (!ac || !bc || !['name', 'phone', 'email'].every((field) =>
    isValue(ac[field as keyof RegulatoryContactValues]) && isValue(bc[field as keyof RegulatoryContactValues]))) return false;
  return sameRegulatoryContact(ac, bc);
}

/** Map the existing registry's regulatory contact into the existing FDA shape. */
export function fdaContactsForPackageIdentity(identity: RecordedPackageIdentity): FdaApplicantContact[] {
  const { name, phone, email } = identity.contact ?? {};
  return name && phone && email ? [{ type: 'regulatory', name, phone, email }] : [];
}

interface IdentityRow {
  organization_name?: unknown;
  application_number?: unknown;
  primary_agency?: unknown;
  applicant_sponsor_id?: unknown;
  sponsor_id?: unknown;
  sponsor_name?: unknown;
  duns?: unknown;
  contact_name?: unknown;
  contact_phone?: unknown;
  contact_email?: unknown;
}

/** One statement sees program, organization and same-tenant sponsor together. */
export async function readRecordedPackageIdentity(
  q: PackageIdentityQueryable,
  organizationId: number,
  programId: string | null | undefined,
): Promise<RecordedPackageIdentity> {
  const row = (await q.query(
    `SELECT o.name AS organization_name, p.application_number, p.primary_agency, p.applicant_sponsor_id,
            s.id AS sponsor_id, s.name AS sponsor_name, s.duns,
            s.contact_name, s.contact_phone, s.contact_email
       FROM organizations o
       LEFT JOIN regulatory_programs p
         ON p.id = $2::uuid AND p.organization_id = o.id AND p.deleted_at IS NULL
       LEFT JOIN ind_sponsors s
         ON s.id = p.applicant_sponsor_id AND s.organization_id = p.organization_id
      WHERE o.id = $1 LIMIT 1`,
    [organizationId, programId ?? null],
  )).rows[0] as IdentityRow | undefined;
  return identityFromRow(row ?? {}, programId ?? null);
}

function identityFromRow(row: IdentityRow, programId: string | null): RecordedPackageIdentity {
  const applicantSponsorId = typeof row.applicant_sponsor_id === 'string' ? row.applicant_sponsor_id : null;
  // A missing/foreign explicit sponsor is a missing applicant, never the org.
  const bound = applicantSponsorId !== null && row.sponsor_id === applicantSponsorId;
  return {
    programId,
    applicationNumber: usableIdentifier('applicationNumber', row.application_number),
    applicantSponsorId,
    applicantName: usableIdentifier('applicantName', applicantSponsorId === null ? row.organization_name : bound ? row.sponsor_name : null),
    applicantId: bound ? usableIdentifier('applicantId', row.duns) : null,
    contact: {
      name: bound ? usableContactField('name', row.contact_name) : null,
      phone: bound ? usableContactField('phone', row.contact_phone) : null,
      email: bound ? usableContactField('email', row.contact_email) : null,
    },
    homeAgency: typeof row.primary_agency === 'string' ? row.primary_agency : null,
  };
}

/** Lock applicant-name fallback, then parent, before sequence/program/sponsor. */
export async function lockSubmissionPackageIdentity(
  q: PackageIdentityQueryable,
  organizationId: number,
  submissionId: number,
  options: { forUpdate?: boolean } = {},
): Promise<{ programId: string | null } | null> {
  await q.query('SELECT id FROM organizations WHERE id = $1 FOR SHARE', [organizationId]);
  const row = (await q.query(
    options.forUpdate
      ? `SELECT program_id FROM submissions
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`
      : `SELECT program_id FROM submissions
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR SHARE`,
    [submissionId, organizationId],
  )).rows[0] as { program_id: string | null } | undefined;
  return row ? { programId: row.program_id } : null;
}

/**
 * Called inside the caller's transaction after its sequence lock. Lock program
 * before sponsor, matching the binding writer; never hold these across network
 * transmission. A missing record is judged by the canonical reader/refusal.
 */
export async function lockRecordedPackageIdentity(
  q: PackageIdentityQueryable,
  organizationId: number,
  programId: string | null | undefined,
): Promise<void> {
  if (!programId) return;
  const row = (await q.query(
    `SELECT applicant_sponsor_id FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR SHARE`,
    [programId, organizationId],
  )).rows[0] as { applicant_sponsor_id?: unknown } | undefined;
  if (typeof row?.applicant_sponsor_id !== 'string') return;
  await q.query(`SELECT id FROM ind_sponsors WHERE id = $1 AND organization_id = $2 FOR SHARE`,
    [row.applicant_sponsor_id, organizationId]);
}

type LegacyReadableIdentity = Pick<RecordedPackageIdentity, 'programId' | 'applicationNumber' | 'applicantName'> &
  Partial<Pick<RecordedPackageIdentity, 'applicantSponsorId' | 'applicantId' | 'contact' | 'market' | 'marketResolutionProblem'>>;

function applicationNumberGap(identity: LegacyReadableIdentity): string {
  if (identity.marketResolutionProblem) return identity.marketResolutionProblem;
  if (identity.market) {
    return `this submission is the project's ${identity.market.region} market, and records no application number of its own ` +
      "(record the number its agency assigned on the submission; the project's number is its home market's, P-44)";
  }
  return identity.programId
    ? 'its project records no agency application number (record the number the agency assigned on the project; the program code is not one)'
    : 'the submission is not anchored to a project, so no agency application number is recorded for it (anchor it, then record the number on the project)';
}

/** Named actionable gaps, using the existing FDA identifier/contact rules. */
export function packageIdentityRefusal(
  identity: LegacyReadableIdentity,
  outcome: string,
  options: { fda?: boolean } = {},
): PackageIdentityMissingError | null {
  const missing: PackageIdentityField[] = [];
  const gaps: string[] = [];
  if (!identity.applicationNumber) {
    missing.push('applicationNumber');
    gaps.push(applicationNumberGap(identity));
  }
  if (!identity.applicantName) {
    missing.push('applicantName');
    gaps.push(identity.applicantSponsorId
      ? 'the bound sponsor record has no usable applicant name in this organization'
      : "the organization's record has no usable name to give as the applicant");
  }
  if (options.fda) {
    if (!identity.applicantSponsorId) {
      missing.push('applicantSponsorId');
      gaps.push('its project has no explicitly bound sponsor record (select the recorded applicant in Module 1 forms)');
    }
    if (!identity.applicantId) {
      missing.push('applicantId');
      gaps.push('the bound sponsor records no usable D-U-N-S number (record its nine digits in the sponsor registry)');
    }
    for (const problem of fdaIdentifierProblems({
      applicationNumber: identity.applicationNumber, applicantId: identity.applicantId,
      contact: identity.contact,
    })) {
      for (const field of problem.fields) if (!missing.includes(field as PackageIdentityField)) missing.push(field as PackageIdentityField);
      gaps.push(problem.message);
    }
  }
  return missing.length ? new PackageIdentityMissingError(missing,
    `A package names its application and its applicant from the record, never a placeholder, and ${gaps.join('; and ')}. ${outcome}`) : null;
}

/**
 * Whether a submission's region is its project's home market, the region of the
 * project's primary agency (decision P-44). Both sides must name recognized
 * regions: an unknown value never establishes ownership of the project's number.
 */
export function isHomeMarket(submissionRegion: unknown, primaryAgency: unknown): boolean {
  const market = canonicalRegionOf(typeof submissionRegion === 'string' ? submissionRegion : '');
  const home = canonicalRegionOf(typeof primaryAgency === 'string' ? primaryAgency : '');
  return market !== undefined && market === home;
}

function unresolvedMarketIdentity(identity: RecordedPackageIdentity, problem: string): RecordedPackageIdentity {
  return { ...identity, applicationNumber: null, marketResolutionProblem: problem };
}

/** Database region fields are untrusted text, not a new region vocabulary. */
function recordedRegionText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Resolve the submission's same-tenant program before reading recorded facts,
 * and the number the package's market carries (P-44). The market is the
 * package's region (`options.region`, the sequence's), else the submission's
 * own: the home market (the project's primary agency's region) reads the
 * project's number; the submission's own market reads the number recorded on
 * the submission; any other region has none recorded here, and is refused by
 * name. A sequence of another region under a submission therefore never
 * borrows its submission's number (security review, 2026-10-22). The applicant
 * and its contact are the project's either way. `application_number` is read
 * through to_jsonb, so a database the 20261022b column has not reached can still
 * read recognized home markets. Only an omitted/undefined override uses the
 * submission's region; an explicit null or unknown region never falls back.
 */
export async function readSubmissionPackageIdentity(
  q: PackageIdentityQueryable,
  organizationId: number,
  submissionId: number,
  options: { region?: string | null } = {},
): Promise<RecordedPackageIdentity> {
  const row = (await q.query(
    `SELECT program_id, primary_region, to_jsonb(s)->>'application_number' AS market_number
       FROM submissions s WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [submissionId, organizationId],
  )).rows[0] as { program_id?: unknown; primary_region?: unknown; market_number?: unknown } | undefined;
  const programId = typeof row?.program_id === 'string' && row.program_id ? row.program_id : null;
  const identity = await readRecordedPackageIdentity(q, organizationId, programId);
  if (!programId) {
    return unresolvedMarketIdentity(identity,
      "the submission is not anchored to a project; anchor it before resolving its market's recorded application number");
  }
  const packageRegion = options.region === undefined ? row?.primary_region : options.region;
  const market = canonicalRegionOf(recordedRegionText(packageRegion));
  const home = canonicalRegionOf(identity.homeAgency);
  if (!market) {
    return unresolvedMarketIdentity(identity,
      'the package market is not recognized; correct the submission or sequence region before packaging');
  }
  if (!home) {
    return unresolvedMarketIdentity(identity,
      "its project's primary agency is not recognized; correct the project's primary agency before packaging");
  }
  if (market === home) return identity;
  const submissionMarket = canonicalRegionOf(recordedRegionText(row?.primary_region));
  if (!submissionMarket) {
    return unresolvedMarketIdentity(identity,
      `this submission's market is not recognized; correct its primary region before packaging for the ${market} market`);
  }
  return {
    ...identity,
    applicationNumber: submissionMarket === market ? usableIdentifier('applicationNumber', row?.market_number) : null,
    market: { region: market },
  };
}

// ── Dry runs (P-27 follow-up, 2026-10-08) ────────────────────────────────────
//
// Three assemblies run only to ask a question of the package a sequence would
// make: the packageability check before a governed freeze or dispatch
// (submission-service assertSequencePackageable), the sequence assemble route
// (POST /api/submissions/sequences/:id/assemble), and — when the record does
// not name its identity — the package orchestrator's validation assembly. They
// may carry placeholder identity only because they produce no package: the
// staged bundle is discarded, nothing of it is stored, and nothing of it is
// sent. The placeholder is minted here and nowhere else, and every such output
// says it is a dry run.

/** What every dry-run output says about itself. */
export const DRY_RUN_NOTICE =
  'Dry run: this assembly answers what the package would hold and what transmit would refuse. It is not a package: ' +
  'it carries placeholder identity in place of the recorded application number and applicant, nothing of it is ' +
  'stored, and it is never sent.';

/** The placeholder identity a dry run carries. Each value says it is unassigned. */
export function dryRunPackageIdentity(
  sequenceLabel: number | string,
  organizationId: number,
): { applicationId: string; sponsorId: string; sponsorName: string } {
  return {
    applicationId: `UNASSIGNED-SEQ-${sequenceLabel}`,
    sponsorId: `UNASSIGNED-ORG-${organizationId}`,
    sponsorName: `UNASSIGNED (organization ${organizationId})`,
  };
}
