/**
 * Tests for the living-file change router.
 *
 * Verifies that domain events fan out to the correct downstream propagators
 * (and DON'T fire when the event is unrelated).
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

// Capture all downstream propagator calls via mocks
const propagateClaimChangeMock = vi.fn(async () => ({
  affectedPacketIds: ['pkt-1'],
  markedStaleCount: 1,
  alreadyStaleCount: 0,
  notRenderedCount: 0,
  reason: 'claim_changed',
}));
const propagateEvidenceChangeMock = vi.fn(async () => ({
  affectedPacketIds: [],
  markedStaleCount: 0,
  alreadyStaleCount: 0,
  notRenderedCount: 0,
  reason: 'evidence_changed',
}));
const propagatePredicateChangeMock = vi.fn(async () => ({
  affectedPacketIds: [],
  markedStaleCount: 2,
  alreadyStaleCount: 0,
  notRenderedCount: 0,
  reason: 'predicate_changed',
}));
const propagateRiskVocabChangeMock = vi.fn(async () => ({
  affectedPacketIds: [],
  markedStaleCount: 0,
  alreadyStaleCount: 0,
  notRenderedCount: 0,
  reason: 'risk_vocab_updated',
}));

vi.mock('../../regulatory-graph/defense-packet-staleness.service', () => ({
  propagateClaimChange: (...a: unknown[]) => propagateClaimChangeMock(...(a as [any])),
  propagateEvidenceChange: (...a: unknown[]) => propagateEvidenceChangeMock(...(a as [any])),
  propagatePredicateChange: (...a: unknown[]) => propagatePredicateChangeMock(...(a as [any])),
  propagateRiskVocabChange: (...a: unknown[]) => propagateRiskVocabChangeMock(...(a as [any])),
}));

const reactivePropagateMock = vi.fn(async () => ({
  triggerType: 'assumption_updated',
  triggerObjectId: 'src-1',
  downstreamImpacted: 3,
  actions: [],
}));
vi.mock('../../reactive-dependency-service', () => ({
  reactiveDependencyService: {
    propagateChange: (a: unknown) => reactivePropagateMock(a),
  },
}));

const updateReturnMock = vi.fn(async () => [{ id: 'std-app-1' }]);
vi.mock('../../../db', () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => updateReturnMock(),
        }),
      }),
    }),
  },
}));

import { propagateRegulatoryChange } from '../change-router.service';

const ORG = 11;
const PROGRAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeEach(() => {
  propagateClaimChangeMock.mockClear();
  propagateEvidenceChangeMock.mockClear();
  propagatePredicateChangeMock.mockClear();
  propagateRiskVocabChangeMock.mockClear();
  reactivePropagateMock.mockClear();
  updateReturnMock.mockClear();
});

describe('propagateRegulatoryChange — claim events', () => {
  test('claim_changed fans out to defense-packet propagator', async () => {
    const r = await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'claim_changed',
      sourceId: '42',
    });
    expect(propagateClaimChangeMock).toHaveBeenCalledTimes(1);
    expect(propagateClaimChangeMock.mock.calls[0][0]).toBe(42);
    expect(propagateClaimChangeMock.mock.calls[0][1]).toBe('claim_changed');
    expect(reactivePropagateMock).toHaveBeenCalledTimes(1);
    expect(r.totalAffected).toBeGreaterThanOrEqual(1);
  });

  test('claim_withdrawn passes the stronger reason code', async () => {
    await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'claim_withdrawn',
      sourceId: '7',
    });
    expect(propagateClaimChangeMock.mock.calls[0][1]).toBe('claim_withdrawn');
  });

  test('claim event with non-numeric sourceId skips defense-packet propagator', async () => {
    await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'claim_changed',
      sourceId: 'not-a-number',
    });
    expect(propagateClaimChangeMock).not.toHaveBeenCalled();
  });
});

describe('propagateRegulatoryChange — evidence events', () => {
  test('evidence_superseded calls evidence propagator AND flips GSPR mappings', async () => {
    const r = await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'evidence_superseded',
      sourceId: 'ev-uuid-A',
    });
    expect(propagateEvidenceChangeMock).toHaveBeenCalledTimes(1);
    expect(propagateEvidenceChangeMock.mock.calls[0][2]).toBe('evidence_superseded');
    // GSPR mapping update path was invoked (via db.update mock)
    expect(updateReturnMock).toHaveBeenCalled();
    expect(r.outcomes.find(o => o.channel === 'gspr_program_mappings')).toBeDefined();
  });
});

describe('propagateRegulatoryChange — predicate', () => {
  test('predicate_changed only routes to defense-packet predicate propagator', async () => {
    const r = await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'predicate_changed',
      sourceId: 'K123456',
    });
    expect(propagatePredicateChangeMock).toHaveBeenCalledTimes(1);
    expect(propagateEvidenceChangeMock).not.toHaveBeenCalled();
    expect(propagateClaimChangeMock).not.toHaveBeenCalled();
    expect(r.outcomes.some(o => o.channel === 'defense_packet.predicate')).toBe(true);
  });
});

describe('propagateRegulatoryChange — standard events', () => {
  test('standard_withdrawn flips standards_applicability rows + reactive', async () => {
    const r = await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'standard_withdrawn',
      sourceId: '17', // integer-as-string for device_test_standards.id
    });
    // standards_applicability bulk update happens
    expect(updateReturnMock).toHaveBeenCalled();
    expect(r.outcomes.some(o => o.channel === 'standards_applicability')).toBe(true);
    // reactive service also invoked
    expect(reactivePropagateMock).toHaveBeenCalled();
  });

  test('standard_withdrawn with non-numeric sourceId is recorded as skipped', async () => {
    const r = await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'standard_withdrawn',
      sourceId: 'not-numeric',
    });
    const standards = r.outcomes.find(o => o.channel === 'standards_applicability');
    expect(standards).toBeDefined();
    const detail = standards!.detail as Record<string, unknown>;
    expect(detail.skipped).toBe('standard id not numeric');
  });
});

describe('propagateRegulatoryChange — risk vocab', () => {
  test('risk_vocab_updated fans only to risk-vocab propagator + reactive', async () => {
    await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'risk_vocab_updated',
      sourceId: 'vocab-hash-NEW',
    });
    expect(propagateRiskVocabChangeMock).toHaveBeenCalledTimes(1);
    expect(propagateClaimChangeMock).not.toHaveBeenCalled();
    expect(propagateEvidenceChangeMock).not.toHaveBeenCalled();
    expect(propagatePredicateChangeMock).not.toHaveBeenCalled();
    expect(reactivePropagateMock).toHaveBeenCalled();
  });
});

describe('propagateRegulatoryChange — broad events', () => {
  test('intended_use_changed only routes through reactive service', async () => {
    await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'intended_use_changed',
      sourceId: PROGRAM,
    });
    expect(reactivePropagateMock).toHaveBeenCalledTimes(1);
    expect(propagateClaimChangeMock).not.toHaveBeenCalled();
    expect(propagateEvidenceChangeMock).not.toHaveBeenCalled();
    expect(propagatePredicateChangeMock).not.toHaveBeenCalled();
    expect(propagateRiskVocabChangeMock).not.toHaveBeenCalled();
  });

  test('event without legacyProgramId skips reactive service', async () => {
    await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      event: 'predicate_changed',
      sourceId: 'K1',
    });
    expect(reactivePropagateMock).not.toHaveBeenCalled();
  });
});

describe('propagateRegulatoryChange — error isolation', () => {
  test('a failing channel does not abort the others', async () => {
    propagateClaimChangeMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const r = await propagateRegulatoryChange({
      organizationId: ORG,
      programId: PROGRAM,
      legacyProgramId: 99,
      event: 'claim_changed',
      sourceId: '5',
    });
    const failing = r.outcomes.find(o => {
      const d = o.detail as Record<string, unknown>;
      return d && typeof d.error === 'string';
    });
    expect(failing).toBeDefined();
    expect(reactivePropagateMock).toHaveBeenCalled();
  });
});
