/**
 * What an eCTD package names as its APPLICANT and its APPLICATION, read from
 * the record only — the one reader every path that builds a package from a
 * submission uses: the export / inspection copy (assembleSubmissionEctd), the
 * eCTD compile, and the sequence transmit (submission-service transmitSequence).
 *
 * ── Why (QA 2026-10-08, j6) ──────────────────────────────────────────────────
 * The inspection copy of PLR-606 sequence 0000 carried
 *   <company-name>UNASSIGNED (organization 1)</company-name>
 * although the organisation record says Concept2Cure Therapeutics (the sponsor
 * of record, as Form FDA 1571 names it), and
 *   <application-number>PLR-606</application-number>
 * which is the program's own code, not a number FDA assigned. The sequence
 * transmit sent no sponsor name, so a transmitted package would have carried
 * the placeholder too. Each path filled the gap its own way
 * (recordedApplicationId fell back to the program code, then to
 * UNASSIGNED-SEQ-<id>; the applicant fell back to UNASSIGNED (organization N)).
 *
 * The rule now, in one place:
 *   - the applicant is `organizations.name`, the sponsor of record in this data
 *     model, held to the backbone's applicant-name contract (usableIdentifier);
 *   - the application number is `regulatory_programs.application_number` of the
 *     submission's project, and nothing else — never the program code;
 *   - with either missing, the package is refused by name
 *     (PackageIdentityMissingError). A regulated package never carries a
 *     placeholder for either.
 *
 * The applicant's <id> (D-U-N-S) has no recorded home on the sequence path yet;
 * it is out of this rule and reported as a decision (docs/evidence/QA-2026-10-08/
 * submission-center-3/README.md). The package spine (submission-ops) records
 * all three identifiers on the package and refuses on REGULATORY-IDENTIFIER-MISSING.
 *
 * Reads through an injected pg-style `query`, so a route on the pool and a
 * service on Drizzle (queryableFromDrizzle) ask the same two questions.
 *
 * @module server/services/ectd/package-identity
 */
import { usableIdentifier } from './regulatory-identifiers';

export interface PackageIdentityQueryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export interface RecordedPackageIdentity {
  /** The submission's project; null when the submission is anchored to none. */
  programId: string | null;
  /** regulatory_programs.application_number, when the project records a usable one. */
  applicationNumber: string | null;
  /** organizations.name, when usable as the backbone's applicant name. */
  applicantName: string | null;
}

export type PackageIdentityField = 'applicationNumber' | 'applicantName';

/** A package refused because the record does not name its application or its applicant. */
export class PackageIdentityMissingError extends Error {
  readonly code = 'PACKAGE_IDENTITY_MISSING' as const;
  constructor(
    readonly missing: PackageIdentityField[],
    message: string,
  ) {
    super(message);
    this.name = 'PackageIdentityMissingError';
  }
}

/** The organisation's name and the project's application number, as recorded. */
export async function readRecordedPackageIdentity(
  q: PackageIdentityQueryable,
  organizationId: number,
  programId: string | null | undefined,
): Promise<RecordedPackageIdentity> {
  const org = (await q.query(`SELECT name FROM organizations WHERE id = $1 LIMIT 1`, [organizationId])).rows[0] as
    | { name?: unknown }
    | undefined;
  const program = programId
    ? ((
        await q.query(
          `SELECT application_number FROM regulatory_programs
            WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [programId, organizationId],
        )
      ).rows[0] as { application_number?: unknown } | undefined)
    : undefined;
  return {
    programId: programId ?? null,
    applicationNumber: usableIdentifier('applicationNumber', program?.application_number ?? null),
    applicantName: usableIdentifier('applicantName', org?.name ?? null),
  };
}

/**
 * The refusal naming what the record lacks, or null when the package can name
 * both. `outcome` closes the sentence in the caller's terms ("Nothing was
 * built.", "Nothing was sent.").
 */
export function packageIdentityRefusal(identity: RecordedPackageIdentity, outcome: string): PackageIdentityMissingError | null {
  const missing: PackageIdentityField[] = [];
  const gaps: string[] = [];
  if (!identity.applicationNumber) {
    missing.push('applicationNumber');
    gaps.push(
      identity.programId
        ? 'its project records no agency application number (record the number the agency assigned on the project; the program code is not one)'
        : 'the submission is not anchored to a project, so no agency application number is recorded for it (anchor it, then record the number on the project)',
    );
  }
  if (!identity.applicantName) {
    missing.push('applicantName');
    gaps.push("the organization's record has no usable name to give as the applicant");
  }
  if (missing.length === 0) return null;
  return new PackageIdentityMissingError(
    missing,
    `A package names its application and its applicant from the record, never a placeholder, and ${gaps.join('; and ')}. ${outcome}`,
  );
}

/**
 * The project a submission is anchored to, then its recorded identity — for a
 * caller that holds a submission id rather than a project (the package
 * orchestrator). An unknown or foreign submission reads as anchored to none, so
 * its refusal names the missing application number.
 */
export async function readSubmissionPackageIdentity(
  q: PackageIdentityQueryable,
  organizationId: number,
  submissionId: number,
): Promise<RecordedPackageIdentity> {
  const row = (
    await q.query(
      `SELECT program_id FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [submissionId, organizationId],
    )
  ).rows[0] as { program_id?: unknown } | undefined;
  const programId = typeof row?.program_id === 'string' && row.program_id ? row.program_id : null;
  return readRecordedPackageIdentity(q, organizationId, programId);
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
