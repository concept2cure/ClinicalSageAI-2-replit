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
