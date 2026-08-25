/**
 * Unit tests for the seat-licensing decision engine. Targets the PURE core
 * (evaluateSeats) where the policy lives; DB wrappers are thin pass-throughs.
 */
import { describe, it, expect } from 'vitest';

import { evaluateSeats, isSeatEnforcementOn } from '../seat-licensing';

describe('evaluateSeats', () => {
  it('is unlimited (always allowed) when no seats are purchased', () => {
    const d = evaluateSeats({ seatsPurchased: 0, seatsUsed: 99, seatsPending: 5, adding: 10 });
    expect(d.state).toBe('unlimited');
    expect(d.allowed).toBe(true);
    expect(d.utilizationPct).toBe(0);
  });

  it('counts both active members and pending invitations toward consumed seats', () => {
    const d = evaluateSeats({ seatsPurchased: 10, seatsUsed: 6, seatsPending: 2, adding: 0 });
    expect(d.seatsConsumed).toBe(8);
    expect(d.available).toBe(2);
    expect(d.state).toBe('ok');
    expect(d.utilizationPct).toBe(80);
  });

  it('permits an add that exactly fills the license', () => {
    const d = evaluateSeats({ seatsPurchased: 10, seatsUsed: 9, seatsPending: 0, adding: 1 });
    expect(d.allowed).toBe(true);
    expect(d.projected).toBe(10);
  });

  it('denies an add that would exceed purchased seats', () => {
    const d = evaluateSeats({ seatsPurchased: 10, seatsUsed: 8, seatsPending: 2, adding: 1 });
    expect(d.seatsConsumed).toBe(10);
    expect(d.state).toBe('full');
    expect(d.available).toBe(0);
    expect(d.allowed).toBe(false);
  });

  it('reports an over-allocated org (consumed beyond the license)', () => {
    const d = evaluateSeats({ seatsPurchased: 5, seatsUsed: 6, seatsPending: 1, adding: 0 });
    expect(d.state).toBe('over');
    expect(d.available).toBe(0);
    expect(d.allowed).toBe(false); // adding 0 still can't be allowed while over
    expect(d.utilizationPct).toBe(140);
  });
});

describe('isSeatEnforcementOn — production default', () => {
  // This control shipped inert for its whole life: the check was
  // `=== 'enforce'` and no deployment manifest set the variable, so an
  // organization could add the (N+1)th member to an N-seat contract with
  // nothing between it and the database. The default now follows the same
  // doctrine as db/rlsEnforcement.ts — safe in production, convenient elsewhere.

  it('ENFORCES in production when the variable is unset', () => {
    expect(isSeatEnforcementOn({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('is report-only outside production when the variable is unset', () => {
    expect(isSeatEnforcementOn({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isSeatEnforcementOn({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("honours an explicit 'report' opt-out in production", () => {
    // The migration-window escape hatch, spelled out so it is greppable in a
    // deployment manifest rather than being the accidental default.
    expect(
      isSeatEnforcementOn({ NODE_ENV: 'production', SEAT_LIMIT_ENFORCEMENT: 'report' } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("honours an explicit 'enforce' outside production", () => {
    expect(
      isSeatEnforcementOn({ NODE_ENV: 'test', SEAT_LIMIT_ENFORCEMENT: 'enforce' } as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  it('falls back to the environment default on a typo rather than silently disabling', () => {
    // A misspelled value must not switch a revenue control off in production.
    expect(
      isSeatEnforcementOn({ NODE_ENV: 'production', SEAT_LIMIT_ENFORCEMENT: 'enfroce' } as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(
      isSeatEnforcementOn({ NODE_ENV: 'test', SEAT_LIMIT_ENFORCEMENT: '  ENFORCE ' } as NodeJS.ProcessEnv)
    ).toBe(true);
  });
});
