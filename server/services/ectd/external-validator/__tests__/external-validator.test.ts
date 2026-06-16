import { describe, it, expect } from 'vitest';
import {
  tallyFindings,
  evaluateExternalValidationGate,
  resolveExternalValidator,
  evalidatorRequiredFromEnv,
  NoopExternalValidator,
  LorenzEValidatorAdapter,
  type ExternalValidationReport,
  type ExternalValidationFinding,
} from '..';

function report(over: Partial<ExternalValidationReport> = {}): ExternalValidationReport {
  return {
    validator: 'stub',
    profile: 'FDA eCTD 3.2.2',
    ranAt: new Date(),
    ran: true,
    findings: [],
    errorCount: 0,
    warningCount: 0,
    passed: true,
    ...over,
  };
}

describe('tallyFindings', () => {
  it('counts only error/warning severities', () => {
    const findings: ExternalValidationFinding[] = [
      { ruleId: 'FDA-1', severity: 'error', message: 'x' },
      { ruleId: 'FDA-2', severity: 'error', message: 'y' },
      { ruleId: 'FDA-3', severity: 'warning', message: 'z' },
      { ruleId: 'FDA-4', severity: 'info', message: 'i' },
    ];
    expect(tallyFindings(findings)).toEqual({ errorCount: 2, warningCount: 1 });
  });
});

describe('NoopExternalValidator', () => {
  it('is not configured and returns an honest un-run report (not a pass)', async () => {
    const v = new NoopExternalValidator();
    expect(await v.isConfigured()).toBe(false);
    const r = await v.validate({ packageDir: '/tmp/x', region: 'fda' });
    expect(r.ran).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.errorCount).toBe(0);
  });
});

describe('LorenzEValidatorAdapter', () => {
  it('is not configured without EVALIDATOR_BINARY and fails closed when validated', async () => {
    const prior = process.env.EVALIDATOR_BINARY;
    delete process.env.EVALIDATOR_BINARY;
    delete process.env.EVALIDATOR_ENDPOINT;
    try {
      const v = new LorenzEValidatorAdapter();
      expect(await v.isConfigured()).toBe(false);
      await expect(v.validate({ packageDir: '/tmp/x', region: 'fda' })).rejects.toThrow(/not configured/i);
    } finally {
      if (prior !== undefined) process.env.EVALIDATOR_BINARY = prior;
    }
  });
});

describe('resolveExternalValidator', () => {
  it('falls back to the no-op when no engine is configured', async () => {
    const prior = process.env.EVALIDATOR_BINARY;
    const priorEp = process.env.EVALIDATOR_ENDPOINT;
    delete process.env.EVALIDATOR_BINARY;
    delete process.env.EVALIDATOR_ENDPOINT;
    try {
      const v = await resolveExternalValidator();
      expect(v.name).toBe('noop');
    } finally {
      if (prior !== undefined) process.env.EVALIDATOR_BINARY = prior;
      if (priorEp !== undefined) process.env.EVALIDATOR_ENDPOINT = priorEp;
    }
  });
});

describe('evaluateExternalValidationGate', () => {
  it('staging is advisory: surfaces error count but adds no blocker', () => {
    const r = evaluateExternalValidationGate({
      report: report({ errorCount: 3, findings: [{ ruleId: 'F', severity: 'error', message: 'm' }] }),
      configured: true,
      requireEvalidator: true,
      environment: 'staging',
    });
    expect(r.externalErrorCount).toBe(3);
    expect(r.cleared).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('production + required + not configured ⇒ fail closed (could not run)', () => {
    const r = evaluateExternalValidationGate({
      report: null,
      configured: false,
      requireEvalidator: true,
      environment: 'production',
    });
    expect(r.ran).toBe(false);
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toMatch(/did not run/i);
  });

  it('production + required + ran with errors ⇒ blocks on the agency errors', () => {
    const r = evaluateExternalValidationGate({
      report: report({ ran: true, errorCount: 2, passed: false }),
      configured: true,
      requireEvalidator: true,
      environment: 'production',
    });
    expect(r.externalErrorCount).toBe(2);
    expect(r.cleared).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/reported 2 error/i);
  });

  it('production + required + ran clean ⇒ cleared', () => {
    const r = evaluateExternalValidationGate({
      report: report({ ran: true, errorCount: 0, passed: true }),
      configured: true,
      requireEvalidator: true,
      environment: 'production',
    });
    expect(r.cleared).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('not required ⇒ never blocks even in production with no engine', () => {
    const r = evaluateExternalValidationGate({
      report: null,
      configured: false,
      requireEvalidator: false,
      environment: 'production',
    });
    expect(r.cleared).toBe(true);
  });

  it('reads the opt-in enforcement flag from the environment', () => {
    expect(evalidatorRequiredFromEnv({ ECTD_REQUIRE_EVALIDATOR: 'true' } as any)).toBe(true);
    expect(evalidatorRequiredFromEnv({} as any)).toBe(false);
  });
});
