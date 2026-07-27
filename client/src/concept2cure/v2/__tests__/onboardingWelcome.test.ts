/**
 * AnA onboarding welcome (P1) content model — client/src/concept2cure/v2/onboardingWelcome.ts
 *
 * Locks the honesty + client-type-awareness contract: a deterministic greeting
 * in AnA's voice, type-specific starters, an always-present upload bridge to
 * P2/P3, and a neutral fallback so no segment ever yields an empty welcome.
 */
import { describe, it, expect } from 'vitest';
import { welcomeFor } from '../onboardingWelcome';

describe('welcomeFor — client-type-aware first-run welcome', () => {
  it('adapts the greeting + starters to each client family', () => {
    const biotech = welcomeFor('biotech', 'Jordan');
    expect(biotech.greeting).toContain('Jordan');
    expect(biotech.greeting.toLowerCase()).toContain('biotech');
    expect(biotech.starters.some((s) => /IND/i.test(s.label))).toBe(true);

    expect(welcomeFor('medtech', 'Sam').starters.some((s) => /510\(k\)/i.test(s.label))).toBe(true);
    expect(welcomeFor('IVD / diagnostics', 'Sam').starters.some((s) => /IVD/i.test(s.label))).toBe(true);
    expect(welcomeFor('pharma', 'Sam').greeting.toLowerCase()).toContain('drug');
    expect(welcomeFor('CRO', 'Sam').starters.some((s) => /client workspace/i.test(s.label))).toBe(true);
  });

  it('matches the client type case-insensitively', () => {
    const upper = welcomeFor('DEVICE', 'A');
    const lower = welcomeFor('device', 'A');
    expect(upper.starters.map((s) => s.label)).toEqual(lower.starters.map((s) => s.label));
  });

  it('falls back to a neutral welcome for an unknown segment (never empty)', () => {
    const unknown = welcomeFor('something-new', 'Riley');
    expect(unknown.greeting).toContain('Riley');
    expect(unknown.starters.length).toBeGreaterThanOrEqual(2);
    expect(unknown.starters.some((s) => /first program/i.test(s.label))).toBe(true);
  });

  it('uses a neutral name when none is supplied', () => {
    expect(welcomeFor('biotech', '').greeting).toContain('there');
    expect(welcomeFor('biotech', '   ').greeting).toContain('there');
  });

  it('always offers the upload starter (the bridge to P2/P3) with a live prompt', () => {
    for (const seg of ['biotech', 'pharma', 'device', 'diagnostics', 'cro', 'other']) {
      const w = welcomeFor(seg, 'X');
      const upload = w.starters.find((s) => /upload/i.test(s.label));
      expect(upload, `upload starter present for ${seg}`).toBeTruthy();
      // P1 is assist-only: the prompt explicitly promises human review before any save.
      expect(upload!.prompt.toLowerCase()).toContain('review');
    }
  });

  it('every starter carries a label and a non-empty live prompt', () => {
    const w = welcomeFor('biotech', 'X');
    for (const s of w.starters) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.prompt.trim().length).toBeGreaterThan(0);
    }
  });
});
