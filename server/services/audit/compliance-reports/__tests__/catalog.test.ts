/**
 * The compliance-report catalog a client is shown (GET /api/audit/reports).
 *
 * Each entry is a promise to an inspector: what the report answers, the clauses
 * it is evidence for, the sections it carries and — stated, never implied — what
 * the platform does not record. An entry without any of those is a report
 * nobody can rely on.
 */
import { describe, expect, it } from 'vitest';

import {
  COMPLIANCE_REPORT_CATALOG,
  FULL_AUDIT_TRAIL_ID,
  findReport,
  reportSummaries,
} from '../catalog';

const ORDER = [
  'access-review',
  'authentication-events',
  'administrative-changes',
  'electronic-signatures',
  'audit-trail-integrity',
  'retention-legal-holds',
  'controlled-documents',
  'audit-trail',
];

describe('the compliance-report catalog', () => {
  it('lists the eight reports in catalog order, each id once', () => {
    const ids = COMPLIANCE_REPORT_CATALOG.map((r) => r.id);
    expect(ids).toEqual(ORDER);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ORDER)('%s has a title, a one-sentence purpose, a basis, sections and what is not recorded', (id) => {
    const r = findReport(id)!;
    expect(r.title.length).toBeGreaterThan(3);
    expect(r.purpose).toMatch(/\.$/);
    expect(r.purpose).not.toContain('!');
    expect(r.basis.length).toBeGreaterThan(0);
    expect(r.sections.length).toBeGreaterThan(0);
    expect(r.notRecorded.length).toBeGreaterThan(0);
    expect(['range', 'as-of']).toContain(r.period);
    const keys = r.sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(ORDER.filter((id) => id !== FULL_AUDIT_TRAIL_ID))('%s is run here, and every section names its columns once', (id) => {
    const r = findReport(id)!;
    expect(typeof r.run).toBe('function');
    expect(r.endpoint).toBeUndefined();
    for (const s of r.sections) {
      expect(s.columns.length).toBeGreaterThan(0);
      const cols = s.columns.map((c) => c.key);
      expect(new Set(cols).size).toBe(cols.length);
      for (const c of s.columns) expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('the full audit trail is an entry only: its run is the existing signed export', () => {
    const r = findReport(FULL_AUDIT_TRAIL_ID)!;
    expect(r.endpoint).toBe('/api/audit/export/signed');
    expect(r.period).toBe('range');
    expect(r.run).toBeUndefined();
  });

  it('states the periods the brief fixes', () => {
    expect(findReport('access-review')!.period).toBe('as-of');
    expect(findReport('controlled-documents')!.period).toBe('as-of');
    for (const id of ['authentication-events', 'administrative-changes', 'electronic-signatures', 'audit-trail-integrity', 'retention-legal-holds']) {
      expect(findReport(id)!.period).toBe('range');
    }
  });

  it('an unknown id is not a report', () => {
    expect(findReport('nope')).toBeUndefined();
    expect(findReport('__proto__')).toBeUndefined();
    expect(findReport('constructor')).toBeUndefined();
  });

  it('the summary a client receives carries the contract fields and nothing executable', () => {
    const summaries = reportSummaries();
    expect(summaries.map((s) => s.id)).toEqual(ORDER);
    for (const s of summaries) {
      const keys = Object.keys(s).sort();
      const expected = ['basis', 'id', 'notRecorded', 'period', 'purpose', 'sections', 'title'];
      expect(keys).toEqual(s.id === FULL_AUDIT_TRAIL_ID ? [...expected, 'endpoint'].sort() : expected);
      for (const section of s.sections) expect(Object.keys(section).sort()).toEqual(['key', 'title']);
    }
    expect(() => JSON.stringify(summaries)).not.toThrow();
  });

  it('copy is calm: no exclamation marks and no route names in what a reader sees', () => {
    for (const r of COMPLIANCE_REPORT_CATALOG) {
      const visible = [r.title, r.purpose, ...r.notRecorded, ...r.sections.map((s) => s.title)];
      for (const text of visible) {
        expect(text).not.toContain('!');
        expect(text).not.toMatch(/\/api\//);
      }
    }
  });
});
