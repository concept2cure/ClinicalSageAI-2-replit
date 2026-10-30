import { describe, expect, it } from 'vitest';
import {
  isProjectRecordedContextData, isProjectRecordedContextEnvelope,
  type ProjectRecordedContextData,
} from '../project-recorded-context';

const scope = { programId: '11111111-1111-4111-8111-111111111111', projectId: 21,
  organizationId: 1, actorUserId: 11, clientWorkspaceId: 7 };
const saved = (): ProjectRecordedContextData => ({ ...scope, profile: {
  profileId: 2, regulatoryStrategy: 'Retain the recorded comparator', targetIndication: null,
  targetPopulation: null, customInstructions: 'Use the recorded terminology.',
  riskFactors: [{ risk: 'Unresolved evidence', likelihood: 'unassessed', impact: 'unassessed' }],
  openQuestions: [{ question: 'Which version supports this claim?' }],
  keyDecisions: [{ decision: 'Keep both arms', rationale: 'Client decision', date: 'Date not recorded', source: 'Meeting notes' }],
  learnedInsights: [{ insight: 'Recorded observation', source: 'report.pdf', confidence: null, extractedAt: '2026-10-29' }],
  lastEnrichedAt: '2026-10-29T12:00:00.000Z',
} });

describe('recorded project context transport boundary', () => {
  it('accepts the saved profile without inventing confidence or interpreting dates in notes', () => {
    const value = saved();
    expect(isProjectRecordedContextEnvelope({ success: true, data: value }, scope)).toBe(true);
    expect(value.profile?.learnedInsights[0].confidence).toBeNull();
    expect(value.profile?.keyDecisions[0].date).toBe('Date not recorded');
  });

  it('distinguishes a confirmed missing profile from a missing or malformed profile field', () => {
    expect(isProjectRecordedContextData({ ...scope, profile: null }, scope)).toBe(true);
    expect(isProjectRecordedContextData(scope, scope)).toBe(false);
    expect(isProjectRecordedContextData({ ...scope, profile: {} }, scope)).toBe(false);
    expect(isProjectRecordedContextEnvelope({ success: false, data: saved() }, scope)).toBe(false);
  });

  it.each(['programId', 'projectId', 'organizationId', 'actorUserId', 'clientWorkspaceId'] as const)(
    'refuses a receipt for another %s', field => {
      const value = saved();
      const changed = field === 'programId' ? '22222222-2222-4222-8222-222222222222' : 99;
      expect(isProjectRecordedContextData({ ...value, [field]: changed }, scope)).toBe(false);
    });

  it('allows an unselected workspace but binds an explicitly null legacy parent', () => {
    const unselected = { ...scope, clientWorkspaceId: undefined };
    expect(isProjectRecordedContextData(saved(), unselected)).toBe(true);
    expect(isProjectRecordedContextData(saved(), { ...scope, clientWorkspaceId: null })).toBe(false);
    expect(isProjectRecordedContextData({ ...saved(), clientWorkspaceId: null }, { ...scope, clientWorkspaceId: null })).toBe(true);
  });

  it.each([
    { riskFactors: null }, { openQuestions: [{}] }, { keyDecisions: [{ decision: 'A decision' }] },
    { learnedInsights: [{ insight: 'Guess', source: 'doc', extractedAt: 'yesterday', confidence: NaN }] },
    { customInstructions: {} }, { lastEnrichedAt: 'not a timestamp' },
  ])('refuses malformed persisted notes rather than declaring them empty: %j', change => {
    const value = saved();
    expect(isProjectRecordedContextData({ ...value, profile: { ...value.profile, ...change } }, scope)).toBe(false);
  });

  it('does not accept coerced, fractional or out-of-range identity numbers', () => {
    for (const projectId of ['21', 0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(isProjectRecordedContextData({ ...saved(), projectId }, scope)).toBe(false);
    }
  });
});
