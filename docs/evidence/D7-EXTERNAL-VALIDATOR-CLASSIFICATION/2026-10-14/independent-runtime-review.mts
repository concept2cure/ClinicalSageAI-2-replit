import assert from 'node:assert/strict';
import { evaluateExternalValidationGate } from '../../../../server/services/ectd/external-validator/gate.ts';

globalThis.fetch = async () => { throw new Error('Network is forbidden in this review.'); };
const report = {
  validator: 'lorenz-evalidator', profile: 'FDA eCTD 3.2.2',
  ranAt: new Date('2026-10-14T00:00:00Z'), ran: true, passed: true,
  findings: [], errorCount: 0, warningCount: 0,
};
const input = {
  configured: true, requireEvalidator: true, environment: 'production',
  selectedValidator: { name: 'lorenz-evalidator', kind: 'external_engine' },
  report,
};
const variants: Array<[string, Record<string, unknown>]> = [
  ['configured-string-false', { configured: 'false' }],
  ['configured-string-true', { configured: 'true' }],
  ['selected-null', { selectedValidator: null }],
  ['selected-empty-name', { selectedValidator: { name: '', kind: 'external_engine' } }],
  ['selected-whitespace-name', { selectedValidator: { name: ' ', kind: 'external_engine' } }],
  ['selected-kind-uppercase', { selectedValidator: { name: 'lorenz-evalidator', kind: 'EXTERNAL_ENGINE' } }],
  ['report-identity-leading-space', { report: { ...report, validator: ' lorenz-evalidator' } }],
  ['report-identity-case-change', { report: { ...report, validator: 'LORENZ-EVALIDATOR' } }],
  ['profile-whitespace', { report: { ...report, profile: ' ' } }],
  ['date-iso-string', { report: { ...report, ranAt: '2026-10-14T00:00:00Z' } }],
  ['date-invalid-object', { report: { ...report, ranAt: new Date('invalid') } }],
  ['date-epoch-number', { report: { ...report, ranAt: 1791936000000 } }],
  ['findings-null', { report: { ...report, findings: null } }],
  ['findings-object', { report: { ...report, findings: {} } }],
  ['finding-null', { report: { ...report, findings: [null] } }],
  ['finding-string', { report: { ...report, findings: ['error'] } }],
  ['finding-severity-upper-case', { report: { ...report, findings: [{ severity: 'Error', ruleId: 'X', message: 'x' }] } }],
  ['warning-count-string', { report: { ...report, warningCount: '0' } }],
  ['warning-count-negative', { report: { ...report, warningCount: -1 } }],
  ['warning-count-unsafe', { report: { ...report, warningCount: Number.MAX_SAFE_INTEGER + 1 } }],
];
const results = variants.map(([id, patch]) => {
  try {
    const result = evaluateExternalValidationGate({ ...input, ...patch } as any);
    assert.equal(result.cleared, false, `${id}: required malformed input cleared`);
    assert.equal((result as any).qualifyingRun, false, `${id}: malformed input qualified`);
    return { id, outcome: 'pass', result };
  } catch (err) {
    return { id, outcome: 'fail', error: err instanceof Error ? err.message : String(err) };
  }
});
for (const [id, environment, requireEvalidator] of [
  ['advisory-error-production', 'production', false],
  ['advisory-error-staging', 'staging', true],
] as const) {
  try {
    const result = evaluateExternalValidationGate({ ...input, environment, requireEvalidator,
      report: { ...report, passed: false, errorCount: 1, findings: [{ ruleId: 'X', severity: 'error', message: 'x' }] },
    } as any);
    assert.equal(result.cleared, true, `${id}: existing advisory policy changed`);
    assert.equal(result.externalErrorCount, 1, `${id}: raw diagnostic count lost`);
    assert.equal((result as any).qualifyingRun, true, `${id}: executed coherent failure mislabeled unassessed`);
    assert.equal((result as any).assessmentStatus, 'failed', `${id}: actual external error not shown as failed`);
    results.push({ id, outcome: 'pass', result });
  } catch (err) {
    results.push({ id, outcome: 'fail', error: err instanceof Error ? err.message : String(err) });
  }
}
console.log(JSON.stringify({ scope: 'Independent runtime contract assertions, no binary/provider/database/package/transmission.',
  passed: results.filter(r => r.outcome === 'pass').length, failed: results.filter(r => r.outcome === 'fail').length, results }, null, 2));
process.exitCode = results.some(r => r.outcome === 'fail') ? 1 : 0;
