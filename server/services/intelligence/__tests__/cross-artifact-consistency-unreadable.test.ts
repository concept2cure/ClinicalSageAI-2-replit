/**
 * A dossier consistency check that could not read the dossier does not say
 * "clean" (row 74, slice S3).
 *
 * checkDossierConsistency reads the project's other artifacts and compares
 * labelled figures against the draft. When that read failed — a database
 * error, a dropped connection — the catch returned the empty report, whose
 * verdict is 'clean', and check_dossier_consistency told the model "No
 * consistency issues detected against the existing dossier." Nothing had been
 * compared. That is a fail-open: an error rendered as a pass.
 *
 * Now the engine marks the report `unavailable: 'artifacts_unreadable'`, and
 * the tool answers with an error that says nothing was compared.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState = vi.hoisted(() => ({ fail: false, rows: [] as unknown[] }));

vi.mock('../../../db.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      if (dbState.fail) throw new Error('connection terminated unexpectedly');
      return dbState.rows;
    },
  };
  return { ...real, db: { ...(real.db as object), select: () => chain } };
});

import { checkDossierConsistency } from '../cross-artifact-consistency';

const DRAFT =
  'In the pivotal study the sample size was N = 240 subjects, randomized 1:1. ' +
  'The NOAEL was 50 mg/kg/day in the 28-day rat study, and the primary endpoint was met.';

beforeEach(() => {
  dbState.fail = false;
  dbState.rows = [];
});

describe('checkDossierConsistency when the project artifacts cannot be read', () => {
  it('marks the report unavailable instead of returning a clean empty report', async () => {
    dbState.fail = true;
    const report = await checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: DRAFT });
    expect(report.unavailable).toBe('artifacts_unreadable');
    expect(report.artifactsCompared).toBe(0);
  });

  it('a read that succeeds and finds nothing is still an ordinary report, not unavailable', async () => {
    const report = await checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: DRAFT });
    expect(report.unavailable).toBeUndefined();
    expect(report.verdict).toBe('clean');
  });
});

describe('the check_dossier_consistency tool', () => {
  const runTool = async (input: Record<string, unknown>) => {
    const { getToolHandler } = await import('../../ana/AnaToolExecutor');
    return JSON.parse(await getToolHandler('check_dossier_consistency')!(input, { organizationId: 7, userId: 3 } as any));
  };

  it('answers with an error, never a clean verdict, when nothing could be compared', async () => {
    dbState.fail = true;
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out).toEqual({
      error: 'The project documents could not be read, so nothing was compared.',
      unavailable: true,
    });
    expect(out).not.toHaveProperty('verdict');
    expect(JSON.stringify(out)).not.toMatch(/No consistency issues/);
  }, 30_000);

  it('still reports a verdict when the documents were read', async () => {
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out.verdict).toBe('clean');
    expect(out).not.toHaveProperty('unavailable');
  }, 30_000);
});
