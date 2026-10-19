/**
 * The AnA review tools state the gate's verdict as it is.
 *
 * review_financial_disclosure, review_iacuc_protocol and review_ibc_registration
 * answered every non-critical result with "… passes the deterministic … gate
 * (<risk> risk)" — including 'medium', which these gates assign exactly when a
 * MAJOR finding is open. review_ibc_registration also reported
 * highestRequiredBsl 'BSL-1' for a registration with no agents, and an expiry
 * of `expired: false` for one with no approval date; review_iacuc_protocol did
 * the same for a protocol with no approval date.
 */
import { describe, it, expect, vi } from 'vitest';

const fakeClient = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), connect: async () => fakeClient }),
}));

const h = vi.hoisted(() => ({
  containment: {} as Record<string, unknown>,
  protocol: {} as Record<string, unknown>,
  disclosure: {} as Record<string, unknown>,
}));
vi.mock('../../ibc/ibc-service', async (orig) => ({ ...(await orig<object>()), getContainmentInput: vi.fn(async () => h.containment) }));
vi.mock('../../iacuc/iacuc-service', async (orig) => ({ ...(await orig<object>()), getProtocolCompletenessInput: vi.fn(async () => h.protocol) }));
vi.mock('../../financial-disclosures/fcoi-service', async (orig) => ({ ...(await orig<object>()), loadDisclosureSnapshot: vi.fn(async () => h.disclosure) }));

import { getToolHandler } from '../AnaToolExecutor';

const run = async (tool: string, input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(tool)!(input, { organizationId: 7 } as never)) as Record<string, any>;

describe('a medium result is not called a pass', () => {
  it('review_ibc_registration', async () => {
    h.containment = {
      declaredBsl: 'BSL-3', nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false, approvalDate: '2026-03-01',
      agents: [{ agentName: 'X', riskGroup: 'RG3', requiredBsl: 'BSL-2' }],
    };
    const out = await run('review_ibc_registration', { registration_id: 1 });
    expect(out.riskLevel).toBe('medium');
    expect(out.message).not.toMatch(/passes/i);
    expect(out.message).toMatch(/1 finding \(1 major\), risk medium — does not pass/);
  });

  it('review_iacuc_protocol', async () => {
    h.protocol = {
      painCategory: 'C', threeRsReplacement: 'No in-vitro model.', threeRsReduction: null, threeRsRefinement: 'Humane endpoints.',
      painJustification: null, speciesCount: 1, plannedAnimalTotal: 24, approvalDate: '2026-03-01',
    };
    const out = await run('review_iacuc_protocol', { protocol_id: 1 });
    expect(out.riskLevel).toBe('medium');
    expect(out.message).not.toMatch(/passes/i);
    expect(out.message).toMatch(/1 finding \(1 major\), risk medium — does not pass/);
  });

  it('review_financial_disclosure, which still says only critical findings block certification', async () => {
    h.disclosure = { formType: 'FDA_3454', hasDisclosableInterests: false, disclosurePeriodStart: null, disclosurePeriodEnd: null, interests: [] };
    const out = await run('review_financial_disclosure', { disclosure_id: 1 });
    expect(out.riskLevel).toBe('medium');
    expect(out.certifiable).toBe(true);
    expect(out.message).not.toMatch(/passes/i);
    expect(out.message).toMatch(/1 finding \(1 major\), risk medium — does not pass/);
    expect(out.message).toMatch(/only critical findings block it/);
  });
});

describe('what was not derived is not reported', () => {
  it('review_ibc_registration with no agents and no approval date derives no level and no expiry verdict', async () => {
    h.containment = { declaredBsl: 'BSL-2', nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false, approvalDate: null, agents: [] };
    const out = await run('review_ibc_registration', { registration_id: 1 });
    expect(out.highestRequiredBsl).toBeNull();
    expect(out.expiration.expired).toBeNull();
    expect(out.riskLevel).toBe('undetermined');
    expect(out.message).toMatch(/Not assessed: .*no agents are registered/);
  });

  it('review_iacuc_protocol with no approval date reports the review status as undetermined', async () => {
    h.protocol = {
      painCategory: 'C', threeRsReplacement: 'a', threeRsReduction: 'b', threeRsRefinement: 'c',
      painJustification: null, speciesCount: 1, plannedAnimalTotal: 24, approvalDate: null,
    };
    const out = await run('review_iacuc_protocol', { protocol_id: 1 });
    expect(out.reviewStatus.expired).toBeNull();
    expect(out.reviewStatus.undetermined).toBe(true);
    expect(out.message).toMatch(/No findings among the checks run/);
    expect(out.message).toMatch(/expiry and annual review cannot be determined/);
  });
});
