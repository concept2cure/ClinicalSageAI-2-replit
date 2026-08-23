/**
 * The composer's mode picker has to change what AnA actually does.
 *
 * WHAT WENT WRONG
 * `prefs.anaMode` was stored, passed to the rail, and rendered beside the send
 * button as "Ask · Maximum". It never reached the request: `V2App` called
 * `useAnaChat({ screenName, projectId, moduleContext })` with no `effortLevel`,
 * and nothing else mapped the mode onto one.
 *
 * `effort_level` is not cosmetic. The server maps it to the agentic loop's
 * round ceiling — fast 4, balanced 6 (+2 earned), thorough 10 (+4) — plus the
 * output budget and the model tier, and `resolveEffortLevel` falls back to
 * `balanced` for anything it does not recognise, including absent.
 *
 * So a reviewer choosing "Deep research — drafting, multi-step analysis,
 * long-form" for a regulatory question silently got 8 rounds where the label
 * promised 14, and "Quick ask" cost twice what it advertised. Only "Standard"
 * was correct, and only because it happened to match the default.
 *
 * A control that presents a deliberate choice and discards it is worse than no
 * control: it does not merely fail to help, it tells the user something untrue
 * about the work that was done.
 */
import { describe, expect, it } from 'vitest';

import { ANA_MODES, effortForMode } from '../registryModel';

describe('every offered mode buys the effort its label promises', () => {
  it('Deep research asks for the deepest loop', () => {
    // "Maximum · drafting, multi-step analysis, long-form" is a promise about
    // depth; thorough is the only level that keeps it.
    expect(effortForMode('deep-research')).toBe('thorough');
  });

  it('Quick ask asks for the shallowest', () => {
    expect(effortForMode('quick-ask')).toBe('fast');
  });

  it('Standard asks for the middle', () => {
    expect(effortForMode('standard')).toBe('balanced');
  });

  it('every mode the composer offers declares an effort', () => {
    // A mode without one silently falls back to the server default, which is
    // exactly the defect this field exists to end — and it would do so for a
    // mode the picker still advertises.
    for (const m of ANA_MODES) {
      expect(m.effort, `${m.id} has no effort`).toBeTruthy();
      expect(['fast', 'balanced', 'thorough']).toContain(m.effort);
    }
  });

  it('distinct modes do not collapse onto one effort', () => {
    // Three labelled choices that all resolve the same way would be the old
    // defect wearing a new shape: a picker that changes nothing.
    const efforts = new Set(ANA_MODES.map((m) => m.effort));
    expect(efforts.size).toBe(ANA_MODES.length);
  });

  it('an unknown mode resolves to null rather than guessing', () => {
    // null lets the hook omit effort_level and take the server default, which
    // is honest. Inventing a level here would be this layer deciding how hard
    // AnA works on the strength of a string it does not recognise.
    expect(effortForMode('not-a-mode')).toBeNull();
  });
});
