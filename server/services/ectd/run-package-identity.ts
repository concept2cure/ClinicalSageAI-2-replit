/**
 * The identity a package-orchestrator run's package names, read from the record
 * — or, when the record does not name it, why the run's assembly is a dry run.
 *
 * Its own module so the orchestrator's other suites can stand a recorded
 * identity in with one mock, as they stand in the validator, instead of
 * modelling the three record reads (tests/unit/orchestrator-dry-run-identity
 * drives this reader through them).
 *
 * @module server/services/ectd/run-package-identity
 */
import { pool } from '../../db.js';
import { packageIdentityRefusal, readSubmissionPackageIdentity } from './package-identity.js';

/** What a run says about the submission it packages. */
export interface RunIdentityInputs {
  organizationId: number;
  submissionId: string;
  submissionFk?: number | null;
  applicationNumber: string;
}

/** The identity a run's package names: recorded, or a dry run and why. */
export type RunPackageIdentity =
  | { recorded: true; applicationNumber: string; applicantName: string }
  | { recorded: false; reason: string };

/**
 * Read the run's package identity from the record (package-identity.ts — the
 * reader export, compile and transmit use): the submission's project's recorded
 * application number, which must be the run's, and the organisation's name.
 *
 * 2026-10-08 (P-27 follow-up): the validation assembly wrote
 * 'UNASSIGNED (applicant)' into the regional backbone, whose checksum is a leaf
 * of the index.xml the release signature binds and the signed snapshot stores.
 * A lookup that cannot run is a dry run, not a guess.
 */
export async function resolveRunPackageIdentity(inputs: RunIdentityInputs): Promise<RunPackageIdentity> {
  const fromText = Number(String(inputs.submissionId ?? '').trim());
  const submissionFk =
    typeof inputs.submissionFk === 'number' && inputs.submissionFk > 0
      ? inputs.submissionFk
      : Number.isInteger(fromText) && fromText > 0
        ? fromText
        : null;
  if (submissionFk === null) {
    return {
      recorded: false,
      reason:
        `the run names no submission on record ("${inputs.submissionId}"), so its application number and applicant ` +
        'cannot be read from the record.',
    };
  }
  let identity: Awaited<ReturnType<typeof readSubmissionPackageIdentity>>;
  try {
    identity = await readSubmissionPackageIdentity(pool, inputs.organizationId, submissionFk);
  } catch (err) {
    console.error('[Orchestrator] package identity read failed:', err instanceof Error ? err.message : err);
    return { recorded: false, reason: 'the recorded application number and applicant could not be read.' };
  }
  const refusal = packageIdentityRefusal(identity, 'This assembly is a dry run.');
  if (refusal) return { recorded: false, reason: refusal.message };
  if (identity.applicationNumber !== inputs.applicationNumber) {
    return {
      recorded: false,
      reason:
        `the run names application number "${inputs.applicationNumber}", but the record names ` +
        `"${identity.applicationNumber}". The record is authoritative.`,
    };
  }
  return {
    recorded: true,
    applicationNumber: identity.applicationNumber as string,
    applicantName: identity.applicantName as string,
  };
}
