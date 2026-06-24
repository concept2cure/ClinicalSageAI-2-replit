/**
 * Cover-letter context from master data + submission.
 *
 * Assembles a CoverLetterInput from a sponsor registry record and a submission
 * record (plus caller overrides), so the IND cover letter can be generated
 * straight from stored data — the cover-letter analogue of the forms'
 * pdf-from-records flow.
 *
 * Pure / deterministic (records → input). The route that loads the records and
 * renders the letter lives in ind-lifecycle.routes.ts.
 */

import type { Sponsor } from '@shared/schema/ind-master-data';
import type { CoverLetterInput, IndSubmissionType } from './ind-cover-letter-service';
import { composeAddress } from '../ind-common/format';
import {
  getSubmissionTypeContext,
  type SubmissionTypeContext,
} from '../../../shared/regulatory/submission-type-bridge.js';

/** The submission fields the cover letter reads (a structural subset of the
 *  submissions row, so this stays decoupled from the full Drizzle select type). */
export interface CoverLetterSubmission {
  productName?: string | null;
  lifecycleStage?: string | null;
}

/** Map a submission lifecycle stage to the cover letter's submission type. */
export function lifecycleStageToSubmissionType(stage: string | null | undefined): IndSubmissionType {
  switch (stage) {
    case 'amendment':
      return 'information_amendment';
    case 'response':
      return 'response_to_information_request';
    case 'annual':
      return 'annual_report';
    case 'planning':
    case 'original':
    default:
      return 'original';
  }
}

export interface CoverLetterRecords {
  sponsor?: Sponsor | null;
  submission?: CoverLetterSubmission | null;
  /** Fields not held in master data / the submission row (indNumber, indication, fdaDivision, …). */
  overrides?: Partial<CoverLetterInput>;
  /** Optional top-level regulatory submission type (e.g. 'IND', 'US_IND') for
   *  bridge normalization. When provided, the bridge resolves it to canonical
   *  metadata that callers can use for context enrichment. */
  regulatoryType?: string;
}

export interface CoverLetterContextResult {
  input: CoverLetterInput;
  /** Canonical bridge context for the top-level regulatory type, if resolvable. */
  bridgeContext: SubmissionTypeContext | null;
}

/**
 * Assemble CoverLetterInput from a sponsor + submission record plus overrides.
 * Overrides win, so a route can supply the IND number, indication, FDA division
 * and letter date that are not stored on those records.
 *
 * When `regulatoryType` is supplied (e.g. 'IND', 'US_IND'), the bridge resolves
 * it and returns canonical context alongside the input for downstream enrichment.
 */
export function assembleCoverLetterContext(records: CoverLetterRecords): CoverLetterContextResult {
  const s = records.sponsor;
  const sub = records.submission;

  // Resolve the top-level regulatory type through the bridge (defaults to 'IND'
  // for IND lifecycle submissions) so callers get canonical metadata.
  const bridgeContext = getSubmissionTypeContext(records.regulatoryType ?? 'IND');

  const base: CoverLetterInput = {
    sponsorName: s?.name ?? '',
    sponsorAddress: s
      ? composeAddress([s.addressLine1, s.addressLine2, s.city, s.stateProvince, s.postalCode, s.country])
      : undefined,
    drugName: sub?.productName ?? '',
    submissionType: lifecycleStageToSubmissionType(sub?.lifecycleStage),
    contactName: s?.contactName ?? undefined,
    contactPhone: s?.contactPhone ?? undefined,
    contactEmail: s?.contactEmail ?? undefined,
    signatoryName: s?.signatoryName ?? undefined,
    signatoryTitle: s?.signatoryTitle ?? undefined,
  };

  return {
    input: { ...base, ...(records.overrides ?? {}) },
    bridgeContext,
  };
}
