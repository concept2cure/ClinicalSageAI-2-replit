/**
 * WO-16C #133, review of the PDEV void-audit conversion.
 *
 * `pdev.ind_assembly.compile` is the one command in this surface that produces
 * TWO 21 CFR Part 11 §11.10(e) rows per call:
 *
 *   - the SERVICE's row — `pdev_ectd_compiled` / `pdev_ectd_compile_refused`,
 *     which records the compile itself and any `forced: true` override of the
 *     readiness floor;
 *   - this HANDLER's row — `agent.ana.pdev.ind_assembly.compile`, which records
 *     that AnA invoked it.
 *
 * The first version of the conversion carried only the handler's own row. That
 * is worse than carrying none, and the mechanism is the point of this file:
 * `auditNote` appends nothing when the outcome it is given persisted, so a run
 * where the AGENT row landed and the SERVICE row was lost produced a tool
 * response with no audit note at all — a positive "the record is fine" signal
 * about a record that does not exist.
 *
 * Failure is injected at the dependency in both directions independently: the
 * compile service reports a lost row while the handler's own write succeeds, and
 * the reverse. Each must be visible on its own key and in the message.
 *
 * RED before the fix: `data.ectdAuditTrail` was `undefined` and the message
 * carried no note when only the service row was lost.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const COMPILE = vi.hoisted(() => ({
  result: null as Record<string, unknown> | null,
}));
const AGENT_ROW = vi.hoisted(() => ({
  outcome: { persisted: true, chained: true } as Record<string, unknown>,
}));

vi.mock('../../../db', () => ({
  db: {},
  pool: undefined,
  getPool: () => { throw new Error('not in test scope'); },
}));

// The governed-tool gate is a large mechanism with its own tests; this file is
// about what the handler does AFTER the gate opens.
vi.mock('../mdx-tool-policy', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, requireGovernedToolGate: () => ({ ok: true, reason: 'because the Pre-IND package is due and readiness is confirmed' }) };
});

vi.mock('../../pdev/pdev-ectd-compile', () => ({
  pdevEctdCompileService: { compile: async () => COMPILE.result },
}));

vi.mock('../../audit/audit-write-outcome', () => ({
  recordAuditRow: async () => AGENT_ROW.outcome,
}));

import { pdevIndAssemblyCompile } from '../pdev-command-handlers';

const CTX = {
  userId: 7,
  organizationId: 1,
  userRole: 'regulatory_lead',
  threadId: 'thread-1',
} as unknown as Parameters<typeof pdevIndAssemblyCompile>[0];

const PARAMS = {
  programId: '22222222-2222-2222-2222-222222222222',
  // numParam: the handler wants a numeric project id here, not a uuid.
  submissionId: 41,
  reason: 'Pre-IND package is due and the readiness floor was reviewed with QA.',
};

const LOST = {
  persisted: false,
  code: 'AUDIT_ROW_NOT_PERSISTED',
  message: 'The 21 CFR Part 11 audit entry for this transition could not be written.',
};

const COMPILED = (audit: unknown) => ({
  status: 'compiled',
  readinessSnapshot: { overallReadiness: 91, blockers: [] },
  package: { filename: 'ind-0001.zip', sizeBytes: 4096, stats: { totalFiles: 12 } },
  thresholdApplied: 80,
  forced: false,
  audit,
});

const REFUSED = (audit: unknown) => ({
  status: 'refused_low_readiness',
  readinessSnapshot: { overallReadiness: 41, blockers: [{ activityKey: 'cmc.specifications' }] },
  refusalReason: 'IND assembly readiness 41% < threshold 80%',
  thresholdApplied: 80,
  forced: false,
  audit,
});

beforeEach(() => {
  AGENT_ROW.outcome = { persisted: true, chained: true };
  COMPILE.result = null;
});

describe('pdev.ind_assembly.compile reports BOTH of its Part 11 rows', () => {
  test('a lost SERVICE row is visible even when the agent row landed', async () => {
    COMPILE.result = COMPILED(LOST);

    const res = await pdevIndAssemblyCompile(CTX, PARAMS);

    expect(res.success).toBe(true);
    const data = res.data as Record<string, unknown>;
    // The two rows are named separately — reporting one row's outcome under the
    // other's key is the defect this file exists for.
    expect(data.agentAuditTrail).toEqual({ persisted: true, chained: true });
    expect(data.ectdAuditTrail).toEqual(LOST);
    // And the message says so, rather than being silent because the OTHER row
    // was fine.
    expect(res.message).toContain('could not be written');
  });

  test('a lost AGENT row is visible even when the service row landed', async () => {
    AGENT_ROW.outcome = LOST;
    COMPILE.result = COMPILED({ persisted: true, chained: true });

    const res = await pdevIndAssemblyCompile(CTX, PARAMS);
    const data = res.data as Record<string, unknown>;

    expect(data.agentAuditTrail).toEqual(LOST);
    expect(data.ectdAuditTrail).toEqual({ persisted: true, chained: true });
    expect(res.message).toContain('could not be written');
  });

  test('both rows landing leaves the message clean', async () => {
    COMPILE.result = COMPILED({ persisted: true, chained: true });

    const res = await pdevIndAssemblyCompile(CTX, PARAMS);

    expect(res.message).not.toContain('could not be written');
    expect(res.message).toContain('Compiled ind-0001.zip');
  });

  test('the refusal arm carries both rows too', async () => {
    // The refusal row is the audit trail's only evidence that a compile was
    // attempted below threshold, so it is the one least safe to lose silently.
    COMPILE.result = REFUSED(LOST);

    const res = await pdevIndAssemblyCompile(CTX, PARAMS);

    expect(res.success).toBe(false);
    expect(res.error).toBe('READINESS_TOO_LOW');
    const data = res.data as Record<string, unknown>;
    expect(data.ectdAuditTrail).toEqual(LOST);
    expect(data.agentAuditTrail).toEqual({ persisted: true, chained: true });
    expect(res.message).toContain('could not be written');
    expect(res.message).toContain('readiness 41%');
  });

  test('no store-derived text reaches the tool response', async () => {
    COMPILE.result = COMPILED({
      persisted: false,
      code: 'AUDIT_ROW_NOT_PERSISTED',
      message: 'The 21 CFR Part 11 audit entry for this transition could not be written.',
    });

    const res = await pdevIndAssemblyCompile(CTX, PARAMS);
    const serialized = JSON.stringify(res);

    // The failure arm carries a stable code and a safe sentence; the store's own
    // reason lives in recordAuditRow's log line and nowhere else.
    expect(serialized).toContain('AUDIT_ROW_NOT_PERSISTED');
    expect(serialized).not.toMatch(/relation .* does not exist/);
    expect(serialized).not.toMatch(/connection terminated/i);
    expect(serialized).not.toMatch(/\b53300\b/);
  });
});
