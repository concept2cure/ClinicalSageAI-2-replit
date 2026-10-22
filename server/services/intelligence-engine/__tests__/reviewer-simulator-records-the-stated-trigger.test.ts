/**
 * A reviewer simulation run is recorded with the trigger its caller stated, or not at
 * all. Until 2026-10-15 an unstated trigger was written as 'manual' — a claim
 * that a person started the run, which nobody said. The column is NOT NULL, so
 * an unstated trigger is refused before anything is written.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';

const insertCalls: Array<{ values: any }> = [];

vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: (v: any) => {
        insertCalls.push({ values: v });
        return { returning: () => Promise.resolve([{ id: 'sim-run-1' }]) };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  },
}));

import { runReviewerSimulation as runScopedReviewerSimulation } from '../reviewer-simulator.service';
import type { PersonaProgramFacts } from '../reviewer-personas';

vi.mock('../../authoring/authoring-program-access', async original => ({
  ...(await original<typeof import('../../authoring/authoring-program-access')>()), authorizeAuthoringProgram: vi.fn(async () => undefined),
}));
const executor = { query: async (text: string, params: unknown[] = []) => {
  if (!text.startsWith('INSERT INTO reviewer_simulation_runs')) throw new Error('Unexpected fixture read');
  insertCalls.push({ values: { organizationId: params[0], programId: params[1], triggeredBy: params[2], trigger: params[3],
    personaScope: JSON.parse(params[4] as string), inputsHash: params[5], questions: JSON.parse(params[6] as string), questionCount: params[7],
    criticalCount: params[8], warningCount: params[9], infoCount: params[10], summary: JSON.parse(params[13] as string) } });
  return { rows: [{ id: 'sim-run-1' }] };
} };
const runReviewerSimulation = (req: Parameters<typeof runScopedReviewerSimulation>[0]) => runScopedReviewerSimulation(req, { executor, userId: 3 });

const ORG = 7;
const PROGRAM = '00000000-0000-0000-0000-000000000001';

const baseProgram: PersonaProgramFacts = {
  programType: '510K',
  productType: 'device',
  deviceClass: 'II',
  primaryAgency: 'FDA',
};

beforeEach(() => { insertCalls.length = 0; });

describe('runReviewerSimulation — the recorded trigger is the caller\'s', () => {
  test('refuses to persist a run whose trigger was not stated', async () => {
    await expect(runReviewerSimulation({ organizationId: ORG, programId: PROGRAM, program: baseProgram }))
      .rejects.toMatchObject({ statusCode: 422, field: 'trigger' });
    expect(insertCalls, 'an unstated trigger was recorded').toHaveLength(0);
  });

  test('a dry run needs no trigger', async () => {
    await runReviewerSimulation({ organizationId: ORG, programId: PROGRAM, program: baseProgram, dryRun: true });
    expect(insertCalls).toHaveLength(0);
  });
});
