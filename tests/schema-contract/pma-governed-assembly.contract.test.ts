/**
 * Contract: a PMA authored in the governed editor reaches the PMA assembly
 * verdict — through the real schema, the real rule pack and the real loader.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * A Class III program was scaffolded from pma:fda (fda-pma-21cfr814-20-v1.0,
 * the 67-node 21 CFR 814.20 tree) into c2c_document_sections and authored
 * through the governed editor. Readiness read it. Assembly did not: the
 * device-assembly contract admitted only '510k' | 'de_novo', the scope
 * resolver did not say which class of governed document answered, and the PMA
 * mapper's matchers were written against a different vocabulary than the
 * pack's own labels — authored CHILD sections (A.3, G.1, G.5 …) left the
 * 'clinical' and 'ssed-summary' modules reported missing, so a sponsor who
 * had written the study protocols was told they had not.
 *
 * ── What this proves ──────────────────────────────────────────────────────────
 *   • the scope resolver reports docType 'pma' for the program, from the
 *     tenant-scoped c2c_documents lookup;
 *   • the governed leaves, scored as pathway 'pma', are a draft content package
 *     with NO "required section(s) missing" blocker when the pack's mandatory
 *     leaves carry real approved content;
 *   • the gate is falsifiable: blank G.5 (statistical analysis) to a
 *     placeholder and the statistical-analysis blocker appears.
 *
 * PGlite runs the real migrations (Part 11 GUC-gated version trigger included),
 * so an INSERT or UPDATE the server would reject fails the test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREREQ = path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');
const PMA_OUTLINE = path.join(REPO_ROOT, 'migrations/20260810_pma_fda_814_20_outline.sql');

const ORG = 7;
const USER = 1;
const PROGRAM = '11111111-2222-3333-4444-555555555555';

let pg: PGlite;

// The loader defaults to the shared pool; every call here injects PGlite as the
// client, and the shared module must still import without a database.
vi.mock('../../server/db', () => ({
  db: {},
  pool: { query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]) },
}));

import { scaffoldProjectDocuments } from '../../server/services/c2c/scaffold-project-documents';
import {
  resolveDeviceContentScope,
  loadDeviceContentLeaves,
} from '../../server/services/pathway-engines/estar/estar-content-leaves';
import { assembleDeviceSubmission } from '../../server/services/pathway-engines/device-assembly/assemble-device-submission';

const client = () => ({ query: (sql: string, p?: unknown[]) => pg.query(sql, p as any[]) });

/** Mandatory leaves of the pack, one per required PMA module, plus the SSED entry. */
const AUTHORED_KEYS = ['A.3', 'B.1', 'C.1', 'D.1', 'F.1', 'G.1', 'G.5', 'H.1'];

const bodyFor = (key: string) =>
  `Authored content for section ${key} of the CV-330 implantable monitor PMA — real, approved text long enough to count as substantive.`;

beforeEach(async () => {
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
  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROGRAM]);
  await pg.exec(fs.readFileSync(PREREQ, 'utf8'));
  await pg.exec(fs.readFileSync(SCHEMA, 'utf8'));
  await pg.exec(fs.readFileSync(PMA_OUTLINE, 'utf8'));

  // The real scaffolder, against the live pma:fda pack.
  const scaffolded = await scaffoldProjectDocuments({
    client: client(), orgId: ORG, userId: USER, projectId: PROGRAM,
    programType: 'pma', primaryAgency: 'FDA', productName: 'CV-330',
  } as Parameters<typeof scaffoldProjectDocuments>[0]);
  expect(scaffolded.documentId).toBeTruthy();
  expect(scaffolded.sectionCount).toBe(67);

  // Author the mandatory leaves the way the editor does: content + approved
  // status, under Part 11 attribution (the version trigger refuses otherwise).
  await pg.query(`SELECT set_config('app.actor_id', $1, false)`, [String(USER)]);
  await pg.query(`SELECT set_config('app.reason', 'contract test authoring', false)`);
  for (const key of AUTHORED_KEYS) {
    await pg.query(
      `UPDATE c2c_document_sections
          SET content = jsonb_build_object('text', $3::text), status = 'approved'
        WHERE document_id = $1 AND section_key = $2`,
      [scaffolded.documentId, key, bodyFor(key)],
    );
  }
});
afterEach(async () => { await pg?.close(); });

describe('a governed PMA reaches the PMA assembly verdict', () => {
  it('resolves the program to its governed PMA document and scores it as a PMA', async () => {
    const resolved = await resolveDeviceContentScope(ORG, { programId: PROGRAM, client: client() });
    expect(resolved.source).toBe('governed_program');
    expect(resolved.docType).toBe('pma');

    const leaves = await loadDeviceContentLeaves(ORG, resolved.scope);
    expect(leaves.map((l) => l.sectionCode)).toEqual(AUTHORED_KEYS);
    expect(leaves.every((l) => l.substantive)).toBe(true);

    const r = assembleDeviceSubmission({
      pathway: 'pma',
      variant: 'device',
      leaves,
      presentTemplates: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.pathway).toBe('pma');
    expect(r.estar.summary.missingRequired).toEqual([]);
    expect(r.artifactKind).toBe('content-package-draft');
    expect(r.blockers.filter((b) => /section\(s\) missing/.test(b))).toEqual([]);
    // Draft, never a submittable eSTAR: the official PMA template is not vendored.
    expect(r.canProduceOfficialEstar).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/Cannot produce a submittable eSTAR/);
  }, 60_000);

  it('the gate fails on the case it exists to catch: a placeholder statistical analysis blocks assembly', async () => {
    await pg.query(
      `UPDATE c2c_document_sections SET content = jsonb_build_object('text', 'TBD')
        WHERE section_key = 'G.5' AND document_id IN (SELECT id FROM c2c_documents WHERE project_id = $1)`,
      [PROGRAM],
    );
    const resolved = await resolveDeviceContentScope(ORG, { programId: PROGRAM, client: client() });
    const leaves = await loadDeviceContentLeaves(ORG, resolved.scope);
    const r = assembleDeviceSubmission({
      pathway: 'pma',
      variant: 'device',
      leaves,
      presentTemplates: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.estar.summary.missingRequired).toEqual(['statistical-analysis']);
    expect(r.blockers.join(' ')).toMatch(/required eSTAR section\(s\) missing: statistical-analysis/);
  }, 60_000);

  it('another tenant sees nothing of this program (docType never leaks across orgs)', async () => {
    const other = await resolveDeviceContentScope(ORG + 1, { programId: PROGRAM, client: client() });
    expect(other.source).toBe('legacy_org_wide');
    expect(other.docType).toBeUndefined();
  }, 60_000);
});
