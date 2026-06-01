/**
 * Tests for document analysis (server/services/document-analysis.ts):
 * structure parsing, in-document search, and section/clause-level comparison.
 */

import { describe, it, expect, vi } from 'vitest';

// versionDiffService imports the db at module load; the diff logic itself is pure.
vi.mock('../../server/db', () => ({ db: {} }));

import {
  detectHeading,
  parseDocumentStructure,
  searchDocument,
  diffDocumentStructure,
} from '../../server/services/document-analysis';

describe('detectHeading', () => {
  it('detects markdown, decimal, Article/Section, and ALL-CAPS headings', () => {
    expect(detectHeading('## Scope')).toEqual({ level: 2, number: null, title: 'Scope' });
    expect(detectHeading('2.3 Governing Law')).toEqual({ level: 2, number: '2.3', title: 'Governing Law' });
    expect(detectHeading('Section 4 Termination')).toMatchObject({ number: '4', title: 'Termination' });
    expect(detectHeading('STATEMENT OF FACTS')).toEqual({ level: 1, number: null, title: 'STATEMENT OF FACTS' });
  });

  it('does not treat ordinary sentences or list items as headings', () => {
    expect(detectHeading('The party shall indemnify the other party.')).toBeNull();
    expect(detectHeading('1. The party shall pay all fees due.')).toBeNull(); // ends with period
    expect(detectHeading('')).toBeNull();
  });
});

describe('parseDocumentStructure', () => {
  const doc = [
    'Preamble text here.',
    '1 Introduction',
    'This agreement is entered into.',
    '2 Obligations',
    '2.1 Payment',
    'The client shall pay within 30 days.',
    '2.2 Delivery',
    'Goods are delivered ex works. See Table 1 and Figure 1.',
  ].join('\n');

  it('extracts headings, a TOC, and sections with line ranges', () => {
    const s = parseDocumentStructure(doc);
    expect(s.headings.map(h => h.title)).toEqual(['Introduction', 'Obligations', 'Payment', 'Delivery']);
    expect(s.counts.headings).toBe(4);
    expect(s.counts.tables).toBe(1);
    expect(s.counts.figures).toBe(1);
    // Preamble captured as its own section before the first heading.
    expect(s.sections[0].title).toBe('(preamble)');
    // "2.1 Payment" is a level-2 heading.
    expect(s.headings.find(h => h.number === '2.1')?.level).toBe(2);
  });

  it('captures a section’s body text within its line range', () => {
    const s = parseDocumentStructure(doc);
    const payment = s.sections.find(sec => sec.title === 'Payment')!;
    expect(payment.text).toContain('pay within 30 days');
  });
});

describe('searchDocument', () => {
  const doc = [
    '1 Definitions',
    'The Confidential Information includes trade secrets.',
    '2 Term',
    'This Agreement remains in effect for 24 months.',
    'Either party may terminate the Agreement for cause.',
  ].join('\n');

  it('finds literal matches and attributes them to their section', () => {
    const r = searchDocument(doc, 'Agreement');
    expect(r.totalMatches).toBe(2);
    expect(r.matches.map(m => m.line)).toEqual([4, 5]);
    expect(r.matches[0].section).toBe('Term');
  });

  it('supports regex search', () => {
    const r = searchDocument(doc, '\\b\\d+ months\\b', { regex: true });
    expect(r.totalMatches).toBe(1);
    expect(r.matches[0].section).toBe('Term');
  });

  it('is case-insensitive by default and rejects an empty query', () => {
    expect(searchDocument(doc, 'CONFIDENTIAL').totalMatches).toBe(1);
    expect(() => searchDocument(doc, '')).toThrow(/non-empty/);
  });

  it('throws on an invalid regex', () => {
    expect(() => searchDocument(doc, '(', { regex: true })).toThrow(/invalid regex/);
  });
});

describe('diffDocumentStructure', () => {
  const v1 = [
    '1 Scope',
    'This covers widgets.',
    '2 Payment',
    'Net 30 days.',
    '3 Liability',
    'Capped at fees paid.',
  ].join('\n');
  const v2 = [
    '1 Scope',
    'This covers widgets.',          // unchanged
    '2 Payment',
    'Net 45 days after invoice.',     // modified
    '4 Confidentiality',
    'Mutual NDA applies.',            // added
  ].join('\n');                       // "3 Liability" removed

  it('classifies sections as added / removed / modified / unchanged', () => {
    const d = diffDocumentStructure(v1, v2);
    expect(d.summary).toEqual({ added: 1, removed: 1, modified: 1, unchanged: 1 });
    const byTitle = Object.fromEntries(d.sections.map(s => [s.title, s.status]));
    expect(byTitle['Scope']).toBe('unchanged');
    expect(byTitle['Payment']).toBe('modified');
    expect(byTitle['Liability']).toBe('removed');
    expect(byTitle['Confidentiality']).toBe('added');
  });

  it('reports line additions/deletions for a modified section and a whole-document flat diff', () => {
    const d = diffDocumentStructure(v1, v2);
    const payment = d.sections.find(s => s.title === 'Payment')!;
    expect(payment.additions).toBeGreaterThan(0);
    expect(payment.deletions).toBeGreaterThan(0);
    expect(d.flat.additions).toBeGreaterThan(0);
  });

  it('an identical document shows everything unchanged', () => {
    const d = diffDocumentStructure(v1, v1);
    expect(d.summary.modified).toBe(0);
    expect(d.summary.added).toBe(0);
    expect(d.summary.removed).toBe(0);
  });
});
