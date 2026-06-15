/**
 * Electronic submission format & gateway requirements expert — global.
 *
 * Marketing applications must be submitted in a prescribed electronic format
 * (almost universally eCTD), transmitted through a designated agency gateway,
 * and pass that agency's eCTD validation criteria before they are accepted.
 * Each market also defines its own regional Module 1 (the region-specific
 * administrative module of the Common Technical Document). This service encodes
 * the format / version / gateway / validation / regional-module facts per
 * market and assesses a sponsor's submission against them — surfacing the
 * concrete shortfalls (wrong format, gateway not enrolled, validation not
 * passed) before transmission.
 *
 * Markets: FDA (US), EMA (EU centralised), PMDA (JP), HEALTH_CANADA (CA),
 * MHRA (UK). The catalog captures the durable format/gateway facts; eCTD
 * versions and gateway names evolve by agency notice, so every output carries a
 * caveat to confirm against the current agency guidance (honest-by-construction).
 *
 * Pure / deterministic — no DB, no IO, no live gateway lookup.
 *
 * Reference: FDA "Providing Regulatory Submissions in Electronic Format —
 * Certain Human Pharmaceutical Product Applications and Related Submissions
 * Using the eCTD Specifications" guidance; 21 CFR 314.50(l) / 601; FDA
 * Electronic Submissions Gateway (ESG). EU eCTD guidance / Notice to Applicants
 * (eSubmission Gateway / Web Client; CESP for national). PMDA eCTD notifications
 * (PMDA Gateway). Health Canada eCTD guidance (Common Electronic Submissions
 * Gateway, CESG). MHRA eCTD guidance (MHRA Submissions portal).
 *
 * @module server/services/global-ri/electronic-submission-format
 */

export type SubmissionMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA' | 'MHRA';

/** The ordered set of markets with a modeled electronic-submission profile. */
export const SUBMISSION_MARKETS: SubmissionMarket[] = ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'MHRA'];

export interface ValidationCriteria {
  /** Human name of the validation rule set. */
  name: string;
  /** Reference / source for the validation criteria. */
  reference: string;
}

export interface SubmissionFormat {
  /** Submission format (e.g. 'eCTD'). */
  format: string;
  /** Applicable eCTD specification version. */
  ectdVersion: string;
  /** Whether the electronic format is mandatory for the principal application type(s). */
  mandatory: boolean;
  /** Name of the electronic gateway used to transmit submissions. */
  gateway: string;
  /** Agency validation criteria the submission must pass. */
  validationCriteria: ValidationCriteria;
  /** The regional (Module 1) specification for the market. */
  regionalModule: string;
  /** Honest scope notes for the entry. */
  notes: string;
  /** Citation for the format / gateway facts. */
  citation: string;
}

