/**
 * AnA's `ich_compliance` and `control_strategy` commands ask the composition
 * boundary (decision P-28: small-molecule Module 3 for a US IND) before their
 * engine runs, and relay its refusal as the command's answer.
 *
 * They called the engines directly, so a monoclonal antibody was judged on
 * Q3A(R2) impurity bases and handed Q6A small-molecule release defaults — the
 * same content the CMC routes now refuse (2026-10-15 launch-boundary re-proof,
 * docs/evidence/D2-API-SCOPE/2026-10-15-reproof/cmc-boundary/). The decision
 * itself runs on a real engine in
 * services/cmc/__tests__/composition-boundary-readers.pglite.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const assessProgramCompositionScope = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('../../cmc/module3-compile', () => ({
  assessProgramCompositionScope: (...a: unknown[]) => assessProgramCompositionScope(...a),
}));
const runIchComplianceCheck = vi.fn(async () => ({
  overallStatus: 'compliant',
  guidelineStatus: {},
  findings: [],
  counts: { pass: 0, warning: 0, fail: 0 },
}));
vi.mock('../../cmc/ich-compliance-checker', () => ({ runIchComplianceCheck: (...a: unknown[]) => runIchComplianceCheck(...(a as [])) }));
const generateControlStrategy = vi.fn(async () => ({ controlElements: [], gaps: [], cqas: [], cpps: [], citations: [] }));
vi.mock('../../cmc/control-strategy-generator', () => ({ generateControlStrategy: (...a: unknown[]) => generateControlStrategy(...(a as [])) }));

import { controlStrategy, ichCompliance } from '../quality-engine-command-handlers';

const ORG = 101;
const P = '0b6f0f86-6f2d-4c1b-9a2e-0d1c7f5d0a11';
const ctx = { organizationId: ORG, activeProjectId: P } as never;
const MAB = {
  code: 'CMC_MODALITY_OUT_OF_SCOPE',
  modality: 'biologic',
  message: "This project's drug substance is biologically derived — CHO cell culture — and Module 3 for a biologic is not composed here.",
};

beforeEach(() => {
  vi.clearAllMocks();
  assessProgramCompositionScope.mockResolvedValue(null);
});

describe.each([
  { action: 'ich_compliance', run: () => ichCompliance(ctx, {}), engine: runIchComplianceCheck },
  { action: 'control_strategy', run: () => controlStrategy(ctx, {}), engine: generateControlStrategy },
])('$action asks the composition boundary first', ({ action, run, engine }) => {
  it('relays the refusal for a program outside it, and runs nothing', async () => {
    assessProgramCompositionScope.mockResolvedValue(MAB);
    const out = await run();
    expect(out).toEqual({ success: false, action, message: MAB.message });
    expect(assessProgramCompositionScope).toHaveBeenCalledWith(ORG, P);
    expect(engine).not.toHaveBeenCalled();
  });

  it('runs its engine for a program inside it', async () => {
    const out = await run();
    expect(out.success).toBe(true);
    expect(engine).toHaveBeenCalled();
  });
});
