/**
 * How a run-policy turn's ending is kept (row 74, slice S4): on the assistant
 * message (which a reopened thread, the next turn and the lineage dossier
 * read), and in the turn record's warnings.
 *
 *   - The policy the turn ran under, and AnA's own holds, are stored with the
 *     message. The dossier uses them to explain a resume that has no matching
 *     human pause: under Manual the pause was the policy's, not a person's.
 *   - A turn that stopped with steps unrun names them, so the next turn does
 *     not present work it never did, and the person can see what is left.
 *   - The record says what stopped the turn in plain words, with the policy,
 *     the round and the steps not run — never a bare reason code.
 */
import { describe, it, expect } from 'vitest';

import {
  buildAssistantMetadata,
  formatStoppedTurnNote,
  policyHoldWarning,
  turnStopWarning,
  withTurnEnding,
} from '../tool-trace';
import type { PolicyHold } from '../run-status';

const hold = (over: Partial<PolicyHold> = {}): PolicyHold => ({
  round: 2,
  reason: 'manual',
  next: ['Searching PubMed for "endpoint"'],
  outcome: 'continued',
  at: '2026-09-28T10:00:00.000Z',
  ...over,
});

const history = (metadata: Record<string, unknown> | null) => [
  { role: 'user', content: 'Compare the endpoints.' },
  { role: 'assistant', content: 'Partial.', metadata },
];

describe('the assistant message keeps the policy, the holds and the steps not run', () => {
  it('stores all three with the reason and rounds', () => {
    const m = withTurnEnding(buildAssistantMetadata([], null), {
      stoppedReason: 'hold_expired',
      rounds: 1,
      runPolicy: 'manual',
      pendingSteps: ['Searching PubMed for "endpoint"'],
      policyHolds: [hold({ outcome: 'expired' })],
    });
    expect(m).toEqual({
      stoppedReason: 'hold_expired',
      rounds: 1,
      runPolicy: 'manual',
      pendingSteps: ['Searching PubMed for "endpoint"'],
      policyHolds: [hold({ outcome: 'expired' })],
    });
  });

  it('a finished Manual turn keeps its policy and holds, and no reason', () => {
    const m = withTurnEnding(undefined, {
      stoppedReason: 'no_more_tools',
      rounds: 3,
      runPolicy: 'manual',
      pendingSteps: [],
      policyHolds: [hold()],
    });
    expect(m).toEqual({ rounds: 3, runPolicy: 'manual', policyHolds: [hold()] });
  });

  it('a turn with no policy stores exactly what it stored before', () => {
    const m = withTurnEnding(undefined, { stoppedReason: 'max_rounds', rounds: 8, runPolicy: null, pendingSteps: [], policyHolds: [] });
    expect(m).toEqual({ stoppedReason: 'max_rounds', rounds: 8 });
  });

  it('keeps only well-formed labels and holds', () => {
    const m = withTurnEnding(undefined, {
      stoppedReason: 'hold_unavailable',
      runPolicy: 'manual',
      pendingSteps: ['Searching', '', 7 as unknown as string],
      policyHolds: [hold(), { round: 'x' } as unknown as PolicyHold],
    });
    expect(m?.pendingSteps).toEqual(['Searching']);
    expect(m?.policyHolds).toEqual([hold()]);
  });

  it('an unknown policy is not stored', () => {
    const m = withTurnEnding(undefined, { rounds: 1, runPolicy: 'turbo' as unknown as 'auto' });
    expect(m).toEqual({ rounds: 1 });
  });
});

