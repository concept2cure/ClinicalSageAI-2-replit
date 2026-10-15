/**
 * A submission plan's structure comes from the reasoning engine; the model
 * narrates (Rule 2; work-orders item 21, 2026-10-05; evidence
 * docs/evidence/RULE2/2026-10-05-submission-plan/).
 *
 * generateSubmissionPlan returned the model's own module map, forms and a
 * timeline of day offsets keyed to PDUFA, 210-day or PMDA clocks, spread beside
 * the engine's deterministic structure, and the two could disagree. A model
 * failure also failed the whole plan, though the structure needs no model.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const GW = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../../ai-gateway', () => ({ getGateway: () => ({ route: (...a: unknown[]) => GW.route(...a) }) }));
vi.mock('../../auditService', () => ({ default: { logAction: async () => ({ persisted: true, chained: true }) } }));

import { generateSubmissionPlan, SUBMISSION_PLAN_NARRATIVE_LABEL } from '../submission-ai-service';
import { buildSubmissionStructure } from '../../reasoning-engine/index.js';

const CTX = { organizationId: 2, userId: 1, submissionId: 37 };
const INPUT = { applicationType: 'nda', clientType: 'pharma', regions: ['fda'] };

beforeEach(() => GW.route.mockReset());

describe("the plan is the engine's structure; the model's figures are not in it", () => {
  it("a model's timeline, module map and forms are dropped; its gaps and dependencies are labelled narrative", async () => {
    GW.route.mockResolvedValue({
      content: JSON.stringify({
        moduleMap: [{ sectionCode: 'm9.9', title: 'Invented', required: true }],
        forms: [{ formId: 'FDA-9999', region: 'fda', required: true }],
        timeline: [{ milestone: 'PDUFA date', offsetDays: 300 }],
        gaps: [{ sectionCode: 'm2.5', description: 'No clinical overview yet.' }],
        dependencies: [{ before: 'm5.3.5', after: 'm2.7' }],
      }),
    });
    const plan = (await generateSubmissionPlan(INPUT, CTX)) as unknown as Record<string, unknown>;
    expect(plan.deterministicStructure).toEqual(buildSubmissionStructure(['fda'], 'nda'));
    expect(JSON.stringify(plan)).not.toMatch(/FDA-9999|offsetDays|m9\.9|"timeline"|"moduleMap"|"forms"/);
    expect(plan.narrative).toEqual({
      source: 'model',
      label: SUBMISSION_PLAN_NARRATIVE_LABEL,
      promptVersion: 'submission-plan@v1.1',
      gaps: [{ sectionCode: 'm2.5', description: 'No clinical overview yet.' }],
      dependencies: [{ before: 'm5.3.5', after: 'm2.7' }],
    });
  });

  it('the model is given the structure to narrate, under prompt v1.1', async () => {
    GW.route.mockResolvedValue({ content: '{"gaps":[],"dependencies":[]}' });
    await generateSubmissionPlan(INPUT, CTX);
    const req = GW.route.mock.calls[0][0] as { promptVersion: string; messages: Array<{ role: string; content: string }> };
    expect(req.promptVersion).toBe('submission-plan@v1.1');
    expect(JSON.parse(req.messages[1].content).deterministicStructure).toEqual(buildSubmissionStructure(['fda'], 'nda'));
  });

  it('the plan stands when the model call fails (an unreadable reply)', async () => {
    GW.route.mockResolvedValue({ content: 'not json at all' });
    const plan = await generateSubmissionPlan(INPUT, CTX);
    expect(plan.deterministicStructure).toEqual(buildSubmissionStructure(['fda'], 'nda'));
    expect(plan.narrative).toBeNull();
    expect(plan.narrativeUnavailable?.code).toBe('INVALID_AI_RESPONSE');
  });
});
