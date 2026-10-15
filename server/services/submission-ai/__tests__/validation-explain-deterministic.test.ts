/**
 * Validation explain: the findings and their severities are the validator's;
 * the model narrates (CLAUDE.md Rule 2; filing-spine design review 2026-10-08,
 * .design/filing-spine/DESIGN_REVIEW.md, open item 2).
 *
 * explainValidation returned the model's JSON as it came. Prompt v1.0 asked the
 * model to decide `blocking` ("true if any finding has severity 'error'") and
 * to echo each finding's ruleId, severity and leaf, and the Validation tab
 * printed "Blocking." and a severity chip from that reply, with no model label:
 * a verdict from a model, the class F21 retired. A reply could also carry rows
 * for findings that were never given, and a model failure failed the request,
 * though the findings need no model.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const GW = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../../ai-gateway', () => ({ getGateway: () => ({ route: (...a: unknown[]) => GW.route(...a) }) }));
vi.mock('../../auditService', () => ({ default: { logAction: async () => ({ persisted: true, chained: true }) } }));

import { explainValidation, VALIDATION_EXPLAIN_NARRATIVE_LABEL } from '../submission-ai-service';

const CTX = { organizationId: 2, userId: 1, submissionId: 37 };
const INPUT = {
  region: 'fda',
  findings: [
    { ruleId: 'MISSING_REQUIRED_SECTION', severity: 'error' as const, message: 'm1.2 is missing', leaf: 'm1.2' },
    { ruleId: 'LEAF_TITLE_EMPTY', severity: 'warning' as const, message: 'A leaf has no title', leaf: 'm2.5' },
  ],
};

beforeEach(() => GW.route.mockReset());

describe("validation explain: the validator's findings, the model's prose", () => {
  it("a model's blocking flag, its severities and its invented rows are dropped; each row is bound to a given finding", async () => {
    GW.route.mockResolvedValue({
      content: JSON.stringify({
        blocking: false,
        summary: 'One section is missing and one leaf needs a title.',
        explained: [
          { index: 0, ruleId: 'SOMETHING_ELSE', severity: 'info', leaf: 'm9.9', cause: 'The cover letter is not in the sequence.', fix: 'Place the cover letter at 1.2.' },
          { index: 1, severity: 'error', cause: 'The leaf title is blank.', fix: 'Give the leaf its document title.' },
          { index: 7, ruleId: 'INVENTED', severity: 'error', cause: 'A finding nobody gave.', fix: 'Nothing.' },
          { ruleId: 'NO_INDEX', severity: 'error', cause: 'No index.', fix: 'Nothing.' },
        ],
      }),
    });
    const out = await explainValidation(INPUT, CTX);
    expect(JSON.stringify(out)).not.toMatch(/"blocking"|INVENTED|NO_INDEX|SOMETHING_ELSE|m9\.9/);
    expect(out).toEqual({
      narrative: {
        source: 'model',
        label: VALIDATION_EXPLAIN_NARRATIVE_LABEL,
        promptVersion: 'validation-explain@v1.1',
        summary: 'One section is missing and one leaf needs a title.',
        explained: [
          { index: 0, ruleId: 'MISSING_REQUIRED_SECTION', severity: 'error', leaf: 'm1.2', cause: 'The cover letter is not in the sequence.', fix: 'Place the cover letter at 1.2.' },
          { index: 1, ruleId: 'LEAF_TITLE_EMPTY', severity: 'warning', leaf: 'm2.5', cause: 'The leaf title is blank.', fix: 'Give the leaf its document title.' },
        ],
      },
      narrativeUnavailable: null,
    });
  });

  it('the model is given each finding with its index, under prompt v1.1', async () => {
    GW.route.mockResolvedValue({ content: '{"summary":"","explained":[]}' });
    await explainValidation(INPUT, CTX);
    const req = GW.route.mock.calls[0][0] as { promptVersion: string; messages: Array<{ role: string; content: string }> };
    expect(req.promptVersion).toBe('validation-explain@v1.1');
    expect(JSON.parse(req.messages[1].content).findings.map((f: { index: number }) => f.index)).toEqual([0, 1]);
  });

  it("AnA's snake_case rule_id binds as the finding's rule", async () => {
    GW.route.mockResolvedValue({ content: JSON.stringify({ summary: 's', explained: [{ index: 0, cause: 'c', fix: 'f' }] }) });
    const out = await explainValidation({ region: 'fda', findings: [{ rule_id: 'M1_FORM', severity: 'error', message: 'm' } as never] }, CTX);
    expect(out.narrative?.explained[0].ruleId).toBe('M1_FORM');
  });

  it('a failed model call is no explanation, not a failed request: the findings stand', async () => {
    GW.route.mockResolvedValue({ content: 'not json at all' });
    const out = await explainValidation(INPUT, CTX);
    expect(out.narrative).toBeNull();
    expect(out.narrativeUnavailable?.code).toBe('INVALID_AI_RESPONSE');
  });
});
