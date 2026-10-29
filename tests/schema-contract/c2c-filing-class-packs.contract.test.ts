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
import { REGIONAL_DEVICE_APPLICATION_CLASSES } from '../../shared/regulatory/filing-catalog';
import {
  FILING_CLASS_PACKS,
  filingClassPackGoverningRule,
  filingClassPackSections,
  filingClassPackUncertainties,
} from '../../server/services/c2c/filing-class-packs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const FILE = 'migrations/20261018_filing_class_rule_packs.sql';
/** The review corrections: ten new versions superseding exactly the ones FILE seeded. */
const CORRECTIONS = 'migrations/20261018c_filing_class_packs_review_corrections.sql';
/** The critic's follow-ups to CORRECTIONS, minted after it was on the applier. */
const FOLLOWUPS = 'migrations/20261019b_filing_class_packs_v1_2_critic_followups.sql';
const REGIONAL = 'migrations/20261020_regional_device_application_packs.sql';
/** The first packs of the 17 US biotech filing classes (2026-10-29). */
const US_BIOTECH = 'migrations/20261029_us_biotech_filing_class_packs.sql';
const CLASS_FILES = [FILE, CORRECTIONS, FOLLOWUPS, REGIONAL, US_BIOTECH];

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
  '20261018c_filing_class_packs_review_corrections.sql',
  '20261019b_filing_class_packs_v1_2_critic_followups.sql',
  '20261020_regional_device_application_packs.sql',
  '20261029_us_biotech_filing_class_packs.sql',
];
/** The set in applier order; without the class files, or stopping before the corrections. */
const inSetOrder = (withClasses: boolean | 'before-corrections') => {
  const files = (C2C_MIGRATION_FILES as string[]).filter((f) => PACK_FILES.some((b) => f.endsWith(`/${b}`)));
  expect(files, 'every rule-pack file is on the applier').toHaveLength(PACK_FILES.length);
  if (withClasses === 'before-corrections') return files.filter((f) => !f.endsWith(CORRECTIONS) && !f.endsWith(FOLLOWUPS) && !f.endsWith(REGIONAL) && !f.endsWith(US_BIOTECH));
  return withClasses ? files : files.filter((f) => !CLASS_FILES.some((c) => f.endsWith(c)));
};

const ORG = 7;
const PROJECT = '11111111-2222-3333-4444-555555555555';
let pg: PGlite;
const client = () => ({ query: (sql: string, p?: unknown[]) => pg.query(sql, p as any[]) }) as any;

async function boot(withClasses: boolean | 'before-corrections' = true) {
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
    const classes = [...FILING_DOCUMENT_CLASSES, ...REGIONAL_DEVICE_APPLICATION_CLASSES];
    expect(FILING_CLASS_PACKS.map((p) => p.docType).sort())
      .toEqual(classes.map((c) => c.docType).sort());
    for (const c of classes) {
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

});

