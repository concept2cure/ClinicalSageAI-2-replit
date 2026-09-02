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
// The CTR 536/2014 outline for cta:ema arrives in its own migration because its
// shape is not the CTD one the file above seeds. Applied here in the same order
// the deploy path applies it (C2C_MIGRATION_FILES), so the test sees what ships.
const CTA_OUTLINE = path.join(REPO_ROOT, 'migrations/20260806_cta_ema_ctr536_outline.sql');
// anda:fda and ide:fda, plus the doc_type CHECK widening that makes either of
// them insertable at all. Applied after CTA, in C2C_MIGRATION_FILES order.
const ANDA_IDE = path.join(REPO_ROOT, 'migrations/20260806b_anda_ide_filing_types.sql');
// pma:fda's real 21 CFR 814.20 tree, replacing the six-node stub 20260528 seeded.
const PMA_OUTLINE = path.join(REPO_ROOT, 'migrations/20260810_pma_fda_814_20_outline.sql');
// EU MDR 2017/745 and IVDR 2017/746, plus the doc_type widening they need.
const EU_DEVICE = path.join(REPO_ROOT, 'migrations/20260810b_eu_mdr_ivdr_outlines.sql');
// ind:fda re-seeded with Module 1 numbered per the FDA eCTD Module 1 Specification
// v2.3 (1.20 general investigational plan, 1.14.4.1 IB, 1.12.14 environmental
// analysis) and Modules 2–5 at ICH M4 leaf granularity; supersedes ich-m4-v2.0.
const IND_M1 = path.join(REPO_ROOT, 'migrations/20260901_ind_fda_m1_v2_3_outline.sql');
// k510:fda and denovo:fda re-seeded to the eSTAR-era structure (no retired Form
// 3514 cover sheet; Part 807 mandatory items present); supersedes the 2024 packs.
const ESTAR_DEVICE = path.join(REPO_ROOT, 'migrations/20260901b_estar_510k_denovo_outlines.sql');
// ind:fda ich-m4-v2.2: same outline, 1.3.1 and 5.2 optional for an initial IND
// now that the compile gates read the pack's mandatory flags; supersedes v2.1.
const IND_M1_V22 = path.join(REPO_ROOT, 'migrations/20260902_ind_fda_outline_v2_2_initial_ind_flags.sql');

const ORG = 7;
const PROJECT = '11111111-2222-3333-4444-555555555555';

/** Biotech's marketing pathways. IND is covered by the CTD dossier assertion. */
const BIOTECH_PATHWAYS = ['bla', 'maa', 'jnda'] as const;

let pg: PGlite;
const client = () => ({ query: (sql: string, p?: unknown[]) => pg.query(sql, p as any[]) }) as any;

/**
 * Provision the schema. `withOutlines: false` is the pre-fix world.
 *
 * `withAndaIde` is separate rather than folded into `withOutlines` so the
 * falsifiability case at the bottom can boot a database that has EVERY other
 * outline and still watch an ANDA decline. Turning all of them off would prove
 * only that the ANDA test needs some migration; leaving the rest on proves it
 * needs THIS one.
 */
async function boot(
  withOutlines = true,
  withAndaIde = withOutlines,
  withSept2026 = withOutlines,
  withIndV22 = withSept2026,
) {
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
  if (withOutlines) await pg.exec(fs.readFileSync(OUTLINES, 'utf8'));
  if (withOutlines) await pg.exec(fs.readFileSync(CTA_OUTLINE, 'utf8'));
  if (withAndaIde) await pg.exec(fs.readFileSync(ANDA_IDE, 'utf8'));
  if (withOutlines) await pg.exec(fs.readFileSync(PMA_OUTLINE, 'utf8'));
  if (withOutlines) await pg.exec(fs.readFileSync(EU_DEVICE, 'utf8'));
  if (withSept2026) await pg.exec(fs.readFileSync(IND_M1, 'utf8'));
  if (withSept2026) await pg.exec(fs.readFileSync(ESTAR_DEVICE, 'utf8'));
  if (withIndV22) await pg.exec(fs.readFileSync(IND_M1_V22, 'utf8'));
}

