import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { evaluateExternalValidationGate } from '../../../../server/services/ectd/external-validator/gate.ts';
import { parseEvalidatorXmlReport, normalizeSeverity } from '../../../../server/services/ectd/external-validator/lorenz-adapter.ts';
import type { ExternalValidationReport } from '../../../../server/services/ectd/external-validator/types.ts';

// Read-only local contract probe. Never resolve/run a binary or call a provider.
globalThis.fetch = async () => { throw new Error('Network is forbidden in this probe.'); };
const base: ExternalValidationReport = {
  validator: 'lorenz-evalidator', profile: 'FDA eCTD 3.2.2',
  ranAt: new Date('2026-10-14T00:00:00Z'), ran: true, passed: true,
  findings: [], errorCount: 0, warningCount: 0,
};
const error = { ruleId: 'SYNTHETIC-ERROR', severity: 'error' as const, message: 'Synthetic package error' };
const warning = { ruleId: 'SYNTHETIC-WARNING', severity: 'warning' as const, message: 'Synthetic advisory' };
const cases: Array<{ id: string; report: unknown; required?: boolean; environment?: 'production' | 'staging'; configured?: boolean }> = [
  { id: 'clean-external-required', report: base },
  { id: 'clean-subset-required', report: { ...base, validator: 'fda-criteria-subset' } },
  { id: 'unknown-report-required', report: { ...base, validator: 'invented-engine' } },
  { id: 'ran-string-false-required', report: { ...base, ran: 'false' } },
  { id: 'passed-false-zero-errors-required', report: { ...base, passed: false } },
  { id: 'negative-errors-required', report: { ...base, errorCount: -1 } },
  { id: 'nan-errors-required', report: { ...base, errorCount: Number.NaN } },
  { id: 'fractional-errors-required', report: { ...base, errorCount: 0.5 } },
  { id: 'error-row-count-zero-required', report: { ...base, findings: [error], errorCount: 0 } },
  { id: 'unknown-finding-severity-required', report: { ...base, findings: [{ ...error, severity: 'blocker' }] } },
  { id: 'warnings-only-required', report: { ...base, findings: [warning], warningCount: 1 } },
  { id: 'real-errors-advisory-production', required: false, report: { ...base, passed: false, findings: [error], errorCount: 1 } },
  { id: 'real-errors-required-staging', environment: 'staging', report: { ...base, passed: false, findings: [error], errorCount: 1 } },
  { id: 'noop-advisory', required: false, configured: false, report: { ...base, validator: 'noop', ran: false, passed: false } },
  { id: 'run-failure-operational-diagnostic', report: { ...base, ran: false, passed: false,
    findings: [{ ruleId: 'EVALIDATOR-RUN-FAILED', severity: 'error', message: 'Synthetic run failed, no content error tally' }] } },
];

const results = cases.map(c => ({
  id: c.id,
  input: { validator: (c.report as any)?.validator, ran: (c.report as any)?.ran,
    passed: (c.report as any)?.passed, errorCount: Number.isNaN((c.report as any)?.errorCount) ? 'NaN' : (c.report as any)?.errorCount,
    required: c.required ?? true, environment: c.environment ?? 'production' },
  output: evaluateExternalValidationGate({
    report: c.report as ExternalValidationReport, configured: c.configured ?? true,
    requireEvalidator: c.required ?? true, environment: c.environment ?? 'production',
  }),
}));
const xmlCases = [];
for (const [id, xml] of [
  ['unknown-xml-envelope', '<not-a-report><payload>unrelated</payload></not-a-report>'],
  ['xml-fatal-severity', '<eValidatorReport><result severity="fatal" number="X"/></eValidatorReport>'],
  ['xml-unknown-severity', '<eValidatorReport><result severity="blocker" number="X"/></eValidatorReport>'],
] as const) {
  xmlCases.push({ id, findings: await parseEvalidatorXmlReport(xml) });
}
const fileHashes: Record<string, string> = {};
for (const file of ['gate.ts', 'types.ts', 'lorenz-adapter.ts', 'index.ts']) {
  const bytes = await readFile(new URL(`../../../../server/services/ectd/external-validator/${file}`, import.meta.url));
  fileHashes[file] = createHash('sha256').update(bytes).digest('hex');
}
console.log(JSON.stringify({
  evidenceScope: 'Current component behavior only; local synthetic report values; no full assessor, database, licensed validator, package validation or transmission.',
  expectedHead: '87b27c897c5d1be20b0527009bcaf425ebbf3af6', fileHashes,
  results, parserObservations: { normalizeFatal: normalizeSeverity('fatal'), xmlCases },
}, null, 2));