/** Electronic-submission format & gateway profile, by market. */
export const SUBMISSION_FORMATS: Record<SubmissionMarket, SubmissionFormat> = {
  FDA: {
    format: 'eCTD',
    ectdVersion: 'eCTD v3.2.2 (eCTD v4.0 being introduced)',
    mandatory: true,
    gateway: 'FDA Electronic Submissions Gateway (ESG)',
    validationCriteria: { name: 'FDA eCTD Validation Criteria', reference: 'FDA eCTD Technical Conformance Guide / validation criteria' },
    regionalModule: 'FDA regional (Module 1, US)',
    notes: 'eCTD is mandatory for NDA, BLA, ANDA, and commercial INDs; transmitted via the FDA ESG.',
    citation: 'FDA, "Providing Regulatory Submissions in Electronic Format" guidance; 21 CFR 314.50(l) / 601.',
  },
  EMA: {
    format: 'eCTD',
    ectdVersion: 'EU eCTD (v3.2.2 / EU M1 spec)',
    mandatory: true,
    gateway: 'eSubmission Gateway / Web Client (CESP for national procedures)',
    validationCriteria: { name: 'EU eCTD Validation Criteria', reference: 'EU eCTD validation criteria (Notice to Applicants, Vol 2B)' },
    regionalModule: 'EU Module 1',
    notes: 'eCTD is mandatory for the centralised procedure; national procedures may use CESP.',
    citation: 'EU eCTD guidance / Notice to Applicants (eSubmission Gateway).',
  },
  PMDA: {
    format: 'eCTD',
    ectdVersion: 'JP eCTD (v3.2.2 / JP M1 spec)',
    mandatory: true,
    gateway: 'PMDA Gateway',
    validationCriteria: { name: 'JP eCTD Validation Criteria', reference: 'PMDA eCTD validation specification' },
    regionalModule: 'JP Module 1',
    notes: 'eCTD is accepted/required for new drug approval applications; transmitted via the PMDA Gateway.',
    citation: 'PMDA eCTD notifications.',
  },
  HEALTH_CANADA: {
    format: 'eCTD',
    ectdVersion: 'CA eCTD (v3.2.2 / CA M1 spec)',
    mandatory: true,
    gateway: 'Common Electronic Submissions Gateway (CESG)',
    validationCriteria: { name: 'HC eCTD Validation Rules', reference: 'Health Canada eCTD validation rules' },
    regionalModule: 'CA Module 1',
    notes: 'eCTD is required for many regulatory transactions; transmitted via the CESG.',
    citation: 'Health Canada eCTD guidance.',
  },
  MHRA: {
    format: 'eCTD',
    ectdVersion: 'UK eCTD (v3.2.2 / UK M1 spec)',
    mandatory: true,
    gateway: 'MHRA Submissions portal',
    validationCriteria: { name: 'UK eCTD Validation Criteria', reference: 'MHRA eCTD validation criteria' },
    regionalModule: 'UK Module 1',
    notes: 'eCTD is used for UK marketing authorisation applications; submitted via the MHRA Submissions portal.',
    citation: 'MHRA eCTD guidance.',
  },
};

export interface SubmissionReadinessInput {
  market: SubmissionMarket;
  /** The format the sponsor intends to submit (e.g. 'eCTD'). */
  format?: string;
  /** Whether the sponsor is enrolled with the market's gateway. */
  gatewayEnrolled?: boolean;
  /** Whether the submission has passed the agency's validation criteria. */
  validationPassed?: boolean;
}

export interface SubmissionReadinessResult {
  market: SubmissionMarket;
  ready: boolean;
  /** Concrete shortfalls blocking acceptance. */
  issues: string[];
  /** The full encoded format profile for the market. */
  required: SubmissionFormat;
  notes: string[];
}

const EVOLUTION_CAVEAT =
  'eCTD versions, gateways, and validation criteria evolve by agency notice; confirm against the current agency guidance.';

/**
 * Assess a sponsor's submission package against the market's electronic-format /
 * gateway / validation requirements. ready ⇔ the format matches the required
 * format AND the gateway is enrolled AND validation has passed; each shortfall
 * is listed in issues. A missing/empty format is treated as a gap.
 * Throws for an unmodeled market. Pure / deterministic.
 */
export function assessSubmissionReadiness(input: SubmissionReadinessInput): SubmissionReadinessResult {
  const required = SUBMISSION_FORMATS[input.market];
  if (!required) {
    throw new Error(`No electronic-submission format modeled for market "${input.market}".`);
  }

  const issues: string[] = [];

  const suppliedFormat = typeof input.format === 'string' ? input.format.trim() : '';
  if (suppliedFormat === '') {
    issues.push(`Submission format not supplied; ${input.market} requires ${required.format}.`);
  } else if (suppliedFormat.toLowerCase() !== required.format.toLowerCase()) {
    issues.push(`Submission format "${input.format}" does not match the required format ${required.format} for ${input.market}.`);
  }

  if (input.gatewayEnrolled !== true) {
    issues.push(`Not enrolled with the ${required.gateway}; gateway enrollment is required to transmit submissions.`);
  }

  if (input.validationPassed !== true) {
    issues.push(`Submission has not passed the ${required.validationCriteria.name}.`);
  }

  return {
    market: input.market,
    ready: issues.length === 0,
    issues,
    required,
    notes: [
      `Required format: ${required.format} (${required.ectdVersion}); gateway: ${required.gateway}; regional module: ${required.regionalModule}.`,
      required.notes,
      EVOLUTION_CAVEAT,
    ],
  };
}

/** The encoded electronic-submission format profile for a market, or null if unmodeled. */
export function getSubmissionFormat(market: SubmissionMarket): SubmissionFormat | null {
  return SUBMISSION_FORMATS[market] ?? null;
}
