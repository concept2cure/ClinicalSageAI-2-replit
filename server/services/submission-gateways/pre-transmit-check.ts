/**
 * Pre-transmit precondition gate (transmission hardening).
 *
 * The human authorization gate (assertTransmitAuthorized) proves a PERSON
 * approved the send. This gate proves the PACKAGE is fit to send — composed,
 * deterministic preconditions checked at the one point every transmit passes
 * through, alongside (not instead of) the Part 11 human gate:
 *
 *   1. Gateway size limit — HARD, always. A package over the region gateway's
 *      ceiling cannot be transmitted via the gateway (FDA Form 5640 v2.0: ESG
 *      for ≤10 GB, physical media above). This is a fact about the channel, not
 *      a policy toggle, so it always blocks.
 *   2. PDF/A submission grade — blocks in production when ECTD_REQUIRE_PDFA and
 *      the bundle shows unconverted PDF leaves.
 *   3. DTD self-containment — blocks in production when ECTD_REQUIRE_DTD and the
 *      bundle is not DTD self-contained.
 *   4. External agency-grade validation — folds evaluateExternalValidationGate
 *      when a report is supplied / required (ECTD_REQUIRE_EVALIDATOR).
 *
 * Flag-gated checks are report-only by default (identical to today's behavior);
 * they only block a production send when the operator has opted in. Missing
 * evidence never blocks (we warn rather than halt a legitimate send we cannot
 * disprove) — demonstrated non-compliance blocks.
 *
 * PURE (no I/O): callers pass the bundle + an optional external report.
 *
 * @module server/services/submission-gateways/pre-transmit-check
 */

import type { Region, SubmissionBundle } from './types';
import { getGatewaySizeLimit, type RegulatoryRegion } from '../ectd/ectd-regional-rules';
import {
  evaluateExternalValidationGate,
  evalidatorRequiredFromEnv,
  type ExternalValidationReport,
} from '../ectd/external-validator';
import { pdfaRequiredFromEnv } from '../ectd/pdfa-readiness';
import { dtdRequiredFromEnv } from '../ectd/dtd-bundler';
import {
  evaluateRegionalBackboneGate,
  regionalBackboneRequiredFromEnv,
} from '../ectd/regional-backbone-readiness';

/** Gateway region (lowercase) → regulatory region (uppercase) for the size limit. */
const REGION_TO_REGULATORY: Record<Region, RegulatoryRegion> = {
  fda: 'US', ema: 'EU', pmda: 'JP', ca: 'CA',
  uk: 'UK', ch: 'CH', au: 'AU', cn: 'CN', br: 'BR', in: 'IN', kr: 'KR', sg: 'SG',
};

export interface PreTransmitCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PreTransmitInput {
  region: Region;
  bundle: SubmissionBundle;
  environment: 'staging' | 'production';
  /** An already-run external (agency-grade) validation report, if available. */
  externalReport?: ExternalValidationReport | null;
  /** Whether a licensed external engine is configured (default false). */
  externalConfigured?: boolean;
  /**
   * Fold the external agency-grade validation gate into the decision. Default
   * true (the route layer, which has run the validator + holds the report).
   * The low-level gateway guard sets this false — it cannot run/receive a
   * report, and external enforcement already lives in assess-dispatch-readiness.
   */
  enforceExternal?: boolean;
  /** Env overrides (tests). */
  env?: NodeJS.ProcessEnv;
}

export interface PreTransmitResult {
  cleared: boolean;
  blockers: string[];
  checks: PreTransmitCheck[];
  /** Non-blocking advisories (e.g. required-flag set but no evidence to check). */
  warnings: string[];
}

