/**
 * Contract: a rule pack must carry a real outline, not a five-row placeholder.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `migrations/20260529_phase9_backfill.sql` seeded nda, bla, maa, jnda and
 * denovo as five top-level rows apiece, and said so: "These are stripped-down
 * summaries; the full outlines will be updated in a later kit." The later kit
 * did not arrive. Biotech's pathways are IND · BLA · MAA · J-NDA, so four of the
 * segment's five filing types resolved to a five-node dossier — and the machine
 * around them worked perfectly. scaffoldProjectDocuments() inserted the five
 * rows, the Vault tree rendered them, `GET /api/c2c/documents/:id/outline`
 * served them, and every readiness rollup counted them. A customer opening the
 * BLA they are betting the company on saw five empty folders and no error.
 *
 * That is the failure mode this file exists to make impossible: not a crash, but
 * a pipeline that succeeds end-to-end while carrying almost nothing. Counting
 * rows cannot detect it. Only asserting the SHAPE of the outline can.
 *
 * ── What is asserted, and what deliberately is not ────────────────────────────
 *   • every five-module CTD dossier pack (ind, nda, bla, maa, jnda) carries all
 *     of M1-M5 with at least one section under each, so a bare-module stub —
 *     whole or half — cannot be merged without failing here;
 *   • parent keys resolve and no pack is empty;
 *   • scaffolding a BLA writes the whole nested tree, through the real service;
 *   • the rule is falsifiable — booted without the outlines migration, the two
 *     tests that matter fail, which is what stops the rest from being a
 *     tautology dressed as a guarantee.
 *
 * There is NO blanket "a pack must have N sections" or "a pack must be nested"
 * rule, because both punish correct data: mod3:ich is four top-level sections
 * and complete; a CER's A0-A8 and Module 2's summaries have no hierarchy to
 * express. Shallow is not hollow, and a threshold tuned until it went green
 * would be fitted to today's rows rather than to the defect. cta:ema is thin
 * and is recorded as such below rather than quietly exempted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldProjectDocuments } from '../../server/services/c2c/scaffold-project-documents';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREREQ = path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');
const OUTLINES = path.join(REPO_ROOT, 'migrations/20260804_phase9_rule_pack_outlines.sql');

const ORG = 7;
const PROJECT = '11111111-2222-3333-4444-555555555555';

/** Biotech's marketing pathways. IND is covered by the CTD dossier assertion. */
const BIOTECH_PATHWAYS = ['bla', 'maa', 'jnda'] as const;

let pg: PGlite;
const client = () => ({ query: (sql: string, p?: unknown[]) => pg.query(sql, p as any[]) }) as any;

