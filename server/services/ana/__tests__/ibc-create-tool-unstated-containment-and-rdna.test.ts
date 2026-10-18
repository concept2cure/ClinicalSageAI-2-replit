/**
 * AnA's create_ibc_registration records an unstated containment level and
 * recombinant-DNA answer as not recorded.
 *
 * It refused a registration without a biosafety_level, so a level the user had
 * not declared had to be supplied to open one, and it sent
 * `involves_recombinant_dna === true`, so an unstated answer was stored as "no
 * recombinant DNA". Unstated now reaches the service as null, a level outside
 * BSL-1..4 is still refused, and the message says no level is declared.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeClient = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), connect: async () => fakeClient }),
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 'act_test' })) }));

const h = vi.hoisted(() => ({
  createRegistrationTx: vi.fn(async (..._a: unknown[]) => ({ id: 12 })),
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../ibc/ibc-service', async (orig) => ({ ...(await orig<object>()), createRegistrationTx: h.createRegistrationTx }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));

import { getToolHandler } from '../AnaToolExecutor';

const CTX = { organizationId: 7, userId: 42, humanConfirmed: true } as never;
const REASON = 'Opening the record the user asked for.';
const run = async (input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler('create_ibc_registration')!({ ...input, reason: REASON }, CTX)) as Record<string, any>;
const lastInput = () => h.createRegistrationTx.mock.calls.at(-1)?.[3] as Record<string, unknown>;

beforeEach(() => h.createRegistrationTx.mockClear());

describe('create_ibc_registration', () => {
  it('opens a registration with no declared level and no recombinant-DNA answer, passing both as null', async () => {
    const out = await run({ registration_number: 'R-1', title: 'AAV work' });
    expect(out.error).toBeUndefined();
    expect(lastInput()).toMatchObject({ biosafetyLevel: null, involvesRecombinantDna: null });
    expect(out.message).toMatch(/no containment level declared/);
  });

  it('passes an unstated recombinant-DNA answer as null when the level is stated', async () => {
    await run({ registration_number: 'R-4', title: 'x', biosafety_level: 'BSL-1' });
    expect(lastInput().involvesRecombinantDna).toBeNull();
  });

  it('passes a stated "no" recombinant-DNA answer as false, and a stated level as given', async () => {
    const out = await run({ registration_number: 'R-2', title: 'x', biosafety_level: 'BSL-2', involves_recombinant_dna: false });
    expect(lastInput()).toMatchObject({ biosafetyLevel: 'BSL-2', involvesRecombinantDna: false });
    expect(out.message).toMatch(/at BSL-2/);
  });

  it('refuses a level outside BSL-1..4 and records nothing', async () => {
    const out = await run({ registration_number: 'R-3', title: 'x', biosafety_level: 'BSL-9' });
    expect(out.error).toMatch(/valid biosafety_level/);
    expect(h.createRegistrationTx).not.toHaveBeenCalled();
  });
});
