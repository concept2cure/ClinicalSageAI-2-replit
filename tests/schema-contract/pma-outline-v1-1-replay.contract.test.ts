/**
 * Contract: the PMA outline a client scaffolds asks for FDA's software
 * Documentation Level, and it still does after every deploy replays the set.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * pma:fda fda-pma-21cfr814-20-v1.0 (migrations/20260810) labels node C.4
 * "Software description and level of concern". FDA's final guidance "Content of
 * Premarket Submissions for Device Software Functions" (14 June 2023,
 * https://www.fda.gov/media/153781/download) replaced the 2005 Level of Concern
 * with two Documentation Levels, Basic and Enhanced. The correction is a NEW
 * version row (Rule 1: rewriting a version's tree falsifies what scaffolded
 * documents claim to have been built against).
 *
 * ── Why a replay test ─────────────────────────────────────────────────────────
 * Every file in C2C_MIGRATION_FILES re-runs on every deploy (CLAUDE.md Rule 1).
 * 20260810's supersede UPDATE was `version <> 'fda-pma-21cfr814-20-v1.0' AND
 * superseded_by IS NULL` — on the second deploy that marks ANY newer live pma
 * pack as superseded by v1.0, so v1.1 would be live for exactly one deploy and
 * the scaffolder would quietly go back to "level of concern". A fresh database
 * never shows it; only applying the set twice does.
 *
 * Deploy order mirrors scripts/db/migration-set.mjs: 20260810 → 20260810c
 * (provenance, doc_type-wide) → 20260810d → the v1.1 file (near the tail).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const PREREQ = 'migrations/20260527_mutation_primitives.sql';
const SCHEMA = 'migrations/20260528_phase9_document_schema.sql';
const PMA_V1_0 = 'migrations/20260810_pma_fda_814_20_outline.sql';
const PROVENANCE = 'migrations/20260810c_rule_pack_provenance.sql';
const REVIEW_ATTRIBUTION = 'migrations/20260810d_rule_pack_review_attribution.sql';
const PMA_V1_1 = 'migrations/20261005b_pma_fda_outline_v1_1_software_documentation_level.sql';

const V1_0 = 'fda-pma-21cfr814-20-v1.0';
const V1_1 = 'fda-pma-21cfr814-20-v1.1';
const C4_LABEL = 'Software description and FDA documentation level (Basic/Enhanced)';

type Node = { key: string; parent_key: string | null; label: string; mandatory: boolean; path_order: number };

let pg: PGlite;

async function bootSchema() {
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
  `);
  await pg.exec(read(PREREQ));
  await pg.exec(read(SCHEMA));
}

/** One deploy's worth of the files that touch pma:fda, in set order. */
async function deploy() {
  for (const f of [PMA_V1_0, PROVENANCE, REVIEW_ATTRIBUTION, PMA_V1_1]) await pg.exec(read(f));
}

async function packs() {
  const r = await pg.query<{ version: string; superseded_by: string | null; required_sections: Node[]; uncertainties: string | null }>(
    `SELECT version, superseded_by, required_sections, uncertainties
       FROM c2c_rule_packs WHERE doc_type = 'pma' AND agency = 'fda' ORDER BY version`,
  );
  return Object.fromEntries(r.rows.map((row) => [row.version, row]));
}

beforeEach(async () => { await bootSchema(); });
afterEach(async () => { await pg?.close(); });

describe('pma:fda v1.1 — FDA software Documentation Level, replay-safe', () => {
  it('after two deploys v1.1 is the one live pack and the supersede chain is 2024 → v1.0 → v1.1', async () => {
    await deploy();
    await deploy();
    const p = await packs();
    expect(p[V1_1], 'v1.1 row missing').toBeDefined();
    expect(p[V1_1].superseded_by, 'v1.1 was superseded on replay').toBeNull();
    expect(p[V1_0].superseded_by).toBe(V1_1);
    expect(p['fda-pma-2024'].superseded_by).toBe(V1_0);

    const live = await pg.query<{ version: string }>(
      `SELECT version FROM c2c_rule_packs WHERE doc_type = 'pma' AND agency = 'fda' AND superseded_by IS NULL`,
    );
    expect(live.rows.map((r) => r.version)).toEqual([V1_1]);
  }, 60_000);

  it('a third deploy changes nothing', async () => {
    await deploy();
    await deploy();
    const before = await packs();
    await deploy();
    expect(await packs()).toEqual(before);
  }, 60_000);

  it('v1.1 is v1.0 node for node except the C.4 label, which names the Documentation Level', async () => {
    await deploy();
    const p = await packs();
    const v10 = p[V1_0].required_sections;
    const v11 = p[V1_1].required_sections;
    expect(v11).toHaveLength(67);
    expect(v11).toHaveLength(v10.length);

    const c4 = v11.find((n) => n.key === 'C.4');
    expect(c4).toEqual({ key: 'C.4', parent_key: 'C', label: C4_LABEL, mandatory: false, path_order: 21 });
    expect(JSON.stringify(v11)).not.toMatch(/level of concern/i);

    const withoutC4 = (ns: Node[]) => ns.filter((n) => n.key !== 'C.4');
    expect(withoutC4(v11)).toEqual(withoutC4(v10));
  }, 60_000);

  it('v1.1 provenance names the 2023 guidance it relabels C.4 from', async () => {
    await deploy();
    await deploy();
    const p = await packs();
    expect(p[V1_1].uncertainties ?? '').toContain('https://www.fda.gov/media/153781/download');
    expect(p[V1_1].uncertainties ?? '').toMatch(/Documentation Level/);
  }, 60_000);

  // 20260810c attests pma:fda doc_type-wide, but it runs BEFORE this file in the
  // set: on the deploy that first inserts v1.1, v1.1 would otherwise carry the
  // column defaults ('undeclared' / 'unknown') — the live pack a client
  // scaffolds from telling them nothing about what it was built from — until
  // the next deploy happened to re-run 20260810c.
  it('v1.1 carries its provenance attestation from the first deploy, not only after a replay', async () => {
    await deploy();
    const r = await pg.query<{ source_basis: string; confidence: string; governing_rule: string | null }>(
      `SELECT source_basis, confidence, governing_rule FROM c2c_rule_packs
        WHERE doc_type = 'pma' AND agency = 'fda' AND version = $1`,
      [V1_1],
    );
    expect(r.rows[0].source_basis).toBe('statutory_transcription');
    expect(r.rows[0].confidence).toBe('high');
    expect(r.rows[0].governing_rule ?? '').toContain('21 CFR 814.20(b)');
    expect(r.rows[0].governing_rule ?? '').toContain('Content of Premarket Submissions for Device Software Functions');
  }, 60_000);

  it('the row-count assertion fails the deploy when a truncated v1.1 row already holds the key', async () => {
    await pg.exec(read(PMA_V1_0));
    // A v1.1 row with one node missing — ON CONFLICT DO NOTHING would keep it forever.
    await pg.exec(`
      INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
      SELECT doc_type, agency, '${V1_1}', label, required_sections - 0, esubmit_channel, now()
        FROM c2c_rule_packs WHERE doc_type = 'pma' AND agency = 'fda' AND version = '${V1_0}';
    `);
    await expect(pg.exec(read(PMA_V1_1))).rejects.toThrow(/67/);
  }, 60_000);
});
