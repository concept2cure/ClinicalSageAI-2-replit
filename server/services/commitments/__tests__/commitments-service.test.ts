import { describe, it, expect } from 'vitest';
import {
  parseCommitmentsJson,
  commitmentClock,
  commitmentGroundedness,
  normalizeType,
  normalizeDirection,
  parseContradictionsJson,
  buildTaskFromCommitment,
} from '../commitments-service';

describe('normalizeDirection / normalizeType', () => {
  it('defaults direction to inbound, honours outbound', () => {
    expect(normalizeDirection('outbound')).toBe('outbound');
    expect(normalizeDirection('inbound')).toBe('inbound');
    expect(normalizeDirection('nonsense')).toBe('inbound');
  });
  it('maps known commitment types, falls back to other', () => {
    expect(normalizeType('PMR')).toBe('PMR');
    expect(normalizeType('annex_ii')).toBe('annex_ii');
    expect(normalizeType('self_commitment')).toBe('self_commitment');
    expect(normalizeType('made-up')).toBe('other');
  });
});

describe('commitmentGroundedness', () => {
  it('scores a missing/short source span low', () => {
    expect(commitmentGroundedness(null)).toBeLessThan(0.5);
    expect(commitmentGroundedness('too short')).toBeLessThan(0.5);
  });
  it('scores a substantial verbatim span high', () => {
    const span = 'The applicant commits to conduct a confirmatory trial and submit final data by December 2027.';
    expect(commitmentGroundedness(span)).toBeGreaterThanOrEqual(0.6);
  });
});

describe('parseCommitmentsJson', () => {
  it('parses a fenced JSON array, normalizes, and anchors groundedness', () => {
    const raw = '```json\n' + JSON.stringify([
      {
        direction: 'inbound', type: 'PMR', authority: 'FDA',
        title: 'Confirmatory trial',
        description: 'Conduct confirmatory trial X',
        sourceQuote: 'As a post-marketing requirement, the applicant must conduct trial X and submit by Q4 2027.',
        dueDateText: 'Q4 2027',
      },
      { direction: 'outbound', commitmentType: 'self_commitment', title: 'Provide CMC data', sourceQuote: 'We will provide stability data in a future submission.' },
    ]) + '\n```';
    const out = parseCommitmentsJson(raw);
    expect(out).toHaveLength(2);
    expect(out[0].commitmentType).toBe('PMR');
    expect(out[0].direction).toBe('inbound');
    expect(out[0].dueDateText).toBe('Q4 2027');
    expect(out[0].groundedness).toBeGreaterThan(0.6);
    expect(out[1].direction).toBe('outbound');
    expect(out[1].commitmentType).toBe('self_commitment');
  });

  it('drops items without a title and tolerates surrounding prose', () => {
    const raw = 'Here are the commitments:\n[{"title":"","sourceQuote":"x"},{"title":"Keep me","direction":"inbound","sourceQuote":"A verbatim commitment sentence of sufficient length here."}]\nDone.';
    const out = parseCommitmentsJson(raw);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Keep me');
  });

  it('returns [] for non-JSON / empty input', () => {
    expect(parseCommitmentsJson('not json')).toEqual([]);
    expect(parseCommitmentsJson('')).toEqual([]);
    expect(parseCommitmentsJson('{"not":"an array"}')).toEqual([]);
  });
});

describe('commitmentClock', () => {
  const now = new Date('2026-06-10T00:00:00Z');
  it('reports none when no due date', () => {
    expect(commitmentClock(null, now).status).toBe('none');
  });
  it('reports on_track far out, due_soon within 30d, overdue past', () => {
    expect(commitmentClock('2026-12-10T00:00:00Z', now).status).toBe('on_track');
    expect(commitmentClock('2026-06-25T00:00:00Z', now).status).toBe('due_soon');
    const overdue = commitmentClock('2026-06-01T00:00:00Z', now);
    expect(overdue.overdue).toBe(true);
    expect(overdue.status).toBe('overdue');
  });
});

describe('parseContradictionsJson', () => {
  const ids = new Set(['cmt_a', 'cmt_b', 'cmt_c']);
  it('keeps findings that reference >=2 real commitments with an explanation', () => {
    const raw = JSON.stringify([
      { commitmentIds: ['cmt_a', 'cmt_b'], kind: 'conflicting_deadline', explanation: 'Q4 2027 vs Q2 2027 for the same study.', severity: 'high' },
    ]);
    const out = parseContradictionsJson(raw, ids);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('conflicting_deadline');
    expect(out[0].severity).toBe('high');
  });
  it('drops single-id, unexplained, or hallucinated-id findings', () => {
    const raw = JSON.stringify([
      { commitmentIds: ['cmt_a'], explanation: 'only one', severity: 'low' },
      { commitmentIds: ['cmt_a', 'cmt_b'], explanation: '', severity: 'low' },
      { commitmentIds: ['cmt_a', 'cmt_zzz'], explanation: 'one id is fake', severity: 'low' },
    ]);
    expect(parseContradictionsJson(raw, ids)).toEqual([]);
  });
  it('coerces unknown kind/severity and returns [] on non-JSON', () => {
    const raw = JSON.stringify([{ commitmentIds: ['cmt_a', 'cmt_b'], kind: 'weird', explanation: 'x', severity: 'huge' }]);
    const out = parseContradictionsJson(raw, ids);
    expect(out[0].kind).toBe('other');
    expect(out[0].severity).toBe('medium');
    expect(parseContradictionsJson('nope', ids)).toEqual([]);
  });
});

describe('buildTaskFromCommitment', () => {
  it('builds an owned, dated task spec and escalates priority when overdue/soon', () => {
    const spec = buildTaskFromCommitment({
      id: 'cmt_a', title: 'Submit confirmatory data', description: 'Phase 4 trial',
      owner: 'RA Lead', dueDateText: 'Q4 2027', sourceQuote: 'The applicant commits to…',
      clock: { dueDate: '2027-12-31T00:00:00Z', daysRemaining: 500, overdue: false, dueSoon: false, status: 'on_track' },
    });
    expect(spec.sourceCommitmentId).toBe('cmt_a');
    expect(spec.title).toContain('Submit confirmatory data');
    expect(spec.priority).toBe('medium');
    expect(spec.description).toContain('Q4 2027');

    const urgent = buildTaskFromCommitment({
      id: 'cmt_b', title: 'File DSUR', clock: { dueDate: '2026-06-15T00:00:00Z', daysRemaining: 5, overdue: false, dueSoon: true, status: 'due_soon' },
    });
    expect(urgent.priority).toBe('high');
  });
});
