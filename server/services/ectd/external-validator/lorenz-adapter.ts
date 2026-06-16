/**
 * LORENZ eValidator adapter — the licensed, agency-grade engine target.
 *
 * `isConfigured()` is true only when `EVALIDATOR_BINARY`/`EVALIDATOR_ENDPOINT`
 * points at an existing engine. The actual shell/endpoint invocation + parsing
 * of LORENZ's native report format is the licensed drop-in (the engine and its
 * validation profiles are commercial — see EVALIDATOR_INTEGRATION_SPEC.md and
 * docs/runbooks/evalidator-setup.md once procured).
 *
 * HONEST FAIL-CLOSED: until that integration lands, `validate()` throws rather
 * than returning a fabricated pass. The dispatch-readiness wiring treats a failed
 * or un-run external validation as "not passed", so this can never silently clear
 * a package the agency validator hasn't actually approved.
 *
 * @module server/services/ectd/external-validator/lorenz-adapter
 */

import { promises as fs } from 'fs';
import { evalidatorBinary, evalidatorProfile } from './config';
import type { ExternalValidator, ExternalValidationReport, ValidateArgs } from './types';

export class LorenzEValidatorAdapter implements ExternalValidator {
  readonly name = 'lorenz-evalidator';

  async isConfigured(): Promise<boolean> {
    const bin = evalidatorBinary();
    if (!bin) return false;
    // An http(s) endpoint is taken as configured; a path must exist on disk.
    if (/^https?:\/\//i.test(bin)) return true;
    try {
      await fs.access(bin);
      return true;
    } catch {
      return false;
    }
  }

  async validate(args: ValidateArgs): Promise<ExternalValidationReport> {
    const configured = await this.isConfigured();
    if (!configured) {
      throw new Error(
        'LORENZ eValidator is not configured (set EVALIDATOR_BINARY/EVALIDATOR_ENDPOINT). ' +
          'Cannot run an agency-grade validation.',
      );
    }
    // Licensed drop-in: shell to the engine against args.packageDir with the
    // region profile, then parse its native report into ExternalValidationReport.
    // Intentionally not faked — fail closed until the real parser is implemented
    // against the procured engine so we never report an unverified pass.
    const profile = args.profile ?? evalidatorProfile(args.region) ?? args.region;
    throw new Error(
      `LORENZ eValidator report parsing is not yet implemented for profile "${profile}". ` +
        'Implement the engine invocation + report parser in lorenz-adapter.ts against the procured engine.',
    );
  }
}

export default LorenzEValidatorAdapter;
