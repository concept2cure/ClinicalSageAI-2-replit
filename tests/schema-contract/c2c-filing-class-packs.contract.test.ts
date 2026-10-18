/**
 * Contract: the filing a project is created for is the outline it is built on.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The New project wizard knew application types only, so a Prior Approval
 * Supplement, a CBE, an annual report, an IND amendment, a meeting package, a
 * designation request and a pediatric study plan were each scaffolded as the
 * 73-node NDA dossier, and a clinical study report as the IND. Every one of
 * those filings already had its own outline in the platform
 * (getRegistryDocumentTemplate), and five had a rule pack nobody reached.
 *
 * ── What is held here ─────────────────────────────────────────────────────────
 *   • every filing document class (shared/regulatory/filing-document-classes.ts)
 *     has exactly one live pack after the deploy set runs, and that pack IS the
 *     outline its module derives (server/services/c2c/filing-class-packs.ts) —
 *     node for node, so a canonical outline that changes fails here until a new
 *     version is minted;
 *   • each pack states its provenance and none claims a review;
 *   • the five classes that had a pack supersede exactly that version;
 *   • the set replays: a second deploy over a supplement document is a no-op;
 *   • scaffolding through the real service writes the class's own outline, and
 *     an application still gets its dossier;
 *   • falsifiable: without the migration a supplement scaffolds nothing, and a
 *     row whose tree is not the file's stops the deploy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';
import { scaffoldProjectDocuments } from '../../server/services/c2c/scaffold-project-documents';
import { FILING_DOCUMENT_CLASSES } from '../../shared/regulatory/filing-document-classes';
import {
  FILING_CLASS_PACKS,
  filingClassPackGoverningRule,
  filingClassPackSections,
  filingClassPackUncertainties,
} from '../../server/services/c2c/filing-class-packs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const FILE = 'migrations/20261018_filing_class_rule_packs.sql';

/** The rule-pack files, in the order the applier runs them — never a hand-kept order. */
const PACK_FILES = [
  '20260528_phase9_document_schema.sql',
  '20260804_phase9_rule_pack_outlines.sql',
  '20260806_cta_ema_ctr536_outline.sql',
  '20260806b_anda_ide_filing_types.sql',
  '20260810_pma_fda_814_20_outline.sql',
  '20260810b_eu_mdr_ivdr_outlines.sql',
  '20260810c_rule_pack_provenance.sql',
  '20260810d_rule_pack_review_attribution.sql',
  '20260901_ind_fda_m1_v2_3_outline.sql',
  '20260901b_estar_510k_denovo_outlines.sql',
  '20260902_ind_fda_outline_v2_2_initial_ind_flags.sql',
  '20261005_fda_jnda_m1_outline_v2_2.sql',
  '20261005b_pma_fda_outline_v1_1_software_documentation_level.sql',
  '20261005c_k510_denovo_estar_outline_v1_1.sql',
  '20261018_filing_class_rule_packs.sql',
];
const inSetOrder = (withClasses: boolean) => {
  const files = (C2C_MIGRATION_FILES as string[]).filter((f) => PACK_FILES.some((b) => f.endsWith(`/${b}`)));
  expect(files, 'every rule-pack file is on the applier').toHaveLength(PACK_FILES.length);
  return withClasses ? files : files.filter((f) => !f.endsWith(FILE));
};

const ORG = 7;
const PROJECT = '11111111-2222-3333-4444-555555555555';
let pg: PGlite;
const client = () => ({ query: (sql: string, p?: unknown[]) => pg.query(sql, p as any[]) }) as any;

