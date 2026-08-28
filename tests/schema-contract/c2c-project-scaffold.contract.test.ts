/**
 * Contract: creating a project scaffolds a real document from its rule pack.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Nothing in the product created a document. `INSERT INTO c2c_documents` appears
 * four times in the repository, all four inside a one-time backfill migration;
 * there is no Drizzle insert in server/ and no POST route. So every project had
 * an empty Vault, empty workstreams and empty drafts — rendered as "nothing here
 * yet" — while `c2c_rule_packs` sat seeded with 13 packs and 115 ordered
 * sections that nothing read.
 *
 * ── Why this test builds a real database ──────────────────────────────────────
 * The scaffold's correctness lives in constraints, not in control flow:
 *   • a composite FK (doc_type, agency, rule_pack_version) → c2c_rule_packs
 *   • CHECKs on doc_type, agency and status
 *   • a UNIQUE (document_id, section_key)
 *   • a BEFORE UPDATE trigger that RAISES without app.actor_id
 * A mocked pool proves none of that. This applies the REAL migration and runs
 * the REAL service against it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldProjectDocuments } from '../../server/services/c2c/scaffold-project-documents';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');
const PREREQ = path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql');


const ORG = 7;
const PROJECT = '11111111-2222-3333-4444-555555555555';

let pg: PGlite;
/** Adapts PGlite to the PoolClient shape the service consumes. */
const client = () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]) }) as any;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    -- The scaffold records a governed action, which writes a hash-chained
    -- audit_logs row in the SAME transaction. That coupling is correct — a
    -- document appearing with no audit trail is exactly what this codebase has
    -- been removing — so the harness provisions it rather than stubbing it out.
    CREATE TABLE audit_logs (
      id            text PRIMARY KEY,
      tenant_id     integer,
      user_id       integer,
      action        text,
      table_name    text,
      record_id     text,
      actor_id      text,
      target        text,
      target_type   text,
      target_id     text,
      reason        text,
      payload_hash  text,
      ana_action_id text,
      sha256_chain  text,
      occurred_at   timestamptz DEFAULT now(),
      hmac_seal     text,
      old_values   json,
      new_values   json,
      ip_address   text,
      user_agent   text
    );
    INSERT INTO organizations DEFAULT VALUES;
    INSERT INTO users DEFAULT VALUES;
  `);
  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  await pg.exec(fs.readFileSync(PREREQ, 'utf8'));
  await pg.exec(fs.readFileSync(SCHEMA, 'utf8'));
});
afterEach(async () => { await pg?.close(); });

const run = (over: Partial<Parameters<typeof scaffoldProjectDocuments>[0]> = {}) =>
  scaffoldProjectDocuments({
    client: client(), orgId: ORG, userId: 1, projectId: PROJECT,
    programType: 'ind', primaryAgency: 'FDA', productName: 'BX-204',
    ...over,
  });

describe('the rule packs the scaffold reads are actually seeded', () => {
  it('ships 13 packs and 115 sections', async () => {
    const packs = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM c2c_rule_packs`);
    expect(Number(packs.rows[0].n)).toBe(13);
    const secs = await pg.query<{ n: number }>(
      `SELECT sum(jsonb_array_length(required_sections))::int AS n FROM c2c_rule_packs`,
    );
    expect(Number(secs.rows[0].n)).toBe(115);
  }, 60_000);
});

describe('scaffolding an IND', () => {
  it('creates one document bound to a real rule pack', async () => {
    const r = await run();
    expect(r.skipped).toBeUndefined();
    expect(r.documentId).toMatch(/^doc_[0-9a-f]{32}$/);

    const doc = await pg.query<any>(`SELECT * FROM c2c_documents WHERE id = $1`, [r.documentId!]);
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0].org_id).toBe(ORG);
    expect(doc.rows[0].project_id).toBe(PROJECT);
    expect(doc.rows[0].doc_type).toBe('ind');
    expect(doc.rows[0].agency).toBe('fda');
    expect(doc.rows[0].status).toBe('draft');
    expect(doc.rows[0].readiness).toBe(0);
  }, 60_000);

  it('writes the pack\'s full section outline — 24 for ind/fda', async () => {
    const r = await run();
    expect(r.sectionCount).toBe(24);
    const n = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM c2c_document_sections WHERE document_id = $1`, [r.documentId!],
    );
    expect(Number(n.rows[0].n)).toBe(24);
  }, 60_000);

  it('every section is honestly empty — nothing is claimed drafted', async () => {
    const r = await run();
    const rows = await pg.query<any>(
      `SELECT status, content, draft_source, version FROM c2c_document_sections WHERE document_id = $1`,
      [r.documentId!],
    );
    for (const s of rows.rows) {
      expect(s.status).toBe('todo');
      expect(s.content).toEqual({});
      expect(s.draft_source).toBe('template'); // distinguishable from authored, forever
      expect(s.version).toBe(1);
    }
  }, 60_000);

  it('preserves the pack\'s ordering and hierarchy', async () => {
    const r = await run();
    const rows = await pg.query<any>(
      `SELECT section_key, path_order FROM c2c_document_sections
        WHERE document_id = $1 ORDER BY path_order`, [r.documentId!],
    );
    const orders = rows.rows.map((x: any) => x.path_order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders); // already ordered
    const parents = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM c2c_document_sections
        WHERE document_id = $1 AND parent_key IS NOT NULL`, [r.documentId!],
    );
    expect(Number(parents.rows[0].n)).toBeGreaterThan(0); // hierarchy survived
  }, 60_000);
});

