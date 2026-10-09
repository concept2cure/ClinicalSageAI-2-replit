/**
 * Every citation exported to date carried no section and no page.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `citation-engine.ts` looked the source atom up with
 *
 *     SELECT id, source_type, source_id, metadata
 *       FROM lumen_data_atoms
 *      WHERE id = ANY($1::uuid[])
 *
 * and both halves were impossible against the deployed table. There is no
 * `metadata` column — it is `structured_data` — and `id` is INTEGER, so the
 * uuid[] cast could not have matched even if the projection were right:
 *
 *     ERROR:  column "metadata" does not exist
 *     ERROR:  invalid input syntax for type uuid: "1"
 *
 * The catch warns only on non-42P01 and returns an empty Map, so `atom` was
 * ALWAYS undefined. Every citation therefore got `sectionCode: null`,
 * `pageRef: null`, and an `artifactId` that degraded to the raw vault chunk id
 * — the "opaque chunk ids" the engine's own comment says it exists to prevent.
 * Those nulls freeze into the immutable `ana_artifact_citation_runs` row and
 * are exported by
 * `GET /api/ana/citations/artifacts/:artifactId/export?format=csv` as
 * `primarySourceSection` and `primarySourcePageRef`. An exported artifact.
 *
 * The same phantom column sat in two knowledgeGraphService reads, where it did
 * not degrade a field but failed the whole query, and in atomVersionService's
 * content hash, where `atom.metadata` was always undefined so two atoms
 * differing only in their structured payload hashed identically and no version
 * was cut.
 *
 * ── Why a source test ────────────────────────────────────────────────────────
 * `ci:column-reachability` parses statements it can see; these are template
 * literals inside service methods. This reads the source directly, so a
 * reintroduction fails here regardless of how the string is built.
 *
 * @module server/services/ana/__tests__/citation-atom-columns
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');

/** The columns `public.lumen_data_atoms` actually has. */
const REAL_COLUMNS = [
  'id', 'organization_id', 'source_type', 'source_id', 'atom_type', 'title',
  'content', 'structured_data', 'tags', 'confidence', 'status',
  'created_at', 'updated_at', 'embedding', 'embedding_model', 'embedding_updated_at',
];

const FILES = [
  'server/services/ana/citation-engine.ts',
  'server/services/knowledgeGraphService.ts',
  'server/services/atomVersionService.ts',
];

/** Every `SELECT … FROM lumen_data_atoms` in a file, projection text only. */
function atomProjections(src: string): string[] {
  return [...src.matchAll(/SELECT\s+([\s\S]{0,400}?)\s+FROM\s+lumen_data_atoms/gi)].map(m => m[1]);
}

describe('reads of lumen_data_atoms name columns the table has', () => {
  it('never selects `metadata`, which is `structured_data`', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      for (const projection of atomProjections(readFileSync(join(ROOT, rel), 'utf8'))) {
        if (/\bmetadata\b/.test(projection)) offenders.push(`${rel}: SELECT ${projection.trim()}`);
      }
    }
    expect(offenders, 'lumen_data_atoms has structured_data, not metadata').toEqual([]);
  });

  it('never casts the atom id to uuid — it is an integer', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      for (const m of src.matchAll(/FROM\s+lumen_data_atoms[\s\S]{0,200}?::uuid\[\]/gi)) {
        offenders.push(`${rel}: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(offenders, 'lumen_data_atoms.id is integer; a uuid[] cast raises 22P02').toEqual([]);
  });

  it('selects only columns that exist', () => {
    const allowed = new Set(REAL_COLUMNS);
    const offenders: string[] = [];
    for (const rel of FILES) {
      for (const projection of atomProjections(readFileSync(join(ROOT, rel), 'utf8'))) {
        if (projection.includes('*')) continue; // SELECT * is the table's own shape
        for (const raw of projection.split(',')) {
          const col = raw.trim().split(/\s+/)[0].replace(/^[a-z]+\./i, '');
          if (!col || col.startsWith('$') || /[()']/.test(col)) continue;
          if (!allowed.has(col)) offenders.push(`${rel}: ${col}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
