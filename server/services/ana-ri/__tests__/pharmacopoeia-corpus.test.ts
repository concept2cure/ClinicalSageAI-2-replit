/**
 * Pharmacopoeia corpus — citable index of the major pharmacopoeias and key
 * general chapters, including PDG/ICH Q4B harmonised chapters with their cross-
 * pharmacopoeial equivalents. Integrity, lookups, search and the verify caveat.
 */

import { describe, it, expect } from 'vitest';
import {
  PHARMACOPOEIAS,
  PHARMACOPOEIAL_CHAPTERS,
  getPharmacopoeia,
  getChapter,
  harmonizedChapters,
  searchChapters,
  buildPharmacopoeiaBlock,
  pharmacopoeiaSummary,
} from '../pharmacopoeia-corpus';

describe('pharmacopoeia corpus — integrity', () => {
  it('indexes the major pharmacopoeias', () => {
    const codes = PHARMACOPOEIAS.map(p => p.code);
    for (const c of ['USP-NF', 'Ph.Eur.', 'JP', 'BP', 'ChP', 'IP']) {
      expect(codes).toContain(c);
    }
  });

  it('chapters are unique and well-formed; harmonised ones carry a Q4B annex', () => {
    const codes = PHARMACOPOEIAL_CHAPTERS.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of PHARMACOPOEIAL_CHAPTERS) {
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.keywords.length).toBeGreaterThan(0);
      if (c.harmonized) {
        expect(c.q4bAnnex, `${c.code} harmonised → needs a Q4B annex`).toBeTruthy();
        expect(c.equivalents && c.equivalents.length).toBeTruthy();
      }
    }
  });
});

describe('pharmacopoeia corpus — lookups', () => {
  it('resolves a pharmacopoeia and a chapter, rejects unknowns', () => {
    expect(getPharmacopoeia('Ph.Eur.')?.region).toBe('Europe');
    expect(getChapter('USP <85>')?.topic).toBe('Endotoxins');
    expect(getChapter('USP <9999>')).toBeUndefined();
  });

  it('searches by test name and exposes equivalents', () => {
    const diss = searchChapters('dissolution');
    expect(diss.some(c => c.code === 'USP <711>')).toBe(true);
    const endo = getChapter('USP <85>')!;
    expect(endo.equivalents).toContain('Ph.Eur. 2.6.14');
  });

  it('exposes the harmonised subset', () => {
    expect(harmonizedChapters().length).toBeGreaterThanOrEqual(8);
    expect(harmonizedChapters().every(c => c.harmonized)).toBe(true);
  });
});

describe('pharmacopoeia corpus — rendered block', () => {
  it('renders matches and always carries the verify caveat', () => {
    const block = buildPharmacopoeiaBlock({ message: 'endotoxin' });
    expect(block).toMatch(/USP <85>/);
    expect(block).toMatch(/Q4B/);
    expect(block).toMatch(/current pharmacopoeia/i);
  });

  it('renders an overview when nothing matches, still with the caveat', () => {
    const block = buildPharmacopoeiaBlock({ message: 'zzzznomatch' });
    expect(block).toMatch(/harmonised/i);
    expect(block).toMatch(/current pharmacopoeia/i);
  });
});

describe('pharmacopoeia corpus — summary', () => {
  it('reports consistent totals', () => {
    const s = pharmacopoeiaSummary();
    expect(s.pharmacopoeias).toBe(PHARMACOPOEIAS.length);
    expect(s.chapters).toBe(PHARMACOPOEIAL_CHAPTERS.length);
    expect(s.harmonizedChapters).toBe(harmonizedChapters().length);
  });
});
