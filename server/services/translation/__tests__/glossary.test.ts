/**
 * glossary tests — proves the GLOSSARY + DO-NOT-TRANSLATE engine protects
 * regulatory identifiers across a mask→translate→unmask round-trip.
 *
 * The module under test is pure (no db / env), so no vi.hoisted env shim is
 * needed — unlike the db-backed services in this repo, we import directly.
 *
 * Coverage:
 *  - DNT identifiers (21 CFR 312, ICH E6(R2), PMDA, Module 3, eCTD, evidence
 *    labels, slash commands, codes) survive a round-trip unchanged.
 *  - mask→unmask is the identity transform.
 *  - mask() is idempotent (re-masking masked text does not corrupt placeholders).
 *  - locked DNT terms (INN/drug names, MedDRA terms) are masked verbatim.
 *  - locked TARGET terms (preferred, non-DNT) get substituted.
 */

import { describe, it, expect } from 'vitest';

import {
  applyLockedTargetTerms,
  compileGlossary,
  detectDntSpans,
  emptyGlossary,
  isPlaceholder,
  mask,
  registerDntTerms,
  unmask,
} from '../glossary';
import type { CompiledGlossary, GlossaryTerm } from '../types';

const ORG = 42;

/** A bare built-ins-only glossary for org/lang. */
function g() {
  return emptyGlossary(ORG, 'ja');
}

/**
 * A simple "translation" stand-in: the workflow masks BEFORE the engine and
 * unmasks AFTER. We model the engine as a function that mangles ordinary words
 * but, crucially, must never see the identifiers — they are placeholders by then.
 */
function fakeTranslate(masked: string): string {
  // Mangle the prose (lowercase + wrap) to prove the identifiers were genuinely
  // protected — but treat placeholders as opaque tokens an engine must not
  // alter, exactly as a compliant MT engine would. We lowercase word characters
  // only OUTSIDE of placeholders.
  const parts = masked.split(/(⦙DNT\d+⦙)/);
  return `«${parts.map((p, i) => (i % 2 === 1 ? p : p.toLowerCase())).join('')}»`;
}

describe('glossary — built-in DNT identifiers survive a round-trip', () => {
  const cases: Array<{ name: string; text: string; identifier: string }> = [
    { name: '21 CFR citation', text: 'Per 21 CFR 312 the sponsor must file.', identifier: '21 CFR 312' },
    { name: '21 CFR Part 11', text: 'Records under 21 CFR Part 11 are immutable.', identifier: '21 CFR Part 11' },
    { name: 'CFR with subparagraphs', text: 'See 21 CFR 312.23(a)(1) for content.', identifier: '21 CFR 312.23(a)(1)' },
    { name: 'ICH E6(R2)', text: 'Follow ICH E6(R2) good clinical practice.', identifier: 'ICH E6(R2)' },
    { name: 'ICH Q8(R2)', text: 'Quality per ICH Q8(R2) applies.', identifier: 'ICH Q8(R2)' },
    { name: 'PMDA agency', text: 'Consult PMDA before submission.', identifier: 'PMDA' },
    { name: 'eCTD Module 3', text: 'Place the data in Module 3 of the dossier.', identifier: 'Module 3' },
    { name: 'eCTD M2 label', text: 'The M2 summaries are required.', identifier: 'M2' },
    { name: 'eCTD token', text: 'Submit as an eCTD sequence.', identifier: 'eCTD' },
    { name: 'evidence label', text: 'This claim is [INFERRED] from the protocol.', identifier: '[INFERRED]' },
    { name: 'slash command', text: 'Run /readiness to score the dossier.', identifier: '/readiness' },
  ];

  for (const c of cases) {
    it(`preserves ${c.name} unchanged through mask→translate→unmask`, () => {
      const glossary = g();
      const masked = mask(c.text, glossary);

      // The identifier must be GONE from the masked text handed to the engine.
      expect(masked.maskedText).not.toContain(c.identifier);
      // And captured as a token for restoration.
      expect(masked.tokens.some((t) => t.original === c.identifier)).toBe(true);

      const translated = fakeTranslate(masked.maskedText);
      const restored = unmask(translated, masked);

      // The identifier comes back verbatim, even though prose was lowercased.
      expect(restored).toContain(c.identifier);
    });
  }
});

describe('glossary — mask→unmask is identity', () => {
  it('round-trips a dense regulatory sentence to itself', () => {
    const text =
      'Under 21 CFR Part 11 and ICH E6(R2), submit Module 3 to PMDA; mark gaps [MISSING] and run /audit.';
    const glossary = g();
    const masked = mask(text, glossary);
    expect(unmask(masked.maskedText, masked)).toBe(text);
  });

  it('collapses a repeated identifier to a single stable placeholder', () => {
    const text = 'PMDA reviews; PMDA approves; notify PMDA.';
    const masked = mask(text, g());
    // One token for the three occurrences.
    expect(masked.tokens.filter((t) => t.original === 'PMDA')).toHaveLength(1);
    // All three occurrences masked.
    expect(masked.maskedText).not.toContain('PMDA');
    expect(unmask(masked.maskedText, masked)).toBe(text);
  });
});

