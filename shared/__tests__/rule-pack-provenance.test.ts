/**
 * The conservative default is the whole protection — lock it.
 *
 * `normalizeRulePackProvenance` sits on the boundary between a database that
 * may not have taken migration 20260810c and a screen a filer reads before
 * building a submission. Every failure mode of this function is the same
 * failure: an outline nothing stands behind gets rendered as one that
 * something does.
 *
 * These tests are written from that direction. They do not check that valid
 * values pass through (though one does); they check that INVALID, ABSENT, and
 * UNRECOGNISED values cannot become a claim.
 */
import { describe, it, expect } from 'vitest';

import {
  UNDECLARED_PROVENANCE,
  describeRulePackProvenance,
  normalizeRulePackProvenance,
  rulePackProvenanceSelectSql,
  type RulePackProvenance,
} from '../rule-pack-provenance';

describe('normalizeRulePackProvenance — nothing becomes a claim', () => {
  // A database that has not run 20260810c has no columns at all, so the route's
  // `to_jsonb(rp) ->> '…'` reads yield null for all five.
  it('a pre-migration row (all null) is undeclared, unknown, unreviewed', () => {
    expect(
      normalizeRulePackProvenance({
        source_basis: null,
        confidence: null,
        review_status: null,
        governing_rule: null,
        uncertainties: null,
      }),
    ).toEqual(UNDECLARED_PROVENANCE);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'statutory_transcription'],
    ['a number', 7],
    ['an array', []],
    ['an empty object', {}],
  ])('%s normalises to the undeclared default', (_label, input) => {
    expect(normalizeRulePackProvenance(input)).toEqual(UNDECLARED_PROVENANCE);
  });

  // The CHECK constraints only exist after the migration. Before it — and for
  // anything arriving over HTTP — an unrecognised value must be refused, not
  // forwarded. 'reviewed_by_fda' is the shape of the lie that would matter.
  it.each(['reviewed_by_fda', 'verified', 'STATUTORY_TRANSCRIPTION', '', ' '])(
    'refuses the unrecognised source_basis %o rather than forwarding it',
    (bad) => {
      expect(normalizeRulePackProvenance({ source_basis: bad }).sourceBasis).toBe('undeclared');
    },
  );

  it('refuses an unrecognised review_status rather than forwarding it', () => {
    expect(normalizeRulePackProvenance({ review_status: 'approved' }).reviewStatus).toBe('unreviewed');
    expect(normalizeRulePackProvenance({ review_status: 'REVIEWED' }).reviewStatus).toBe('unreviewed');
  });

  it('refuses an unrecognised confidence rather than forwarding it', () => {
    expect(normalizeRulePackProvenance({ confidence: 'certain' }).confidence).toBe('unknown');
  });

  it('treats whitespace-only prose as absent — it is not a statement', () => {
    const p = normalizeRulePackProvenance({ governing_rule: '   ', uncertainties: '\n\t' });
    expect(p.governingRule).toBeNull();
    expect(p.uncertainties).toBeNull();
  });

  it('trims prose that is a statement', () => {
    const p = normalizeRulePackProvenance({ governing_rule: '  21 CFR 814.20(b)  ' });
    expect(p.governingRule).toBe('21 CFR 814.20(b)');
  });

  it('accepts the snake_case shape Postgres returns', () => {
    expect(
      normalizeRulePackProvenance({
        source_basis: 'statutory_transcription',
        confidence: 'high',
        review_status: 'unreviewed',
        governing_rule: '21 CFR 814.20(b) — Application contents',
        uncertainties: 'Confirm module placement before filing.',
      }),
    ).toEqual({
      sourceBasis: 'statutory_transcription',
      confidence: 'high',
      reviewStatus: 'unreviewed',
      governingRule: '21 CFR 814.20(b) — Application contents',
      uncertainties: 'Confirm module placement before filing.',
    } satisfies RulePackProvenance);
  });

  it('accepts the camelCase shape the API emits, so re-normalising is idempotent', () => {
    const once = normalizeRulePackProvenance({
      source_basis: 'harmonised_standard',
      confidence: 'high',
      review_status: 'unreviewed',
      governing_rule: 'ICH M4',
    });
    // The client normalises what the server already normalised.
    expect(normalizeRulePackProvenance(once)).toEqual(once);
  });

  it('the exported default cannot be mutated by a caller', () => {
    expect(() => {
      (UNDECLARED_PROVENANCE as { sourceBasis: string }).sourceBasis = 'statutory_transcription';
    }).toThrow();
    expect(UNDECLARED_PROVENANCE.sourceBasis).toBe('undeclared');
  });
});

