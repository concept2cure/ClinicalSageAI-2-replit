/**
 * A Module 3 approval binds to the sources it was compiled from and to the
 * text that is filed — proven on the real column types (jsonb, uuid,
 * timestamp), not on mocks that answer any statement.
 *
 * ── The defects ──────────────────────────────────────────────────────────────
 * 1. Drift was read from one flag, `stale`, that only cmc-write-through sets.
 *    module3-convergence-service and POST /module3-os/source-objects write
 *    source objects without it, and the write-through skips locked sections,
 *    so an approved section could read "current" over sources that changed.
 *    findSectionDrift reads the lineage instead.
 * 2. The approval froze deterministic_json only, and placement filed the LIVE
 *    row, so the signature did not cover the filed narrative and anything that
 *    changed the row after it would have been filed as signed.
 *    readPlaceableSections compares the live row with the signed snapshot.
 *
 * @module server/services/cmc/__tests__/section-signature-binding.pglite
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { findSectionDrift } from '../section-drift';
import {
  CHANGED_SINCE_APPROVAL_SKIP_REASON,
  PRE_NARRATIVE_SIGNATURE_SKIP_REASON,
  placeableContent,
  readPlaceableSections,
} from '../place-module3-into-submission';

const ORG = 7;
const PROJECT = 'proj-1';
let pg: PGlite;
const q = {
  query: (sql: string, params: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }>,
};

const DDL = `
CREATE TABLE cmc_source_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL, project_id text NOT NULL,
  source_type text NOT NULL, source_key text NOT NULL, source_payload jsonb NOT NULL,
  source_hash text NOT NULL, version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
CREATE TABLE cmc_module3_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL, project_id text NOT NULL, section_key text NOT NULL,
  section_path text NOT NULL, deterministic_json jsonb NOT NULL, narrative_text text,
  compiled_hash text NOT NULL, stale boolean NOT NULL DEFAULT false, stale_reason text,
  approval_state text NOT NULL DEFAULT 'draft', approved_version_id uuid,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
CREATE TABLE cmc_section_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL, section_id uuid NOT NULL, source_object_id uuid NOT NULL,
  source_hash_at_compile text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE cmc_module3_section_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL, section_id uuid NOT NULL, project_id text NOT NULL,
  version_number integer NOT NULL, snapshot_json jsonb NOT NULL, diff_summary jsonb,
  state text NOT NULL DEFAULT 'draft', created_by text, created_at timestamp NOT NULL DEFAULT now());
`;

const COMPILED = {
  sectionKey: '3.2.S.4',
  completeness: 100,
  missingInputs: [],
  tables: [{ title: 'Spec', headers: ['Test'], rows: [['Assay']] }],
};
const NARRATIVE = 'The specification is given below.';

async function insertSource(
  type: string,
  key: string,
  hash: string,
  at = "now() - interval '2 hours'"
): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload, source_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, ${at}, ${at}) RETURNING id`,
    [ORG, PROJECT, type, key, hash]
  );
  return r.rows[0].id;
}

/** A section compiled an hour ago from `sources`, approved with the snapshot the approve route now freezes. */
async function compileAndApprove(
  sources: Array<{ id: string; hash: string }>,
  snapshot: Record<string, unknown>
): Promise<string> {
  const s = await pg.query<{ id: string }>(
    `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, approval_state)
     VALUES ($1, $2, '3.2.S.4', '3.2.S.4', $3::jsonb, $4, 'h', 'approved') RETURNING id`,
    [ORG, PROJECT, JSON.stringify(COMPILED), NARRATIVE]
  );
  const sectionId = s.rows[0].id;
  for (const src of sources) {
    await pg.query(
      `INSERT INTO cmc_section_lineage (organization_id, section_id, source_object_id, source_hash_at_compile, created_at)
       VALUES ($1, $2, $3, $4, now() - interval '1 hour')`,
      [ORG, sectionId, src.id, src.hash]
    );
  }
  const v = await pg.query<{ id: string }>(
    `INSERT INTO cmc_module3_section_versions (organization_id, section_id, project_id, version_number, snapshot_json, state)
     VALUES ($1, $2, $3, 1, $4::jsonb, 'approved') RETURNING id`,
    [ORG, sectionId, PROJECT, JSON.stringify(snapshot)]
  );
  await pg.query(`UPDATE cmc_module3_sections SET approved_version_id = $1 WHERE id = $2`, [
    v.rows[0].id,
    sectionId,
  ]);
  return sectionId;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(
    'DELETE FROM cmc_section_lineage; DELETE FROM cmc_module3_section_versions; DELETE FROM cmc_module3_sections; DELETE FROM cmc_source_objects;'
  );
});

