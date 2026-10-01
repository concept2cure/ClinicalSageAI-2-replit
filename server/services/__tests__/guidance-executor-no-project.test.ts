/**
 * AnA's action blocks are never left in the answer, whether or not the turn
 * has a project (PF-10 S6a review, wf_2358b437-4c8, upheld 2/2).
 *
 * AnA is told to emit ```ana-action fences for a memo, a gap analysis, a
 * checklist. processResponseActions is the one place that strips them, and it
 * also creates what they ask for — which needs a project. When the turn's
 * project did not resolve (a program with no anchor row, a failed anchor read,
 * no project open) its callers skipped it, so the raw JSON block was saved as
 * the answer, shown to the person, replayed to the model, and the action's
 * "not created" was never said. Now the executor takes a null project: the
 * blocks are stripped, nothing is created, and each action is reported as not
 * created and why.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({ pool: { query: vi.fn(async () => { throw new Error('nothing may be written'); }) }, db: {} }));

import { processResponseActions } from '../ana-guidance-executor';

const FENCE = '```ana-action\n{"type":"memo","title":"Endpoint memo","content":"PFS at 12 months is the primary endpoint.","confidence":"strong"}\n```';
const ANSWER = `PFS at 12 months.\n\n${FENCE}`;

describe('processResponseActions with no project', () => {
  it('strips the block, creates nothing, and says each action was not created and why', async () => {
    const out = await processResponseActions(ANSWER, {
      projectId: null, organizationId: 61, userId: 7, userName: 'AnA', threadId: 'th_1',
    });
    expect(out.cleanedText).not.toContain('ana-action');
    expect(out.cleanedText).toContain('PFS at 12 months.');
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0]).toMatchObject({ executed: false, success: false, actionType: 'memo' });
    expect(out.actions[0].error).toMatch(/no project/i);
  });
});