/* The content of individual packs, held to what the corrected records say. */
describe('the packs carry what their filings need', () => {
  beforeEach(() => boot());

  it('a supplement carries its own parts, not the NDA dossier', async () => {
    const pas = await filingClassPackSections('pas');
    const labels = pas.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Cover Letter', 'Form FDA 356h', 'Summary and Description of the Change',
      'Environmental Assessment or Categorical Exclusion Claim',
    ]));
    // No NDA module container: the CTD sections a change updates sit under the
    // supplement's own "Updated CTD Sections", each optional. An efficacy
    // supplement's clinical sections are among them (review finding,
    // 2026-10-18: v1.0 held Module 3 only).
    expect(pas.some((s) => /^M[1-5]$/.test(s.key))).toBe(false);
    const ctd = pas.filter((s) => /^[2-5]/.test(s.key));
    expect(ctd.map((s) => s.key)).toEqual(expect.arrayContaining(['2.5', '2.7', '5.3', '3.2.S', '3.2.P']));
    expect(ctd.every((s) => s.parent_key === 'CTD' && !s.mandatory)).toBe(true);
    expect(pas.find((s) => s.key === 'PAS-CLINICAL')?.mandatory).toBe(false);
    // PDUFA VI removed supplement fees: the fee part is no longer required.
    expect(pas.find((s) => s.key === 'PAS-FEE')?.mandatory).toBe(false);
    // An efficacy supplement's PREA and patent parts (505B; 314.53(d)(2)), each conditional.
    expect(pas.find((s) => s.key === 'PAS-PEDIATRIC')?.mandatory).toBe(false);
    expect(pas.find((s) => s.key === 'PAS-PATENT')?.mandatory).toBe(false);
  });

  it('a CBE-0 needs its change description and environmental claim as much as a CBE-30 does', async () => {
    const cbe = await filingClassPackSections('cbe');
    const part = (label: string) => cbe.find((s) => s.label === label);
    expect(part('Description and Justification of the Change')?.mandatory).toBe(true);
    expect(part('Categorical Exclusion Claim or Environmental Assessment')?.mandatory).toBe(true);
    expect(cbe.some((s) => /\(CBE-30\)$/.test(s.label) && /Change|Environmental/.test(s.label))).toBe(false);
  });

});

