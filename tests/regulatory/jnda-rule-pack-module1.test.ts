/**
 * The Module 1 rule packs minted on 2026-10-05 — jnda:pmda files its draft RMP
 * at 1.11, and the nda/bla/anda:fda corrections reach a deployed database.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * The jnda:pmda outline (ich-m4-v2.1, migrations/20260804) ran 1.1–1.10, then
 * 1.12 and 1.13: it had no 1.11. PMDA files the draft risk management plan
 * (医薬品リスク管理計画書（案）) at CTD Module 1 section 1.11, so a J-NDA
 * scaffolded from the pack had nowhere to put it and the gates never asked for
 * it. The FDA packs' Module 1 corrections are held to the FDA heading list by
 * tests/regulatory/fda-module1-numbering.test.ts; this file proves the
 * migration that carries all four corrections behaves on a database the way
 * CLAUDE.md Rule 1 demands of a seed:
 *
 *   - it re-runs on every deploy (no "already applied" skip), so a second apply
 *     must change nothing and must not fail;
 *   - ON CONFLICT DO NOTHING means a wrong row already holding the key is never
 *     corrected, so the in-file row-count assertion must refuse it — shown here
 *     by planting a truncated row;
 *   - a later version superseding one of these rows must not break the replay.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

import { requiredSectionsFromPack } from '../../server/services/ectd/required-sections';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = 'migrations/20261005_fda_jnda_m1_outline_v2_2.sql';
const PREREQ = 'migrations/20260527_mutation_primitives.sql';
const SCHEMA = 'migrations/20260528_phase9_document_schema.sql';
const OUTLINES = 'migrations/20260804_phase9_rule_pack_outlines.sql';
const ANDA_IDE = 'migrations/20260806b_anda_ide_filing_types.sql';
const PROVENANCE = 'migrations/20260810c_rule_pack_provenance.sql';
const REVIEW_ATTRIBUTION = 'migrations/20260810d_rule_pack_review_attribution.sql';

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** old → new, per (doc_type, agency). */
const MINTED = [
  { docType: 'nda', agency: 'fda', from: 'ich-m4-v2.1', to: 'ich-m4-v2.2' },
  { docType: 'bla', agency: 'fda', from: 'ich-m4-v2.1', to: 'ich-m4-v2.2' },
  { docType: 'anda', agency: 'fda', from: 'fda-anda-21cfr314-94-v1.0', to: 'fda-anda-21cfr314-94-v1.1' },
  { docType: 'jnda', agency: 'pmda', from: 'ich-m4-v2.1', to: 'ich-m4-v2.2' },
] as const;

type Section = { key: string; parent_key: string | null; label: string; mandatory: boolean; path_order: number };

