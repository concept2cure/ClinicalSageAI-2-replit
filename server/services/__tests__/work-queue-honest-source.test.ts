/**
 * The work queue says which rule queued an item and why — not "AI" with a
 * confidence no model produced.
 *
 * generateWorkRecommendations wrote overdue, in-review and not-started
 * sections as source 'ai' with constant confidences 0.95 / 0.85 / 0.75 and
 * canned reasons ("Blocking downstream sections from proceeding", with no
 * dependency looked at), which lumen-context-builder injected into AnA's
 * prompt; a failure was swallowed after the old rows were deleted; and
 * addToWorkQueue turned a failed insert into `null`, which POST
 * /work-queue/add answered as 200.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../utils/logger.js', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { addToWorkQueue, generateWorkRecommendations } from '../user-intelligence';

const PAST = new Date(Date.now() - 5 * 86_400_000).toISOString();
const SECTIONS = [
  { section_code: '2.5', title: 'Clinical overview', status: 'drafting', deadline: PAST, assigned_to: 7, module: '2' },
  { section_code: '3.2.P', title: 'Drug product', status: 'qc_review', deadline: null, assigned_to: 9, module: '3' },
  { section_code: '5.3.5', title: 'Efficacy reports', status: 'not_started', deadline: null, assigned_to: null, module: '5' },
];

/** The INSERT parameters of each queued item. */
const inserted = () => H.query.mock.calls
  .filter(([sql]) => /INSERT INTO user_work_queue/.test(String(sql)))
  .map(([sql, p]) => ({ sql: String(sql), p: p as unknown[] }));

beforeEach(() => {
  H.query.mockReset();
  H.query.mockImplementation(async (sql: string) => {
    if (/FROM project_sections/.test(sql)) return { rows: SECTIONS };
    if (/INSERT INTO user_work_queue/.test(sql)) return { rows: [{ id: 41 }] };
    return { rows: [], rowCount: 0 };
  });
});

describe('generateWorkRecommendations', () => {
  it('labels each item with the rule that queued it, and no confidence', async () => {
    await generateWorkRecommendations({ userId: 7, organizationId: 3, projectId: 12 });
    const rows = inserted();
    expect(rows.map((r) => r.p[11])).toEqual(['deadline', 'review_request', 'sequence']);
    for (const r of rows) expect(r.sql).toMatch(/\$12, NULL, \$13\)/); // ai_confidence written NULL
    const reasons = rows.map((r) => String(r.p[12]));
    expect(reasons[0]).toMatch(/^Past its deadline \(\d{4}-\d{2}-\d{2}\) and still "drafting"\.$/);
    expect(reasons[1]).toBe('Awaiting QC review.');
    expect(reasons[2]).toBe('Not started and unassigned; listed in Module 5 order.');
    expect(reasons.join(' ')).not.toMatch(/Blocking downstream|authoring sequence/);
  });

  it('clears the old "ai" rows with its own', async () => {
    await generateWorkRecommendations({ userId: 7, organizationId: 3, projectId: 12 });
    const del = H.query.mock.calls.find(([sql]) => /DELETE FROM user_work_queue/.test(String(sql)));
    expect(String(del?.[0])).toMatch(/source IN \('ai', 'deadline', 'review_request', 'sequence'\)/);
  });

  it('reports a failed regeneration rather than serving what is left', async () => {
    H.query.mockImplementation(async (sql: string) => {
      if (/FROM project_sections/.test(sql)) return { rows: SECTIONS };
      if (/INSERT INTO user_work_queue/.test(sql)) throw new Error('connection terminated');
      return { rows: [], rowCount: 0 };
    });
    await expect(generateWorkRecommendations({ userId: 7, organizationId: 3, projectId: 12 })).rejects.toThrow(/connection terminated/);
  });
});

describe('addToWorkQueue', () => {
  it('throws on an insert that recorded nothing, rather than returning null', async () => {
    H.query.mockResolvedValue({ rows: [] });
    await expect(addToWorkQueue({ userId: 7, organizationId: 3, taskType: 'manual', taskTitle: 't', source: 'manual' }))
      .rejects.toThrow(/not recorded/);
  });
});