/** Evaluate the pre-transmit preconditions for a package. Pure + deterministic. */
export function evaluatePreTransmit(input: PreTransmitInput): PreTransmitResult {
  const env = input.env ?? process.env;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const checks: PreTransmitCheck[] = [];
  const isProd = input.environment === 'production';

  // 1. Size limit — hard, always.
  const limit = getGatewaySizeLimit(REGION_TO_REGULATORY[input.region]);
  const sizeOk = input.bundle.sizeBytes <= limit;
  checks.push({
    name: 'gateway-size-limit',
    passed: sizeOk,
    detail: `${input.bundle.sizeBytes} bytes vs ${limit} byte limit for ${input.region.toUpperCase()}`,
  });
  if (!sizeOk) {
    const gb = (n: number) => (n / 1024 ** 3).toFixed(2);
    blockers.push(
      `Package is ${gb(input.bundle.sizeBytes)} GB, over the ${input.region.toUpperCase()} gateway limit of ` +
        `${gb(limit)} GB. Submit via the agency's large-submission channel (e.g. physical media) instead of the gateway.`,
    );
  }

  // 2. PDF/A submission grade.
  const grade = input.bundle.submissionGrade;
  const pdfaRequired = pdfaRequiredFromEnv(env);
  // A grade is evidence only when it carries the list the check reads; `{}`
  // used to pass as "0 not converted".
  if (grade && Array.isArray(grade.notConverted)) {
    const notConverted = grade.notConverted?.length ?? 0;
    const pdfaOk = notConverted === 0;
    checks.push({ name: 'pdfa-submission-grade', passed: pdfaOk, detail: `${grade.pdfaConverted}/${grade.pdfLeaves} PDF leaves are PDF/A; ${notConverted} not converted` });
    if (isProd && pdfaRequired && !pdfaOk) {
      blockers.push(`${notConverted} PDF leaf/leaves are not PDF/A (${grade.notConverted.slice(0, 3).join(', ')}${notConverted > 3 ? ', …' : ''}); ECTD_REQUIRE_PDFA blocks this production transmit.`);
    }
  } else if (isProd && pdfaRequired) {
    warnings.push('ECTD_REQUIRE_PDFA is set but the bundle carries no PDF/A grade — cannot prove PDF/A compliance at transmit time.');
  }

  // 3. DTD self-containment.
  const dtd = input.bundle.dtdStatus;
  const dtdRequired = dtdRequiredFromEnv(env);
  if (dtd) {
    checks.push({ name: 'dtd-self-contained', passed: dtd.selfContained, detail: dtd.selfContained ? 'all required DTDs bundled' : `missing: ${dtd.missing.join(', ')}` });
    if (isProd && dtdRequired && !dtd.selfContained) {
      blockers.push(`Package is not DTD self-contained (missing ${dtd.missing.join(', ')}); ECTD_REQUIRE_DTD blocks this production transmit.`);
    }
  } else if (isProd && dtdRequired) {
    warnings.push('ECTD_REQUIRE_DTD is set but the bundle carries no DTD status — cannot prove self-containment at transmit time.');
  }

  // 3a. Region identity — HARD, always. A bundle carries the region it was
  // BUILT for (the regional backbone it contains, and its format tag). Sending
  // an FDA-built package to PMDA, or a pmda_ectd bundle through an FDA gateway,
  // is a fact about the package, like the size limit — not a policy toggle.
  // This gate used to be region-blind: it read regionConformant without ever
  // comparing the backbone's region to the transmit target.
  // Two sources of the built region: the regional backbone the bundle contains
  // (eCTD formats) and the region the assemble route recorded on the descriptor
  // (every format). Either one that disagrees with the target blocks; a bundle
  // that carries neither is reported as unprovable, never treated as matching.
  const built = input.bundle.regionalBackbone;
  const declared = input.bundle.builtRegion;
  const evidence = built ? { region: built.region, source: built.file } : declared ? { region: declared, source: 'descriptor' } : null;
  if (evidence) {
    const same = evidence.region === input.region;
    checks.push({
      name: 'regional-backbone-region',
      passed: same,
      detail: same
        ? `built for ${evidence.region.toUpperCase()} (${evidence.source})`
        : `built for ${evidence.region.toUpperCase()} (${evidence.source}); transmit target is ${input.region.toUpperCase()}`,
    });
    if (!same) {
      blockers.push(
        `Package was assembled for ${evidence.region.toUpperCase()} (${evidence.source}); it cannot be transmitted to ` +
          `${input.region.toUpperCase()}. Re-assemble the package for ${input.region.toUpperCase()}.`,
      );
    }
  } else {
    warnings.push(
      `The bundle carries no record of the region it was built for (assembled before region identity was recorded); ` +
        `cannot prove it matches the ${input.region.toUpperCase()} gateway.`,
    );
  }
  // Every format pins a region. The check used to cover only the two eCTD
  // formats, so an eSTAR (an FDA CDRH form) cleared the PMDA gate.
  const fmt = input.bundle.format;
  const REQUIRED_REGION: Partial<Record<string, Region>> = { pmda_ectd: 'pmda', estar: 'fda', eudamed_register: 'ema' };
  const required = REQUIRED_REGION[fmt];
  const formatRegionOk = required ? input.region === required : fmt === 'ectd' ? input.region !== 'pmda' : true;
  if (!formatRegionOk) {
    checks.push({ name: 'bundle-format-region', passed: false, detail: `format ${fmt} vs ${input.region.toUpperCase()} gateway` });
    blockers.push(
      `Bundle format '${fmt}' does not match the ${input.region.toUpperCase()} gateway (` +
        (required ? `${fmt} is the ${required.toUpperCase()} format` : 'pmda_ectd is the PMDA format; ectd is the format for the other regions') +
        `). Re-assemble the package for ${input.region.toUpperCase()}.`,
    );
  }

  // 3b. Regional Module 1 backbone conformance. The eight widened regions ship an
  // EMA-structure PLACEHOLDER as `<cc>-regional.xml`; it is always surfaced and
  // blocks a production transmit only when ECTD_REQUIRE_REGIONAL_BACKBONE=true
  // (same opt-in posture as the PDF/A + DTD gates).
  const regionalGate = evaluateRegionalBackboneGate({
    status: input.bundle.regionalBackbone,
    environment: input.environment,
    required: regionalBackboneRequiredFromEnv(env),
  });
  if (regionalGate.check) checks.push(regionalGate.check);
  blockers.push(...regionalGate.blockers);
  warnings.push(...regionalGate.warnings);

  // 4. External agency-grade validation gate (route layer only — see enforceExternal).
  if (input.enforceExternal !== false) {
    const extGate = evaluateExternalValidationGate({
      report: input.externalReport ?? null,
      configured: input.externalConfigured ?? false,
      requireEvalidator: evalidatorRequiredFromEnv(env),
      environment: input.environment,
    });
    checks.push({ name: 'external-evalidator', passed: extGate.cleared, detail: extGate.ran ? `${extGate.externalErrorCount} agency error(s)` : 'did not run' });
    blockers.push(...extGate.blockers);
  }

  return { cleared: blockers.length === 0, blockers, checks, warnings };
}

export default { evaluatePreTransmit };
