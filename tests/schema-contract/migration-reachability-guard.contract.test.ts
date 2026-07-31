/**
 * The reachability guard's own parsing contract (ledger C-35).
 *
 * `scripts/ci/check-migration-reachability.mjs` (C-32) is the thing standing
 * between this codebase and another round of "merged, green, and never applied".
 * A guard is only worth its report, so its two regexes — what a migration
 * CREATES, and what server code REFERENCES — need pinning as tightly as the code
 * they police. C-35 exists because they were wrong in two ways at once, and the
 * guard reported green over both:
 *
 *   1. SCHEMA-QUALIFIED NAMES captured the SCHEMA, not the table.
 *      `CREATE TABLE regulatory.submissions` registered a table called
 *      "regulatory"; `FROM predicate.fda_510k_clearances` registered a reference
 *      to "predicate". Both sides agreed, so nothing looked broken — while the
 *      ~337 schema-qualified tables in this repo went entirely unchecked. Fixing
 *      it immediately surfaced five real findings (the predicate.* / precedent.*
 *      tables behind the live precedent-engine.ts) that had been invisible.
 *
 *   2. COMMENTS AND PROSE were parsed as SQL. A migration header reading
 *      `-- (CREATE TABLE IF NOT EXISTS only)` registered a table named "only",
 *      and an English sentence in a .ts prompt string ("Update only the …")
 *      registered a matching reference. Beyond the phantom, this is the dangerous
 *      direction: a merely *described* or commented-out CREATE TABLE counted as a
 *      durable creator, which would MASK a genuinely missing one.
 *
 * These cases run the guard's real exported helpers against known input, so the
 * parsing cannot regress without a red test.
 */
import { describe, it, expect } from 'vitest';
import { tablesIn, qualify, NOT_A_RELATION, sqlishSegments } from '../../scripts/ci/check-migration-reachability.mjs';

describe('C-35: table identity is schema-aware', () => {
  it('normalizes public and unqualified names to the same identity', () => {
    // `public.foo` and `foo` are the same relation; treating them as two would
    // report a table as uncreated while its creator sits right there.
    expect(qualify('public', 'foo')).toBe('foo');
    expect(qualify(undefined, 'foo')).toBe('foo');
    expect(qualify('', 'foo')).toBe('foo');
    expect(qualify('PUBLIC', 'FOO')).toBe('foo');
  });

  it('keeps a non-public schema, so same-named tables never collide', () => {
    // predicate.runs and precedent.runs are different tables; collapsing them to
    // "runs" would let one silently satisfy a reference to the other.
    expect(qualify('predicate', 'runs')).toBe('predicate.runs');
    expect(qualify('precedent', 'runs')).toBe('precedent.runs');
    expect(qualify('predicate', 'runs')).not.toBe(qualify('precedent', 'runs'));
  });
});

describe('C-35: CREATE parsing captures the table, not the schema', () => {
  it('reads schema-qualified CREATE TABLE correctly', () => {
    const found = tablesIn(`
      CREATE TABLE regulatory.submissions (id serial);
      CREATE TABLE IF NOT EXISTS predicate.fda_510k_clearances (id serial);
    `);
    expect(found.has('regulatory.submissions')).toBe(true);
    expect(found.has('predicate.fda_510k_clearances')).toBe(true);
    // The bug: the schema name registered as a table.
    expect(found.has('regulatory')).toBe(false);
    expect(found.has('predicate')).toBe(false);
  });

  it('handles unqualified, public-qualified, quoted and IF NOT EXISTS forms', () => {
    const found = tablesIn(`
      CREATE TABLE bar (id serial);
      CREATE TABLE public.baz (id serial);
      CREATE TABLE IF NOT EXISTS "quoted_tbl" (id serial);
      CREATE TABLE "ai"."document_embeddings" (id serial);
      CREATE UNLOGGED TABLE scratch (id serial);
      CREATE MATERIALIZED VIEW mv_thing AS SELECT 1;
    `);
    for (const t of ['bar', 'baz', 'quoted_tbl', 'ai.document_embeddings', 'scratch', 'mv_thing']) {
      expect(found.has(t), `missing ${t}`).toBe(true);
    }
  });

  it('does NOT treat DDL inside comments as a creator', () => {
    // The masking case: a described or commented-out CREATE TABLE must never
    // count as provisioning, or a real missing creator hides behind prose.
    const found = tablesIn(`
      -- (CREATE TABLE IF NOT EXISTS only) — same convention as the c2c_* family
      /* CREATE TABLE commented_out_tbl (id serial); */
      CREATE TABLE real_tbl (id serial);
    `);
    expect(found.has('real_tbl')).toBe(true);
    expect(found.has('only')).toBe(false);
    expect(found.has('commented_out_tbl')).toBe(false);
  });
});

describe('C-39: the reference scan reads SQL, not English', () => {
  it('ignores prose that merely contains the word FROM', () => {
    // These are real strings from the codebase. Scanning raw file text registered
    // a table called `studies` from both — a keyword blocklist cannot fix that,
    // because `studies` is a perfectly plausible table name.
    const prose = `
      const guidance = 'Summary of new nonclinical safety findings from studies completed during the reporting period.';
      const label = "FDA Guidance: Statistical Guidance on Reporting Results from Studies Evaluating Diagnostic Tests";
      // Update only the sections that changed.
    `;
    expect(sqlishSegments(prose)).toEqual([]);
  });

  it('still captures genuine queries in every quoting style', () => {
    const code = [
      'const a = `SELECT id FROM authoring_documents WHERE tenant_id = $1`;',
      "const b = 'SELECT sections FROM templates WHERE id = $1';",
      'const c = `INSERT INTO doc_checklist (doc_id) VALUES ($1)`;',
      'const d = `UPDATE cer_jobs SET status=$1 WHERE job_id=$2`;',
    ].join('\n');
    const segs = sqlishSegments(code);
    expect(segs).toHaveLength(4);
    const joined = segs.join(' | ');
    for (const t of ['authoring_documents', 'templates', 'doc_checklist', 'cer_jobs']) {
      expect(joined, `lost the query referencing ${t}`).toContain(t);
    }
  });
});

describe('C-35: the reference scan ignores non-relations', () => {
  it('excludes SQL keywords and prose words that follow FROM/UPDATE', () => {
    // The reference scan reads whole .ts files, so it meets English sentences in
    // comments and prompt strings. `FROM ONLY tbl` is also valid SQL where ONLY
    // is a keyword, not the relation.
    for (const w of ['only', 'lateral', 'unnest', 'select', 'values']) {
      expect(NOT_A_RELATION.has(w), `${w} should be excluded`).toBe(true);
    }
    expect(NOT_A_RELATION.has('authoring_documents')).toBe(false);
  });
});
