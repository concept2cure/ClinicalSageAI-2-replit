/**
 * A decision record names the user who acted and the recommendation type its
 * caller stated — or nothing is written.
 *
 * decisionRecordService.createDecision recorded decided_by 'system' when the
 * caller named no user (`String(input.createdById || 'system')`) and
 * recommendation_type 'regulatory_strategy' when it named no type.
 * executeDecision and escalateDecision recorded a transition nobody was named
 * as performing as performed by 'system'; supersedeDecision did the same for
 * the replacement it wrote and for the supersession. An escalation with no
 * stated target was recorded as escalated to whoever escalated — 'system',
 * when nobody was named. create() and transition() wrote whatever actor they
 * were handed, an empty one included.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../db', () => ({ pool: { query: H.query } }));

import { decisionRecordService } from '../decision-record-service';
import { LedgerInputRefusal } from '../assumption-registry-service';

const ID = '00000000-0000-0000-0000-000000000001';
const ROW = { id: ID, organization_id: 3, project_id: 12, action_state: 'proposed', created_at: new Date(), updated_at: new Date() };

/** Every statement that would have written to decision_records. */
const writes = () =>
  H.query.mock.calls.map(([sql]) => String(sql)).filter((sql) => /INSERT INTO decision_records|UPDATE decision_records/.test(sql));
const paramsOf = (pattern: RegExp) => H.query.mock.calls.find(([sql]) => pattern.test(String(sql)))?.[1] as unknown[];

/** What a call was refused with, or null when it was answered. */
const refusalOf = (call: Promise<unknown>) => call.then(() => null, (e: unknown) => e);

beforeEach(() => {
  H.query.mockReset();
  H.query.mockImplementation(async () => ({ rows: [ROW], rowCount: 1 }));
});

const STATED = {
  organizationId: 3,
  projectId: 12,
  recommendationType: 'statistical_method',
  recommendationSummary: 'Generate SAP with N=120',
  createdById: 41,
};

describe('createDecision', () => {
  it('refuses a decision nobody is named as making, and writes nothing', async () => {
    const err = await refusalOf(decisionRecordService.createDecision({ ...STATED, createdById: undefined }));
    expect(err, 'the decision was recorded, decided by "system"').toBeInstanceOf(LedgerInputRefusal);
    expect((err as LedgerInputRefusal).field).toBe('createdBy');
    expect(writes()).toEqual([]);
  });

  it('refuses a decision with no recommendation type, and writes nothing', async () => {
    const err = await refusalOf(decisionRecordService.createDecision({ ...STATED, recommendationType: undefined }));
    expect(err, 'the decision was recorded as a regulatory_strategy recommendation').toBeInstanceOf(LedgerInputRefusal);
    expect((err as LedgerInputRefusal).field).toBe('recommendationType');
    expect(writes()).toEqual([]);
  });

  it('refuses a recommendation type outside the ledger vocabulary, naming the allowed ones', async () => {
    const err = await refusalOf(decisionRecordService.createDecision({ ...STATED, recommendationType: 'sap_generation' }));
    expect(err).toBeInstanceOf(LedgerInputRefusal);
    expect((err as Error).message).toMatch(/statistical_method/);
    expect(writes()).toEqual([]);
  });

  it('records the user and the recommendation type that were stated', async () => {
    await decisionRecordService.createDecision(STATED);
    const params = paramsOf(/INSERT INTO decision_records/);
    expect(params[5]).toBe('statistical_method'); // recommendation_type
    expect(params[11]).toBe('41'); // decided_by
  });
});

describe('create', () => {
  it('refuses a blank decider rather than recording one', async () => {
    const err = await refusalOf(
      decisionRecordService.create({
        organizationId: 3,
        projectId: 12,
        decisionCode: 'D-1',
        title: 'T',
        domainTrack: 'regulatory',
        recommendationType: 'study_design',
        recommendationSummary: 'S',
        decidedBy: '  ',
      }),
    );
    expect(err).toBeInstanceOf(LedgerInputRefusal);
    expect((err as LedgerInputRefusal).field).toBe('decidedBy');
    expect(writes()).toEqual([]);
  });
});

describe('transitions', () => {
  it('refuses an execution nobody is named as performing', async () => {
    const err = await refusalOf(decisionRecordService.executeDecision(ID, 3, 99));
    expect(err, 'the execution was recorded as performed by "system"').toBeInstanceOf(LedgerInputRefusal);
    expect(writes()).toEqual([]);
  });

  it('refuses an escalation nobody is named as making, rather than escalating it to "system"', async () => {
    const err = await refusalOf(decisionRecordService.escalateDecision(ID, 3, 'conflicting dose'));
    expect(err, 'the escalation was recorded as escalated to "system"').toBeInstanceOf(LedgerInputRefusal);
    expect(writes()).toEqual([]);
  });

  it('records no escalation target that was not stated — not the person who escalated', async () => {
    await decisionRecordService.escalateDecision(ID, 3, 'conflicting dose', 7);
    const params = paramsOf(/UPDATE decision_records/);
    expect(params[0]).toBe('escalated');
    expect(params[1], 'escalated_to named the escalator').toBeNull();
    expect(params[2]).toBe('conflicting dose');
  });

  it('refuses a supersession whose replacement names no user, before writing either record', async () => {
    const err = await refusalOf(
      decisionRecordService.supersedeDecision(ID, 3, { ...STATED, createdById: undefined }, 'replaced by the amended SAP'),
    );
    expect(err).toBeInstanceOf(LedgerInputRefusal);
    expect(writes()).toEqual([]);
  });

  it('refuses an approval with no user rather than recording approved_by "undefined"', async () => {
    const err = await refusalOf(decisionRecordService.approveDecision(ID, 3, undefined as unknown as number));
    expect(err).toBeInstanceOf(LedgerInputRefusal);
    expect(writes()).toEqual([]);
  });

  it('transition() refuses a blank performer', async () => {
    const err = await refusalOf(
      decisionRecordService.transition(ID, { organizationId: 3, actionState: 'under_review', performedBy: '' }),
    );
    expect(err).toBeInstanceOf(LedgerInputRefusal);
    expect((err as LedgerInputRefusal).field).toBe('performedBy');
    expect(writes()).toEqual([]);
  });

  it('records the user who executed it', async () => {
    await decisionRecordService.approveDecision(ID, 3, 7);
    const params = paramsOf(/UPDATE decision_records/);
    expect(params[0]).toBe('approved');
    expect(params[1]).toBe('7'); // approved_by
  });
});
