/**
 * Contract: the 510(k) and De Novo outlines a client scaffolds carry the MDUFA
 * user-fee section (Form FDA 3601), the 510(k) outline carries FDA's
 * "Benefits, Risks, and Mitigation Measures" (risk management) section, and
 * both are still the live packs after every deploy replays the set.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * k510:fda fda-estar-510k-v1.0 and denovo:fda fda-estar-denovo-v1.0
 * (migrations/20260901b) have no section for the user-fee cover sheet, and the
 * 510(k) pack none for risk management. The eSTAR readiness engine
 * (estar-mapper.ts) requires both slots, so a governed 510(k) authored section
 * by section against its own outline could never score complete —
 * tests/schema-contract/estar-mapper-matches-shipped-outlines.contract.test.ts
 * recorded the gap as a ledger: k510 [risk-management, user-fee-cover-sheet],
 * De Novo [user-fee-cover-sheet]. The correction is a NEW version row
 * (Rule 1: a version's tree is what scaffolded documents were built against).
 *
 * ── Why a replay test ─────────────────────────────────────────────────────────
 * Every file in C2C_MIGRATION_FILES re-runs on every deploy (CLAUDE.md Rule 1).
 * A supersede written `version <> …` (the shape 20260810 had for PMA) marks the
 * newer pack superseded on the second deploy; a fresh database never shows it.
 * Only applying the set's k510/denovo files twice does.
 *
 * Deploy order mirrors scripts/db/migration-set.mjs: 20260804 (fda-denovo-2024)
 * → 20260810c (provenance columns) → 20260810d → 20260901b (v1.0) → the v1.1
 * file (near the tail, before the isolation sweeps).
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
const OUTLINES_2024 = 'migrations/20260804_phase9_rule_pack_outlines.sql';
const PROVENANCE = 'migrations/20260810c_rule_pack_provenance.sql';
const REVIEW_ATTRIBUTION = 'migrations/20260810d_rule_pack_review_attribution.sql';
const ESTAR_V1_0 = 'migrations/20260901b_estar_510k_denovo_outlines.sql';
const ESTAR_V1_1 = 'migrations/20261005c_k510_denovo_estar_outline_v1_1.sql';

const PACKS = {
  k510: { v10: 'fda-estar-510k-v1.0', v11: 'fda-estar-510k-v1.1', y2024: 'fda-510k-2024', nodes: 38 },
  denovo: { v10: 'fda-estar-denovo-v1.0', v11: 'fda-estar-denovo-v1.1', y2024: 'fda-denovo-2024', nodes: 33 },
} as const;

const FEE_LABEL = 'MDUFA user fee — Form FDA 3601 and payment';
const RISK_LABEL =
  'Benefits, risks and mitigation measures — risk management (ISO 14971), Special 510(k) design control activities';

type Node = { key: string; parent_key: string | null; label: string; mandatory: boolean; path_order: number };
type Row = { version: string; superseded_by: string | null; required_sections: Node[]; uncertainties: string | null };

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

/** One deploy's worth of the files that touch k510:fda and denovo:fda, in set order. */
async function deploy() {
  for (const f of [OUTLINES_2024, PROVENANCE, REVIEW_ATTRIBUTION, ESTAR_V1_0, ESTAR_V1_1]) await pg.exec(read(f));
}

async function packs(docType: 'k510' | 'denovo'): Promise<Record<string, Row>> {
  const r = await pg.query<Row>(
    `SELECT version, superseded_by, required_sections, uncertainties
       FROM c2c_rule_packs WHERE doc_type = $1 AND agency = 'fda' ORDER BY version`,
    [docType],
  );
  return Object.fromEntries(r.rows.map((row) => [row.version, row]));
}

/** What the scaffolder selects (server/services/ectd/required-sections.ts, 20260804 header). */
async function scaffolded(docType: 'k510' | 'denovo') {
  const r = await pg.query<{ version: string }>(
    `SELECT version FROM c2c_rule_packs
      WHERE doc_type = $1 AND agency = 'fda' AND superseded_by IS NULL
      ORDER BY effective_from DESC LIMIT 1`,
    [docType],
  );
  return r.rows[0]?.version;
}

/** A tree without positions: identity, parent, label and the mandatory flag. */
const shape = (ns: Node[]) => ns.map(({ key, parent_key, label, mandatory }) => ({ key, parent_key, label, mandatory }));

beforeEach(async () => { await bootSchema(); });
afterEach(async () => { await pg?.close(); });