/** The one live pack for a (doc_type, agency), as the scaffolder selects it. */
async function livePack(docType: string, agency: string) {
  const r = await pg.query<{ version: string; required_sections: Array<{ key: string; parent_key: string | null; label: string; mandatory: boolean }> }>(
    `SELECT version, required_sections FROM c2c_rule_packs
      WHERE doc_type = $1 AND agency = $2 AND superseded_by IS NULL
      ORDER BY effective_from DESC`,
    [docType, agency],
  );
  expect(r.rows.length, `expected exactly one live ${docType}:${agency} pack`).toBe(1);
  const secs = r.rows[0].required_sections;
  return { version: r.rows[0].version, secs, keys: new Set(secs.map((x) => x.key)), labels: secs.map((x) => x.label) };
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
    // `cta`, `anda` and `ide` are deliberately absent, each for a reason the
    // list has to state or it becomes a place to hide a thin pack:
    //   • cta — an EU clinical trial application under CTR 536/2014 is a
    //     Part I / Part II submission built around an IMPD, not a CTD.
    //   • anda — a CTD, but a FOUR-module one. 21 CFR 314.94 has no Module 4;
    //     substituting bioequivalence for nonclinical pharmacology and
    //     toxicology is the whole premise of the abbreviated pathway, so
    //     demanding M4 of it would demand the thing that makes it not an ANDA.
    //   • ide — 21 CFR 812.20 defines a lettered set A-K in the regulation
    //     itself. It is not a CTD at any module count.
    // All three are covered by their own shape tests below, so exclusion here
    // costs no coverage.
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

  /*
   * cta:ema now carries the real CTR 536/2014 Annex I outline, so this asserts
   * its SHAPE rather than recording a gap.
   *
   * Worth knowing why the previous version had to be replaced and not merely
   * satisfied: it asserted `roots.length === 2`, meaning "M1 plus a bare M2".
   * CTR 536/2014 also has exactly two top-level parts — Part I and Part II — so
   * the real outline would have passed the thin-pack tripwire by coincidence and
   * the guard would have gone quiet while appearing to hold. A count is a weak
   * proxy for a shape.
   *
   * An EU clinical trial application is NOT a five-module CTD, which is why cta
   * is excluded by name from the M1-M5 assertion above. Annex I splits the
   * documentation by who assesses it: Part I (A-J), assessed jointly by the
   * Member States concerned, covers the science and the product; Part II (K-R),
   * assessed nationally, covers ethics, sites, insurance and data protection.
   */
  it('cta:ema carries the CTR 536/2014 Part I + Part II structure', async () => {
    const r = await pg.query<{ required_sections: any[] }>(
      `SELECT required_sections FROM c2c_rule_packs
        WHERE doc_type = 'cta' AND agency = 'ema' AND superseded_by IS NULL`,
    );
    expect(r.rows.length, 'no live cta:ema pack').toBe(1);
    const secs = r.rows[0].required_sections;
    const keys = new Set(secs.map((x: any) => x.key));

    // Both assessment parts, and each with content beneath it — a bare pair of
    // parts is the placeholder shape this file exists to reject.
    for (const part of ['PI', 'PII']) {
      expect(keys.has(part), `${part} missing`).toBe(true);
      expect(
        secs.filter((x: any) => x.parent_key === part).length,
        `${part} has no sections beneath it`,
      ).toBeGreaterThan(3);
    }

    // The lettered set. Named individually because "there are 27 rows" would be
    // satisfied by 27 of anything.
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J']) {
      expect(keys.has(letter), `Part I is missing ${letter}`).toBe(true);
    }
    for (const letter of ['K', 'L', 'M', 'N', 'O', 'R']) {
      expect(keys.has(letter), `Part II is missing ${letter}`).toBe(true);
    }

    // The IMPD is the substantive half of Part I and carries its own quality
    // split; without it the pack is an index rather than a dossier.
    expect(keys.has('G.1.S') && keys.has('G.1.P'), 'the IMPD quality split is missing').toBe(true);
    expect(secs.find((x: any) => x.key === 'G.1')?.parent_key).toBe('G');
  }, 60_000);

  /*
   * An ANDA is a CTD with a hole in it, and the hole is the point. 21 CFR
   * 314.94 requires Modules 1, 2, 3 and 5; there is no Module 4, because a
   * generic application replaces nonclinical pharmacology and toxicology with a
   * demonstration of bioequivalence to the reference listed drug.
   *
   * The failure this guards against is not an empty pack — "no pack is empty"
   * already catches that — but a pack cloned from nda:fda and relabelled. Such
   * a pack would be non-empty, correctly nested, five-module and completely
   * wrong: it would ask a generics customer for a full nonclinical package they
   * are not required to file and do not have, and it would omit the four items
   * that actually decide an ANDA's fate. So the assertions below are the
   * ANDA-specific ones, named individually.
   */
  it('anda:fda is a four-module CTD carrying the generic-specific sections', async () => {
    const r = await pg.query<{ required_sections: any[] }>(
      `SELECT required_sections FROM c2c_rule_packs
        WHERE doc_type = 'anda' AND agency = 'fda' AND superseded_by IS NULL`,
    );
    expect(r.rows.length, 'no live anda:fda pack').toBe(1);
    const secs = r.rows[0].required_sections;
    const keys = new Set(secs.map((x: any) => x.key));

    const roots = secs.filter((x: any) => x.parent_key === null).map((x: any) => x.key);
    expect(roots, 'an ANDA has no Module 4').toEqual(['M1', 'M2', 'M3', 'M5']);
    expect(keys.has('M4'), 'M4 present — this pack was cloned from an NDA').toBe(false);

    // The four items an ANDA lives or dies on, none of which an NDA pack has.
    // A cloned-from-nda pack passes every generic structural check and fails
    // here, which is the only reason this test earns its place.
    expect(keys.has('1.12.11'), 'the RLD basis for submission is missing').toBe(true);
    expect(keys.has('1.14.3'), 'the side-by-side labeling comparison is missing').toBe(true);
    expect(keys.has('1.15.2'), 'the Paragraph I-IV patent certification is missing').toBe(true);
    expect(keys.has('5.3.1.2'), 'the bioequivalence study reports section is missing').toBe(true);

    // Nesting, module by module — the same property the CTD test asserts, since
    // excluding anda from that test must not exempt it from the rule.
    for (const m of roots) {
      expect(
        secs.filter((x: any) => x.parent_key === m).length,
        `${m} has nothing under it`,
      ).toBeGreaterThan(0);
    }
  }, 60_000);

  /*
   * An IDE is the one pack in the table with no CTD ancestry at all. 21 CFR
   * 812.20(b) enumerates its contents as a lettered list, and 812.25 and 812.27
   * expand two of those letters into the substance of the submission: the
   * investigational plan and the report of prior investigations.
   *
   * The specific wrong answer here is an IDE pack shaped like a 510(k) or a PMA
   * — all three are CDRH device submissions and it is an easy substitution to
   * make — so this asserts the lettered structure rather than a count.
   */
  it('ide:fda carries the 21 CFR 812.20 lettered set, not a device-CTD shape', async () => {
    const r = await pg.query<{ required_sections: any[]; esubmit_channel: string }>(
      `SELECT required_sections, esubmit_channel FROM c2c_rule_packs
        WHERE doc_type = 'ide' AND agency = 'fda' AND superseded_by IS NULL`,
    );
    expect(r.rows.length, 'no live ide:fda pack').toBe(1);
    const secs = r.rows[0].required_sections;
    const keys = new Set(secs.map((x: any) => x.key));

    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'I', 'J']) {
      expect(keys.has(letter), `812.20 item ${letter} is missing`).toBe(true);
    }
    expect(secs.some((x: any) => x.key.startsWith('M')), 'an IDE has no CTD modules').toBe(false);

    // The two letters the regulation expands into their own sections. A pack
    // that stops at the letters is an index of the rule, not an outline of a
    // submission — the exact hollow shape this file exists to reject.
    expect(
      secs.filter((x: any) => x.parent_key === 'C').length,
      'the investigational plan (812.25) has no sections beneath it',
    ).toBeGreaterThan(5);
    expect(
      secs.filter((x: any) => x.parent_key === 'B').length,
      'the report of prior investigations (812.27) has no sections beneath it',
    ).toBeGreaterThan(1);

    // An IDE does not go through the eCTD gateway. Naming ESG here would be a
    // false statement in a column the submission path reads.
    expect(r.rows[0].esubmit_channel).toBe('CDRH-Portal');
  }, 60_000);

  /*
   * pma:fda slipped between this file's two existing rules for two years.
   *
   * "no pack is empty" passes at six sections. The five-module CTD assertion
   * queries doc_type IN ('ind','nda','bla','maa','jnda') and pma is not listed —
   * correctly, because a PMA is not a CTD. So the pack was neither empty nor in
   * scope, and six flat placeholder sections sat live under the most demanding
   * submission the FDA accepts.
   *
   * The shape is asserted, not the count, for the same reason as anda and cta: a
   * count is satisfied by 67 of anything, and the realistic wrong answer here is
   * not an empty pack but the old stub with more rows bolted on.
   */
  it('pma:fda carries the 21 CFR 814.20 tree, not the six-node stub', async () => {
    const r = await pg.query<{ required_sections: any[]; version: string }>(
      `SELECT required_sections, version FROM c2c_rule_packs
        WHERE doc_type = 'pma' AND agency = 'fda' AND superseded_by IS NULL`,
    );
    expect(r.rows.length, 'no live pma:fda pack').toBe(1);
    const secs = r.rows[0].required_sections;
    const keys = new Set(secs.map((x: any) => x.key));

    // The stub is gone, not merely outnumbered.
    expect(r.rows[0].version).not.toBe('fda-pma-2024');

    // Nesting is the whole difference. The stub was six roots and zero children.
    const roots = secs.filter((x: any) => x.parent_key === null);
    expect(roots.length, 'pma has no top-level structure').toBeGreaterThan(8);
    expect(
      secs.length - roots.length,
      'pma is still flat — every section is a root, which is the stub shape',
    ).toBeGreaterThan(40);

    // The parts of 814.20(b) a reviewer looks for, named individually because
    // "there are 67 rows" would be satisfied by 67 of anything.
    for (const key of ['B', 'C', 'D', 'F', 'G', 'H', 'K']) {
      expect(keys.has(key), `814.20(b) section ${key} is missing`).toBe(true);
    }
    // The four that decide a PMA: SSED indications, QSR conformance,
    // biocompatibility, and effectiveness against the primary endpoint.
    expect(keys.has('B.1'), 'SSED indications for use missing').toBe(true);
    expect(keys.has('D.3'), '21 CFR 820 / ISO 13485 conformance missing').toBe(true);
    expect(keys.has('F.1'), 'ISO 10993 biocompatibility missing').toBe(true);
    expect(keys.has('G.4'), 'effectiveness against the primary endpoint missing').toBe(true);

    // Optionality is real: a Class III device with no software or sterile barrier
    // must not be handed mandatory sterilisation and cybersecurity sections.
    const optional = secs.filter((x: any) => x.mandatory === false).map((x: any) => x.key);
    expect(optional, 'every section is mandatory — optionality was flattened').toContain('D.4');
    expect(optional).toContain('C.5');
  }, 60_000);

  /*
   * mdr:ema and ivdr:ema — the EU device and diagnostics segment.
   *
   * Thirteen registry rows offered these and every one scaffolded a US NDA. The
   * shape is asserted rather than the count because the realistic wrong answer
   * is not an empty pack but the CTD spine relabelled: an MDR technical file has
   * no modules, and an IVDR one lives or dies on analytical and clinical
   * performance sections that appear in no CTD.
   */
  it('mdr:ema carries MDR Annex II + III, not a CTD', async () => {
    const r = await pg.query<{ required_sections: any[]; esubmit_channel: string }>(
      `SELECT required_sections, esubmit_channel FROM c2c_rule_packs
        WHERE doc_type = 'mdr' AND agency = 'ema' AND superseded_by IS NULL`,
    );
    expect(r.rows.length, 'no live mdr:ema pack').toBe(1);
    const secs = r.rows[0].required_sections;
    const keys = new Set(secs.map((x: any) => x.key));

    expect(secs.some((x: any) => /^M[1-5]$/.test(x.key)), 'an MDR file has no CTD modules').toBe(false);
    expect(keys.has('II') && keys.has('III'), 'Annex II or III missing').toBe(true);
    // The GSPR checklist and the clinical evaluation report are what a Notified
    // Body opens first; risk management under ISO 14971 is the spine of both.
    expect(keys.has('II.4.a'), 'GSPR checklist missing').toBe(true);
    expect(keys.has('II.6.1.g'), 'clinical evaluation report (Annex XIV A) missing').toBe(true);
    expect(keys.has('II.5.a'), 'ISO 14971 risk management file missing').toBe(true);
    expect(keys.has('III.3'), 'PMCF plan (Annex XIV B) missing').toBe(true);
    expect(keys.has('IV.1'), 'EU declaration of conformity missing').toBe(true);
    expect(r.rows[0].esubmit_channel).toBe('EUDAMED');

    // Class-dependent items must be optional — a Class I device needs no
    // Notified Body certificate and no SSCP.
    const optional = secs.filter((x: any) => x.mandatory === false).map((x: any) => x.key);
    expect(optional).toContain('IV.2');
    expect(optional).toContain('IV.4');
  }, 60_000);

  it('ivdr:ema carries the analytical and clinical performance evidence an IVD turns on', async () => {
    const r = await pg.query<{ required_sections: any[] }>(
      `SELECT required_sections FROM c2c_rule_packs
        WHERE doc_type = 'ivdr' AND agency = 'ema' AND superseded_by IS NULL`,
    );
    expect(r.rows.length, 'no live ivdr:ema pack').toBe(1);
    const secs = r.rows[0].required_sections;
    const keys = new Set(secs.map((x: any) => x.key));

    expect(secs.some((x: any) => /^M[1-5]$/.test(x.key)), 'an IVDR file has no CTD modules').toBe(false);
    // The half that distinguishes an IVDR file from an MDR one. Named
    // individually because "there are 55 rows" is satisfied by 55 of anything.
    expect(keys.has('II.6.1.a'), 'limit of detection / quantitation missing').toBe(true);
    expect(keys.has('II.6.1.b'), 'interference and cross-reactivity missing').toBe(true);
    expect(keys.has('II.6.1.e'), 'metrological traceability of calibrators missing').toBe(true);
    expect(keys.has('II.6.2.a'), 'scientific validity missing').toBe(true);
    expect(keys.has('II.6.2.c'), 'Annex XIII performance evaluation report missing').toBe(true);
    expect(keys.has('III.3'), 'PMPF plan (Annex XIII B) missing').toBe(true);
    // Class D reference-laboratory testing applies to Class D only.
    expect(secs.filter((x: any) => x.mandatory === false).map((x: any) => x.key)).toContain('IV.6');
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

describe('scaffolding a CTA', () => {
  /*
   * The end-to-end payoff. A rule pack nobody can reach is the same as no pack,
   * and until now `cta` was exactly that: a legal doc_type, mapped in
   * PROGRAM_TO_DOC_TYPE, backed by a pack, and rejected by VALID_PROGRAM_TYPES
   * at POST /api/c2c/projects. This drives the real service to prove a European
   * clinical trial application now produces a real dossier rather than a 400.
   */
  beforeEach(() => boot());

  it('writes the real CTR 536/2014 outline, both assessment parts', async () => {
    const r = await scaffold('cta', 'EMA');

    expect(r.skipped, `CTA scaffolding declined: ${JSON.stringify(r)}`).toBeUndefined();
    expect(r.sectionCount, 'a CTA scaffolded to a placeholder-sized outline').toBeGreaterThan(20);

    const rows = await pg.query<{ section_key: string }>(
      `SELECT section_key FROM c2c_document_sections WHERE document_id = $1`,
      [r.documentId],
    );
    const keys = new Set(rows.rows.map(x => x.section_key));

    // Part I and Part II both scaffolded — the split that defines a CTR filing.
    expect(keys.has('PI') && keys.has('PII'), 'an assessment part is missing').toBe(true);
    // The IMPD, with its quality split — the substantive half of Part I.
    expect(keys.has('G') && keys.has('G.1.S') && keys.has('G.1.P')).toBe(true);
    // Part II's national items, which no CTD pack would produce.
    expect(keys.has('L'), 'informed consent (L) missing').toBe(true);
    expect(keys.has('R'), 'GDPR compliance (R) missing').toBe(true);
  }, 60_000);

  it('binds the document to the CTR pack version, not a CTD one', async () => {
    const r = await scaffold('cta', 'EMA');
    const doc = await pg.query<{ doc_type: string; agency: string; rule_pack_version: string }>(
      `SELECT doc_type, agency, rule_pack_version FROM c2c_documents WHERE id = $1`,
      [r.documentId],
    );
    expect(doc.rows[0].doc_type).toBe('cta');
    expect(doc.rows[0].agency).toBe('ema');
    expect(doc.rows[0].rule_pack_version).toBe('ctr-536-2014-annex-i-v1.0');
  }, 60_000);
});

describe('scaffolding an ANDA and an IDE', () => {
  /*
   * The end-to-end payoff, and a different failure from the CTA one.
   *
   * `cta` was rejected at the API boundary — a 400, visible immediately. `anda`
   * and `ide` were ACCEPTED by VALID_PROGRAM_TYPES and then dropped silently:
   * PROGRAM_TO_DOC_TYPE had no entry, resolveDocumentClass() returned null,
   * scaffoldProjectDocuments() declined, and the customer got a project with an
   * empty Vault and no error anywhere. A generics company's first ANDA looked
   * created and contained nothing.
   *
   * So these assert `skipped` is undefined before anything else. That single
   * field is the whole difference between the old behaviour and the new one,
   * and every other assertion here is downstream of it.
   */
  beforeEach(() => boot());

  it('an ANDA scaffolds the four-module outline, through the real service', async () => {
    const r = await scaffold('anda', 'FDA');

    expect(r.skipped, `ANDA scaffolding declined: ${JSON.stringify(r)}`).toBeUndefined();

    const rows = await pg.query<{ section_key: string; parent_key: string | null }>(
      `SELECT section_key, parent_key FROM c2c_document_sections WHERE document_id = $1`,
      [r.documentId],
    );
    const keys = new Set(rows.rows.map((x) => x.section_key));
    const roots = rows.rows.filter((x) => x.parent_key === null).map((x) => x.section_key);

    expect(roots.sort()).toEqual(['M1', 'M2', 'M3', 'M5']);
    // The generic-specific four again, this time proving they survived the trip
    // through scaffoldProjectDocuments() rather than merely sitting in the pack.
    for (const key of ['1.12.11', '1.14.3', '1.15.2', '5.3.1.2']) {
      expect(keys.has(key), `the scaffolded ANDA is missing ${key}`).toBe(true);
    }
  }, 60_000);

  it('an IDE scaffolds the lettered set, through the real service', async () => {
    const r = await scaffold('ide', 'FDA');

    expect(r.skipped, `IDE scaffolding declined: ${JSON.stringify(r)}`).toBeUndefined();

    const keys = new Set(
      (
        await pg.query<{ section_key: string }>(
          `SELECT section_key FROM c2c_document_sections WHERE document_id = $1`,
          [r.documentId],
        )
      ).rows.map((x) => x.section_key),
    );
    // B.1 and C.3 are the two that carry the submission: the prior-investigations
    // reports and the risk analysis. Both sit a level below their letter, so
    // their presence also proves the nesting survived scaffolding.
    for (const key of ['A', 'B', 'B.1', 'C', 'C.3', 'E', 'I']) {
      expect(keys.has(key), `the scaffolded IDE is missing ${key}`).toBe(true);
    }
  }, 60_000);

  /*
   * The insert is the assertion. Before 20260806b widened
   * c2c_documents_doc_type_check, writing either of these rows raised `violates
   * check constraint` — so mapping anda/ide in PROGRAM_TO_DOC_TYPE without the
   * widening would have moved the failure rather than fixed it: from a silently
   * unscaffolded project to a loud one, later.
   *
   * Two tests rather than one loop, deliberately. scaffoldProjectDocuments() is
   * idempotent per PROJECT — a second call against the same project returns
   * `skipped: 'ALREADY_SCAFFOLDED'` and a null documentId, which is correct
   * behaviour and which a loop over both filing types silently trips on. The
   * first draft of this file was that loop; it failed on the second iteration
   * with `Cannot read properties of undefined`, and the honest fix is separate
   * cases with the fresh database `beforeEach` already provides, not a second
   * project id threaded through to make the loop work.
   */
  const bindsTo = (docType: string, version: string) => async () => {
    const r = await scaffold(docType, 'FDA');
    const doc = await pg.query<{ doc_type: string; agency: string; rule_pack_version: string }>(
      `SELECT doc_type, agency, rule_pack_version FROM c2c_documents WHERE id = $1`,
      [r.documentId],
    );
    expect(doc.rows.length, `no governed document written for ${docType}`).toBe(1);
    expect(doc.rows[0].doc_type).toBe(docType);
    expect(doc.rows[0].agency).toBe('fda');
    expect(doc.rows[0].rule_pack_version).toBe(version);
  };

  it(
    'the ANDA binds to its own pack version, and to a doc_type the CHECK admits',
    bindsTo('anda', 'fda-anda-21cfr314-94-v1.0'),
    60_000,
  );

  it(
    'the IDE binds to its own pack version, and to a doc_type the CHECK admits',
    bindsTo('ide', 'fda-ide-21cfr812-20-v1.0'),
    60_000,
  );
});

describe('scaffolding an EU MDR and an EU IVDR', () => {
  /*
   * The end-to-end payoff for the EU device and diagnostics segment.
   *
   * Thirteen registry rows offered these filing types and every one produced a
   * 71-section US NDA, because their tuples had no pathwayKey and programTypeFor
   * fell through to `pw === 'ctd'`. Client routing fixed that but left them on
   * 'device'/'ivd', which are deliberately unmapped — honest, and unsellable.
   * These assert the whole chain now works: program type accepted, doc_type
   * legal, pack seeded, real service scaffolds the real tree.
   */
  beforeEach(() => boot());

  it('an EU MDR technical file scaffolds Annex II + III, not a CTD', async () => {
    const r = await scaffold('mdr', 'EMA');
    expect(r.skipped, `MDR scaffolding declined: ${JSON.stringify(r)}`).toBeUndefined();

    const keys = new Set(
      (await pg.query<{ section_key: string }>(
        `SELECT section_key FROM c2c_document_sections WHERE document_id = $1`, [r.documentId],
      )).rows.map((x) => x.section_key),
    );
    expect(keys.has('II') && keys.has('III'), 'an annex is missing').toBe(true);
    expect(keys.has('II.4.a'), 'GSPR checklist missing').toBe(true);
    expect(keys.has('II.6.1.g'), 'clinical evaluation report missing').toBe(true);
    expect([...keys].some((k) => /^M[1-5]$/.test(k)), 'CTD modules leaked into an MDR file').toBe(false);
  }, 60_000);

  it('an EU IVDR technical file scaffolds its performance evidence', async () => {
    const r = await scaffold('ivdr', 'EMA');
    expect(r.skipped, `IVDR scaffolding declined: ${JSON.stringify(r)}`).toBeUndefined();

    const keys = new Set(
      (await pg.query<{ section_key: string }>(
        `SELECT section_key FROM c2c_document_sections WHERE document_id = $1`, [r.documentId],
      )).rows.map((x) => x.section_key),
    );
    // Analytical + clinical performance: the two things an IVD is judged on and
    // that no CTD contains.
    expect(keys.has('II.6.1.a'), 'limit of detection missing').toBe(true);
    expect(keys.has('II.6.2.c'), 'performance evaluation report missing').toBe(true);
  }, 60_000);

  it('both bind to their own pack and to a doc_type the widened CHECK admits', async () => {
    for (const [pt, ver] of [
      ['mdr', 'eu-mdr-2017-745-annex-ii-v1.0'],
      ['ivdr', 'eu-ivdr-2017-746-annex-ii-v1.0'],
    ] as const) {
      await boot();
      const r = await scaffold(pt, 'EMA');
      const doc = await pg.query<{ doc_type: string; agency: string; rule_pack_version: string }>(
        `SELECT doc_type, agency, rule_pack_version FROM c2c_documents WHERE id = $1`,
        [r.documentId],
      );
      expect(doc.rows.length, `no document written for ${pt}`).toBe(1);
      expect(doc.rows[0].doc_type).toBe(pt);
      expect(doc.rows[0].rule_pack_version).toBe(ver);
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

  it('with every outline EXCEPT 20260806b, an ANDA still declines', async () => {
    // The isolating case. Everything else is applied — the CTD outlines, the
    // CTR pack — so the only difference between this and the passing ANDA tests
    // above is the one migration. Without it the pack is absent and the service
    // fails closed, which is what makes those tests a demonstration rather than
    // a description of whatever the database happened to contain.
    await boot(true, false);
    const r = await scaffold('anda', 'FDA');
    expect(r.skipped, 'an ANDA scaffolded without its rule pack').toBe('NO_RULE_PACK');
    expect(r.sectionCount ?? 0).toBe(0);
  }, 60_000);
});


describe('ind:fda files Module 1 where FDA files it, at the granularity an IND is authored at', () => {
  beforeEach(() => boot());

  it('the live pack is ich-m4-v2.2 with five modules and the 21 CFR 312.23 Module 1 content', async () => {
    const pack = await livePack('ind', 'fda');
    expect(pack.version).toBe('ich-m4-v2.2');
    const roots = pack.secs.filter((x) => x.parent_key === null).map((x) => x.key);
    expect(roots).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    // FDA eCTD Module 1 Specification v2.3 headings an initial IND must carry.
    for (const k of ['1.1.1', '1.1.2', '1.1.3', '1.2', '1.12.14', '1.14.4.1', '1.14.4.2', '1.20']) {
      expect(pack.keys.has(k), `Module 1 heading ${k} missing`).toBe(true);
    }
    // No retired paper-IND numbering: 1.5 TOC, 1.6 plan, 1.7 IB, 1.9 EA.
    for (const k of ['1.5', '1.6', '1.7', '1.8', '1.9']) {
      expect(pack.keys.has(k), `paper-IND heading ${k} must not be in the eCTD outline`).toBe(false);
    }
    // ICH M4 leaves, not one blob per module.
    for (const k of ['3.2.S.4', '3.2.P.5', '4.2.3.2', '5.3.5.1']) {
      expect(pack.keys.has(k), `leaf ${k} missing`).toBe(true);
    }
    const orphans = pack.secs.filter((x) => x.parent_key !== null && !pack.keys.has(x.parent_key!));
    expect(orphans).toEqual([]);
  });

  it('an FDA IND project scaffolds against the new pack, not the superseded 24-node one', async () => {
    const res = await scaffold('ind', 'FDA');
    expect(res.documentId).toBeTruthy();
    const d = await pg.query<{ rule_pack_version: string }>(
      `SELECT rule_pack_version FROM c2c_documents WHERE id = $1`, [res.documentId],
    );
    expect(d.rows[0].rule_pack_version).toBe('ich-m4-v2.2');
    const n = await pg.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM c2c_document_sections WHERE document_id = $1`, [res.documentId],
    );
    expect(Number(n.rows[0].n)).toBeGreaterThan(80);
  });

  it('an initial IND is not asked for post-initial contact changes (1.3.1) or a prior-study listing (5.2)', async () => {
    const pack = await livePack('ind', 'fda');
    const flag = (k: string) => pack.secs.find((x) => x.key === k)?.mandatory;
    expect(flag('1.3.1')).toBe(false);
    expect(flag('5.2')).toBe(false);
    // The initial-IND content is still mandatory.
    for (const k of ['1.1.1', '1.2', '1.20', '1.14.4.1', '1.12.14', '5.3.5.1']) {
      expect(flag(k), `${k} must stay mandatory`).toBe(true);
    }
  });

  it('FALSIFIABLE: without 20260902 the live pack is v2.1 and still demands 1.3.1 and 5.2 of an initial IND', async () => {
    await pg.close();
    await boot(true, true, true, false);
    const pack = await livePack('ind', 'fda');
    expect(pack.version).toBe('ich-m4-v2.1');
    expect(pack.secs.find((x) => x.key === '1.3.1')?.mandatory).toBe(true);
    expect(pack.secs.find((x) => x.key === '5.2')?.mandatory).toBe(true);
  });

  it('FALSIFIABLE: without 20260901 the live ind:fda pack has no 1.20 and still uses the 24-node outline', async () => {
    await pg.close();
    await boot(true, true, false);
    const pack = await livePack('ind', 'fda');
    expect(pack.version).toBe('ich-m4-v2.0');
    expect(pack.keys.has('1.20')).toBe(false);
  });
});

describe('k510:fda and denovo:fda are eSTAR-era outlines', () => {
  beforeEach(() => boot());

  it('510(k): no retired Form 3514 cover sheet; the Part 807 mandatory items and cybersecurity exist', async () => {
    const pack = await livePack('k510', 'fda');
    expect(pack.version).toBe('fda-estar-510k-v1.0');
    expect(pack.labels.some((l) => /3514/.test(l)), 'Form 3514 was retired with eSTAR').toBe(false);
    const mandatory = pack.secs.filter((x) => x.mandatory).map((x) => x.label.toLowerCase());
    expect(mandatory.some((l) => l.includes('510(k) summary'))).toBe(true);
    expect(mandatory.some((l) => l.includes('truthful and accuracy'))).toBe(true);
    expect(pack.labels.some((l) => /cybersecurity/i.test(l))).toBe(true);
    expect(pack.labels.some((l) => /human factors/i.test(l))).toBe(true);
    const orphans = pack.secs.filter((x) => x.parent_key !== null && !pack.keys.has(x.parent_key!));
    expect(orphans).toEqual([]);
  });

  it('De Novo: no Form 3514, no table-of-contents slot, special controls and benefit-risk present', async () => {
    const pack = await livePack('denovo', 'fda');
    expect(pack.version).toBe('fda-estar-denovo-v1.0');
    expect(pack.labels.some((l) => /3514/.test(l))).toBe(false);
    expect(pack.labels.some((l) => /table of contents/i.test(l))).toBe(false);
    expect(pack.labels.some((l) => /special controls/i.test(l))).toBe(true);
    expect(pack.labels.some((l) => /benefit-risk/i.test(l))).toBe(true);
  });

  it('a 510(k) project scaffolds against the eSTAR-era pack', async () => {
    const res = await scaffold('510k', 'FDA');
    expect(res.documentId).toBeTruthy();
    const d = await pg.query<{ rule_pack_version: string }>(
      `SELECT rule_pack_version FROM c2c_documents WHERE id = $1`, [res.documentId],
    );
    expect(d.rows[0].rule_pack_version).toBe('fda-estar-510k-v1.0');
  });

  it('FALSIFIABLE: without 20260901b the live 510(k) pack still demands Form 3514', async () => {
    await pg.close();
    await boot(true, true, false);
    const pack = await livePack('k510', 'fda');
    expect(pack.version).toBe('fda-510k-2024');
    expect(pack.labels.some((l) => /3514/.test(l))).toBe(true);
  });
});
