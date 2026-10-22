/**
 * Contract: a section is "complete" on one definition, and the database owns it.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The project vault rendered two different meanings of the same `pct` column in
 * one tree:
 *
 *   document row   pct = c2c_documents.readiness
 *                        = % of that document's sections approved or locked,
 *                          maintained by c2c_recompute_document_readiness()
 *   section leaf   pct = hasContent ? 100 : 0
 *
 * So a section with one sentence typed into it reported **100% complete**,
 * sitting directly beneath a document reporting 0% because nothing had been
 * approved. On a filing checklist that is not a cosmetic inconsistency — it
 * tells a regulatory affairs lead a section is finished when nobody has reviewed
 * a word of it. Same class as the SmartFieldLinking false-completeness defect.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Two things, and the second is the one that lasts:
 *
 *   1. sectionCompletionPct answers 100 only for a status the readiness trigger
 *      also counts, and 0 for everything else including a drafted section.
 *   2. The TypeScript set is READ BACK OUT OF THE MIGRATION. The trigger is the
 *      authority for what "complete" means; a constant restating it in another
 *      language is a copy, and copies of this exact kind of definition drifting
 *      apart is what this whole workstream has been closing. Change the trigger
 *      without changing the constant and this fails.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  C2C_SECTION_COMPLETE_STATUSES,
  countedSectionSql,
  markCountedSections,
  sectionCompletionPct,
} from '../../server/services/c2c/section-content';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');

describe('a section is complete only when the filing says so', () => {
  it('counts approved and locked, and nothing else', () => {
    expect(sectionCompletionPct('approved')).toBe(100);
    expect(sectionCompletionPct('locked')).toBe(100);
  });

  it('a drafted section is NOT complete — this is the whole defect', () => {
    // `hasContent ? 100 : 0` made every one of these report a finished section.
    for (const s of ['drafted', 'draft', 'review', 'in_review', 'todo', 'not_started']) {
      expect(sectionCompletionPct(s), `${s} must not report complete`).toBe(0);
    }
  });

  it('an absent or unrecognised status is 0, never a guess', () => {
    expect(sectionCompletionPct(null)).toBe(0);
    expect(sectionCompletionPct(undefined)).toBe(0);
    expect(sectionCompletionPct('')).toBe(0);
    expect(sectionCompletionPct('APPROVED')).toBe(0); // the store writes lower case
    expect(sectionCompletionPct('something_new')).toBe(0);
  });

  it('never returns an invented middle value', () => {
    // A document's number is a proportion because it has sections to count. A
    // section has no sub-parts, so 40% for "drafted" would be fabricated.
    const seen = new Set(
      ['approved', 'locked', 'drafted', 'review', 'todo', null, undefined].map(sectionCompletionPct),
    );
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 100]);
  });
});

describe('the definition matches the trigger that maintains readiness', () => {
  it('the TypeScript set is exactly the SQL FILTER set', () => {
    const sql = fs.readFileSync(SCHEMA, 'utf8');

    // c2c_recompute_document_readiness():
    //   COUNT(*) FILTER (WHERE s.status IN ('approved','locked'))
    const m = /COUNT\(\*\)\s*FILTER\s*\(\s*WHERE\s+s\.status\s+IN\s*\(([^)]*)\)/i.exec(sql);
    expect(m, 'readiness trigger FILTER clause not found — did the trigger move?').not.toBeNull();

    const fromSql = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    const fromTs = [...C2C_SECTION_COMPLETE_STATUSES].sort();

    expect(fromSql.length).toBeGreaterThan(0);
    // If these ever diverge, the vault's section leaves and the document
    // readiness beside them start disagreeing again — quietly, and in the
    // direction that overstates.
    expect(fromTs).toEqual(fromSql);
  });
});

/* F23 (8/9): readiness counts the sections that hold no other section. The
   rule is written once in SQL (countedSectionSql) and the trigger must carry
   that exact text; the TypeScript twin over rows already read
   (markCountedSections, used by dossier-read) must agree with it. */
describe('readiness counts sections, not headings, on one rule', () => {
  const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

  it('the readiness function carries countedSectionSql(\'s\') verbatim', () => {
    const sql = squash(fs.readFileSync(SCHEMA, 'utf8'));
    const fn = /CREATE OR REPLACE FUNCTION c2c_document_counted_readiness\(p_document_id text\)[\s\S]*?\$\$ LANGUAGE sql STABLE;/.exec(sql);
    expect(fn, 'c2c_document_counted_readiness not found — did the trigger move?').not.toBeNull();
    expect(fn![0]).toContain(squash(countedSectionSql('s')));
    // The trigger and the backfill both go through that one function.
    expect(sql).toMatch(/SET readiness = c2c_document_counted_readiness\(d\.id\), updated_at = now\(\)/);
    // The backfill recounts only documents with sections, and only where the
    // stored value differs; it does not touch updated_at.
    expect(sql).toMatch(/SET readiness = c2c_document_counted_readiness\(d\.id\) WHERE EXISTS \(SELECT 1 FROM c2c_document_sections s WHERE s\.document_id = d\.id\) AND d\.readiness IS DISTINCT FROM c2c_document_counted_readiness\(d\.id\);/);
    expect(sql).toMatch(/ALTER TABLE c2c_documents DISABLE TRIGGER set_updated_at[\s\S]*ALTER TABLE c2c_documents ENABLE TRIGGER set_updated_at/);
    // The trigger fires on what the counted set depends on, and the heading
    // probe has an index.
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OF status, parent_key ON c2c_document_sections/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS c2c_doc_sections_parent_idx ON c2c_document_sections \(document_id, parent_key\);/);
  });

  it('the TypeScript twin marks a heading uncounted and a section counted, per document', () => {
    const rows = markCountedSections([
      { document_id: 'a', section_key: 'M2', parent_key: null, status: 'todo' },
      { document_id: 'a', section_key: '2.5', parent_key: 'M2', status: 'todo' },
      // Another document's child does not make a's 2.5 a heading.
      { document_id: 'b', section_key: '2.5.1', parent_key: '2.5', status: 'todo' },
      // A heading someone has written in is counted (review of F23 8/9).
      { document_id: 'c', section_key: '3.2.S', parent_key: null, status: 'drafted' },
      { document_id: 'c', section_key: '3.2.S.1', parent_key: '3.2.S', status: 'approved' },
    ]);
    expect(rows.map((r) => [r.document_id, r.section_key, r.counted])).toEqual([
      ['a', 'M2', false], ['a', '2.5', true], ['b', '2.5.1', true], ['c', '3.2.S', true], ['c', '3.2.S.1', true],
    ]);
  });

  it('refuses an alias it could not safely place in SQL', () => {
    expect(() => countedSectionSql("s; DROP TABLE x")).toThrow();
    expect(() => countedSectionSql('held')).toThrow();
  });
});
