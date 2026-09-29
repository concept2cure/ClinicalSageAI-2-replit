/**
 * verifyKeyDataAgainstText — the deterministic check that every value the
 * model records in key_data is a transcription of the document, not a figure
 * it produced. Pure: no DB, no mocks.
 *
 * The fixture is the reproduced defect. A CoA whose extracted text reads batch
 * "23‑104" (U+2011), protocol "ST–23–104" (en dashes), assay "99.2 %", batch
 * size "120 000" (U+202F) and D90 "45 µm" (micro sign) was cataloged with
 * batch 23-105, assay 98.4, study ST-99-001, batch size "250,000 tablets" and
 * D90 12 — every value wrong — and the write succeeded, because the only gate
 * was read coverage. Failure-first on purpose: the refusals are the cases
 * that prove the verifier works; the acceptances prove it does not refuse the
 * document's own typography.
 */
import { describe, it, expect } from 'vitest';
import {
  verifyKeyDataAgainstText,
  assertCatalogWriteAllowed,
  computeCoverage,
} from '../document-catalog-core';

const COA = [
  'Certificate of Analysis. Product: Catalogin 10mg tablets.',
  'Batch number: 23\u2011104.',
  'Stability protocol: ST\u201323\u2013104.',
  'Assay (HPLC): 99.2 % of label claim.',
  'Batch size: 120\u202F000 tablets.',
  'Particle size D90: 45 \u00B5m.',
  'Storage: excursions to \u22125 \u00B0C permitted; 24-month retest period.',
  'TAMC: \u2264 10\u00B3 CFU/g.',
].join('\n');

const paths = (v: ReturnType<typeof verifyKeyDataAgainstText>) =>
  v.unverified.map(l => l.path).sort();

describe('verifyKeyDataAgainstText — the reproduced CoA', () => {
  it('ACCEPTS the faithful values, written the way the document writes them', () => {
    const v = verifyKeyDataAgainstText(
      {
        batch: '23\u2011104',
        stability_study: 'ST\u201323\u2013104',
        assay_pct: 99.2,
        batch_size: '120\u202F000',
        d90: '45 \u00B5m',
      },
      COA,
    );
    expect(v.unverified).toEqual([]);
    expect(v.verified).toBe(true);
    expect(v.reason).toBeNull();
    expect(v.checkedLeaves).toBe(5);
  });

  it('ACCEPTS the same values typed in plain ASCII, any case, either mu', () => {
    const v = verifyKeyDataAgainstText(
      {
        batch: '23-104',
        stability_study: 'st-23-104',
        batch_size_nbsp: '120\u00A0000', // NBSP-grouped, as other extractors emit it
        batch_size_number: 120000,
        d90_greek_mu: '45 \u03BCm',
        d90_number: 45,
      },
      COA,
    );
    expect(v.unverified).toEqual([]);
    expect(v.verified).toBe(true);
  });

  it('REFUSES every invented value and NAMES each leaf with the value it carried', () => {
    const v = verifyKeyDataAgainstText(
      {
        batch: '23-105',
        assay_pct: 98.4,
        stability_study: 'ST-99-001',
        batch_size: '250,000 tablets',
        d90_um: 12,
      },
      COA,
    );
    expect(v.verified).toBe(false);
    expect(paths(v)).toEqual(['assay_pct', 'batch', 'batch_size', 'd90_um', 'stability_study']);
    expect(v.unverified.every(l => l.problem === 'not_in_text')).toBe(true);
    for (const named of [
      'batch = "23-105"',
      'assay_pct = 98.4',
      'stability_study = "ST-99-001"',
      'batch_size = "250,000 tablets"',
      'd90_um = 12',
    ]) {
      expect(v.reason).toContain(named);
    }
    expect(v.reason).toMatch(/^Refusing to catalog: 5 key_data value/);
  });

  it('names only the failing leaves when faithful and invented values are mixed', () => {
    const v = verifyKeyDataAgainstText({ batch: '23-104', assay_pct: 98.4 }, COA);
    expect(v.verified).toBe(false);
    expect(paths(v)).toEqual(['assay_pct']);
    expect(v.checkedLeaves).toBe(2);
  });
});