/* Supersession, scaffolding and replay over the set. */
describe('the class packs supersede, scaffold and replay', () => {
  beforeEach(() => boot());

  it('every superseded prior version is superseded by exactly the version that replaced it', async () => {
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
    expect(doc.rows[0]).toMatchObject({ doc_type: 'pas', agency: 'fda', rule_pack_version: FILING_CLASS_PACKS.find((p) => p.docType === 'pas')?.version });
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
    // Provenance too: 20261018 re-asserts its literal every deploy and 20261018c
    // corrects it after, so a deploy must end exactly where the last one did.
    const cols = 'doc_type, agency, version, superseded_by, required_sections, confidence, governing_rule, uncertainties';
    const before = await pg.query(`SELECT ${cols} FROM c2c_rule_packs ORDER BY 1,2,3`);
    for (const f of inSetOrder(true)) await pg.exec(read(f));
    const after = await pg.query(`SELECT ${cols} FROM c2c_rule_packs ORDER BY 1,2,3`);
    expect(after.rows).toEqual(before.rows);
    const docs = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM c2c_documents WHERE doc_type = 'pas'`);
    expect(docs.rows[0].n).toBe(1);
  }, 60_000);
});

/*
 * A changed outline is minted in a NEW file that supersedes exactly the version
 * 20261018 seeded (scripts/db/emit-filing-class-packs.ts never rewrites a file
 * on the applier). The deployed-database case: 20261018 has run on an earlier
 * deploy and its v1.0 packs are live, with a document bound to one. The next
 * deploy runs the whole set: 20261018 replays (its assertions must hold over a
 * superseded row), then 20261018c supersedes. Then a third deploy replays both.
 */
describe('the review corrections supersede 20261018 on a deployed database', () => {
  it('v1.0 is live, a document is bound to it; two deploys later the corrections are live and the document keeps its outline', async () => {
    await boot('before-corrections');
    const before = await scaffold('pas', 'FDA');
    const bound = await pg.query<{ rule_pack_version: string }>(
      `SELECT rule_pack_version FROM c2c_documents WHERE id = $1`, [before.documentId],
    );
    expect(bound.rows[0].rule_pack_version).toBe('fda-pas-lifecycle-v1.0');
    for (let deploy = 0; deploy < 2; deploy++) {
      for (const f of inSetOrder(true)) await pg.exec(read(f));
    }
    for (const spec of FILING_CLASS_PACKS) {
      const live = await pg.query<{ version: string }>(
        `SELECT version FROM c2c_rule_packs WHERE doc_type = $1 AND agency = $2 AND superseded_by IS NULL`,
        [spec.docType, spec.agency],
      );
      expect(live.rows.map((r) => r.version), `${spec.docType}:${spec.agency}`).toEqual([spec.version]);
    }
    const still = await pg.query<{ rule_pack_version: string; n: number }>(
      `SELECT d.rule_pack_version, (SELECT count(*)::int FROM c2c_document_sections s WHERE s.document_id = d.id) AS n
         FROM c2c_documents d WHERE d.id = $1`, [before.documentId],
    );
    expect(still.rows[0]).toEqual({ rule_pack_version: 'fda-pas-lifecycle-v1.0', n: before.sectionCount });
  }, 90_000);
});

/*
 * A document bound to a superseded version keeps its outline, so the version
 * says what superseded it, and a provenance claim the review found false is not
 * left standing on it (second review, 2026-10-18).
 */
describe('a superseded version says why, and keeps no withdrawn claim', () => {
  it('the v1.0 IND safety report and NDA annual report packs no longer claim what the review withdrew', async () => {
    await boot();
    const row = async (docType: string, version: string) => (await pg.query<{ confidence: string; governing_rule: string; uncertainties: string }>(
      `SELECT confidence, governing_rule, uncertainties FROM c2c_rule_packs WHERE doc_type = $1 AND agency = 'fda' AND version = $2`,
      [docType, version],
    )).rows[0];
    const sr = await row('ind_safety_report', 'fda-ind-safety-report-v1.0');
    expect(sr.confidence).toBe('low');
    expect(sr.governing_rule).not.toMatch(/checked against the regulator's text/);
    expect(sr.uncertainties).toContain('Superseded by fda-ind-safety-report-v1.1 on 2026-10-18');
    const ar = await row('annual_report', 'fda-annual-report-lifecycle-v1.0');
    expect(ar.governing_rule).not.toMatch(/601\.12\(a\) and 601\.28 \(annual/);
    expect(ar.governing_rule).toContain('601.12(d)');
    for (const spec of FILING_CLASS_PACKS.filter((p) => p.supersedes && p.changeNote)) {
      const { rows } = await pg.query<{ uncertainties: string | null }>(
        `SELECT uncertainties FROM c2c_rule_packs WHERE doc_type = $1 AND agency = $2 AND version = $3`,
        [spec.docType, spec.agency, spec.supersedes],
      );
      // The five 20261018 superseded before provenance existed on them stay as they were.
      if (spec.supersedes && ['ich-m4-v2.0', 'fda-meeting-2024', 'ich-e2c-r2'].includes(spec.supersedes)) continue;
      expect(rows[0]?.uncertainties, `${spec.docType} ${spec.supersedes}`).toContain(`Superseded by ${spec.version}`);
    }
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

  // Second review, 2026-10-18: the corrections file's own assertion was never
  // exercised. A row holding the v1.1 key with the right node count and one
  // flag flipped is kept by ON CONFLICT DO NOTHING; only the tree check refuses it.
  it('a live-version row with the right node count and one flag flipped stops the file that seeds it', async () => {
    await boot('before-corrections');
    await pg.exec(read(CORRECTIONS));
    const spec = FILING_CLASS_PACKS.find((p) => p.docType === 'pas')!;
    const tree = await filingClassPackSections('pas');
    const flipped = tree.map((r, i) => (i === 0 ? { ...r, mandatory: !r.mandatory } : r));
    await pg.query(
      `INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, effective_from)
       VALUES ('pas', 'fda', $1, 'tampered', $2::jsonb, now())`,
      [spec.version, JSON.stringify(flipped)],
    );
    await expect(pg.exec(read(FOLLOWUPS))).rejects.toThrow(
      new RegExp(`pas:fda ${spec.version.replace(/\./g, '\\.')} must hold this file's ${tree.length} nodes; found ${tree.length} \\(tree matches: false\\)`),
    );
  }, 60_000);
});
