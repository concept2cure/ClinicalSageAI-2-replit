import assert from 'node:assert/strict';
import { evaluatePreTransmit } from '../../../../server/services/submission-gateways/pre-transmit-check.ts';
globalThis.fetch = async () => { throw new Error('Network is forbidden in this review.'); };
const report = { validator: 'lorenz-evalidator', profile: 'FDA eCTD 3.2.2', ran: true, passed: true,
  ranAt: new Date('2026-10-14T00:00:00Z'), findings: [], errorCount: 0, warningCount: 0 };
const input = { region: 'fda', bundle: { path: '/tmp/synthetic.zip', sha256: 'a'.repeat(64), sizeBytes: 1000, format: 'ectd', builtRegion: 'fda' },
  environment: 'production', selectedExternalValidator: { name: 'lorenz-evalidator', kind: 'external_engine' },
  externalConfigured: true, externalReport: report, env: { ECTD_REQUIRE_EVALIDATOR: 'true' } };
const cases: Array<{ id: string; patch: Record<string, unknown>; cleared: boolean; passed?: boolean; detail?: RegExp; warning?: RegExp }> = [
  { id: 'required-external-warning-only', patch: { externalReport: { ...report, warningCount: 1, findings: [{ severity: 'warning', ruleId: 'W', message: 'w' }] } }, cleared: true, passed: true, detail: /status=passed/ },
  { id: 'required-exact-identity-mismatch', patch: { externalReport: { ...report, validator: 'LORENZ-EVALIDATOR' } }, cleared: false, passed: false, detail: /status=invalid/ },
  { id: 'required-no-descriptor', patch: { selectedExternalValidator: undefined }, cleared: false, passed: false, detail: /kind=unknown/ },
  { id: 'advisory-malformed-count', patch: { externalReport: { ...report, errorCount: Number.NaN }, env: {} }, cleared: true, passed: false, detail: /status=invalid.*errorCountKnown=false.*errors=unknown/, warning: /advisory/ },
  { id: 'advisory-warning-tally-mismatch', patch: { externalReport: { ...report, warningCount: 1 }, env: {} }, cleared: true, passed: false, detail: /status=invalid.*errors=unknown/ },
  { id: 'advisory-subset-errors-retained', patch: { selectedExternalValidator: { name: 'fda-criteria-subset', kind: 'internal_subset' },
    externalReport: { ...report, validator: 'fda-criteria-subset', passed: false, errorCount: 1, findings: [{ severity: 'error', ruleId: 'X', message: 'x' }] }, env: {} },
    cleared: true, passed: false, detail: /status=not_assessed.*kind=internal_subset.*errorCountKnown=true.*errors=1/, warning: /internal_subset/ },
  { id: 'staging-required-failed-external', patch: { environment: 'staging', externalReport: { ...report, passed: false, errorCount: 1,
    findings: [{ severity: 'error', ruleId: 'X', message: 'x' }] } }, cleared: true, passed: false, detail: /status=failed.*errors=1.*enforced=false/, warning: /advisory/ },
  { id: 'low-level-external-opt-out', patch: { enforceExternal: false, selectedExternalValidator: undefined, externalReport: null }, cleared: true },
];
const results = cases.map(c => {
  try {
    const result = evaluatePreTransmit({ ...input, ...c.patch } as any);
    assert.equal(result.cleared, c.cleared, `${c.id}: policy verdict changed`);
    const check = result.checks.find(v => v.name === 'external-evalidator');
    if (c.passed == null) assert.equal(check, undefined);
    else assert.equal(check?.passed, c.passed, `${c.id}: check pass differs from actual assessment`);
    if (c.detail) assert.match(check?.detail ?? '', c.detail);
    if (c.warning) assert.match(result.warnings.join(' '), c.warning);
    return { id: c.id, outcome: 'pass', cleared: result.cleared, check, warnings: result.warnings };
  } catch (err) { return { id: c.id, outcome: 'fail', error: err instanceof Error ? err.message : String(err) }; }
});
console.log(JSON.stringify({ scope: 'Pure wrapper semantics only; no archive validation, licensed engine, gateway or wire call.',
  passed: results.filter(r => r.outcome === 'pass').length, failed: results.filter(r => r.outcome === 'fail').length, results }, null, 2));
process.exitCode = results.some(r => r.outcome === 'fail') ? 1 : 0;
