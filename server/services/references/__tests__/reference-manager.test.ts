import { describe, it, expect } from 'vitest';
import { parseRis, formatReference, formatBibliography, lintReferences, type Reference } from '../reference-manager.js';

const ris = `TY  - JOUR
AU  - Smith, John A.
AU  - Doe, Jane
TI  - A study of widgets
JO  - N Engl J Med
PY  - 2020
VL  - 382
IS  - 3
SP  - 100
EP  - 110
DO  - 10.1056/example
ER  -
`;

describe('parseRis', () => {
  it('parses a journal record into structured fields', () => {
    const refs = parseRis(ris);
    expect(refs).toHaveLength(1);
    const r = refs[0];
    expect(r.type).toBe('JOUR');
    expect(r.authors).toEqual(['Smith, John A.', 'Doe, Jane']);
    expect(r.title).toBe('A study of widgets');
    expect(r.journal).toBe('N Engl J Med');
    expect(r.year).toBe('2020');
    expect(r.pages).toBe('100-110');
    expect(r.doi).toBe('10.1056/example');
  });

  it('returns empty for blank input', () => {
    expect(parseRis('')).toEqual([]);
  });
});

describe('formatReference', () => {
  const ref: Reference = { authors: ['Smith, John A.', 'Doe, Jane'], title: 'A study of widgets', journal: 'N Engl J Med', year: '2020', volume: '382', issue: '3', pages: '100-110', doi: '10.1056/example' };

  it('formats Vancouver style (plain journal, no doi)', () => {
    expect(formatReference(ref, 'vancouver')).toBe('Smith JA, Doe J. A study of widgets. N Engl J Med. 2020;382(3):100-110.');
  });

  it('formats AMA style (italic journal, doi appended)', () => {
    expect(formatReference(ref, 'ama')).toBe('Smith JA, Doe J. A study of widgets. *N Engl J Med*. 2020;382(3):100-110. doi:10.1056/example');
  });

  it('applies the >6 authors et al rule', () => {
    const many = { ...ref, authors: ['A,X', 'B,X', 'C,X', 'D,X', 'E,X', 'F,X', 'G,X'] };
    expect(formatReference(many, 'vancouver')).toMatch(/^A X, B X, C X, D X, E X, F X, et al\./);
  });

  it('numbers a bibliography', () => {
    expect(formatBibliography([ref], 'vancouver')).toMatch(/^1\. Smith JA/);
  });
});

describe('lintReferences', () => {
  it('flags missing title (error) and missing year (warning)', () => {
    const r = lintReferences([{ authors: ['Smith, J'], title: '', journal: 'X' }]);
    expect(r.summary.errors).toBe(1);
    expect(r.issues.some((i) => i.field === 'title' && i.severity === 'error')).toBe(true);
    expect(r.issues.some((i) => i.field === 'year')).toBe(true);
  });

  it('detects duplicates by DOI', () => {
    const refs: Reference[] = [
      { authors: ['A,B'], title: 'One', doi: '10.1/x', year: '2020' },
      { authors: ['A,B'], title: 'One (dup)', doi: '10.1/X', year: '2020' },
    ];
    const r = lintReferences(refs);
    expect(r.duplicates.some((d) => d.on === 'doi')).toBe(true);
  });
});