async function boot(): Promise<PGlite> {
  const pg = new PGlite();
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
  `);
  for (const f of [PREREQ, SCHEMA, OUTLINES, ANDA_IDE, PROVENANCE, REVIEW_ATTRIBUTION]) await pg.exec(read(f));
  return pg;
}

/**
 * One deploy of the rule-pack part of the set: every file re-runs, in set order.
 * A missing MIGRATION is applied as nothing, so that before the fix these tests
 * fail on what the database holds (no 1.11) rather than on a file read; the
 * first test below fails on the file's absence itself.
 */
async function deploy(pg: PGlite): Promise<void> {
  for (const f of [OUTLINES, ANDA_IDE, PROVENANCE, REVIEW_ATTRIBUTION]) await pg.exec(read(f));
  if (fs.existsSync(path.join(ROOT, MIGRATION))) await pg.exec(read(MIGRATION));
}

async function row(pg: PGlite, docType: string, agency: string, version: string) {
  const r = await pg.query<{
    required_sections: Section[];
    superseded_by: string | null;
    source_basis: string;
    confidence: string;
    governing_rule: string | null;
    uncertainties: string | null;
    review_status: string;
  }>(
    `SELECT required_sections, superseded_by, source_basis, confidence, governing_rule, uncertainties, review_status
       FROM c2c_rule_packs WHERE doc_type = $1 AND agency = $2 AND version = $3`,
    [docType, agency, version],
  );
  return r.rows[0];
}

async function live(pg: PGlite, docType: string, agency: string) {
  const r = await pg.query<{ version: string; required_sections: Section[] }>(
    `SELECT version, required_sections FROM c2c_rule_packs
      WHERE doc_type = $1 AND agency = $2 AND superseded_by IS NULL ORDER BY effective_from DESC`,
    [docType, agency],
  );
  return r.rows;
}

const requiredM1 = (sections: Section[]) =>
  requiredSectionsFromPack(sections).find((m) => m.code === 'm1')!.requiredSections;

describe('jnda:pmda files the draft RMP at Module 1 section 1.11', () => {
  it('the migration is on the deploy path, above the tenant sweep', () => {
    expect(fs.existsSync(path.join(ROOT, MIGRATION)), `${MIGRATION} does not exist`).toBe(true);
    const at = C2C_MIGRATION_FILES.indexOf(MIGRATION);
    expect(at, `${MIGRATION} is not in C2C_MIGRATION_FILES`).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(C2C_MIGRATION_FILES.indexOf('migrations/20260902_ind_fda_outline_v2_2_initial_ind_flags.sql'));
    expect(at).toBeGreaterThan(C2C_MIGRATION_FILES.indexOf(PROVENANCE));
    expect(at).toBeLessThan(C2C_MIGRATION_FILES.length - 3);
  });

  it('after a deploy the live jnda:pmda outline has 1.11, in order, and the gates require it', async () => {
    const pg = await boot();
    await deploy(pg);
    const rows = await live(pg, 'jnda', 'pmda');
    expect(rows.map((r) => r.version)).toEqual(['ich-m4-v2.2']);
    const secs = rows[0].required_sections;
    const m1 = secs.filter((s) => s.parent_key === 'M1').sort((a, b) => a.path_order - b.path_order);
    expect(m1.map((s) => s.key)).toEqual([
      '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11', '1.12', '1.13',
    ]);
    const rmp = m1.find((s) => s.key === '1.11')!;
    expect(rmp.label).toMatch(/risk management plan/i);
    expect(rmp.label).toContain('医薬品リスク管理計画書（案）');
    expect(requiredM1(secs)).toContain('1.11');
    // Modules 2–5 are v2.1's, node for node.
    const old = await row(pg, 'jnda', 'pmda', 'ich-m4-v2.1');
    const m2to5 = (s: Section[]) => s.filter((x) => !/^(M1|1\.)/.test(x.key)).map(({ key, parent_key, label, mandatory }) => ({ key, parent_key, label, mandatory }));
    expect(m2to5(secs)).toEqual(m2to5(old.required_sections));
    await pg.close();
  });

  it('every new row is live, every old row is superseded by it, and each records its basis', async () => {
    const pg = await boot();
    await deploy(pg);
    for (const m of MINTED) {
      expect((await live(pg, m.docType, m.agency)).map((r) => r.version), `${m.docType}:${m.agency}`).toEqual([m.to]);
      expect((await row(pg, m.docType, m.agency, m.from)).superseded_by, `${m.docType}:${m.agency} ${m.from}`).toBe(m.to);
      const fresh = await row(pg, m.docType, m.agency, m.to);
      expect(fresh.source_basis).not.toBe('undeclared');
      expect(fresh.confidence).not.toBe('unknown');
      expect(fresh.governing_rule ?? '').not.toBe('');
      expect(fresh.uncertainties ?? '').toMatch(/not reviewed by a regulatory professional/i);
      expect(fresh.review_status).toBe('unreviewed');
    }
    // The flags no regulator text was read for are named as such.
    expect((await row(pg, 'nda', 'fda', 'ich-m4-v2.2')).uncertainties).toMatch(/1\.3\.5[\s\S]*1\.18/);
    expect((await row(pg, 'anda', 'fda', 'fda-anda-21cfr314-94-v1.1')).uncertainties).toMatch(/1\.3\.5\.3/);
    expect((await row(pg, 'jnda', 'pmda', 'ich-m4-v2.2')).uncertainties).toMatch(/1\.11/);
    await pg.close();
  });

  it('re-runs on every deploy without changing anything (Rule 1)', async () => {
    const pg = await boot();
    await deploy(pg);
    const snapshot = async () =>
      (await pg.query(`SELECT doc_type, agency, version, required_sections, superseded_by, source_basis, confidence, governing_rule, uncertainties
                         FROM c2c_rule_packs ORDER BY doc_type, agency, version`)).rows;
    const first = await snapshot();
    await deploy(pg);
    await deploy(pg);
    expect(await snapshot()).toEqual(first);
    await pg.close();
  });

  it('refuses a truncated row already holding a new key — ON CONFLICT DO NOTHING would otherwise keep it', async () => {
    const pg = await boot();
    await pg.exec(`INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, effective_from)
                   VALUES ('jnda', 'pmda', 'ich-m4-v2.2', 'truncated', '[{"key":"M1","parent_key":null,"label":"M1","mandatory":true,"path_order":1}]'::jsonb, DATE '2026-10-05')`);
    await expect(deploy(pg)).rejects.toThrow(/jnda:pmda ich-m4-v2\.2/);
    await pg.close();
  });

  it('a later version superseding a 2026-10-05 row does not break the replay', async () => {
    const pg = await boot();
    await deploy(pg);
    await pg.exec(`INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, effective_from)
                     SELECT doc_type, agency, 'ich-m4-v2.3', label, required_sections, DATE '2026-12-01'
                       FROM c2c_rule_packs WHERE doc_type = 'nda' AND agency = 'fda' AND version = 'ich-m4-v2.2';
                   UPDATE c2c_rule_packs SET superseded_by = 'ich-m4-v2.3'
                    WHERE doc_type = 'nda' AND agency = 'fda' AND version = 'ich-m4-v2.2';`);
    await expect(deploy(pg)).resolves.toBeUndefined();
    expect((await live(pg, 'nda', 'fda')).map((r) => r.version)).toEqual(['ich-m4-v2.3']);
    expect((await row(pg, 'nda', 'fda', 'ich-m4-v2.1')).superseded_by).toBe('ich-m4-v2.2');
    await pg.close();
  });
});
