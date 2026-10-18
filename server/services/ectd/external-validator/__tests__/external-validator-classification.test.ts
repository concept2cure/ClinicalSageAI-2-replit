import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateExternalValidationGate,
  resolveExternalValidator,
  runExternalValidation,
  type ExternalValidationReport,
} from '..';

const selectedExternal = { name: 'lorenz-evalidator', kind: 'external_engine' as const };
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  while (directories.length) await fs.rm(directories.pop()!, { recursive: true, force: true });
});

function report(over: Partial<ExternalValidationReport> = {}): ExternalValidationReport {
  return {
    validator: 'lorenz-evalidator',
    profile: 'FDA eCTD 3.2.2 — synthetic control, not a qualified engine execution',
    ranAt: new Date('2026-10-14T00:00:00Z'),
    ran: true,
    findings: [],
    errorCount: 0,
    warningCount: 0,
    passed: true,
    ...over,
  };
}

function gate(over: Partial<Parameters<typeof evaluateExternalValidationGate>[0]> = {}) {
  return evaluateExternalValidationGate({
    selectedValidator: selectedExternal,
    configured: true,
    report: report(),
    requireEvalidator: true,
    environment: 'production',
    ...over,
  });
}

function withoutExternalEndpoint() {
  vi.stubEnv('EVALIDATOR_BINARY', '');
  vi.stubEnv('EVALIDATOR_ENDPOINT', '');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this test.'); }));
}

