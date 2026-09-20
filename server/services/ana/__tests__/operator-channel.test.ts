/**
 * Tests — a steer is framed as an operator directive, not as the user talking.
 *
 * The `role: 'system'` turn establishes WHO is speaking. This establishes WHAT
 * they mean: that the instruction supersedes the plan in flight. A steer that
 * arrives after a round of tool results and reads as one more input to weigh is
 * a steer that does not steer — AnA carries on doing what she was already
 * doing, and the reviewer watches her finish the wrong answer with their
 * correction sitting in the transcript.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSteerMessage,
  MAX_STEER_CHARS,
  STEER_TRUNCATION_NOTE,
} from '../operator-channel.js';

describe('buildSteerMessage', () => {
  it('says the instruction comes from the person, not from a tool', () => {
    const msg = buildSteerMessage('Narrow to Class III devices.')!;
    expect(msg).toContain('The person you are working for');
    expect(msg).toContain('Narrow to Class III devices.');
  });

  it('says the steer supersedes the plan in flight', () => {
    // Without this the steer reads as another consideration and AnA finishes
    // the answer she had already planned.
    const msg = buildSteerMessage('Use the 2026 guidance.')!;
    expect(msg).toMatch(/takes precedence|change course/i);
    expect(msg).toContain('remainder of this turn');
  });

  it('asks her to say what she changed', () => {
    // A steer that lands invisibly is indistinguishable from one that was
    // ignored — the reviewer cannot tell whether it worked.
    expect(buildSteerMessage('Cite the CFR.')!).toMatch(/say in\s+your answer what you changed/);
  });

  it('does not let a steer authorise what a gate would refuse', () => {
    // A steer directs the work. It is not consent, and it is not a signature.
    const msg = buildSteerMessage('Just submit it to the FDA.')!;
    expect(msg).toContain('does not');
    expect(msg).toMatch(/authorise any action a tenant policy or approval gate would otherwise\s+refuse/);
  });

  it('returns null for an empty steer rather than an empty directive', () => {
    // Telling the model to reconsider its plan for no stated reason is worse
    // than saying nothing.
    expect(buildSteerMessage('')).toBeNull();
    expect(buildSteerMessage('   \n  ')).toBeNull();
    expect(buildSteerMessage(undefined as unknown as string)).toBeNull();
  });

  it('caps an over-long steer visibly, never silently', () => {
    // A reviewer who typed two sentences and had the second dropped would be
    // steering something other than what they can see.
    const long = 'x'.repeat(MAX_STEER_CHARS + 500);
    const msg = buildSteerMessage(long)!;
    expect(msg).toContain(STEER_TRUNCATION_NOTE.trim());
    expect(msg).not.toContain('x'.repeat(MAX_STEER_CHARS + 1));
  });

  it('leaves a steer at exactly the cap untouched', () => {
    const exact = 'y'.repeat(MAX_STEER_CHARS);
    const msg = buildSteerMessage(exact)!;
    expect(msg).toContain(exact);
    expect(msg).not.toContain(STEER_TRUNCATION_NOTE.trim());
  });
});