/** Provision the schema. `withOutlines: false` is the pre-fix world. */
async function boot(withOutlines = true) {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE audit_logs (
      id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
      table_name text, record_id text, actor_id text, target text,
      target_type text, target_id text, reason text, payload_hash text,
      ana_action_id text, sha256_chain text,
      occurred_at timestamptz DEFAULT now(), hmac_seal text
    );
    INSERT INTO organizations DEFAULT VALUES;
    INSERT INTO users DEFAULT VALUES;
  `);
  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  await pg.exec(fs.readFileSync(PREREQ, 'utf8'));
  await pg.exec(fs.readFileSync(SCHEMA, 'utf8'));
  if (withOutlines) await pg.exec(fs.readFileSync(OUTLINES, 'utf8'));
}

const scaffold = (programType: string, primaryAgency: string) =>
  scaffoldProjectDocuments({
    client: client(), orgId: ORG, userId: 1, projectId: PROJECT,
    programType, primaryAgency, productName: 'BX-301',
  } as Parameters<typeof scaffoldProjectDocuments>[0]);

afterEach(async () => { await pg?.close(); });

describe('no live rule pack is a stub', () => {
  beforeEach(() => boot());

  // There is deliberately NO universal "a pack must have more than N sections"
  // rule here, because there is no honest one. mod3:ich is four sections
  // (3.2.S / 3.2.P / 3.2.A / 3.2.R) and that is the complete top-level outline
  // for Module 3 — a count threshold would fail it for being correct. Shallow
  // and hollow are different things, and only the dossier rule below can tell
  // them apart. A count rule tuned until it passed would be a rule fitted to
  // today's data rather than to the defect.
  it('no pack is empty', async () => {
    const rows = await pg.query<{ doc_type: string; agency: string; n: number }>(
      `SELECT doc_type, agency, jsonb_array_length(required_sections)::int AS n
         FROM c2c_rule_packs WHERE superseded_by IS NULL ORDER BY doc_type, agency`,
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    const empty = rows.rows.filter((r) => Number(r.n) === 0).map((r) => `${r.doc_type}:${r.agency}`);
    expect(empty).toEqual([]);
  }, 60_000);

  // A flat outline is NOT a defect. Module 2's summaries, a CER's A0-A8 and a
  // PSUR's numbered parts have no hierarchy to express, and demanding nesting
  // from them would be a rule that punishes correct data. Nesting is only
  // diagnostic for the multi-module dossiers, where a bare M1-M5 with nothing
  // beneath it is precisely the placeholder shape this file exists to reject.
  it('every full CTD dossier pack carries all five modules, with content beneath them', async () => {
    // `cta` is deliberately absent. An EU clinical trial application under
    // CTR 536/2014 is a Part I / Part II submission built around an IMPD, not a
    // five-module CTD, so demanding M1-M5 of it would be asserting the wrong
    // shape. It is covered by its own test below.
    const rows = await pg.query<{ doc_type: string; agency: string; required_sections: any[] }>(
      `SELECT doc_type, agency, required_sections FROM c2c_rule_packs
        WHERE superseded_by IS NULL AND doc_type IN ('ind','nda','bla','maa','jnda')`,
    );
    expect(rows.rows.length).toBeGreaterThan(0); // the query itself must not go silently empty

    for (const r of rows.rows) {
      const at = `${r.doc_type}:${r.agency}`;
      const roots = r.required_sections.filter((s: any) => s.parent_key === null).map((s: any) => s.key);
      expect(roots, `${at} is missing modules`).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);

      // Per-module rather than a total count. A threshold on the total is a
      // magic number that has to be re-tuned every time a pack changes, and it
      // passes a half-filled pack — M1 fleshed out, M2-M5 left bare — which is
      // the stub defect wearing a bigger number. "Every module has at least one
      // section under it" is the structural property, and it needs no constant.
      const bare = roots.filter(
        (m: string) => !r.required_sections.some((s: any) => s.parent_key === m),
      );
      expect(bare, `${at} has modules with nothing under them`).toEqual([]);
    }
  }, 60_000);

  it('every parent_key resolves inside its own pack', async () => {
    const rows = await pg.query<{ doc_type: string; required_sections: any[] }>(
      `SELECT doc_type, required_sections FROM c2c_rule_packs WHERE superseded_by IS NULL`,
    );
    for (const r of rows.rows) {
      const keys = new Set(r.required_sections.map((s: any) => s.key));
      const orphans = r.required_sections
        .filter((s: any) => s.parent_key !== null && !keys.has(s.parent_key))
        .map((s: any) => `${r.doc_type}/${s.key}→${s.parent_key}`);
      expect(orphans).toEqual([]);
    }
  }, 60_000);

  // Recorded rather than skipped. cta:ema ships M1 plus a bare M2 and nothing
  // else — thin by any reading. It is NOT fixed in the outlines migration
  // because doing it properly means modelling CTR 536/2014's Part I / Part II
  // and the IMPD, which is a different shape from the CTD packs and not
  // something to improvise alongside them. Asserting the gap keeps it from
  // going quiet: this test fails when someone gives cta a real outline, and the
  // fix is to promote it into the dossier list above rather than delete it here.
  it('records cta:ema as a known-thin pack awaiting a CTR 536/2014 outline', async () => {
    const r = await pg.query<{ required_sections: any[] }>(
      `SELECT required_sections FROM c2c_rule_packs
        WHERE doc_type = 'cta' AND agency = 'ema' AND superseded_by IS NULL`,
    );
    if (r.rows.length === 0) return; // pack removed entirely — not this test's business
    const roots = r.rows[0].required_sections.filter((s: any) => s.parent_key === null);
    expect(
      roots.length,
      'cta:ema now has more than two top-level parts — give it a real outline and move it ' +
        'into the CTD dossier assertion above (or its own CTR-shaped one)',
    ).toBe(2);
  }, 60_000);

  it('covers all three biotech marketing pathways', async () => {
    for (const dt of BIOTECH_PATHWAYS) {
      const r = await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM c2c_rule_packs
          WHERE doc_type = $1 AND superseded_by IS NULL`, [dt],
      );
      expect(Number(r.rows[0].n), `no live rule pack for ${dt}`).toBeGreaterThan(0);
    }
  }, 60_000);
});

