/**
 * What a transmit record says about the package checks the transmit guard ran.
 *
 * The getGateway guard (./index.ts) attaches `preTransmit` {checks, warnings,
 * leafSecurity} to every gateway result, including checks that FAILED without
 * blocking: a flag-gated check not enforced in this environment, such as
 * dtd-self-contained while no DTDs are vendored. Every transmit spine records
 * the same reduction of that report:
 *
 *   - transmitSequence (sequence spine), on its ECTD_TRANSMITTED §11.10(e) row;
 *   - executeGovernedTransmit (package-model spine: the HTTP transmit route and
 *     the AnA 510(k) transmit), on its Part 11 sign ledger payload and
 *     electronic-signature manifest, and from there on the AnA audit row.
 *
 * 2026-09-23 (W5/D7, round-2 review): transmitSequence reduced the report
 * inline and the governed transmit did not record it at all, so a package that
 * failed a check and went out anyway left no transmit-time trace on that path.
 * One reduction now, re-exported from ./index beside the guard. It sits in its
 * own module, with no dependency on the gateway registry, so the governed
 * transmit imports it without importing the registry it is handed a gateway by.
 *
 * @module server/services/submission-gateways/pre-transmit-findings
 */

import type { GatewayTransmitResult } from './types';

export interface PreTransmitFindings {
  /**
   * Checks the guard ran that FAILED without blocking, as "name: detail".
   * `[]` = the guard ran and every check passed. `null` = the guard reported
   * nothing, which is never to be read as "all passed".
   */
  failedChecks: string[] | null;
  /** The guard's warnings (e.g. evidence it could not check); `null` = reported nothing. */
  warnings: string[] | null;
}

/** Reduce a gateway result's `preTransmit` report to what a transmit record carries. */
export function preTransmitFindings(result: Pick<GatewayTransmitResult, 'preTransmit'>): PreTransmitFindings {
  const pre = result?.preTransmit;
  return {
    failedChecks:
      pre && Array.isArray(pre.checks)
        ? pre.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`)
        : null,
    warnings: pre && Array.isArray(pre.warnings) ? [...pre.warnings] : null,
  };
}
