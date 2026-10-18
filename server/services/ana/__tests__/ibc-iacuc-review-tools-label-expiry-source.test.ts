/**
 * review_iacuc_protocol and review_ibc_registration report the committee's
 * recorded expiration, and say when a date was computed instead.
 *
 * Both tools recomputed the expiry from the approval date (+3 years IACUC, +1
 * year IBC) and stated it as the expiry ("De novo review due by …", "Expiry: …")
 * without saying it was computed, and never read the date the committee set: a
 * protocol the committee approved for one year read as current until approval
 * + 3 years.
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
}));
vi.mock('../../ibc/ibc-service', async (orig) => ({ ...(await orig<object>()), getContainmentInput: vi.fn(async () => h.containment) }));
vi.mock('../../iacuc/iacuc-service', async (orig) => ({ ...(await orig<object>()), getProtocolCompletenessInput: vi.fn(async () => h.protocol) }));

import { getToolHandler } from '../AnaToolExecutor';

const run = async (tool: string, input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(tool)!(input, { organizationId: 7 } as never)) as Record<string, any>;

const PROTOCOL = {
  painCategory: 'C', threeRsReplacement: 'a', threeRsReduction: 'b', threeRsRefinement: 'c',
  painJustification: null, speciesCount: 1, plannedAnimalTotal: 24,
};
const REGISTRATION = {
  declaredBsl: 'BSL-2', nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false,
  agents: [{ agentName: 'Lentiviral vector', riskGroup: 'RG2', requiredBsl: 'BSL-2' }],
};

describe('review_iacuc_protocol', () => {
  it('reports the committee’s one-year expiration as expired, not the 3-year de novo date as current', async () => {
    h.protocol = { ...PROTOCOL, approvalDate: '2025-03-02', expirationDate: '2026-03-02' };
    const out = await run('review_iacuc_protocol', { protocol_id: 1 });
    expect(out.reviewStatus).toMatchObject({ expirationDate: '2026-03-02', expirationSource: 'recorded', expired: true });
    expect(out.message).toMatch(/2026-03-02 \(on record\), expired/);
  });

  it('says a de novo date it derived is computed', async () => {
    h.protocol = { ...PROTOCOL, approvalDate: '2025-03-02', expirationDate: null };
    const out = await run('review_iacuc_protocol', { protocol_id: 1 });
    expect(out.reviewStatus).toMatchObject({ expirationDate: '2028-03-02', expirationSource: 'computed' });
    expect(out.message).toMatch(/2028-03-02 \(computed as approval \+ 3 years; no expiration is on record\)/);
  });
});

describe('review_ibc_registration', () => {
  it('reports the committee’s six-month expiration as expired, not approval + 1 year', async () => {
    h.containment = { ...REGISTRATION, approvalDate: '2025-09-02', expirationDate: '2026-03-02' };
    const out = await run('review_ibc_registration', { registration_id: 1 });
    expect(out.expiration).toEqual({ undetermined: false, expirationDate: '2026-03-02', expirationSource: 'recorded', expired: true });
    expect(out.message).toMatch(/Expiry: 2026-03-02 \(on record\), expired/);
  });

  it('says a one-year date it derived is computed', async () => {
    h.containment = { ...REGISTRATION, approvalDate: '2025-09-02', expirationDate: null };
    const out = await run('review_ibc_registration', { registration_id: 1 });
    expect(out.expiration).toMatchObject({ expirationDate: '2026-09-02', expirationSource: 'computed' });
    expect(out.message).toMatch(/Expiry: 2026-09-02 \(computed as approval \+ 1 year; no expiration is on record\)/);
  });
});