describe('it fails closed rather than guessing', () => {
  /*
   * `ide` and `anda` used to be in this list. They are not any more, and the
   * distinction is the point of the list.
   *
   * They were unmapped for a fixable reason — no doc_type CHECK value and no
   * seeded pack — which migrations/20260806b supplies. The three that remain are
   * unmapped for an UNfixable one: none of them names a pathway. "device" could
   * be a 510(k), a De Novo, a PMA or an IDE; "ivd" and "biologic" are product
   * classes, not submissions. There is no outline to write for them because
   * there is no single submission they denote, and guessing one files a
   * customer's product down the wrong pathway. That is a question for the wizard
   * to ask, not a gap in PROGRAM_TO_DOC_TYPE.
   *
   * So this list is now closed rather than merely incomplete, and shrinking it
   * further means answering that product question first.
   */
  it.each(['ivd', 'device', 'biologic'])(
    'skips %s — the wizard accepts it but it names no pathway', async (programType) => {
      const r = await run({ programType });
      expect(r.skipped).toBe('UNMAPPED_PROGRAM_TYPE');
      expect(r.documentId).toBeNull();
      expect(r.detail).toContain(programType);
      const n = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM c2c_documents`);
      expect(Number(n.rows[0].n)).toBe(0); // nothing half-written
    }, 60_000);

  it.each(['anda', 'ide'])(
    'skips %s on a database without its pack — mapped is not the same as seeded', async (programType) => {
      // This suite boots the schema migration ONLY, so anda:fda and ide:fda are
      // absent here even though PROGRAM_TO_DOC_TYPE now maps them. That is the
      // interesting state: a mapping without a pack must still decline, because
      // inserting the document anyway would need a rule_pack_version the
      // composite FK cannot satisfy. The failure mode moves from
      // UNMAPPED_PROGRAM_TYPE to NO_RULE_PACK — both fail closed, and neither
      // writes a row.
      const r = await run({ programType });
      expect(r.skipped).toBe('NO_RULE_PACK');
      expect(r.documentId).toBeNull();
      const n = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM c2c_documents`);
      expect(Number(n.rows[0].n)).toBe(0);
    }, 60_000);

  it('skips an agency with no CHECK value instead of violating the constraint', async () => {
    // document-taxonomy.ts emits Swissmedic/ANVISA/CDSCO/HSA — none passes
    // c2c_documents_agency_check. Mapping through it would 23514 at insert.
    const r = await run({ primaryAgency: 'Swissmedic' });
    expect(r.skipped).toBe('UNMAPPED_PROGRAM_TYPE');
    expect(r.documentId).toBeNull();
  }, 60_000);

  /*
   * A mapped agency with no pack must DECLINE, not borrow another country's.
   *
   * AGENCY_FALLBACKS used to be ['ich', 'fda']. No pack exists for hc, nmpa, tga
   * or mfds, so a Health Canada NDS fell through to the FDA pack — and because
   * scaffold-project-documents.ts writes the RESOLVED agency into c2c_documents
   * rather than the project's, the customer got a row asserting `agency: 'fda'`,
   * bound to ich-m4-v2.1, titled "… — NDA × FDA · 505(b)(1) · eCTD M1–M5", with
   * 71 US sections, while their programme said Health Canada.
   *
   * In a Part 11 table that is worse than a wrong outline: the record states the
   * wrong agency. This is the near-neighbour substitution document-class.ts
   * forbids in its own header, and it is why 'fda' was removed from the list.
   *
   * Asserted on Health Canada specifically because it is mapped (AGENCY_TO_CODE
   * has HC and HEALTH_CANADA) — so this is NOT the unmapped-agency case above.
   * It reaches the pack lookup, finds nothing, and must stop there.
   */
  it('a mapped agency with no pack declines instead of borrowing the US one', async () => {
    const r = await run({ primaryAgency: 'Health Canada' });
    expect(r.skipped, 'Health Canada silently received a US pack').toBe('NO_RULE_PACK');
    expect(r.documentId).toBeNull();
    const n = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM c2c_documents`);
    expect(Number(n.rows[0].n), 'a document was written for an agency with no pack').toBe(0);
  }, 60_000);

  it('US filings are untouched — fda is matched directly, never as a fallback', async () => {
    // The control that makes the change above safe to ship. The caller iterates
    // [agency, ...AGENCY_FALLBACKS], so an FDA project matches on the first pass
    // and never consults the fallback list at all. If this breaks, removing
    // 'fda' from the fallbacks broke something it should not have.
    const r = await run({ primaryAgency: 'FDA' });
    expect(r.skipped).toBeUndefined();
    expect(r.documentId).toBeTruthy();
    const doc = await pg.query<{ agency: string }>(
      `SELECT agency FROM c2c_documents WHERE id = $1`, [r.documentId!],
    );
    expect(doc.rows[0].agency).toBe('fda');
  }, 60_000);

  it('never invents a rule_pack_version — the composite FK would reject it', async () => {
    const r = await run();
    const doc = await pg.query<any>(
      `SELECT d.rule_pack_version, p.version FROM c2c_documents d
         JOIN c2c_rule_packs p
           ON p.doc_type = d.doc_type AND p.agency = d.agency AND p.version = d.rule_pack_version
        WHERE d.id = $1`, [r.documentId!],
    );
    expect(doc.rows).toHaveLength(1); // the join proves the FK resolves
  }, 60_000);
});

describe('the scaffold is audited in the same transaction', () => {
  it('writes a hash-chained audit_logs row naming the document', async () => {
    const r = await run();
    const audit = await pg.query<any>(
      `SELECT action, tenant_id, target, reason, sha256_chain FROM audit_logs`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].tenant_id).toBe(ORG);
    expect(audit.rows[0].target).toContain(r.documentId!);
    expect(audit.rows[0].reason).toMatch(/scaffolded from rule pack/i);
    expect(audit.rows[0].sha256_chain).toBeTruthy(); // the chain is real, not null
  }, 60_000);

  it('writes NO audit row when the scaffold skips — nothing happened to record', async () => {
    const r = await run({ programType: 'ivd' });
    expect(r.skipped).toBe('UNMAPPED_PROGRAM_TYPE');
    const audit = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs`);
    expect(Number(audit.rows[0].n)).toBe(0);
  }, 60_000);
});

