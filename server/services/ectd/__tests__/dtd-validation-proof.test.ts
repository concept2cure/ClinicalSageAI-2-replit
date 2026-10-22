/** Persisted self-containment/passed booleans are not complete DTD proof. */
import { describe, expect, it } from 'vitest';
import { classifyRegionalBackbone } from '../regional-backbone-readiness';
import { hasPassedPackageDtdValidation } from '../dtd-bundler';
import { evaluatePreTransmit } from '../../submission-gateways/pre-transmit-check';
import type { SubmissionBundle } from '../../submission-gateways/types';
import { REGIONAL_XML as regional, syntheticDtdStatus as status } from './_dtd-validation-fixture';

function transmit(dtdStatus?: SubmissionBundle['dtdStatus'], stf?: SubmissionBundle['stf']) {
  return evaluatePreTransmit({ region: 'fda', environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_DTD: 'true' },
    bundle: { path: '/synthetic.zip', sha256: 'a'.repeat(64), sizeBytes: 100, format: 'ectd', builtRegion: 'fda', dtdStatus, stf } });
}

describe('existing DTD gate requires complete validation proof', () => {
  it.each(['xml-errors', 'missing-present', 'missing-styles-inventory', 'duplicate-required'] as const)('canonical proof rejects contradictory %s details', mode => {
      const data = status();
      if (mode === 'xml-errors') data.validation.files[0].dtd.errors.push('validation error');
      if (mode === 'missing-present') data.present = [];
      if (mode === 'missing-styles-inventory') data.presentStylesheets = [];
      if (mode === 'duplicate-required') data.required.push(data.required[0]);
      expect(hasPassedPackageDtdValidation(data)).toBe(false);
    });
  it('refuses absent historical status and presence-only historical status when required', () => {
    expect(transmit().cleared).toBe(false);
    const presence = { ...status(), validation: undefined };
    expect(transmit(presence).cleared).toBe(false);
  });
  it('accepts actual complete proof while preserving the default/report-only posture', () => {
    expect(transmit(status()).cleared).toBe(true);
    expect(evaluatePreTransmit({ region: 'fda', environment: 'staging', enforceExternal: false, env: { ECTD_REQUIRE_DTD: 'true' },
      bundle: { path: '/synthetic.zip', sha256: 'a'.repeat(64), sizeBytes: 100, format: 'ectd', builtRegion: 'fda' } }).cleared).toBe(true);
  });
  it.each(['empty', 'duplicate', 'missing-row', 'skipped', 'doctype', 'integrity', 'missing-required-style', 'nonboolean'] as const)('refuses incomplete or forged %s proof despite passed:true', mode => {
      const data = status();
      if (mode === 'empty') { data.validation.expectedFiles = []; data.validation.files = []; }
      if (mode === 'duplicate') { data.validation.expectedFiles = ['index.xml', 'index.xml']; data.validation.files[1] = data.validation.files[0]; }
      if (mode === 'missing-row') data.validation.files.pop();
      if (mode === 'skipped') data.validation.files[0].dtd.ran = false;
      if (mode === 'doctype') data.validation.files[0].doctype.valid = false;
      if (mode === 'integrity') data.validation.integrity.ok = false;
      if (mode === 'missing-required-style') data.validation.integrity.verified = data.validation.integrity.verified.filter(name => name !== 'us-regional.xsl');
      if (mode === 'nonboolean') data.validation.passed = 'true' as unknown as boolean;
      expect(transmit(data).cleared).toBe(false);
    });
  it('refuses omitted STF coverage in a study package', () => {
    const data = status();
    data.required.push('ich-stf-v2-2.dtd'); data.present.push('ich-stf-v2-2.dtd'); data.validation.integrity.verified.push('ich-stf-v2-2.dtd');
    expect(transmit(data, { studies: 2, leaves: 3, untagged: 0 }).cleared).toBe(false);
  });
});

describe('regional classification needs current regional DTD and integrity proof', () => {
  it('does not establish conformance from a clean structural-gap report alone', () => {
    expect(classifyRegionalBackbone('fda', regional, []).regionConformant).toBe(false);
  });
  it('accepts a clean structural report only with current complete regional proof', () => {
    expect(classifyRegionalBackbone('fda', regional, [], status().validation).regionConformant).toBe(true);
    const proof = status().validation; proof.files[1].dtd.valid = false;
    expect(classifyRegionalBackbone('fda', regional, [], proof).regionConformant).toBe(false);
  });
  it('retains structural refusals even with an XML-valid synthetic grammar', () => {
    expect(classifyRegionalBackbone('fda', regional, ['missing regulatory contact'], status().validation)).toMatchObject({ regionConformant: false, conformanceGap: 'missing regulatory contact' });
  });
});
