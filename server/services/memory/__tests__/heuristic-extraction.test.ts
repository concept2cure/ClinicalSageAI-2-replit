import { describe, it, expect } from 'vitest';
import {
  extractMemoryEntriesFromText,
  extractProjectMemoryEntries,
} from '../heuristic-extraction';

const cat = (entries: { category: string }[]) => entries.map(e => e.category);

describe('extractMemoryEntriesFromText (client heuristics)', () => {
  it('always emits a document-ingestion summary entry, even for empty text', () => {
    const out = extractMemoryEntriesFromText('', 'empty.txt', 'Acme Bio');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      category: 'history',
      subcategory: 'document_ingestion',
      title: 'Ingested: empty.txt',
      confidenceScore: 1.0,
      importanceLevel: 'low',
    });
  });

  it('extracts mission, therapeutic area, and regulatory pathway signals', () => {
    const text =
      'Our mission is to cure rare disease through gene therapy. ' +
      'We are preparing an IND and a future BLA submission.';
    const out = extractMemoryEntriesFromText(text, 'overview.pdf', 'Acme Bio');
    const cats = cat(out);
    expect(cats).toContain('persona'); // mission/vision
    expect(cats).toContain('pipeline'); // therapeutic areas (rare disease / gene therapy)
    expect(cats).toContain('regulatory'); // IND / BLA pathways
    expect(cats).toContain('history'); // always-present summary

    const reg = out.find(e => e.category === 'regulatory');
    expect(reg?.content).toMatch(/IND/);
    expect(reg?.content).toMatch(/BLA/);
  });

  it('extracts compound identifiers and clinical phases', () => {
    const out = extractMemoryEntriesFromText(
      'Lead asset ABC-1234 is in Phase II development.',
      'pipeline.pdf',
      'Acme Bio',
    );
    const cats = cat(out);
    expect(cats).toContain('pipeline'); // compound_identifiers
    expect(cats).toContain('clinical'); // development_phases
    expect(out.find(e => e.subcategory === 'compound_identifiers')?.content).toMatch(/ABC-1234/);
  });

  it('names every entry with the profile name', () => {
    // The mission capture requires >=20 chars after the keyword, so give it a full sentence.
    const out = extractMemoryEntriesFromText(
      'mission: to help patients live longer and healthier lives',
      'x.pdf',
      'Concept2Cure',
    );
    const persona = out.find(e => e.category === 'persona');
    expect(persona).toBeDefined();
    expect(persona?.title).toContain('Concept2Cure');
  });
});

describe('extractProjectMemoryEntries (project heuristics)', () => {
  it('always emits a document-ingestion summary entry', () => {
    const out = extractProjectMemoryEntries('', 'empty.txt', 'Study 001');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      subcategory: 'document_ingestion',
      confidenceScore: 1.0,
      importanceLevel: 'low',
    });
    expect(out[0].content).toContain('Study 001');
  });

  it('extracts endpoints, population, design, risk, CMC and agency-feedback signals', () => {
    const text =
      'The primary endpoint is overall survival. The patient population includes adults with NSCLC. ' +
      'This is a randomized, double-blind, placebo-controlled study. ' +
      'Key risks include hepatotoxicity and neutropenia. ' +
      'Drug substance and drug product stability were assessed under GMP. ' +
      'FDA recommended an additional pharmacokinetic cohort.';
    const out = extractProjectMemoryEntries(text, 'protocol.pdf', 'Study 001');
    const cats = cat(out);
    expect(cats).toEqual(
      expect.arrayContaining(['endpoint', 'clinical', 'strategy', 'risk', 'manufacturing', 'decision', 'strategy']),
    );
    // agency feedback is the highest-severity signal
    expect(out.find(e => e.category === 'decision')?.importanceLevel).toBe('critical');
  });

  it('requires at least two CMC signals before emitting a CMC entry', () => {
    const one = extractProjectMemoryEntries('Only formulation is mentioned.', 'x.pdf', 'S1');
    expect(cat(one)).not.toContain('manufacturing');
    const two = extractProjectMemoryEntries('formulation and stability were assessed', 'x.pdf', 'S1');
    expect(cat(two)).toContain('manufacturing');
  });
});