describe('verifyKeyDataAgainstText — verdicts are not transcriptions', () => {
  it('REFUSES a boolean leaf even though "released" is a word in the text', () => {
    const v = verifyKeyDataAgainstText({ batch: '23-104', released: true }, COA);
    expect(v.verified).toBe(false);
    expect(v.unverified).toEqual([{ path: 'released', value: true, problem: 'verdict' }]);
    expect(v.reason).toContain('released = true');
  });

  it('REFUSES a null leaf and an empty string — neither transcribes anything', () => {
    const v = verifyKeyDataAgainstText({ oos: null, note: '   ' }, COA);
    expect(v.verified).toBe(false);
    expect(v.unverified).toEqual([
      { path: 'oos', value: null, problem: 'verdict' },
      { path: 'note', value: '   ', problem: 'empty' },
    ]);
  });

  it('REFUSES a figure the document does not state, even a derived one', () => {
    // 0 out-of-specification results is a count the model computed; the text
    // never writes it. Rule 2: the model does not get to supply that number.
    const v = verifyKeyDataAgainstText({ oos_count: 0 }, COA);
    expect(paths(v)).toEqual(['oos_count']);
  });
});

describe('verifyKeyDataAgainstText — nesting', () => {
  it('checks a leaf inside an array inside an object, and names its full path', () => {
    const v = verifyKeyDataAgainstText(
      {
        batch: '23-104',
        results: [
          { test: 'Assay', value: 99.2 },
          { test: 'Particle size D90', value: 12 },
        ],
      },
      COA,
    );
    expect(v.verified).toBe(false);
    expect(paths(v)).toEqual(['results[1].value']);
    expect(v.reason).toContain('results[1].value = 12');
    expect(v.checkedLeaves).toBe(5);
  });

  it('quotes a key that is not a plain identifier, so the path is unambiguous', () => {
    const v = verifyKeyDataAgainstText({ 'assay (%)': { 'batch.1': 98.4 } }, COA);
    expect(paths(v)).toEqual(['["assay (%)"]["batch.1"]']);
  });

  it('does not verify keys — labels are the model’s naming, not a claim about the text', () => {
    const v = verifyKeyDataAgainstText({ anything_at_all_zzz: '23-104' }, COA);
    expect(v.verified).toBe(true);
  });

  it('has nothing to verify when there is no key_data', () => {
    for (const none of [null, undefined, {}]) {
      const v = verifyKeyDataAgainstText(none, COA);
      expect(v).toMatchObject({ verified: true, checkedLeaves: 0, unverified: [], reason: null });
    }
  });
});

