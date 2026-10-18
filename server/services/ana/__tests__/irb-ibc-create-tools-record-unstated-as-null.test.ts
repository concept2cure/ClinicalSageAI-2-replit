/**
 * AnA's create_irb_submission and create_ibc_registration record an unstated
 * answer as not recorded.
 *
 * create_irb_submission sent `involves_vulnerable_populations === true`, and
 * create_ibc_registration sent the NIH Guidelines section as 'not_applicable'
 * and `involves_human_gene_transfer === true`, when the model left them out: a
 * question nobody answered was stored as "no", and the IBC tool reported that
 * convened review was not required. An unrecognised section string also went
 * to the database unvalidated. Unstated now reaches the service as null, and
 * convened review is reported as undetermined.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeClient = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), connect: async () => fakeClient }),
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 'act_test' })) }));

const h = vi.hoisted(() => ({
  createSubmissionTx: vi.fn(async (..._a: unknown[]) => ({ id: 11 })),
  createRegistrationTx: vi.fn(async (..._a: unknown[]) => ({ id: 12 })),
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../irb/irb-service', async (orig) => ({ ...(await orig<object>()), createSubmissionTx: h.createSubmissionTx }));
vi.mock('../../ibc/ibc-service', async (orig) => ({ ...(await orig<object>()), createRegistrationTx: h.createRegistrationTx }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));

import { getToolHandler } from '../AnaToolExecutor';

const CTX = { organizationId: 7, userId: 42, humanConfirmed: true } as never;
const REASON = 'Opening the record the user asked for.';
const run = async (tool: string, input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(tool)!({ ...input, reason: REASON }, CTX)) as Record<string, any>;
const lastInput = (fn: typeof h.createSubmissionTx) => fn.mock.calls.at(-1)?.[3] as Record<string, unknown>;

beforeEach(() => {
  h.createSubmissionTx.mockClear();
  h.createRegistrationTx.mockClear();
});

describe('create_irb_submission', () => {
  it('passes an unstated vulnerable-populations answer as null, and a stated one as given', async () => {
    await run('create_irb_submission', { protocol_number: 'P-1', title: 'A study', risk_level: 'minimal' });
    expect(lastInput(h.createSubmissionTx).involvesVulnerablePopulations).toBeNull();
    await run('create_irb_submission', { protocol_number: 'P-2', title: 'A study', risk_level: 'minimal', involves_vulnerable_populations: false });
    expect(lastInput(h.createSubmissionTx).involvesVulnerablePopulations).toBe(false);
  });
});

describe('create_ibc_registration', () => {
  it('passes an unstated section and gene-transfer answer as null and reports convened review as undetermined', async () => {
    const out = await run('create_ibc_registration', { registration_number: 'R-1', title: 'AAV work', biosafety_level: 'BSL-2' });
    expect(lastInput(h.createRegistrationTx)).toMatchObject({ nihGuidelinesSection: null, involvesHumanGeneTransfer: null });
    expect(out.requiresConvenedReview).toBeNull();
    expect(out.message).toMatch(/not determined/);
  });

  it('refuses a section outside the NIH Guidelines vocabulary and records nothing', async () => {
    const out = await run('create_ibc_registration', { registration_number: 'R-2', title: 'x', biosafety_level: 'BSL-2', nih_guidelines_section: 'III-Z' });
    expect(out.error).toMatch(/nih_guidelines_section must be one of/);
    expect(h.createRegistrationTx).not.toHaveBeenCalled();
  });

  it('a recorded III-C section decides it', async () => {
    const out = await run('create_ibc_registration', { registration_number: 'R-3', title: 'x', biosafety_level: 'BSL-2', nih_guidelines_section: 'III-C' });
    expect(out.requiresConvenedReview).toBe(true);
  });
});
