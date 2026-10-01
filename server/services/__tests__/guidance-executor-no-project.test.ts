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
 * blocks are stripped, nothing is proposed or created, and each block's line
 * says it was not saved and why.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({ pool: { query: vi.fn(async () => { throw new Error('nothing may be written'); }) }, db: {} }));

import { processResponseActions } from '../ana-guidance-executor';

const FENCE = '```ana-action\n{"type":"memo","title":"Endpoint memo","content":"PFS at 12 months is the primary endpoint.","confidence":"strong"}\n```';
const ANSWER = `PFS at 12 months.\n\n${FENCE}`;

describe('processResponseActions with no project', () => {
  it('strips the block, proposes nothing, and says it was not saved and why', async () => {
    const out = await processResponseActions(ANSWER, {
      projectId: null, organizationId: 61, userId: 7, userName: 'AnA', threadId: 'th_1',
    });
    expect(out.cleanedText).not.toContain('ana-action');
    expect(out.cleanedText).toContain('PFS at 12 months.');
    // Since the P0-12 residual a block is a proposal, never a write; with no
    // project there is nothing to propose into, and the line says so.
    expect(out.proposals).toEqual([]);
    expect(out.cleanedText).toMatch(/Endpoint memo.*Not saved.*not scoped to a project/s);
  });
});
