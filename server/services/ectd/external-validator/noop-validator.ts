/**
 * No-op external validator — the default when no licensed engine is configured.
 *
 * Honest by construction: `isConfigured()` is false and `validate()` returns a
 * report with `ran: false` and `passed: false` (an un-run external validation is
 * NOT a pass). This is what makes the dispatch gate fail-closed: a production
 * dispatch that requires the external validator cannot be cleared by a no-op.
 *
 * @module server/services/ectd/external-validator/noop-validator
 */

import type { ExternalValidator, ExternalValidationReport, ValidateArgs } from './types';

export class NoopExternalValidator implements ExternalValidator {
  readonly name = 'noop';

  async isConfigured(): Promise<boolean> {
    return false;
  }

  async validate(args: ValidateArgs): Promise<ExternalValidationReport> {
    return {
      validator: this.name,
      profile: args.profile ?? args.region,
      ranAt: new Date(),
      ran: false,
      findings: [],
      errorCount: 0,
      warningCount: 0,
      passed: false, // un-run ≠ passed
    };
  }
}

export default NoopExternalValidator;
