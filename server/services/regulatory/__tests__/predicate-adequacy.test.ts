import { describe, it, expect } from 'vitest';
import { scorePredicateAdequacy } from '../predicate-adequacy.js';

describe('scorePredicateAdequacy', () => {
  it('throws when no candidates are supplied', () => {
    expect(() => scorePredicateAdequacy({ candidates: [] })).toThrow(/non-empty/);
    // @ts-expect-error — exercising the runtime guard
    expect(() => scorePredicateAdequacy({})).toThrow(/required/);
  });

  it('throws when a candidate has no identifier', () => {
    expect(() => scorePredicateAdequacy({ candidates: [{ identifier: '' }] })).toThrow(/identifier/);
  });

  it('scores a strong predicate as adequate and a weak one as inadequate', () => {
    const out = scorePredicateAdequacy({
      options: { currentYear: 2026 },
      candidates: [
        {
          identifier: 'K250001',
          sameProductCode: true,
          intendedUseAlignment: 'same',
          technologyAlignment: 'same',
          samePanel: true,
          clearanceYear: 2024,
          decision: 'SE',
          adverseStatus: false,
        },
        {
          identifier: 'K990001',
          sameProductCode: false,
          intendedUseAlignment: 'different',
          technologyAlignment: 'different',
          samePanel: false,
          clearanceYear: 1999,
          decision: 'NSE',
          adverseStatus: true,
        },
      ],
    });

    expect(out.ranked).toHaveLength(2);
    // Strong predicate ranks first and is fully scored.
    expect(out.ranked[0].identifier).toBe('K250001');
    expect(out.ranked[0].score).toBe(100);
    expect(out.ranked[0].band).toBe('adequate');
    expect(out.recommended).toBe('K250001');
    // Weak predicate is inadequate with concerns surfaced.
    expect(out.ranked[1].identifier).toBe('K990001');
    expect(out.ranked[1].score).toBe(0);
    expect(out.ranked[1].band).toBe('inadequate');
    expect(out.ranked[1].concerns.join(' ')).toMatch(/Not Substantially Equivalent/i);
  });

  it('treats unknown factors as 0 and lists them (never assumed favourable)', () => {
    const out = scorePredicateAdequacy({ candidates: [{ identifier: 'K123456' }] });
    const r = out.ranked[0];
    expect(r.score).toBe(0);
    expect(r.unknownFactors).toEqual(
      expect.arrayContaining([
        'sameProductCode',
        'intendedUseAlignment',
        'technologyAlignment',
        'samePanel',
        'clearanceYear',
        'decision',
        'adverseStatus',
      ]),
    );
  });

  it('is deterministic and stable for ties (preserves input order)', () => {
    const input = {
      candidates: [
        { identifier: 'A', intendedUseAlignment: 'similar' as const },
        { identifier: 'B', intendedUseAlignment: 'similar' as const },
      ],
    };
    const a = scorePredicateAdequacy(input);
    const b = scorePredicateAdequacy(input);
    expect(a).toEqual(b);
    expect(a.ranked.map((r) => r.identifier)).toEqual(['A', 'B']);
  });

  it('awards partial credit for "similar" alignment', () => {
    const out = scorePredicateAdequacy({
      candidates: [{ identifier: 'K1', intendedUseAlignment: 'similar', technologyAlignment: 'similar' }],
    });
    const r = out.ranked[0];
    // 25*0.5 + 20*0.5 = 12.5 -> 13 (intended use rounds 12.5->13) + 10
    const iu = r.factors.find((f) => f.factor === 'Intended use')!;
    const tech = r.factors.find((f) => f.factor === 'Technological characteristics')!;
    expect(iu.awarded).toBe(13);
    expect(tech.awarded).toBe(10);
  });
});
