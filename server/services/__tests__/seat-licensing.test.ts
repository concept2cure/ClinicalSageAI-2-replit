/**
 * Unit tests for the seat-licensing decision engine. Targets the PURE core
 * (evaluateSeats) where the policy lives; DB wrappers are thin pass-throughs.
 */
import { describe, it, expect } from 'vitest';

import { evaluateSeats } from '../seat-licensing';

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