describe('scaffolding a BLA', () => {
  beforeEach(() => boot());

  it('writes the full nested outline, not five empty modules', async () => {
    const r = await scaffold('bla', 'FDA');
    expect(r.skipped).toBeUndefined();
    expect(r.sectionCount).toBe(71);

    const rows = await pg.query<{ section_key: string; parent_key: string | null }>(
      `SELECT section_key, parent_key FROM c2c_document_sections
        WHERE document_id = $1 ORDER BY path_order`, [r.documentId!],
    );
    const roots = rows.rows.filter((s) => s.parent_key === null);
    expect(roots.map((s) => s.section_key)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    expect(rows.rows.length - roots.length).toBe(66); // the part the stub was missing
  }, 60_000);

  it('carries the sections a biologics reviewer looks for', async () => {
    const r = await scaffold('bla', 'FDA');
    const keys = (await pg.query<{ section_key: string }>(
      `SELECT section_key FROM c2c_document_sections WHERE document_id = $1`, [r.documentId!],
    )).rows.map((s) => s.section_key);

    // Not an exhaustive regulatory checklist — a spot-check that the depth is
    // real content and not padding: adventitious agents (3.2.A.2) is the
    // biologic-specific appendix, and ISS/ISE (5.3.5.3) is where a BLA lives
    // or dies. Both sit two levels below the module, so both prove the nesting.
    for (const key of ['3.2.S.2', '3.2.P.8', '3.2.A.2', '5.3.5.3', '1.14.1']) {
      expect(keys, `BLA outline is missing ${key}`).toContain(key);
    }
  }, 60_000);

  it('binds the document to the version it was actually built from', async () => {
    const r = await scaffold('bla', 'FDA');
    const doc = await pg.query<{ rule_pack_version: string }>(
      `SELECT rule_pack_version FROM c2c_documents WHERE id = $1`, [r.documentId!],
    );
    // The composite FK guarantees this row exists; what matters for Part 11 is
    // that it names the NEW version, so the audit trail points at the outline
    // the document was really scaffolded from.
    expect(doc.rows[0].rule_pack_version).toBe('ich-m4-v2.1');
  }, 60_000);
});

describe('the guard is falsifiable', () => {
  it('without the outlines migration the same BLA scaffold declines', async () => {
    await boot(false);
    const r = await scaffold('bla', 'FDA');
    // 20260528 seeds 13 packs, none of them BLA. The service fails closed rather
    // than filing the wrong document class — correct, and useless to a customer.
    // This is the state the outlines migration exists to leave behind, and its
    // presence here is what stops the tests above from being self-satisfied.
    expect(r.skipped).toBeTruthy();
    expect(r.sectionCount ?? 0).toBe(0);
  }, 60_000);
});
