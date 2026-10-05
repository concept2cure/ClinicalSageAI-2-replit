/**
 * The tool selector keeps section codes and annex keys as tokens.
 *
 * `tokenize` used to keep only `[a-z0-9]{3,}` runs, so a turn naming "2.7.3",
 * "5.3.5.3", "II.6.1" or "CH3.05.06" got no credit for the code at all. Over
 * ~790 tools and a cap of 50, the tool built for that section was cut whenever
 * the rest of the wording did not happen to match its description — "write the
 * 2.7.3 for our EU MAA" was not offered draft_clinical_summary_m2_7.
 *
 * Code tokens are matched on a code boundary ("2.5" is not "12.5" or "2.5.1")
 * and weigh +3 on a name match and +2 on a description match. Region acronyms
 * ('eu', 'us', 'jp') are deliberately NOT emitted: scoring is by substring, so
 * they would match "queue", "status" and "focus".
 *
 * Pure (no LLM/DB) — it tests the deterministic selector, not the model.
 */

import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { selectToolsForTurn, tokenize, SELF_DRIVE_TOOLS } from '../tool-selection';
import { withoutHiddenAppTools } from '../ana-launch-scope';

describe('tokenize — section codes, annex keys and eSTAR CH tokens', () => {
  it('keeps dotted section codes and annex keys (it used to return only ["see"])', () => {
    const terms = tokenize('see 2.7.3 and II.6.1');
    expect(terms).toContain('see');
    expect(terms).toContain('2.7.3');
    expect(terms).toContain('ii.6.1');
  });

  it('keeps eSTAR CH tokens whole, without a stray "05.06" fragment', () => {
    const terms = tokenize('what goes in CH3.05.06 of the eSTAR');
    expect(terms).toContain('ch3.05.06');
    expect(terms).not.toContain('05.06');
  });

  it('takes a code at the end of a sentence or in brackets without the punctuation', () => {
    expect(tokenize('Draft section 5.3.5.3.')).toContain('5.3.5.3');
    expect(tokenize('the summary (2.7.4), please')).toContain('2.7.4');
  });

  it('takes a CTD Module 3 code with a letter segment whole, never a "3.2" fragment', () => {
    // "3.2.S.4.1" used to yield "3.2", which scored on the 21 CFR 3.2(e)
    // combination-product tools for a drug-substance turn.
    for (const [query, code] of [
      ['draft 3.2.P.5.1', '3.2.p.5.1'],
      ['what goes in 3.2.S.4.1 specification for the drug substance', '3.2.s.4.1'],
      ['review 3.2.P.8 stability data', '3.2.p.8'],
    ] as const) {
      const terms = tokenize(query);
      expect(terms, query).toContain(code);
      expect(terms, query).not.toContain('3.2');
    }
  });

  it('emits no fragment from a code followed by a dot and a word', () => {
    const terms = tokenize('see 3.2.Sx for details');
    expect(terms).not.toContain('3.2');
  });

  it('never emits the region acronyms eu, us or jp', () => {
    const terms = tokenize('compare the EU, US and JP filings for us');
    for (const region of ['eu', 'us', 'jp']) expect(terms).not.toContain(region);
  });

  it('is additive: the word tokens it produced before are unchanged', () => {
    expect(tokenize('summary of clinical efficacy for the NDA')).toEqual(
      expect.arrayContaining(['summary', 'clinical', 'efficacy', 'nda']),
    );
  });
});

