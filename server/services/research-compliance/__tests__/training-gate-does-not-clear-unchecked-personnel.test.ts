/**
 * The training gate does not clear people it never checked.
 *
 * What the code used to do: evaluateTrainingGate returned
 * `cleared: missing.length === 0`. With no personnel there is nothing to be
 * missing, so a gate run over nobody (personnel_ids omitted or empty) reported
 * "Training gate cleared — all required training is current" and the onboarding
 * assessment "Team training is current — ready to submit". And loadRosterForGate
 * silently dropped any id it could not find (another organization's, deleted,
 * mistyped), so the gate cleared the people it did find as if it had checked
 * everyone named.
 *
 * Now: with training required and nobody evaluated the gate is not determined
 * (cleared: null), and an id that is not on this organization's roster is
 * refused by name (RosterError NOT_FOUND).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query } }));

import { resolveComplianceChecklist, evaluateTrainingGate, assessStudyOnboarding, type ActivityProfile } from '../compliance-checklist';
import { loadRosterForGate } from '../roster-service';

const TODAY = '2026-06-10';
const human: ActivityProfile = {
  involvesHumanSubjects: true, involvesAnimals: false, involvesRecombinantDNA: false,
  involvesHumanGeneTransfer: false, fundingSource: 'nih', region: 'us',
};

beforeEach(() => query.mockReset());

describe('evaluateTrainingGate over nobody', () => {
  it('does not clear when training is required and no personnel were evaluated', () => {
    const c = resolveComplianceChecklist(human);
    const g = evaluateTrainingGate([], c.requiredTraining, [], TODAY, c.undeterminedTraining);
    expect(g.cleared, 'a gate run over nobody reported cleared').toBeNull();
    expect(g.personnelEvaluated).toBe(0);
  });

  it('clears an empty team only when nothing at all is required', () => {
    const none = resolveComplianceChecklist({ ...human, involvesHumanSubjects: false, fundingSource: 'internal' });
    expect(none.requiredTraining).toEqual([]);
    expect(evaluateTrainingGate([], none.requiredTraining, [], TODAY, none.undeterminedTraining).cleared).toBe(true);
  });

  it('the onboarding assessment does not call a team nobody named ready to submit', () => {
    const a = assessStudyOnboarding(human, [], [], TODAY);
    expect(a.readyToSubmit, 'no personnel were named, yet the team was "ready to submit"').toBeNull();
    expect(a.approvals.find((x) => x.committee === 'IRB')!.ready).toBeNull();
  });
});

describe('loadRosterForGate refuses ids it cannot find', () => {
  it('names the personnel ids that are not on this organization\'s roster', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Dr PI', role: 'principal_investigator' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(loadRosterForGate(7, [1, 2])).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Personnel 2 not found for this organization.',
    });
  });

  it('returns the roster when every id is found', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Dr PI', role: 'principal_investigator' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(loadRosterForGate(7, [1, 1])).resolves.toEqual({
      personnel: [{ id: 1, name: 'Dr PI', role: 'principal_investigator' }],
      records: [],
    });
  });
});