describe('it is safe to call twice', () => {
  it('does not scaffold a second competing outline', async () => {
    const first = await run();
    expect(first.documentId).toBeTruthy();
    const second = await run();
    expect(second.skipped).toBe('ALREADY_SCAFFOLDED');
    const n = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM c2c_documents`);
    expect(Number(n.rows[0].n)).toBe(1);
  }, 60_000);
});

describe('it never trips the Part 11 attribution trigger', () => {
  it('scaffolds with no app.actor_id set at all', async () => {
    // c2c_snapshot_section_version() is BEFORE UPDATE and RAISES without
    // app.actor_id. An insert-only scaffold must never reach it — that is why
    // the service issues no UPDATE. If someone converts an insert to an upsert
    // with DO UPDATE, this test fails.
    await expect(run()).resolves.toBeDefined();
    const versions = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM c2c_document_section_versions`,
    );
    expect(Number(versions.rows[0].n)).toBe(0); // no version rows == no UPDATE happened
  }, 60_000);

  it('and the trigger really would raise, so the above is not vacuous', async () => {
    const r = await run();
    await expect(
      pg.query(
        `UPDATE c2c_document_sections SET content = '{"paragraphs":["x"]}'::jsonb
          WHERE document_id = $1 AND section_key = (
            SELECT section_key FROM c2c_document_sections WHERE document_id = $1 LIMIT 1)`,
        [r.documentId!],
      ),
    ).rejects.toThrow(/actor_id/i);
  }, 60_000);
});