describe('D7 validator classification — actual resolver and subset', () => {
  it('refuses a real clean subset despite configured=true, retaining its scoped diagnostics', async () => {
    withoutExternalEndpoint();
    vi.stubEnv('EVALIDATOR_USE_FDA_CRITERIA_FALLBACK', 'true');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'c2c-subset-classification-'));
    directories.push(directory);
    await fs.mkdir(path.join(directory, 'util'), { recursive: true });
    await fs.mkdir(path.join(directory, 'm1', 'us'), { recursive: true });
    await fs.writeFile(path.join(directory, 'index.xml'), '<synthetic-backbone/>');
    await fs.writeFile(path.join(directory, 'util', 'index-md5.txt'), 'synthetic nonempty placeholder');
    await fs.writeFile(path.join(directory, 'm1', 'us', 'us-regional.xml'), '<synthetic-regional/>');
    const validator = await resolveExternalValidator();
    const scopedReport = await validator.validate({ packageDir: directory, region: 'fda' });
    expect(scopedReport).toMatchObject({ ran: true, passed: true, errorCount: 0 });
    expect(scopedReport.findings).toContainEqual(expect.objectContaining({ ruleId: 'C2C-SUBSET-NOTICE' }));
    const result = gate({ selectedValidator: validator, report: scopedReport, configured: true });
    expect(result.cleared).toBe(false);
    expect(validator.kind).toBe('internal_subset');
    expect(result).toMatchObject({
      validatorKind: 'internal_subset',
      selectedValidatorName: 'fda-criteria-subset',
      reportedValidatorName: 'fda-criteria-subset',
      configured: false,
      ran: true,
      errorCountKnown: true,
      qualifyingRun: false,
      assessmentStatus: 'not_assessed',
      enforced: true,
    });
    expect(result.blockers.join(' ')).toMatch(/subset/i);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('classifies an unavailable resolver without inventing a run', async () => {
    withoutExternalEndpoint();
    vi.stubEnv('EVALIDATOR_USE_FDA_CRITERIA_FALLBACK', '');
    const validator = await resolveExternalValidator();
    const unavailableReport = await validator.validate({ packageDir: '/unused', region: 'fda' });
    expect(validator).toMatchObject({ name: 'noop', kind: 'unavailable' });
    expect(gate({ selectedValidator: validator, report: unavailableReport, configured: true })).toMatchObject({
      validatorKind: 'unavailable', configured: false, ran: false, qualifyingRun: false,
      assessmentStatus: 'not_assessed', errorCountKnown: false, cleared: false,
    });
  });

  it('classifies the external adapter path while expressly making no licence/provider claim', async () => {
    withoutExternalEndpoint();
    vi.stubEnv('EVALIDATOR_ENDPOINT', 'https://synthetic-validator.invalid');
    vi.stubEnv('EVALIDATOR_USE_FDA_CRITERIA_FALLBACK', 'true');
    const validator = await resolveExternalValidator();
    expect(validator).toMatchObject({ name: 'lorenz-evalidator', kind: 'external_engine' });
    expect(await validator.isConfigured()).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('preserves the unrun operational failure envelope without fabricating content errors', async () => {
    withoutExternalEndpoint();
    vi.stubEnv('EVALIDATOR_ENDPOINT', 'https://synthetic-validator.invalid');
    const failedRun = await runExternalValidation({ packageDir: '/unused', region: 'fda' });
    expect(failedRun).toMatchObject({ validator: 'lorenz-evalidator', ran: false, passed: false, errorCount: 0 });
    expect(failedRun.findings).toContainEqual(expect.objectContaining({ ruleId: 'EVALIDATOR-RUN-FAILED', severity: 'error' }));
    expect(gate({ report: failedRun })).toMatchObject({
      ran: false, qualifyingRun: false, assessmentStatus: 'not_assessed', errorCountKnown: false, cleared: false,
    });
  });
});

describe('D7 required production controls', () => {
  it('clears a coherent matching external report only for this control contract', () => {
    expect(gate()).toMatchObject({
      configured: true, ran: true, validatorKind: 'external_engine',
      qualifyingRun: true, assessmentStatus: 'passed', errorCountKnown: true, enforced: true, cleared: true, blockers: [],
    });
  });

  it('retains warnings on a coherent external pass', () => {
    expect(gate({ report: report({
      findings: [{ ruleId: 'SYNTHETIC-WARNING', severity: 'warning', message: 'Synthetic warning.' }],
      warningCount: 1,
    }) })).toMatchObject({ qualifyingRun: true, assessmentStatus: 'passed', cleared: true });
  });

  it('records an actual coherent failed external run and refuses clearance', () => {
    const result = gate({ report: report({
      findings: [{ ruleId: 'SYNTHETIC-ERROR', severity: 'error', message: 'Synthetic error.' }],
      errorCount: 1, passed: false,
    }) });
    expect(result).toMatchObject({ qualifyingRun: true, assessmentStatus: 'failed', errorCountKnown: true, externalErrorCount: 1, cleared: false });
    expect(result.blockers.join(' ')).toMatch(/1 error/i);
  });

  it.each([
    ['missing classification', undefined],
    ['explicit unknown', { name: 'unregistered-validator', kind: 'unknown' as const }],
    ['runtime unknown class', { name: 'lorenz-evalidator', kind: 'fabricated' } as any],
    ['missing adapter name', { name: '', kind: 'external_engine' as const }],
  ])('refuses %s even if configured=true', (_label, selectedValidator) => {
    expect(gate({ selectedValidator })).toMatchObject({
      configured: false, qualifyingRun: false, assessmentStatus: 'not_assessed', cleared: false,
    });
  });

  it('refuses a selected external path whose configuration is not established', () => {
    expect(gate({ configured: false })).toMatchObject({
      configured: false, qualifyingRun: false, assessmentStatus: 'not_assessed', cleared: false,
    });
  });

  it.each(['false', 'true'])('does not accept truthy configuration string %s', configured => {
    expect(gate({ configured: configured as any })).toMatchObject({
      configured: false, qualifyingRun: false, assessmentStatus: 'not_assessed', cleared: false,
    });
  });

  it('refuses no report without confusing configuration with execution', () => {
    expect(gate({ report: null })).toMatchObject({
      configured: true, ran: false, qualifyingRun: false, assessmentStatus: 'not_assessed', errorCountKnown: false, cleared: false,
    });
  });

  it.each(['fda-criteria-subset', 'noop', 'unknown', 'LORENZ-EVALIDATOR', 'lorenz-evalidator '])(
    'refuses report identity %s when the selected adapter is LORENZ', validator => {
      expect(gate({ report: report({ validator }) })).toMatchObject({
        reportedValidatorName: validator, qualifyingRun: false, assessmentStatus: 'invalid', cleared: false,
      });
    },
  );

  it.each([
    ['truthy ran', { ran: 'true' }],
    ['truthy passed', { passed: 1 }],
    ['false passed with no errors', { passed: false }],
    ['negative count', { errorCount: -1 }],
    ['fractional count', { errorCount: 0.5 }],
    ['NaN count', { errorCount: NaN }],
    ['infinite count', { errorCount: Infinity }],
    ['unsafe count', { errorCount: Number.MAX_SAFE_INTEGER + 1 }],
    ['bad warning count', { warningCount: -1 }],
    ['finding/count disagreement', { findings: [{ ruleId: 'E', severity: 'error', message: 'x' }] }],
    ['warning/count disagreement', { findings: [{ ruleId: 'W', severity: 'warning', message: 'x' }] }],
    ['count with no findings', { errorCount: 1, passed: false }],
    ['passed true with coherent error findings', { errorCount: 1, findings: [{ ruleId: 'E', severity: 'error', message: 'x' }], passed: true }],
    ['unknown severity', { findings: [{ ruleId: 'X', severity: 'fatal', message: 'x' }] }],
    ['missing findings', { findings: null }],
    ['invalid date', { ranAt: new Date(NaN) }],
    ['serialized date without caller parsing', { ranAt: '2026-10-14T00:00:00Z' }],
    ['missing profile', { profile: '  ' }],
  ])('refuses executed report with %s', (_label, mutation) => {
    expect(gate({ report: report(mutation as any) })).toMatchObject({
      qualifyingRun: false, assessmentStatus: 'invalid', errorCountKnown: false, externalErrorCount: 0, cleared: false,
    });
  });
});

describe('D7 advisory policy is separate from factual assessment', () => {
  const failedReport = () => report({
    findings: [{ ruleId: 'SYNTHETIC-ERROR', severity: 'error', message: 'Synthetic error.' }],
    errorCount: 1, passed: false,
  });

  it.each([
    { environment: 'staging' as const, requireEvalidator: true },
    { environment: 'production' as const, requireEvalidator: false },
  ])('keeps an external failure visible while nonblocking: %o', policy => {
    expect(gate({ ...policy, report: failedReport() })).toMatchObject({
      qualifyingRun: true, assessmentStatus: 'failed', errorCountKnown: true, externalErrorCount: 1,
      enforced: false, cleared: true, blockers: [],
    });
  });

  it('keeps mismatched advisory evidence invalid rather than passed/not_assessed', () => {
    expect(gate({ requireEvalidator: false, report: report({ validator: 'fda-criteria-subset' }) })).toMatchObject({
      assessmentStatus: 'invalid', qualifyingRun: false, cleared: true, blockers: [],
    });
  });

  it('marks a zero compatibility placeholder as unknown rather than a clean advisory tally', () => {
    const supplied = report({ errorCount: NaN });
    expect(gate({ requireEvalidator: false, report: supplied })).toMatchObject({
      assessmentStatus: 'invalid', errorCountKnown: false, externalErrorCount: 0, cleared: true,
    });
    expect(Number.isNaN(supplied.errorCount)).toBe(true);
  });

  it('retains raw executed subset diagnostics without an external assessment or blocker', () => {
    expect(gate({
      requireEvalidator: false,
      selectedValidator: { name: 'fda-criteria-subset', kind: 'internal_subset' },
      report: report({ validator: 'fda-criteria-subset' }),
    })).toMatchObject({
      ran: true, configured: false, qualifyingRun: false,
      assessmentStatus: 'not_assessed', enforced: false, cleared: true, blockers: [],
    });
  });
});
