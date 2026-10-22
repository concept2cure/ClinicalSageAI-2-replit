/**
 * A validation run is recorded as what it was.
 *
 * - The compliance score was 100 whenever no issue was recorded, including
 *   when the AI analysis never ran or saw part of the content.
 * - The history row said performedBy 'system' with the user known, agency
 *   'FDA' when none was named, passedRules 0 / failedRules = the issue count,
 *   and put an artifact or unified-document id in a column that references
 *   coauthor_documents. A row that failed to write was logged and the run
 *   applied anyway.
 * - Confidences nothing computed: 0.8 / 0.7 for findings, 0.9 / 0.85 / 0.8 for
 *   canned advice, and a figure the model was asked to give.
 *
 * The AI client and the database are the only things replaced.
 */
import { describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import fs from 'node:fs';
import path from 'node:path';

const H = vi.hoisted(() => ({
  chat: vi.fn(),
  rows: [] as Array<Record<string, any>>,
  insertFails: false,
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: (...a: unknown[]) => H.chat(...a) } }));
vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (H.insertFails) throw new Error('permission denied for table coauthor_validation_history');
        H.rows.push(row);
      },
    }),
  },
}));
let registered: any = null;
vi.mock('../ai-actions/action-registry', () => ({
  registerActionHandler: (h: unknown) => {
    registered = h;
  },
}));

import { AI_ANALYSIS_MAX_CHARS, realTimeValidationService } from '../realTimeValidationService';
import { coauthorValidationHistory } from '../../../shared/schema';

const clean = JSON.stringify({ issues: [], suggestions: [] });
const answer = (content: string) => H.chat.mockImplementation(async () => ({ content }));
const refuse = () =>
  H.chat.mockImplementation(async () => {
    throw new Error('provider down');
  });
let seq = 0;
const validate = (content: string) =>
  realTimeValidationService.validateContent(`r-${(seq += 1)}`, content, 'regulatory_submission', true);

describe('the compliance score', () => {
  it('is computed when the analysis covered the whole content', async () => {
    answer(clean);
    expect((await validate('Introduction. Executive summary.')).complianceScore).toEqual(expect.any(Number));
  });

  it('is null when the analysis did not run, not the 100 of "no issues"', async () => {
    refuse();
    const r = await validate('Introduction. Executive summary.');
    expect(r.aiAnalysis.status).toBe('not_run');
    expect(r.complianceScore).toBeNull();
  });

  it('is null when the analysis saw only part of the content', async () => {
    answer(clean);
    const r = await validate(`Introduction. ${'x'.repeat(AI_ANALYSIS_MAX_CHARS + 10)}`);
    expect(r.aiAnalysis.status).toBe('partial');
    expect(r.complianceScore).toBeNull();
  });
});

describe('confidence', () => {
  it('is not asked of the model, and not reported where nothing computed one', async () => {
    answer(JSON.stringify({
      issues: [],
      suggestions: [{ type: 'content', text: 'Tighten the summary', confidence: 0.99, reasoning: 'r' }],
    }));
    const r = await validate('Introduction. Executive summary.');
    const [req] = H.chat.mock.calls.at(-1) as [{ messages: Array<{ content: string }> }];
    expect(req.messages[0].content).not.toMatch(/confidence/);
    // The model's suggestion, and the canned template advice for >2 missing sections.
    expect(r.suggestions.length).toBeGreaterThan(0);
    for (const s of r.suggestions) expect(s.confidence).toBeNull();
  });
});

describe('the run_validation action', () => {
  const ctx = { db: {}, actionId: 'a-1', user: { userId: 7, userName: 'Dana Reyes', organizationId: 3 } } as any;
  const run = async (payload: Record<string, unknown> = {}) => {
    await import('../ai-actions/handlers/run-validation');
    return registered.execute(
      {
        actionType: 'run_validation',
        targetType: 'artifact',
        targetId: 41,
        projectId: 12,
        payload: { content: 'Introduction. Purpose of this submission.', title: 'Cover letter', ...payload },
      },
      ctx,
    );
  };
  const reset = () => {
    H.rows.length = 0;
    H.insertFails = false;
  };

  it('records who ran it, on what, and assumes no agency', async () => {
    reset();
    answer(clean);
    await run();
    expect(H.rows).toHaveLength(1);
    const row = H.rows[0];
    expect(row).toMatchObject({
      organizationId: 3,
      performedBy: 'Dana Reyes',
      performedByUserId: 7,
      agency: null,
      documentId: null,
      passedRules: null,
      failedRules: null,
      skippedRules: null,
    });
    expect(row.metadata).toMatchObject({ projectId: 12, target: { type: 'artifact', id: 41 }, title: 'Cover letter' });
    expect(row.validationResults.isValid).toBe(true);
  });

  it('records the agency the caller named', async () => {
    reset();
    answer(clean);
    await run({ agency: 'EMA' });
    expect(H.rows[0].agency).toBe('EMA');
  });

  it('records and reports no score when the analysis did not run', async () => {
    reset();
    refuse();
    const r = await run();
    expect(r.result.complianceScore).toBeNull();
    expect(H.rows[0].complianceScore).toBeNull();
    expect(H.rows[0].validationResults.isValid).toBe(false);
  });

  it('reports no confidence nothing computed', async () => {
    reset();
    answer(JSON.stringify({ issues: [{ type: 'warning', message: 'Vague purpose', severity: 'major', category: 'clarity' }], suggestions: [] }));
    const r = await run();
    expect(r.result.findings.length).toBeGreaterThan(0);
    for (const f of r.result.findings) expect(f.confidence).toBeNull();
  });

  it('does not apply a validation it could not record', async () => {
    reset();
    H.insertFails = true;
    answer(clean);
    await expect(run()).rejects.toMatchObject({ code: 'VALIDATION_NOT_RECORDED', statusCode: 500 });
  });
});

describe('coauthor_validation_history.agency', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
  const MIGRATION = 'migrations/20261015f_coauthor_validation_history_agency_nullable.sql';
  const NO_AGENCY = `INSERT INTO coauthor_validation_history (validation_id, module, agency, validation_results, performed_by)
                     VALUES ('v-1', 'regulatory_submission', NULL, '{}', 'Dana Reyes')`;

  it('is nullable in the drizzle schema a fresh install pushes', () => {
    const agency = getTableConfig(coauthorValidationHistory).columns.find((c) => c.name === 'agency');
    expect(agency?.notNull).toBe(false);
  });

  it('becomes nullable on a database provisioned NOT NULL, idempotently, every deploy', async () => {
    // The table as the baseline created it.
    const ddl = read('migrations/0000_sweet_joseph.sql').match(/CREATE TABLE "coauthor_validation_history" \([\s\S]*?\n\);/);
    expect(ddl).not.toBeNull();
    const pg = new PGlite();
    try {
      await pg.exec(ddl![0]);
      await expect(pg.exec(NO_AGENCY)).rejects.toThrow(/null value in column "agency"/);
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(read(MIGRATION));
      await pg.exec(NO_AGENCY);
      const { rows } = await pg.query<{ agency: string | null }>('SELECT agency FROM coauthor_validation_history');
      expect(rows).toEqual([{ agency: null }]);
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('does nothing where the table does not exist', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(read(MIGRATION));
    } finally {
      await pg.close();
    }
  }, 60_000);
});
