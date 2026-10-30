import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  tallyFindings,
  evaluateExternalValidationGate,
  resolveExternalValidator,
  runExternalValidation,
  evalidatorRequiredFromEnv,
  NoopExternalValidator,
  LorenzEValidatorAdapter,
  FdaCriteriaValidatorAdapter,
  type ExternalValidator,
  type ValidateArgs,
  type ExternalValidationReport,
  type ExternalValidationFinding,
} from '..';

function report(over: Partial<ExternalValidationReport> = {}): ExternalValidationReport {
  const errorCount = over.errorCount ?? 0;
  const warningCount = over.warningCount ?? 0;
  const ran = over.ran ?? true;
  return {
    validator: 'lorenz-evalidator',
    profile: 'FDA eCTD 3.2.2',
    ranAt: new Date(),
    ran,
    findings: [
      ...Array.from({ length: errorCount }, (_, i) => ({ ruleId: `E${i}`, severity: 'error' as const, message: 'Synthetic error.' })),
      ...Array.from({ length: warningCount }, (_, i) => ({ ruleId: `W${i}`, severity: 'warning' as const, message: 'Synthetic warning.' })),
    ],
    errorCount,
    warningCount,
    passed: ran && errorCount === 0,
    ...over,
  };
}

function externalGate(input: Parameters<typeof evaluateExternalValidationGate>[0]) {
  return evaluateExternalValidationGate({
    selectedValidator: { name: 'lorenz-evalidator', kind: 'external_engine' },
    ...input,
  });
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
    const priorEndpoint = process.env.EVALIDATOR_ENDPOINT;
    delete process.env.EVALIDATOR_BINARY;
    delete process.env.EVALIDATOR_ENDPOINT;
    try {
      const v = new LorenzEValidatorAdapter();
      expect(await v.isConfigured()).toBe(false);
      await expect(v.validate({ packageDir: '/tmp/x', region: 'fda' })).rejects.toThrow(/not configured/i);
    } finally {
      if (prior === undefined) delete process.env.EVALIDATOR_BINARY;
      else process.env.EVALIDATOR_BINARY = prior;
      if (priorEndpoint === undefined) delete process.env.EVALIDATOR_ENDPOINT;
      else process.env.EVALIDATOR_ENDPOINT = priorEndpoint;
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

describe('runExternalValidation with an existing server selection', () => {
  afterEach(() => vi.restoreAllMocks());

  function unavailableResolver() {
    return {
      external: vi.spyOn(LorenzEValidatorAdapter.prototype, 'isConfigured').mockResolvedValue(false),
      subset: vi.spyOn(FdaCriteriaValidatorAdapter.prototype, 'isConfigured').mockResolvedValue(false),
    };
  }

  it('uses the supplied adapter once without resolving again and forwards the same arguments', async () => {
    const resolver = unavailableResolver();
    const args: ValidateArgs = { packageDir: '/tmp/synthetic-selected-package', region: 'fda', profile: 'synthetic-fda-profile' };
    const expected = report({ validator: 'synthetic-external', profile: args.profile });
    const selected: ExternalValidator = {
      name: 'synthetic-external', kind: 'external_engine',
      isConfigured: vi.fn().mockResolvedValue(true), validate: vi.fn().mockResolvedValue(expected),
    };

    await expect(runExternalValidation(args, selected)).resolves.toBe(expected);
    expect(selected.validate).toHaveBeenCalledExactlyOnceWith(args);
    expect(vi.mocked(selected.validate).mock.calls[0][0]).toBe(args);
    expect(selected.isConfigured).not.toHaveBeenCalled();
    expect(resolver.external).not.toHaveBeenCalled();
    expect(resolver.subset).not.toHaveBeenCalled();
  });

  it('preserves the canonical unrun failure report for a supplied adapter that throws', async () => {
    const resolver = unavailableResolver();
    const args: ValidateArgs = { packageDir: '/tmp/synthetic-selected-package', region: 'fda', profile: 'synthetic-fda-profile' };
    const selected: ExternalValidator = {
      name: 'synthetic-external', kind: 'external_engine', isConfigured: vi.fn().mockResolvedValue(true),
      validate: vi.fn().mockRejectedValue(new Error('Synthetic selected-adapter failure')),
    };

    const result = await runExternalValidation(args, selected);
    expect(result).toMatchObject({ validator: selected.name, profile: args.profile,
      ran: false, passed: false, errorCount: 0, warningCount: 0,
      findings: [{ ruleId: 'EVALIDATOR-RUN-FAILED', severity: 'error',
        message: 'External validator "synthetic-external" failed to run: Synthetic selected-adapter failure' }],
    });
    expect(result.ranAt).toBeInstanceOf(Date);
    const assessment = evaluateExternalValidationGate({ report: result, selectedValidator: selected,
      configured: true, requireEvalidator: true, environment: 'production' });
    expect(assessment).toMatchObject({ ran: false, qualifyingRun: false,
      errorCountKnown: false, externalErrorCount: 0, assessmentStatus: 'not_assessed', cleared: false });
    expect(selected.validate).toHaveBeenCalledExactlyOnceWith(args);
    expect(resolver.external).not.toHaveBeenCalled();
    expect(resolver.subset).not.toHaveBeenCalled();
  });

  it('preserves default resolution when no selection is supplied', async () => {
    const resolver = unavailableResolver();
    const result = await runExternalValidation({ packageDir: '/tmp/synthetic-unconfigured-package', region: 'fda' });
    expect(result).toMatchObject({ validator: 'noop', profile: 'fda', ran: false, passed: false, findings: [] });
    expect(resolver.external).toHaveBeenCalledOnce();
    expect(resolver.subset).toHaveBeenCalledOnce();
  });
});

describe('evaluateExternalValidationGate', () => {
  it('staging is advisory: surfaces error count but adds no blocker', () => {
    const r = externalGate({
      report: report({ errorCount: 3 }),
      configured: true,
      requireEvalidator: true,
      environment: 'staging',
    });
    expect(r.externalErrorCount).toBe(3);
    expect(r.assessmentStatus).toBe('failed');
    expect(r.cleared).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('production + required + not configured ⇒ fail closed (could not run)', () => {
    const r = externalGate({
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
    const r = externalGate({
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
    const r = externalGate({
      report: report({ ran: true, errorCount: 0, passed: true }),
      configured: true,
      requireEvalidator: true,
      environment: 'production',
    });
    expect(r.cleared).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('not required ⇒ never blocks even in production with no engine', () => {
    const r = externalGate({
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
