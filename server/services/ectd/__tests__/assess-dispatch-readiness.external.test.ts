import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const fixture = vi.hoisted(() => ({
  rows: [] as unknown[][],
  adapter: { name: 'FDA-internal-subset', kind: 'internal_subset', isConfigured: vi.fn() },
  required: true,
}));

vi.mock('../../../db', () => ({
  db: { select: () => {
    const rows = fixture.rows.shift() ?? [];
    const query = {
      from: () => query, where: () => query, innerJoin: () => query,
      limit: async () => rows,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return query;
  },
  // The waiver and finding-disposition reads (text SQL): this suite has no Shadow Review records.
  execute: async (statement: SQL) => ({ rows: /SELECT settings FROM organizations/i.test(new PgDialect().sqlToQuery(statement).sql) ? [{ settings: {} }] : [] }) },
}));
vi.mock('../leaf-document-resolver', () => ({ resolveLeafDocuments: async () => [] }));
vi.mock('../dispatch-readiness', () => ({
  computeDispatchReadiness: () => ({ errors: 0, warnings: 0, infos: 0, findings: [], releaseBlockers: 0 }),
}));
vi.mock('../release-signature-status', () => ({
  resolveReleaseSignatureStatus: async () => ({ verdict: 'unsigned' }),
  isReleaseSignatureRequired: () => false,
  signingNowResolvesRelease: () => false,
}));
vi.mock('../external-validator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../external-validator')>()),
  resolveExternalValidator: async () => fixture.adapter,
  evalidatorRequiredFromEnv: () => fixture.required,
}));

import { assessSequenceDispatchReadiness } from '../assess-dispatch-readiness';
import type { ExternalValidationReport } from '../external-validator';

function report(validator: string, failed = false): ExternalValidationReport {
  return {
    validator, profile: 'fda-ectd-4.0', ran: true, ranAt: new Date('2026-10-14T10:00:00Z'),
    passed: !failed, errorCount: failed ? 1 : 0, warningCount: 0,
    findings: failed ? [{ severity: 'error', ruleId: 'BROKEN_LINK', message: 'Unresolved leaf link.' }] : [],
  };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  fixture.rows = [
    [{ id: 12, organizationId: 7, submissionId: 4, region: 'fda', type: 'amendment', sequenceNumber: '0001', status: 'assembling', validationStatus: null }],
    // sequence, application type, leaves, completed Shadow Review runs. The
    // critical count is a text-SQL read now (criticalsStandingOpen): execute above.
    [{ applicationType: 'other' }], [], [{ value: 1 }],
  ];
  fixture.adapter.name = 'FDA-internal-subset';
  fixture.adapter.kind = 'internal_subset';
  fixture.adapter.isConfigured.mockReset().mockResolvedValue(true);
  fixture.required = true;
});
afterEach(() => vi.unstubAllEnvs());

