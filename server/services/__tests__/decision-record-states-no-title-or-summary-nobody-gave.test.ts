/**
 * A decision record is refused without a title, and a summary nobody stated is
 * stored as absent.
 *
 * Until 2026-10-15 decisionRecordService.createDecision titled a decision whose
 * caller stated neither a contextDescription nor a recommendationSummary
 * 'Decision', and stored a missing summary as the empty string — a record that
 * read as titled and summarised when nobody had said what it decided.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../db', () => ({ pool: { query: H.query } }));

import { decisionRecordService } from '../decision-record-service';
import { LedgerInputRefusal } from '../assumption-registry-service';

const ROW = { id: '00000000-0000-0000-0000-000000000001', organization_id: 3, project_id: 12, action_state: 'proposed',
  recommendation_summary: null, created_at: new Date(), updated_at: new Date() };

const writes = () =>
  H.query.mock.calls.map(([sql]) => String(sql)).filter((sql) => /INSERT INTO decision_records/.test(sql));
const insertParams = () => H.query.mock.calls.find(([sql]) => /INSERT INTO decision_records/.test(String(sql)))?.[1] as unknown[];
const refusalOf = (call: Promise<unknown>) => call.then(() => null, (e: unknown) => e);

beforeEach(() => {
  H.query.mockReset();
  H.query.mockImplementation(async () => ({ rows: [ROW], rowCount: 1 }));
});

const STATED = { organizationId: 3, projectId: 12, recommendationType: 'statistical_method', createdById: 41 };

describe('createDecision', () => {
  it('refuses a decision with no title, naming it, and writes nothing', async () => {
    const err = await refusalOf(decisionRecordService.createDecision(STATED));
    expect(err, "the decision was recorded titled 'Decision'").not.toBeNull();
    expect(err).toBeInstanceOf(LedgerInputRefusal);
    expect((err as LedgerInputRefusal).field).toBe('title');
    expect(writes()).toEqual([]);
  });

  it('stores a summary nobody stated as absent, not as an empty string', async () => {
    const record = await decisionRecordService.createDecision({ ...STATED, contextDescription: 'SAP generation for STUDY-1' });
    const params = insertParams();
    expect(params[3]).toBe('SAP generation for STUDY-1'); // title
    expect(params[6], 'a missing summary was stored as ""').toBeNull(); // recommendation_summary
    expect(record.recommendationSummary).toBeNull();
  });

  it('titles a decision by its summary when that is all that was stated, as before', async () => {
    await decisionRecordService.createDecision({ ...STATED, recommendationSummary: 'Generate SAP with N=120' });
    const params = insertParams();
    expect(params[3]).toBe('Generate SAP with N=120');
    expect(params[6]).toBe('Generate SAP with N=120');
  });
});