describe('glossary — masking is idempotent', () => {
  it('re-masking masked text does not double-wrap or corrupt placeholders', () => {
    const text = 'File 21 CFR 312 with PMDA in Module 3.';
    const glossary = g();

    const first = mask(text, glossary);
    const second = mask(first.maskedText, glossary);

    // Second pass changes nothing — the placeholders are inviolable.
    expect(second.maskedText).toBe(first.maskedText);
    // No new tokens were minted for already-present placeholders.
    expect(second.tokens).toHaveLength(0);

    // Restoring with the ORIGINAL token set still yields the source.
    expect(unmask(second.maskedText, first)).toBe(text);
  });

  it('does not match DNT patterns inside an existing placeholder', () => {
    const masked = mask('Submit to PMDA.', g());
    const ph = masked.tokens[0].placeholder;
    expect(isPlaceholder(ph)).toBe(true);
    // Re-running over a string that is just a placeholder yields it unchanged.
    const again = mask(ph, g());
    expect(again.maskedText).toBe(ph);
    expect(again.tokens).toHaveLength(0);
  });
});

describe('glossary — locked DNT terms (INN / MedDRA) are masked verbatim', () => {
  it('masks a registered INN drug name and a MedDRA term', () => {
    const glossary = registerDntTerms(g(), [
      { sourceTerm: 'pembrolizumab', category: 'inn_drug_name' },
      { sourceTerm: 'myocardial infarction', category: 'meddra_term' },
    ]);

    const text =
      'Subjects on pembrolizumab reported myocardial infarction events.';
    const masked = mask(text, glossary);

    expect(masked.maskedText).not.toContain('pembrolizumab');
    expect(masked.maskedText).not.toContain('myocardial infarction');

    const inn = masked.tokens.find((t) => t.original === 'pembrolizumab');
    const mh = masked.tokens.find((t) => t.original === 'myocardial infarction');
    expect(inn?.category).toBe('inn_drug_name');
    expect(mh?.category).toBe('meddra_term');

    expect(unmask(fakeTranslate(masked.maskedText), masked)).toContain(
      'pembrolizumab',
    );
    expect(unmask(masked.maskedText, masked)).toBe(text);
  });

  it('prefers the longer locked term over a shorter overlapping one', () => {
    const glossary = registerDntTerms(g(), [
      { sourceTerm: 'acute kidney injury', category: 'meddra_term' },
      { sourceTerm: 'kidney', category: 'meddra_term' },
    ]);
    const masked = mask('Reported acute kidney injury in two subjects.', glossary);
    expect(masked.tokens.some((t) => t.original === 'acute kidney injury')).toBe(true);
    expect(masked.tokens.some((t) => t.original === 'kidney')).toBe(false);
  });
});

describe('glossary — locked TARGET terms get substituted', () => {
  function withPreferred(preferred: GlossaryTerm[]) {
    const compiled: CompiledGlossary = {
      organizationId: ORG,
      targetLang: 'de',
      dnt: [],
      preferred,
    };
    return compileGlossary(compiled);
  }

  it('replaces a source term with its mandated target rendering', () => {
    const glossary = withPreferred([
      {
        id: 1,
        organizationId: ORG,
        sourceTerm: 'adverse event',
        targetTerm: 'unerwünschtes Ereignis',
        doNotTranslate: false,
        category: 'preferred_term',
        targetLang: 'de',
      },
    ]);
    const out = applyLockedTargetTerms('Report every adverse event promptly.', glossary);
    expect(out).toContain('unerwünschtes Ereignis');
    expect(out).not.toContain('adverse event');
  });

  it('ignores DNT entries and terms for a different target language', () => {
    const glossary = withPreferred([
      {
        id: 2,
        organizationId: ORG,
        sourceTerm: 'adverse event',
        targetTerm: 'événement indésirable',
        doNotTranslate: false,
        category: 'preferred_term',
        targetLang: 'fr', // wrong language for this de glossary
      },
      {
        id: 3,
        organizationId: ORG,
        sourceTerm: 'serious',
        targetTerm: 'SHOULD_NOT_APPLY',
        doNotTranslate: true, // DNT — must not be applied as a substitution
        category: 'preferred_term',
        targetLang: 'de',
      },
    ]);
    const input = 'A serious adverse event occurred.';
    expect(applyLockedTargetTerms(input, glossary)).toBe(input);
  });
});

describe('glossary — introspection', () => {
  it('detectDntSpans reports protected identifiers without rewriting', () => {
    const spans = detectDntSpans('File 21 CFR 312 with PMDA.', g());
    const cats = spans.map((s) => s.category).sort();
    expect(cats).toEqual(['agency_name', 'regulatory_citation']);
    expect(spans.find((s) => s.category === 'agency_name')?.text).toBe('PMDA');
  });
});
