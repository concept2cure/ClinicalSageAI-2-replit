/**
 * IVD knowledge base — corpus invariants + service behavior.
 */

import { describe, it, expect } from 'vitest';
import { IVD_KNOWLEDGE_BASE, isKnowledgeDomain } from '../index';
import {
  search,
  getEntry,
  getRelated,
  listEntries,
  listEntriesPaged,
  searchPaged,
  listDomains,
  listTopics,
  corpusSize,
} from '../knowledge.service';

describe('corpus structural invariants', () => {
  it('has a substantial, growing corpus', () => {
    expect(corpusSize()).toBeGreaterThanOrEqual(40);
  });

  it('every entry has stable id, required fields, and at least one citation', () => {
    for (const e of IVD_KNOWLEDGE_BASE) {
      expect(e.id, `id on ${e.title}`).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);
      expect(isKnowledgeDomain(e.domain)).toBe(true);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.summary.length).toBeGreaterThan(0);
      expect(e.detail.length, `detail depth on ${e.id}`).toBeGreaterThan(200);
      expect(e.keyPoints.length, `keyPoints on ${e.id}`).toBeGreaterThan(0);
      expect(e.jurisdictions.length, `jurisdictions on ${e.id}`).toBeGreaterThan(0);
      expect(e.citations.length, `citations on ${e.id}`).toBeGreaterThan(0);
      expect(e.tags.length, `tags on ${e.id}`).toBeGreaterThan(0);
      for (const c of e.citations) {
        expect(c.label.length).toBeGreaterThan(0);
        expect(c.source.length).toBeGreaterThan(0);
      }
    }
  });

  it('entry ids are unique', () => {
    const ids = IVD_KNOWLEDGE_BASE.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every related reference resolves to a real entry (no dangling links)', () => {
    const ids = new Set(IVD_KNOWLEDGE_BASE.map(e => e.id));
    for (const e of IVD_KNOWLEDGE_BASE) {
      for (const r of e.related ?? []) {
        expect(ids.has(r), `${e.id} → related "${r}" must exist`).toBe(true);
      }
    }
  });

  it('covers all four domains', () => {
    const domains = new Set(IVD_KNOWLEDGE_BASE.map(e => e.domain));
    expect(domains).toEqual(new Set(['regulatory', 'scientific', 'legal', 'standard']));
  });
});

describe('search', () => {
  it('finds the IVDR Annex VIII classification entry', () => {
    const r = search('annex viii classification class D');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].entry.id).toBe('eu.ivdr.classification-rules');
  });

  it('finds the LDT entry by topical query', () => {
    const r = search('laboratory developed test enforcement discretion');
    expect(r.some(x => x.entry.id === 'legal.ivd.ldt-rule')).toBe(true);
  });

  it('finds detection-capability for LoD/LoB/LoQ', () => {
    const r = search('limit of detection LoB LoQ');
    expect(r.some(x => x.entry.id === 'sci.ivd.detection-capability')).toBe(true);
  });

  it('respects the domain filter', () => {
    const r = search('performance', { domain: 'legal' });
    expect(r.every(x => x.entry.domain === 'legal')).toBe(true);
  });

  it('respects the jurisdiction filter', () => {
    const r = search('classification', { jurisdiction: 'US' });
    expect(r.every(x => x.entry.jurisdictions.includes('US'))).toBe(true);
  });

  it('honors the limit', () => {
    const r = search('ivd', { limit: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
  });

  it('ranks title/tag matches above detail-only matches', () => {
    const r = search('reimbursement');
    expect(r[0].entry.id).toBe('legal.ivd.reimbursement');
  });
});

describe('pagination', () => {
  it('listEntriesPaged returns total + window and is stable across offsets', () => {
    const p0 = listEntriesPaged({ limit: 10, offset: 0 });
    const p1 = listEntriesPaged({ limit: 10, offset: 10 });
    expect(p0.total).toBe(corpusSize());
    expect(p0.rows).toHaveLength(10);
    expect(p0.limit).toBe(10);
    expect(p0.offset).toBe(0);
    // No overlap between consecutive pages.
    const ids0 = new Set(p0.rows.map(r => r.id));
    expect(p1.rows.some(r => ids0.has(r.id))).toBe(false);
  });

  it('listEntriesPaged total reflects filters, not the page size', () => {
    const p = listEntriesPaged({ domain: 'legal', limit: 2, offset: 0 });
    expect(p.rows.length).toBeLessThanOrEqual(2);
    expect(p.total).toBeGreaterThan(2);
    expect(p.rows.every(r => r.domain === 'legal')).toBe(true);
  });

  it('searchPaged total counts all matches; window respects offset/limit', () => {
    const p = searchPaged('ivd', { limit: 5, offset: 0 });
    expect(p.rows.length).toBeLessThanOrEqual(5);
    expect(p.total).toBeGreaterThanOrEqual(p.rows.length);
    const p2 = searchPaged('ivd', { limit: 5, offset: 5 });
    const ids = new Set(p.rows.map(r => r.entry.id));
    expect(p2.rows.some(r => ids.has(r.entry.id))).toBe(false);
  });
});

describe('retrieval helpers', () => {
  it('gets an entry by id and resolves its related entries', () => {
    const e = getEntry('eu.ivdr.transition-timeline');
    expect(e).not.toBeNull();
    const related = getRelated('eu.ivdr.transition-timeline');
    expect(related.length).toBeGreaterThan(0);
    expect(related.every(x => x.id !== 'eu.ivdr.transition-timeline')).toBe(true);
  });

  it('returns null for an unknown id', () => {
    expect(getEntry('nope.nope')).toBeNull();
  });

  it('listEntries filters by topic', () => {
    const rows = listEntries({ topic: 'companion-diagnostics' });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every(r => r.topic === 'companion-diagnostics')).toBe(true);
  });

  it('lists domains and topics', () => {
    expect(listDomains()).toContain('scientific');
    expect(listTopics('scientific')).toContain('analytical-performance');
  });
});
