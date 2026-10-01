/**
 * The consistency check's verdicts come from the reconciliation engine, not a
 * model.
 *
 * runConsistencyCheck sent the claim and its sources to the gateway and
 * persisted the model's own match/conflict labels as consistency findings
 * (CLAUDE.md Rule 2: verdicts come from deterministic engines; the model
 * narrates). It now compares the labelled figures reconcileDossierNumbers
 * extracts between the claim and each source, makes no model call, and says
 * which sources shared no figure with the claim rather than counting them
 * as consistent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  route: vi.fn(async () => {
    throw new Error('the consistency check must not call a model');
  }),
  logAction: vi.fn(async (..._a: unknown[]) => ({ persisted: true, chained: true, tamperProof: true }) as unknown),
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../ai-gateway', () => ({ getGateway: () => ({ route: h.route }) }));
vi.mock('../../auditService', () => ({ default: { logAction: (...a: unknown[]) => h.logAction(...a) } }));
vi.mock('../../../db', () => {
  let n = 0;
  const select = () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 11 }] }) }) });
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      returning: async () => {
        h.inserted.push(v);
        return [{ id: ++n, ...v }];
      },
    }),
  });
  return { db: { select, insert }, pool: {}, getPool: () => ({}) };
});
const { resolveSignerOrgRole } = vi.hoisted(() => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { runConsistencyCheck } from '../truth-engine-service';

const CTX = { organizationId: 7, userId: 3 };
const LEFT = { ref: '2.7.3', text: 'The study randomized 186 subjects at 42 sites; the hazard ratio was 0.71.' };

beforeEach(() => {
  h.route.mockClear();
  h.logAction.mockClear();
  h.inserted.length = 0;
});

describe('runConsistencyCheck', () => {
  it('records a conflict and a match from the figures each text states, with no model call', async () => {
    const r = await runConsistencyCheck(
      {
        submissionId: 11,
        dimension: 'subject-counts',
        left: LEFT,
        right: [
          { ref: 'CSR-001', text: 'In total the trial randomized 120 subjects across 42 sites.' },
          { ref: 'CSR-002', text: 'The study randomized 186 subjects.' },
        ],
      },
      CTX,
    );
    expect(h.route).not.toHaveBeenCalled();
    const byRef = (ref: string) => r.findings.filter((f) => f.rightRef === ref).map((f) => [f.status, f.detail]);
    expect(byRef('CSR-001')).toEqual([
      ['conflict', 'enrolled_n: 2.7.3 gives 186; CSR-001 gives 120.'],
      ['match', 'sites: both give 42.'],
    ]);
    expect(byRef('CSR-002')).toEqual([['match', 'enrolled_n: both give 186.']]);
    expect(r.notCompared).toEqual([]);
  });

  it('records nothing for a source that shares no labelled figure, and names it as not compared', async () => {
    const r = await runConsistencyCheck(
      { submissionId: 11, dimension: 'label-vs-safety', left: LEFT, right: [{ ref: 'Label', text: 'Hepatotoxicity has been reported.' }] },
      CTX,
    );
    expect(r.findings).toEqual([]);
    expect(r.notCompared).toEqual(['Label']);
    expect(h.inserted).toEqual([]);
  });

  it('audits the check as the engine that ran it, not as AI generation', async () => {
    await runConsistencyCheck(
      { submissionId: 11, dimension: 'subject-counts', left: LEFT, right: [{ ref: 'CSR-002', text: 'The study randomized 186 subjects.' }] },
      CTX,
    );
    const [entry] = h.logAction.mock.calls.at(-1) as [Record<string, any>];
    expect(entry.action).toBe('CONSISTENCY_CHECK');
    expect(entry.details).toMatchObject({ engine: 'dossier-number-reconciliation', findingCount: 1, conflicts: 0, notCompared: [] });
    expect(JSON.stringify(entry)).not.toMatch(/promptVersion|AI_GENERATE/);
  });
});

describe("AnA's check_consistency", () => {
  it('tells AnA which sources were not compared, and that this is not a finding of consistency', async () => {
    const { getToolHandler } = await import('../../ana/AnaToolExecutor');
    const res = JSON.parse(
      await getToolHandler('check_consistency')!(
        { submission_id: 11, dimension: 'label-vs-safety', left: LEFT, right: [{ ref: 'Label', text: 'No figures here.' }] },
        { ...CTX, humanConfirmed: true } as never,
      ),
    );
    expect(res.ok).toBe(true);
    expect(res.notCompared).toEqual(['Label']);
    expect(res.message).toMatch(/not compared/i);
    expect(res.message).toMatch(/not a finding of consistency/i);
  });
});