describe('findSectionDrift reads the lineage, not the flag', () => {
  it('reports nothing for a section whose sources are as they were compiled (the control)', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    await compileAndApprove([{ id: spec, hash: 'h1' }], { ...COMPILED, narrativeText: NARRATIVE });
    expect(await findSectionDrift(q, ORG, PROJECT)).toEqual([]);
  });

  it('reports a source that changed after compile, though nobody set stale', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    await compileAndApprove([{ id: spec, hash: 'h1' }], { ...COMPILED, narrativeText: NARRATIVE });
    await pg.query(
      `UPDATE cmc_source_objects SET source_hash = 'h2', updated_at = now() WHERE id = $1`,
      [spec]
    );
    expect(await findSectionDrift(q, ORG, PROJECT)).toEqual([
      { sectionKey: '3.2.S.4', reasons: ['specification "SPEC-1" changed after compile'] },
    ]);
  });

  it('reports a source it was compiled from that no longer exists', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    await compileAndApprove([{ id: spec, hash: 'h1' }], { ...COMPILED, narrativeText: NARRATIVE });
    await pg.query(`DELETE FROM cmc_source_objects WHERE id = $1`, [spec]);
    const [drift] = await findSectionDrift(q, ORG, PROJECT);
    expect(drift.reasons[0]).toMatch(/no longer exists/);
  });

  it('reports a newer source of a type the section reads, and ignores one of a type it does not', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    await compileAndApprove([{ id: spec, hash: 'h1' }], { ...COMPILED, narrativeText: NARRATIVE });
    await insertSource('excipient', 'EXC-1', 'e1', 'now()'); // §3.2.P.4 reads excipients; §3.2.S.4 does not
    expect(await findSectionDrift(q, ORG, PROJECT)).toEqual([]);
    await insertSource('qc_result', 'S-2026-007', 'q1', 'now()'); // §3.2.S.4 reads QC results
    expect(await findSectionDrift(q, ORG, PROJECT)).toEqual([
      { sectionKey: '3.2.S.4', reasons: ['qc_result "S-2026-007" was recorded after compile'] },
    ]);
  });

  it('reads one organisation only', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    await compileAndApprove([{ id: spec, hash: 'h1' }], { ...COMPILED, narrativeText: NARRATIVE });
    expect(await findSectionDrift(q, ORG + 1, PROJECT)).toEqual([]);
  });
});

describe('readPlaceableSections files only what was signed', () => {
  it('a section filed exactly as it was signed is signedAsIs', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    await compileAndApprove([{ id: spec, hash: 'h1' }], { ...COMPILED, narrativeText: NARRATIVE });
    const [row] = await readPlaceableSections(q, ORG, PROJECT);
    expect(row).toMatchObject({
      sectionKey: '3.2.S.4',
      snapshotCoversNarrative: true,
      signedAsIs: true,
    });
  });

  it('a narrative changed after the signature is not', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    const id = await compileAndApprove([{ id: spec, hash: 'h1' }], {
      ...COMPILED,
      narrativeText: NARRATIVE,
    });
    await pg.query(
      `UPDATE cmc_module3_sections SET narrative_text = 'Edited after approval.' WHERE id = $1`,
      [id]
    );
    const [row] = await readPlaceableSections(q, ORG, PROJECT);
    expect(row.signedAsIs).toBe(false);
  });

  it('a compiled record changed after the signature is not', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    const id = await compileAndApprove([{ id: spec, hash: 'h1' }], {
      ...COMPILED,
      narrativeText: NARRATIVE,
    });
    await pg.query(
      `UPDATE cmc_module3_sections SET deterministic_json = deterministic_json || '{"completeness": 90}'::jsonb WHERE id = $1`,
      [id]
    );
    const [row] = await readPlaceableSections(q, ORG, PROJECT);
    expect(row.signedAsIs).toBe(false);
  });

  it('a section approved before the signature covered the narrative is named as such', async () => {
    const spec = await insertSource('specification', 'SPEC-1', 'h1');
    await compileAndApprove([{ id: spec, hash: 'h1' }], COMPILED);
    const [row] = await readPlaceableSections(q, ORG, PROJECT);
    expect(row).toMatchObject({ snapshotCoversNarrative: false, signedAsIs: false });
  });
});

describe('placeableContent turns that reading into the placement decision', () => {
  const row = {
    sectionKey: '3.2.S.4',
    narrativeText: NARRATIVE,
    deterministicJson: COMPILED,
    snapshotCoversNarrative: true,
    signedAsIs: true,
  };

  it('files a section signed as it stands', () => {
    expect(placeableContent(row)).toEqual({ narrative: NARRATIVE, tables: COMPILED.tables });
  });

  it('skips, and names, a section changed since it was signed', () => {
    expect(placeableContent({ ...row, signedAsIs: false })).toEqual({
      skip: CHANGED_SINCE_APPROVAL_SKIP_REASON,
    });
  });

  it('skips, and names, a section signed before the signature covered its narrative', () => {
    expect(placeableContent({ ...row, snapshotCoversNarrative: false, signedAsIs: false })).toEqual(
      {
        skip: PRE_NARRATIVE_SIGNATURE_SKIP_REASON,
      }
    );
  });
});