describe('the turn record says why in words, with the policy, the round and the steps', () => {
  const steps = ['Searching PubMed for "endpoint"'];

  it('a Manual hold nobody answered', () => {
    const w = turnStopWarning('hold_expired', 1, {
      runPolicy: 'manual',
      pendingSteps: steps,
      policyHolds: [hold({ outcome: 'expired' })],
    });
    expect(w).toContain('Manual');
    expect(w).toMatch(/waited 10 minutes/);
    expect(w).toContain('after 1 round');
    expect(w).toContain(steps[0]);
    expect(w).toMatch(/not run/);
  });

  it('Manual that could not hold', () => {
    const w = turnStopWarning('hold_unavailable', 1, { runPolicy: 'manual', pendingSteps: steps });
    expect(w).toMatch(/Manual/);
    expect(w).toMatch(/run control/);
    expect(w).toContain(steps[0]);
  });

  it("Auto's time limit and an unanswered approval", () => {
    expect(turnStopWarning('budget_exhausted', 4, { runPolicy: 'auto' })).toMatch(/time limit.*15 minutes of work.*40 minutes/);
    expect(turnStopWarning('budget_exhausted', 4, { runPolicy: 'auto' })).toContain('Run policy: Auto.');
    const a = turnStopWarning('approval_timeout', 2, { runPolicy: 'auto' });
    expect(a).toMatch(/not answered within 10 minutes/);
    expect(a).toMatch(/was not taken/);
  });

  it('names the policy on the older reasons too, and only when there is one', () => {
    expect(turnStopWarning('max_rounds', 20, { runPolicy: 'auto' })).toContain('Run policy: Auto.');
    expect(turnStopWarning('max_rounds', 20)).not.toContain('Run policy');
  });

  it('no reserved-reason fallback remains for the policy reasons', () => {
    for (const r of ['budget_exhausted', 'approval_timeout', 'hold_expired', 'hold_unavailable'] as const) {
      expect(turnStopWarning(r, 1, { runPolicy: 'manual' }), r).not.toContain(`(${r})`);
    }
  });

  it('each of her own holds is written down: what she held before, and what the person did', () => {
    expect(policyHoldWarning(hold())).toMatch(/Manual.*before round 2.*Searching PubMed.*run it/);
    expect(policyHoldWarning(hold({ outcome: 'redirected' }))).toMatch(/replaced.*not run/);
    expect(policyHoldWarning(hold({ outcome: 'expired' }))).toMatch(/nobody answered/);
  });
});

describe('the next turn is told what did not run', () => {
  it('names the steps a hold left unrun and says nothing from them was used', () => {
    const note = formatStoppedTurnNote(
      history({ stoppedReason: 'hold_expired', rounds: 1, pendingSteps: ['Searching PubMed for "endpoint"'] }),
    );
    expect(note).toMatch(/^Your previous turn stopped/);
    expect(note).toContain('Steps you had chosen that did not run: Searching PubMed for "endpoint". Nothing from them was used.');
  });

  it.each(['budget_exhausted', 'approval_timeout', 'hold_expired', 'hold_unavailable'])('%s is an unfinished turn', reason => {
    const note = formatStoppedTurnNote(history({ stoppedReason: reason, rounds: 2 }));
    expect(note).toMatch(/before it was finished/);
    expect(note).not.toContain('did not run:');
  });

  it('ignores a malformed step list', () => {
    const note = formatStoppedTurnNote(history({ stoppedReason: 'hold_unavailable', pendingSteps: 'Searching' }));
    expect(note).toMatch(/before it was finished/);
    expect(note).not.toContain('did not run');
  });
});

describe('review follow-through: the record never claims a hold, or a wait, that did not happen', () => {
  const steps = ['Searching PubMed for "endpoint"'];

  it("a person's pause that expired is the person's pause, not AnA waiting before her step", () => {
    const w = turnStopWarning('hold_expired', 1, { runPolicy: 'manual', pendingSteps: steps, policyHolds: [] });
    expect(w).toMatch(/the run was paused and nobody resumed it within 10 minutes/);
    expect(w).not.toMatch(/AnA waited/);
    expect(w).toContain(steps[0]);
  });

  it('a steer that replaced a step before it was shown is not written as a stop she made', () => {
    const w = policyHoldWarning(hold({ outcome: 'superseded' }));
    expect(w).not.toMatch(/AnA stopped/);
    expect(w).toMatch(/while AnA was working/);
    expect(w).toMatch(/before it was shown/);
    expect(w).toMatch(/not run/);
  });

  it('a hold ended by Stop, or by the page closing, says the step was not run', () => {
    expect(policyHoldWarning(hold({ outcome: 'stopped' }))).toMatch(/stopped while she waited.*not run/);
    expect(policyHoldWarning(hold({ outcome: 'disconnected' }))).toMatch(/page was closed.*not run/);
  });

  it('a Stop at a hold names the step it left unrun', () => {
    expect(turnStopWarning('cancelled', 1, { runPolicy: 'manual', pendingSteps: steps })).toContain(
      `Steps not run: ${steps[0]}.`,
    );
  });

  it('the new outcomes are kept with the message; an unknown one is not', () => {
    const meta = withTurnEnding(undefined, {
      stoppedReason: 'cancelled',
      policyHolds: [hold({ outcome: 'superseded' }), hold({ outcome: 'stopped' }), hold({ outcome: 'disconnected' }), hold({ outcome: 'bogus' as never })],
    });
    expect(meta?.policyHolds?.map(h => h.outcome)).toEqual(['superseded', 'stopped', 'disconnected']);
  });
});

describe('the record states durations from the shared ceilings, never as literals', () => {
  it.each(['tool-trace.ts', 'turn-run-policy.ts'])('%s has no hard-coded minute count', async file => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    expect(src).not.toMatch(/\b\d+ minutes\b/);
  });
});