describe('scoring — a code token matches on a code boundary and outweighs one word', () => {
  // A synthetic pool well over the cap, so selection is purely by score.
  const filler = Array.from({ length: 60 }, (_, i) => ({ name: `filler_tool_${i}`, description: 'unrelated' }));
  const pick = (pool: Array<{ name: string; description: string }>, query: string, maxTools: number) =>
    new Set(selectToolsForTurn(pool, query, { maxTools }).map((t) => t.name));

  it('"2.5" reaches a tool describing 2.5, and never one describing only 12.5 or 2.5.1', () => {
    const pool = [
      ...filler,
      { name: 'section_twelve_five', description: 'covers section 12.5 only' },
      { name: 'section_two_five_one', description: 'covers section 2.5.1 only' },
      { name: 'section_two_five', description: 'covers the clinical overview (2.5).' },
    ];
    const chosen = pick(pool, '2.5', 10);
    expect(chosen.has('section_two_five')).toBe(true);
    expect(chosen.has('section_twelve_five')).toBe(false);
    expect(chosen.has('section_two_five_one')).toBe(false);
  });

  it('a code in the description (+2) outranks one matching word (+1)', () => {
    const pool = [
      ...filler,
      { name: 'word_tool', description: 'reports on efficacy' },
      { name: 'code_tool', description: 'drafts section 2.7.3' },
    ];
    const chosen = pick(pool, 'efficacy 2.7.3', 1);
    expect(chosen.has('code_tool')).toBe(true);
    expect(chosen.has('word_tool')).toBe(false);
  });

  it('a code in the name (+3) outranks a code in the description (+2)', () => {
    const pool = [
      ...filler,
      { name: 'describes_code', description: 'drafts section 2.7.3' },
      { name: 'section_2.7.3', description: 'unrelated' },
    ];
    const chosen = pick(pool, '2.7.3', 1);
    expect(chosen.has('section_2.7.3')).toBe(true);
  });

  it('a CTD Module 3 code does not reach a tool described only by "21 CFR 3.2(e)"', () => {
    const pool = [
      ...filler,
      { name: 'combination_product_tool', description: 'applies the definition at 21 CFR 3.2(e)' },
      { name: 'drug_product_spec_tool', description: 'drafts the specifications section 3.2.P.5.1' },
    ];
    expect(pick(pool, '3.2.S.4.1', 10).has('combination_product_tool')).toBe(false);
    const chosen = pick(pool, 'draft 3.2.P.5.1', 10);
    expect(chosen.has('combination_product_tool')).toBe(false);
    expect(chosen.has('drug_product_spec_tool')).toBe(true);
  });

  it('an annex key does not match inside a longer one ("ii.6.1" is not "iii.6.1")', () => {
    const pool = [...filler, { name: 'annex_three', description: 'annex key III.6.1' }];
    expect(pick(pool, 'II.6.1', 10).has('annex_three')).toBe(false);
  });

  it('a single-number annex key is a code token too ("ii.6" is not inside "iii.6.1" or "ii.61")', () => {
    // "II.6" carries no digit-dot-digit, so it used to fall back to +1 substring
    // scoring and hit inside "iii.6.1" and "ii.61".
    expect(tokenize('annex II.6 of the MDR')).toContain('ii.6');
    const pool = [
      ...filler,
      { name: 'annex_three', description: 'annex key III.6.1' },
      { name: 'annex_sixty_one', description: 'annex key II.61' },
      { name: 'annex_two_six', description: 'annex key II.6 of the regulation' },
    ];
    const chosen = pick(pool, 'II.6', 10);
    expect(chosen.has('annex_three')).toBe(false);
    expect(chosen.has('annex_sixty_one')).toBe(false);
    expect(chosen.has('annex_two_six')).toBe(true);
  });
});

describe('Module 3 codes on the real catalog — no combination-product tools for a drug-substance turn', () => {
  const COMBINATION = ['determine_primary_mode_of_action', 'classify_combination_product', 'select_combination_submission_pathway'];
  it.each([
    'draft 3.2.P.5.1',
    'what goes in 3.2.S.4.1 specification for the drug substance',
  ])('"%s" offers none of the 21 CFR 3.2(e) tools', (prompt) => {
    const names = new Set(selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map((t) => t.name));
    for (const tool of COMBINATION) expect(names.has(tool), `${tool} offered for "${prompt}"`).toBe(false);
  });
});

/**
 * Routing on the real catalog. The first three fail with the old tokenizer: the
 * section code was the only signal that named the right tool. The rest are
 * guards. The two get_document_section_requirements prompts from the finding
 * pass regardless since that tool became always-on (g-always-on-record-tools);
 * they stay here so a later change to ALWAYS_ON cannot lose them silently.
 */
const ROUTING: { prompt: string; expect: string }[] = [
  { prompt: 'write the 2.7.3 for our EU MAA', expect: 'draft_clinical_summary_m2_7' },
  { prompt: 'write sections 2.6.2 and 2.6.4 for the EU MAA', expect: 'draft_nonclinical_summaries_m2_6' },
  { prompt: 'what goes in 5.3.5.3', expect: 'get_csr_template' },
  { prompt: 'what goes in the 2.7.3 summary of clinical efficacy for an EU MAA', expect: 'get_document_section_requirements' },
  { prompt: 'what should the clinical overview 2.5 contain for the PMDA submission', expect: 'get_document_section_requirements' },
  { prompt: 'what goes in the performance evaluation report for an IVDR class C assay', expect: 'assess_device_evidence_structure' },
];

describe('routing on section codes — full catalog, cap 50', () => {
  it.each(ROUTING)('offers "$expect" for: "$prompt"', ({ prompt, expect: tool }) => {
    const names = new Set(selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map((t) => t.name));
    expect(names.has(tool), `"${tool}" not offered for its own section code`).toBe(true);
  });
});

describe('routing on section codes — production composition (launch-scoped pool, self-drive pinned)', () => {
  const POOL = withoutHiddenAppTools(ALL_ANA_TOOLS);

  it('every expected tool is in the launch-scoped pool (so the cases cannot pass vacuously)', () => {
    const poolNames = new Set(POOL.map((t) => t.name));
    for (const { expect: tool } of ROUTING) expect(poolNames.has(tool), `${tool} hidden by launch scope`).toBe(true);
  });

  it.each(ROUTING)('offers "$expect" for: "$prompt"', ({ prompt, expect: tool }) => {
    const names = new Set(
      selectToolsForTurn(POOL, prompt, { maxTools: 50, pinned: [...SELF_DRIVE_TOOLS] }).map((t) => t.name),
    );
    expect(names.has(tool), `"${tool}" not offered for its own section code`).toBe(true);
  });
});
