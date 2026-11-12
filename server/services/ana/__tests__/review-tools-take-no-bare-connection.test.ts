/**
 * AnA's five review tools no longer read on a bare pool connection.
 *
 * review_financial_disclosure, review_iacuc_protocol, review_ibc_registration,
 * review_send_readiness and review_ha_interaction each took a connection with
 * `getPool().connect()` and read on it with no BEGIN. The pool sets the tenant
 * on a checked-out connection only at BEGIN (server/db/poolInstrumentation.ts),
 * so on tables with forced row-level security the read found no row and the
 * tool answered "not found for this organization" for every organization. The
 * routes beside them read the same way
 * (server/routes/__tests__/review-reads-take-no-bare-connection.test.ts), and
 * review_irb_submission did until the same day.
 *
 * Here `connect()` is refused, and each reader probes the executor it was
 * handed: the probe must arrive on the tenant-scoped `query`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => {
  const scoped = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
  type Probe = { query: (sql: string, params?: unknown[]) => Promise<unknown> };
  const reader = (name: string, input: unknown) => vi.fn(async (client: Probe) => { await client.query(`probe ${name}`); return input; });
  return { scoped, reader, connects: 0 };
});

vi.mock('../../../db', () => {
  const connect = async () => { S.connects += 1; throw new Error('A read took a bare pool connection: it carries no tenant before BEGIN.'); };
  const pool = { query: S.scoped, connect };
  return { pool, getPool: () => pool, query: S.scoped, db: {} };
});
vi.mock('../../financial-disclosures/fcoi-service', async (orig) => ({
  ...(await orig<object>()),
  loadDisclosureSnapshot: S.reader('fcoi', { row: { id: 4 }, formType: 'FDA_3454', hasDisclosableInterests: false, disclosurePeriodStart: null, disclosurePeriodEnd: null, interests: [] }),
}));
vi.mock('../../iacuc/iacuc-service', async (orig) => ({
  ...(await orig<object>()),
  getProtocolCompletenessInput: S.reader('iacuc', { painCategory: 'C', threeRsReplacement: 'a', threeRsReduction: 'b', threeRsRefinement: 'c', painJustification: null, speciesCount: 1, plannedAnimalTotal: 24, approvalDate: null, expirationDate: null }),
}));
vi.mock('../../ibc/ibc-service', async (orig) => ({
  ...(await orig<object>()),
  getContainmentInput: S.reader('ibc', { declaredBsl: 'BSL-2', nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false, approvalDate: null, expirationDate: null, agents: [] }),
}));
vi.mock('../../nonclinical/nonclinical-service', async (orig) => ({
  ...(await orig<object>()),
  getSendReadinessInput: S.reader('nonclinical', { studyType: 'repeat_dose_toxicity', domainsPresent: [], defineXmlPresent: false, nsdrcPresent: false, validationStatus: 'not_validated', validatorErrorCount: 0 }),
}));
vi.mock('../../ha-interactions/ha-service', async (orig) => ({
  ...(await orig<object>()),
  getInteractionReadinessInput: S.reader('ha', { interactionType: 'type_b', status: 'requested', hasBriefingBook: false, questionCount: 0, scheduledDate: null }),
}));

import { getToolHandler } from '../AnaToolExecutor';

const ctx = { organizationId: 7, userId: 3 } as never;
const probes = () => S.scoped.mock.calls.map((c) => String(c[0])).filter((sql) => sql.startsWith('probe '));

beforeEach(() => { S.scoped.mockClear(); S.connects = 0; });

describe('AnA review tools read inside the tenant scope', () => {
  const TOOLS: Array<[string, Record<string, unknown>, string]> = [
    ['review_financial_disclosure', { disclosure_id: 4 }, 'probe fcoi'],
    ['review_iacuc_protocol', { protocol_id: 4 }, 'probe iacuc'],
    ['review_ibc_registration', { registration_id: 4 }, 'probe ibc'],
    ['review_send_readiness', { study_id: 4 }, 'probe nonclinical'],
    ['review_ha_interaction', { interaction_id: 4 }, 'probe ha'],
  ];

  it.each(TOOLS)('%s reads through the scoped query, and takes no connection', async (tool, input, probe) => {
    const out = JSON.parse(await getToolHandler(tool)!(input, ctx));
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    expect(S.connects).toBe(0);
    expect(probes()).toEqual([probe]);
  });
});