describe('assessor binds external validation to the selected adapter', () => {
  it('retains a clean subset execution without treating it as configured external validation', async () => {
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: report(fixture.adapter.name) });
    expect(a.externalValidation.configured).toBe(false);
    expect(a.externalValidation).toMatchObject({ ran: true, qualifyingRun: false, assessmentStatus: 'not_assessed', validatorKind: 'internal_subset', selectedValidatorName: fixture.adapter.name, reportedValidatorName: fixture.adapter.name });
    expect(a.gates.find((g) => g.key === 'external')?.cleared).toBe(false);
    expect([a.gate.cleared, a.freezeGate.cleared, a.dispatchGateOnSigning.cleared]).toEqual([false, false, false]);
    expect(fixture.adapter.isConfigured).toHaveBeenCalledOnce();
  });

  it('clears the composed verdict for a configured matching clean external report', async () => {
    fixture.adapter.name = 'LORENZ'; fixture.adapter.kind = 'external_engine';
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: report('LORENZ') });
    expect(a.externalValidation).toMatchObject({ configured: true, ran: true, qualifyingRun: true, assessmentStatus: 'passed', selectedValidatorName: 'LORENZ', reportedValidatorName: 'LORENZ' });
    expect([a.gate.cleared, a.freezeGate.cleared, a.dispatchGateOnSigning.cleared]).toEqual([true, true, true]);
  });

  it('uses configuration discovery, rather than an adapter name, to enforce readiness', async () => {
    fixture.adapter.name = 'LORENZ'; fixture.adapter.kind = 'external_engine';
    fixture.adapter.isConfigured.mockResolvedValue(false);
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: report('LORENZ') });
    expect(a.externalValidation.configured).toBe(false);
    expect(a.gate.cleared).toBe(false);
  });

  it.each([
    ['failed', 'LORENZ', true],
    ['invalid', 'different-engine', false],
  ] as const)('shows an advisory %s report as its actual outcome, preserving policy clearance', async (status, validator, failed) => {
    fixture.adapter.name = 'LORENZ'; fixture.adapter.kind = 'external_engine'; fixture.required = false;
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: report(validator, failed) });
    expect(a.gate.cleared).toBe(true);
    const external = a.gates.find((g) => g.key === 'external');
    expect(external).toMatchObject({ cleared: true, assessmentStatus: status });
    expect(external?.notAssessed).toBeUndefined();
    expect(external?.assessmentNote).toMatch(status === 'failed' ? /1 error/ : /different-engine/);
  });

  it('serializes an invalid numeric tally as an unknown count with factual status and identities', async () => {
    fixture.adapter.name = 'LORENZ'; fixture.adapter.kind = 'external_engine'; fixture.required = false;
    const supplied = { ...report('LORENZ'), errorCount: NaN };
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: supplied });
    const wire = JSON.parse(JSON.stringify(a));
    expect(wire.externalValidation).toMatchObject({ errorCount: 0, errorCountKnown: false, qualifyingRun: false, assessmentStatus: 'invalid', selectedValidatorName: 'LORENZ', reportedValidatorName: 'LORENZ' });
    expect(wire.gates.find((g: { key: string }) => g.key === 'external')).toMatchObject({ assessmentStatus: 'invalid', cleared: true });
    expect(wire.externalValidation.assessmentNote).toContain('counts do not establish a clean');
  });

  it('explains an advisory subset execution as not externally assessed even when raw ran is true', async () => {
    fixture.required = false;
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: report(fixture.adapter.name) });
    expect(a.externalValidation).toMatchObject({ ran: true, qualifyingRun: false, configured: false, assessmentStatus: 'not_assessed' });
    expect(a.gates.find((g) => g.key === 'external')?.notAssessed).toContain('internal FDA criteria subset');
    expect(a.gate.cleared).toBe(true);
  });

  it('does not attribute another engine report to the selected internal subset', async () => {
    fixture.required = false;
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: report('different-engine') });
    expect(a.externalValidation.assessmentNote).toContain('declares execution from "different-engine"');
    expect(a.externalValidation.assessmentNote).not.toContain('subset ran');
  });

  it('retains unrun operational diagnostics and tolerates a malformed diagnostic row', async () => {
    fixture.adapter.name = 'LORENZ'; fixture.adapter.kind = 'external_engine'; fixture.required = false;
    const supplied = { ...report('LORENZ'), ran: false, passed: false, findings: [null, { ruleId: 'EVALIDATOR-RUN-FAILED', severity: 'error', message: 'Tool execution failed.' }] } as unknown as ExternalValidationReport;
    const a = await assessSequenceDispatchReadiness({ sequenceId: 12, organizationId: 7, externalValidationReport: supplied });
    expect(a.externalValidation).toMatchObject({ ran: false, qualifyingRun: false, assessmentStatus: 'not_assessed', errorCount: 0, errorCountKnown: false });
    expect(a.externalValidation.assessmentNote).toContain('Tool execution failed.');
    expect(a.gate.cleared).toBe(true);
  });
});
