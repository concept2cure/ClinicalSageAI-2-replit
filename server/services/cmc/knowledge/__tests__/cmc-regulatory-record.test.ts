/**
 * The cited CMC regulatory record holds together, every lookup finds what the
 * record holds, and the platform's other ICH index agrees with it.
 *
 * A record a regulated client is shown must not contain a requirement that
 * cites nothing, a source with no date, an authority name the lookups cannot
 * resolve, or a note without a citation — and the platform must not carry two
 * answers to "which revision of Q3C is current". These tests are the record's
 * gate; docs/evidence/CMC-M3-GA/2026-10-04/03-cmc-knowledge/ holds its build.
 */
import { describe, expect, it } from 'vitest';
import {
  CMC_AUTHORITIES,
  CMC_RECORD,
  findCmcGuidance,
  findCmcNotes,
  findCmcPathways,
  findCmcRequirements,
  normalizeCtd,
  resolveAuthorities,
} from '../index';
import { ICH_GUIDELINES } from '../../../ana-ri/ich-guideline-corpus';

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const CTD = /^\d(\.\d+)*(\.[SPAR](\.\d+)*)?$/;

describe('the record holds together', () => {
  it('states the day its statuses are established as of, and how it was built', () => {
    expect(CMC_RECORD.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CMC_RECORD.method.length).toBeGreaterThan(200);
  });

  it('every source has an identifier, a title, a known status, a dated adoption and a resolvable authority', () => {
    const ids = new Set<string>();
    for (const s of CMC_RECORD.sources) {
      expect(ids.has(s.id), `duplicate ${s.id}`).toBe(false);
      ids.add(s.id);
      expect(s.code.trim(), s.id).not.toBe('');
      expect(s.title.trim(), s.id).not.toBe('');
      expect(['final', 'draft', 'superseded', 'withdrawn', 'unknown'], s.id).toContain(s.status);
      // A date the research could not establish is said to be undated, and
      // the entry is low confidence; it is never a guess.
      if (s.date === 'undated') expect(s.confidence, `${s.id} undated`).toBe('low');
      else expect(s.date, `${s.id} date`).toMatch(DATE);
      expect(CMC_AUTHORITIES as readonly string[], `${s.id} authority ${s.authority}`).toContain(s.authority);
      for (const c of s.ctdSections) expect(c, `${s.id} ctd`).toMatch(CTD);
    }
  });

  it('every requirement cites at least one source the record holds', () => {
    const ids = new Set(CMC_RECORD.sources.map((s) => s.id));
    for (const r of CMC_RECORD.requirements) {
      expect(r.sourceIds.length, r.id).toBeGreaterThan(0);
      for (const id of r.sourceIds) expect(ids.has(id), `${r.id} cites ${id}`).toBe(true);
      expect(CMC_AUTHORITIES as readonly string[], `${r.id} authority ${r.authority}`).toContain(r.authority);
      for (const c of r.ctdSections) expect(c, `${r.id} ctd`).toMatch(CTD);
    }
  });

  it('every pathway cites a source, and every note cites at least one guideline or article', () => {
    const ids = new Set(CMC_RECORD.sources.map((s) => s.id));
    for (const p of CMC_RECORD.pathways) for (const id of p.sourceIds) expect(ids.has(id), `${p.authority} ${id}`).toBe(true);
    for (const n of CMC_RECORD.notes) expect(n.citations.length, n.id).toBeGreaterThan(0);
  });
});

describe('the lookups find what the record holds', () => {
  it('every source is found by its own code, in the first three results', () => {
    const missed: string[] = [];
    for (const s of CMC_RECORD.sources) {
      const { matches } = findCmcGuidance(s.code, s.authority);
      if (!matches.slice(0, 3).some((m) => m.id === s.id)) missed.push(`${s.authority} ${s.code}`);
    }
    expect(missed).toEqual([]);
  });

  it('a CTD section question finds the requirements at that section, its subsections and the headings above it', () => {
    const { matches } = findCmcRequirements({ ctdSection: '3.2.P.8' }, 500);
    expect(matches.length).toBeGreaterThan(0);
    const related = (c: string) => c === '3.2.P.8' || c.startsWith('3.2.P.8.') || '3.2.P.8'.startsWith(`${c}.`);
    for (const r of matches) expect(r.ctdSections.some(related), r.id).toBe(true);
    // ... and none filed only under a sibling section.
    expect(matches.some((r) => r.ctdSections.every((c) => c.startsWith('3.2.S')))).toBe(false);
  });

  it('an authority word resolves to the record’s names, and an unknown one resolves to nothing', () => {
    expect(resolveAuthorities('Japan')).toEqual(['PMDA', 'MHLW']);
    expect(resolveAuthorities('eu')).toEqual(['EC', 'EMA']);
    expect(resolveAuthorities('Narnia')).toEqual([]);
    expect(resolveAuthorities('')).toBeNull();
  });

  it('a named authority’s requirements come back with the ICH baseline, and nobody else’s', () => {
    const { matches } = findCmcRequirements({ authority: 'FDA' }, 500);
    expect(matches.some((r) => r.authority === 'FDA')).toBe(true);
    for (const r of matches) expect(['FDA', 'ICH'], r.id).toContain(r.authority);
  });

  it('the clinical-trial pathway of each authority that has one is found by authority', () => {
    for (const p of CMC_RECORD.pathways) {
      const found = findCmcPathways(p.authority);
      expect(found.some((f) => f.applicationName === p.applicationName), `${p.authority} ${p.applicationName}`).toBe(true);
    }
  });

  it('every note is found by its own topic', () => {
    for (const n of CMC_RECORD.notes) {
      const { matches } = findCmcNotes(n.topic, {}, 5);
      expect(matches.some((m) => m.id === n.id), n.id).toBe(true);
    }
  });

  it('normalises how people write CTD codes', () => {
    expect(normalizeCtd('m3.2.s.4.1')).toBe('3.2.S.4.1');
    expect(normalizeCtd('3.2.P.8.')).toBe('3.2.P.8');
  });
});

describe('one answer to "which revision is current"', () => {
  /* The ana-ri ICH index (ich-guideline-corpus.ts) predates this record and
     carried no dates. A quality or M-series code it names must be one the
     record holds for ICH, and in a compatible state: listing a revision the
     record says was superseded — Q3C(R8) after Q3C(R9) — is the drift this
     exists to stop. */
  const STATUS_COMPATIBLE: Record<string, string[]> = {
    adopted: ['final'],
    in_revision: ['final', 'draft'],
    draft: ['draft'],
    withdrawn: ['withdrawn', 'superseded'],
  };
  /** The record's entry for a code: the guideline itself, never its Q&A or an addendum. */
  const ichEntry = (code: string) => {
    const ich = CMC_RECORD.sources.filter((s) => s.authority === 'ICH');
    return (
      ich.find((s) => s.code === code) ??
      ich.find((s) => s.code.startsWith(`${code} `) && !/q&a|addendum/i.test(s.code))
    );
  };

  it('every ICH quality and M4/M7 code the ana-ri index names is current in the record', () => {
    const disagreements: string[] = [];
    for (const g of ICH_GUIDELINES.filter((x) => x.category === 'quality' || /^M(4|7)\b/.test(x.code))) {
      const s = ichEntry(g.code);
      if (!s) {
        disagreements.push(`${g.code}: not in the record`);
        continue;
      }
      if (!STATUS_COMPATIBLE[g.status]?.includes(s.status)) {
        disagreements.push(`${g.code}: index says ${g.status}, record says ${s.status} (${s.date})`);
      }
    }
    expect(disagreements).toEqual([]);
  });
});