describe('k510:fda and denovo:fda v1.1 — user fee and risk management, replay-safe', () => {
  it.each(['k510', 'denovo'] as const)(
    '%s: after two deploys v1.1 is the one live pack and the chain is 2024 → v1.0 → v1.1',
    async (docType) => {
      await deploy();
      await deploy();
      const p = await packs(docType);
      const v = PACKS[docType];
      expect(p[v.v11], 'v1.1 row missing').toBeDefined();
      expect(p[v.v11].superseded_by, 'v1.1 was superseded on replay').toBeNull();
      expect(p[v.v10].superseded_by).toBe(v.v11);
      expect(p[v.y2024].superseded_by).toBe(v.v10);

      const live = await pg.query<{ version: string }>(
        `SELECT version FROM c2c_rule_packs WHERE doc_type = $1 AND agency = 'fda' AND superseded_by IS NULL`,
        [docType],
      );
      expect(live.rows.map((r) => r.version)).toEqual([v.v11]);
      expect(await scaffolded(docType)).toBe(v.v11);
    },
    60_000,
  );

  it('a third deploy changes nothing', async () => {
    await deploy();
    await deploy();
    const before = { k510: await packs('k510'), denovo: await packs('denovo') };
    await deploy();
    expect({ k510: await packs('k510'), denovo: await packs('denovo') }).toEqual(before);
  }, 60_000);

  it('510(k) v1.1 is v1.0 plus A9 (user fee, mandatory) and D6 (risk management, optional), in outline order', async () => {
    await deploy();
    const p = await packs('k510');
    const v10 = p[PACKS.k510.v10].required_sections;
    const v11 = p[PACKS.k510.v11].required_sections;
    expect(v11).toHaveLength(38);

    expect(v11.find((n) => n.key === 'A9')).toEqual({
      key: 'A9', parent_key: 'A', label: FEE_LABEL, mandatory: true, path_order: 10,
    });
    /* Optional, not mandatory: FDA's own eSTAR v7.0 template shows its
       RiskManagement ("Benefits, Risks, and Mitigation Measures") section for a
       Special 510(k) and hides it for a Traditional or Abbreviated one. */
    expect(v11.find((n) => n.key === 'D6')).toEqual({
      key: 'D6', parent_key: 'D', label: RISK_LABEL, mandatory: false, path_order: 24,
    });

    // Every v1.0 node survives unchanged except its position.
    const added = new Set(['A9', 'D6']);
    expect(shape(v11.filter((n) => !added.has(n.key)))).toEqual(shape(v10));
    // Positions are a contiguous 1..n in array order.
    expect(v11.map((n) => n.path_order)).toEqual(v11.map((_, i) => i + 1));
    // The label must not light the cover-letter slot ("cover sheet") as well.
    expect(FEE_LABEL).not.toMatch(/cover (sheet|letter)/i);
  }, 60_000);

  it('De Novo v1.1 is v1.0 plus A7 (user fee, mandatory), in outline order', async () => {
    await deploy();
    const p = await packs('denovo');
    const v10 = p[PACKS.denovo.v10].required_sections;
    const v11 = p[PACKS.denovo.v11].required_sections;
    expect(v11).toHaveLength(33);
    expect(v11.find((n) => n.key === 'A7')).toEqual({
      key: 'A7', parent_key: 'A', label: FEE_LABEL, mandatory: true, path_order: 8,
    });
    expect(shape(v11.filter((n) => n.key !== 'A7'))).toEqual(shape(v10));
    expect(v11.map((n) => n.path_order)).toEqual(v11.map((_, i) => i + 1));
    // The De Novo outline already had risk management (F) — v1.1 does not add a second.
    expect(v11.filter((n) => /risk management/i.test(n.label)).map((n) => n.key)).toEqual(['F']);
  }, 60_000);

  // 20260810c adds the provenance columns BEFORE this file in the set; the v1.1
  // rows must carry their own attestation on the deploy that inserts them,
  // not the column defaults ('undeclared' / 'unknown').
  it.each(['k510', 'denovo'] as const)(
    '%s v1.1 carries its provenance from the first deploy, naming the eSTAR template and Form FDA 3601',
    async (docType) => {
      await deploy();
      const r = await pg.query<{ source_basis: string; confidence: string; governing_rule: string | null; uncertainties: string | null }>(
        `SELECT source_basis, confidence, governing_rule, uncertainties FROM c2c_rule_packs
          WHERE doc_type = $1 AND agency = 'fda' AND version = $2`,
        [docType, PACKS[docType].v11],
      );
      expect(r.rows[0].source_basis).toBe('guidance_transcription');
      expect(r.rows[0].confidence).toBe('medium');
      expect(r.rows[0].governing_rule ?? '').toMatch(/eSTAR/);
      expect(r.rows[0].governing_rule ?? '').toMatch(/Form FDA 3601/);
      expect(r.rows[0].uncertainties ?? '').toContain('https://www.fda.gov/industry/medical-device-user-fee-amendments-mdufa-fees/mdufa-cover-sheets');
    },
    60_000,
  );

  it.each(['k510', 'denovo'] as const)(
    '%s: the content assertion fails the deploy when a truncated v1.1 row already holds the key',
    async (docType) => {
      await pg.exec(read(OUTLINES_2024));
      await pg.exec(read(ESTAR_V1_0));
      const v = PACKS[docType];
      // A v1.1 row that is v1.0's tree — ON CONFLICT DO NOTHING would keep it forever.
      await pg.exec(`
        INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
        SELECT doc_type, agency, '${v.v11}', label, required_sections, esubmit_channel, now()
          FROM c2c_rule_packs WHERE doc_type = '${docType}' AND agency = 'fda' AND version = '${v.v10}';
      `);
      await expect(pg.exec(read(ESTAR_V1_1))).rejects.toThrow(new RegExp(`${v.v11}.*${v.nodes}`));
    },
    60_000,
  );
});