async function boot(withClasses = true) {
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
      occurred_at timestamptz DEFAULT now(), hmac_seal text,
      old_values json, new_values json, ip_address text, user_agent text
    );
    INSERT INTO organizations DEFAULT VALUES;
    INSERT INTO users DEFAULT VALUES;
  `);
  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  await pg.exec(read('migrations/20260527_mutation_primitives.sql'));
  for (const f of inSetOrder(withClasses)) await pg.exec(read(f));
}

const scaffold = (programType: string, primaryAgency: string) =>
  scaffoldProjectDocuments({
    client: client(), orgId: ORG, userId: 1, projectId: PROJECT,
    programType, primaryAgency, productName: 'BX-301',
  } as Parameters<typeof scaffoldProjectDocuments>[0]);

afterEach(async () => { await pg?.close(); });

describe('every filing document class has its own governed outline', () => {
  beforeEach(() => boot());

  it('every class has a pack spec, and every spec names a class', () => {
    expect(FILING_CLASS_PACKS.map((p) => p.docType).sort())
      .toEqual(FILING_DOCUMENT_CLASSES.map((c) => c.docType).sort());
    for (const c of FILING_DOCUMENT_CLASSES) {
      expect(FILING_CLASS_PACKS.find((p) => p.docType === c.docType)?.agency, c.docType).toBe(c.packAgency);
    }
  });

  it('each live pack is the outline its class derives, node for node, with its provenance', async () => {
    for (const spec of FILING_CLASS_PACKS) {
      const at = `${spec.docType}:${spec.agency}`;
      const { rows } = await pg.query<Record<string, any>>(
        `SELECT version, label, required_sections, source_basis, confidence, review_status, governing_rule, uncertainties
           FROM c2c_rule_packs WHERE doc_type = $1 AND agency = $2 AND superseded_by IS NULL`,
        [spec.docType, spec.agency],
      );
      expect(rows.length, `${at} must have exactly one live pack`).toBe(1);
      const live = rows[0];
      expect(live.version, at).toBe(spec.version);
      expect(live.label, at).toBe(spec.label);
      expect(live.required_sections, `${at} is not the outline its class derives`)
        .toEqual(await filingClassPackSections(spec.docType));
      expect([live.source_basis, live.confidence, live.review_status], at)
        .toEqual([spec.sourceBasis, spec.confidence, 'unreviewed']);
      expect(live.governing_rule, at).toBe(await filingClassPackGoverningRule(spec.docType));
      expect(live.uncertainties, at).toBe(await filingClassPackUncertainties(spec));
    }
  }, 60_000);

  it('every parent_key resolves and every key is unique inside each class pack', async () => {
    for (const spec of FILING_CLASS_PACKS) {
      const secs = await filingClassPackSections(spec.docType);
      const keys = secs.map((s) => s.key);
      expect(new Set(keys).size, spec.docType).toBe(keys.length);
      const orphans = secs.filter((s) => s.parent_key !== null && !keys.includes(s.parent_key)).map((s) => s.key);
      expect(orphans, spec.docType).toEqual([]);
    }
  });

  it('the CSR is ICH E3 to its full depth, not the 8-of-16 stub', async () => {
    const secs = await filingClassPackSections('csr');
    const top = secs.filter((s) => s.parent_key === null).map((s) => s.key);
    expect(top).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
    for (const key of ['9.4.6', '11.4.2.1', '12.2.2', '12.3.1.1', '14.3.1', '16.1.9', '16.2.7']) {
      expect(secs.some((s) => s.key === key), `E3 §${key}`).toBe(true);
    }
    const { rows } = await pg.query<{ superseded_by: string | null }>(
      `SELECT superseded_by FROM c2c_rule_packs WHERE doc_type = 'csr' AND agency = 'ich' AND version = 'ich-m4-v2.0'`,
    );
    expect(rows[0]?.superseded_by).toBe('ich-e3-v1.0');
  });

  it('a supplement carries its own parts, not the NDA dossier', async () => {
    const pas = await filingClassPackSections('pas');
    const labels = pas.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Cover Letter', 'Form FDA 356h', 'Summary and Description of the Change',
      'Environmental Assessment or Categorical Exclusion Claim',
    ]));
    // The NDA's nonclinical and clinical modules are not what a supplement files.
    expect(pas.some((s) => /^(M[1-5]|4\.2\.3|5\.3)$/.test(s.key))).toBe(false);
  });

  it('the five prior versions are superseded by exactly the new one', async () => {
    for (const spec of FILING_CLASS_PACKS.filter((p) => p.supersedes)) {
      const { rows } = await pg.query<{ superseded_by: string | null }>(
        `SELECT superseded_by FROM c2c_rule_packs WHERE doc_type = $1 AND agency = $2 AND version = $3`,
        [spec.docType, spec.agency, spec.supersedes],
      );
      expect(rows[0]?.superseded_by, `${spec.docType}:${spec.agency} ${spec.supersedes}`).toBe(spec.version);
    }
  });

  it('scaffolding a class writes its own outline; an application still gets its dossier', async () => {
    const pas = await scaffold('pas', 'FDA');
    expect(pas.skipped).toBeUndefined();
    const doc = await pg.query<{ doc_type: string; agency: string; rule_pack_version: string; title: string }>(
      `SELECT doc_type, agency, rule_pack_version, title FROM c2c_documents WHERE id = $1`, [pas.documentId],
    );
    expect(doc.rows[0]).toMatchObject({ doc_type: 'pas', agency: 'fda', rule_pack_version: 'fda-pas-lifecycle-v1.0' });
    expect(pas.sectionCount).toBe((await filingClassPackSections('pas')).length);

    await pg.query(`DELETE FROM c2c_document_sections`);
    await pg.query(`DELETE FROM c2c_documents`);
    const csr = await scaffold('csr', 'ICH');
    expect(csr.sectionCount).toBe(119);

    await pg.query(`DELETE FROM c2c_document_sections`);
    await pg.query(`DELETE FROM c2c_documents`);
    const nda = await scaffold('nda', 'FDA');
    const ndaDoc = await pg.query<{ doc_type: string }>(`SELECT doc_type FROM c2c_documents WHERE id = $1`, [nda.documentId]);
    expect(ndaDoc.rows[0].doc_type).toBe('nda');
  }, 60_000);

  it('the next deploy replays the set over a supplement document without error or change', async () => {
    await scaffold('pas', 'FDA');
    const before = await pg.query(`SELECT doc_type, agency, version, superseded_by, required_sections FROM c2c_rule_packs ORDER BY 1,2,3`);
    for (const f of inSetOrder(true)) await pg.exec(read(f));
    const after = await pg.query(`SELECT doc_type, agency, version, superseded_by, required_sections FROM c2c_rule_packs ORDER BY 1,2,3`);
    expect(after.rows).toEqual(before.rows);
    const docs = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM c2c_documents WHERE doc_type = 'pas'`);
    expect(docs.rows[0].n).toBe(1);
  }, 60_000);
});

describe('the contract is falsifiable', () => {
  it('without the migration, a supplement has no outline to scaffold', async () => {
    await boot(false);
    const r = await scaffold('pas', 'FDA');
    expect(r.skipped).toBe('NO_RULE_PACK');
  }, 60_000);

  it('a pack row whose tree is not the file\'s stops the deploy', async () => {
    await boot(false);
    // A row already holding the new key with a different tree: ON CONFLICT DO
    // NOTHING would keep it, so only the file's assertion can refuse it.
    await pg.query(
      `INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, effective_from)
       VALUES ('pas', 'fda', 'fda-pas-lifecycle-v1.0', 'tampered', '[{"key":"X","parent_key":null,"label":"X","mandatory":true,"path_order":1}]'::jsonb, now())`,
    );
    await expect(pg.exec(read(FILE))).rejects.toThrow(/pas:fda fda-pas-lifecycle-v1\.0 must hold this file's 11 nodes/);
  }, 60_000);
});