describe('describeRulePackProvenance — tone follows review, not comfort', () => {
  const of = (o: Partial<RulePackProvenance>): RulePackProvenance => ({
    ...UNDECLARED_PROVENANCE,
    ...o,
  });

  // This is the substitution the provenance work exists to prevent: an outline
  // transcribed faithfully from FDA regulation is still not one a regulatory
  // professional has signed off, and must not be painted as if it were.
  it('an unreviewed statutory transcription is NOT green', () => {
    const d = describeRulePackProvenance(of({ sourceBasis: 'statutory_transcription', confidence: 'high' }));
    expect(d.tone).not.toBe('ok');
    expect(d.tone).toBe('idle');
    expect(d.detail).toContain('Not reviewed by a regulatory professional.');
  });

  it('an unreviewed harmonised standard is NOT green either', () => {
    expect(describeRulePackProvenance(of({ sourceBasis: 'harmonised_standard' })).tone).toBe('idle');
  });

  it('only a reviewed pack is green', () => {
    const d = describeRulePackProvenance(
      of({ sourceBasis: 'statutory_transcription', reviewStatus: 'reviewed' }),
    );
    expect(d.tone).toBe('ok');
    expect(d.headline).toContain('reviewed');
    expect(d.detail).not.toContain('Not reviewed by a regulatory professional.');
  });

  it('a reasoned construction warns, and says to check it against the regulation', () => {
    const d = describeRulePackProvenance(of({ sourceBasis: 'reasoned_construction' }));
    expect(d.tone).toBe('warn');
    expect(d.detail).toContain('Check it against the regulation');
  });

  // Undeclared is worse than reasoned_construction: with a construction you at
  // least know what you have. These must not look the same on screen.
  it('undeclared is the strongest signal, and distinct from constructed', () => {
    const undeclared = describeRulePackProvenance(of({ sourceBasis: 'undeclared' }));
    const constructed = describeRulePackProvenance(of({ sourceBasis: 'reasoned_construction' }));
    expect(undeclared.tone).toBe('err');
    expect(undeclared.tone).not.toBe(constructed.tone);
    expect(undeclared.headline).not.toBe(constructed.headline);
    expect(undeclared.detail).toContain('Treat nothing in it as verified.');
  });

  it('guidance is not described as law', () => {
    const d = describeRulePackProvenance(of({ sourceBasis: 'guidance_transcription' }));
    expect(d.detail).toContain('not binding law');
  });

  it('surfaces the governing rule and the recorded uncertainties', () => {
    const d = describeRulePackProvenance(
      of({
        sourceBasis: 'statutory_transcription',
        governingRule: '21 CFR 814.20(b)',
        uncertainties: 'Notified Body expectations vary by device class.',
      }),
    );
    expect(d.detail).toContain('21 CFR 814.20(b)');
    expect(d.detail).toContain('Notified Body expectations vary by device class.');
  });

  it('every basis produces a non-empty headline and detail', () => {
    const bases = [
      'statutory_transcription',
      'harmonised_standard',
      'guidance_transcription',
      'reasoned_construction',
      'undeclared',
    ] as const;
    for (const b of bases) {
      const d = describeRulePackProvenance(of({ sourceBasis: b }));
      expect(d.headline.length).toBeGreaterThan(0);
      expect(d.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('rulePackProvenanceSelectSql', () => {
  it('reads through to_jsonb so an absent column yields NULL instead of 42703', () => {
    const sql = rulePackProvenanceSelectSql('rp');
    for (const col of ['source_basis', 'confidence', 'review_status', 'governing_rule', 'uncertainties']) {
      expect(sql).toContain(`to_jsonb(rp) ->> '${col}' AS ${col}`);
    }
    // A bare column reference is exactly what this avoids.
    expect(sql).not.toMatch(/(^|[\s,])rp\.source_basis/);
  });

  it('refuses an alias that is not a plain identifier', () => {
    expect(() => rulePackProvenanceSelectSql("rp' OR '1'='1")).toThrow(/unsafe alias/);
    expect(() => rulePackProvenanceSelectSql('')).toThrow(/unsafe alias/);
    expect(() => rulePackProvenanceSelectSql('a-b')).toThrow(/unsafe alias/);
  });
});