describe('verifyKeyDataAgainstText — a value must be a whole token, not a fragment', () => {
  it('a number’s decimal form must match exactly: no prefix, suffix or neighbour', () => {
    for (const wrong of [98.4, 99, 9.2, 2, 99.25, 992]) {
      expect(verifyKeyDataAgainstText({ v: wrong }, COA).verified, String(wrong)).toBe(false);
    }
    expect(verifyKeyDataAgainstText({ v: 99.2 }, COA).verified).toBe(true);
  });

  it('thousands grouping may be added or removed for a number — but a group is not the number', () => {
    const grouped = 'Lot A: 120,000 units. Lot B: 1 120 000 units. Lot C: 7500 units.';
    expect(verifyKeyDataAgainstText({ v: 120000 }, grouped).verified).toBe(true); // "120,000"
    expect(verifyKeyDataAgainstText({ v: 7500 }, grouped).verified).toBe(true);
    // 1 120 000 is one figure; 120 000 and 120 inside it are not in the text.
    expect(verifyKeyDataAgainstText({ v: 120 }, 'Lot B: 1 120 000 units.').verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: 120000 }, 'Lot B: 1 120 000 units.').verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: 1120000 }, 'Lot B: 1 120 000 units.').verified).toBe(true);
    // Nor is its head: 1 and "1 120" are the start of that figure, not figures.
    expect(verifyKeyDataAgainstText({ v: 1 }, 'Lot B: 1 120 000 units.').verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: '1 120' }, 'Lot B: 1 120 000 units.').verified).toBe(false);
    // Grouping is a number-only allowance: a string is matched as written.
    expect(verifyKeyDataAgainstText({ v: '7,500' }, grouped).verified).toBe(false);
  });

  it('an identifier fragment is not the identifier', () => {
    expect(verifyKeyDataAgainstText({ v: '23-10' }, COA).verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: 'Catalog' }, COA).verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: 'ST-23' }, COA).verified).toBe(false);
  });

  it('a hyphen separates tokens: 24 is stated by "24-month"', () => {
    expect(verifyKeyDataAgainstText({ retest_months: 24 }, COA).verified).toBe(true);
  });

  it('a sign is part of the figure: −5 °C states -5, not 5', () => {
    expect(verifyKeyDataAgainstText({ v: -5 }, COA).verified).toBe(true);
    expect(verifyKeyDataAgainstText({ v: 5 }, COA).verified).toBe(false);
    // A hyphen between two figures is a range, not a minus sign.
    expect(verifyKeyDataAgainstText({ v: -8 }, 'Store at 2-8 \u00B0C.').verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: 8 }, 'Store at 2-8 \u00B0C.').verified).toBe(true);
  });

  it('a superscript exponent is not folded into the digits (NFKC alone makes 10³ read "103")', () => {
    expect(verifyKeyDataAgainstText({ v: 103 }, COA).verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: 10 }, COA).verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: '10\u00B3 CFU/g' }, COA).verified).toBe(true);
  });

  it('a unit glued to a figure makes one token: 10 is not "10mg", "10mg" is', () => {
    expect(verifyKeyDataAgainstText({ v: 10 }, 'Catalogin 10mg tablets').verified).toBe(false);
    expect(verifyKeyDataAgainstText({ v: '10mg' }, 'Catalogin 10mg tablets').verified).toBe(true);
  });

  it('a value the extraction wrapped across a line, or padded with spaces, still occurs', () => {
    const wrapped = 'Product: Catalogin\n10mg   tablets.';
    expect(verifyKeyDataAgainstText({ v: 'Catalogin 10mg tablets' }, wrapped).verified).toBe(true);
  });

  it('fails closed against a document with no text', () => {
    const v = verifyKeyDataAgainstText({ batch: '23-104' }, '');
    expect(v.verified).toBe(false);
    expect(paths(v)).toEqual(['batch']);
  });
});

describe('assertCatalogWriteAllowed — the gate composes both checks', () => {
  const fullRead = computeCoverage([{ start: 0, end: COA.length }], COA.length);

  it('REFUSES invented key_data even after a complete read, carrying the named leaves', () => {
    const verdict = assertCatalogWriteAllowed(fullRead, { batch: '23-105', assay_pct: 99.2 }, COA);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('batch = "23-105"');
    expect(verdict.unverifiedKeyData?.map(l => l.path)).toEqual(['batch']);
  });

  it('judges coverage first: a partial read is refused on coverage, not on values', () => {
    const partial = computeCoverage([{ start: 0, end: 10 }], COA.length);
    const verdict = assertCatalogWriteAllowed(partial, { batch: '23-105' }, COA);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/only 10 of \d+ characters/);
    expect(verdict.unverifiedKeyData).toBeUndefined();
  });

  it('allows a complete read whose key_data the text states', () => {
    const verdict = assertCatalogWriteAllowed(fullRead, { batch: '23-104', assay_pct: 99.2 }, COA);
    expect(verdict).toMatchObject({ allowed: true, reason: null });
    expect(verdict.unverifiedKeyData).toBeUndefined();
  });
});
