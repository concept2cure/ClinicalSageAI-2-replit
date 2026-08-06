/**
 * labeling-pi-service — END-TO-END against in-process PGlite.
 *
 * Proves the GA write+read path: a USPI section recorded through the service persists
 * in the real labeling_pi_sections store and reads back org-scoped in USPI document
 * order (HL, BW, then numeric — derived, never stored); the upsert keeps one live row
 * per (org, section); malformed content/negotiation payloads are rejected so the
 * render loop can never break; strict tenant scope and soft-delete hold.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
// upsertLabelingPiSection now opens its own transaction (pool.connect) to commit
// the section text and its author lineage together; PGlite is one connection, so
// the "client" wraps its query.
vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => pool.query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => pool.query(s, p), release: () => undefined }),
  },
  db: {},
}));

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

import {
  upsertLabelingPiSection, listLabelingPiSections, getLabelingPiSection,
  deleteLabelingPiSection, LabelingPiValidationError,
} from '../labeling-pi-service';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE labeling_pi_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id int NOT NULL, section_no text NOT NULL, label text NOT NULL,
  status text NOT NULL DEFAULT 'draft', flag text, program text,
  content jsonb, negotiation jsonb, created_by int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_labeling_pi_sections_org_section
  ON labeling_pi_sections (organization_id, section_no) WHERE deleted_at IS NULL;
`;

beforeAll(async () => {
  pglite = new PGlite();
  // The gate FKs/reads against the span-lineage schema; organizations must exist
  // for its FK, and both tenants are used by the isolation cases.
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a'), (${OTHER},'b');`);
  await pglite.exec(DDL);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
}, 90_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM labeling_pi_sections; DELETE FROM document_span_lineage;`); });

describe('labeling-pi-service', () => {
  it('records sections and lists them in USPI document order (HL, BW, then numeric)', async () => {
    await upsertLabelingPiSection(ORG, { sectionNo: '10', label: 'Overdosage' });
    await upsertLabelingPiSection(ORG, { sectionNo: '2', label: 'Dosage and administration', status: 'review' });
    await upsertLabelingPiSection(ORG, { sectionNo: 'BW', label: 'Boxed warning', status: 'negotiation', flag: 'agency' });
    await upsertLabelingPiSection(ORG, {
      sectionNo: 'HL', label: 'Highlights', status: 'review',
      content: { heading: 'Highlights of prescribing information', body: ['See full prescribing information.'], hl: true },
    });

    const rows = await listLabelingPiSections(ORG);
    expect(rows.map((r) => r.section_no)).toEqual(['HL', 'BW', '2', '10']); // derived doc order, '2' before '10'
    expect(rows[0].content).toMatchObject({ heading: 'Highlights of prescribing information', hl: true });
    expect(rows[1].flag).toBe('agency');
    expect(rows[2].status).toBe('review');
  });

  it('upserts one live row per (org, section) — re-record updates in place', async () => {
    const first = await upsertLabelingPiSection(ORG, { sectionNo: '1', label: 'Indications and usage', status: 'draft', createdBy: 42 });
    const second = await upsertLabelingPiSection(ORG, {
      sectionNo: '1', label: 'Indications and usage', status: 'negotiation', flag: 'agency',
      negotiation: { round: 'Labeling round 2', cycle: 'FDA — day 312', sponsor: 's', agency: 'a', rationale: 'r' },
    });
    expect(second.id).toBe(first.id);                       // same live row
    expect(second.status).toBe('negotiation');
    expect(second.negotiation).toMatchObject({ round: 'Labeling round 2' });
    expect((await listLabelingPiSections(ORG))).toHaveLength(1);
  });

  it('rejects invalid section numbers, unknown status/flag, and malformed payloads', async () => {
    await expect(upsertLabelingPiSection(ORG, { sectionNo: 'XX', label: 'x' })).rejects.toBeInstanceOf(LabelingPiValidationError);
    await expect(upsertLabelingPiSection(ORG, { sectionNo: '1', label: '' })).rejects.toBeInstanceOf(LabelingPiValidationError);
    await expect(upsertLabelingPiSection(ORG, { sectionNo: '1', label: 'x', status: 'nope' })).rejects.toBeInstanceOf(LabelingPiValidationError);
    await expect(upsertLabelingPiSection(ORG, { sectionNo: '1', label: 'x', flag: 'sponsor' })).rejects.toBeInstanceOf(LabelingPiValidationError);
    await expect(upsertLabelingPiSection(ORG, { sectionNo: '1', label: 'x', content: { heading: 'h', body: [1] } })).rejects.toBeInstanceOf(LabelingPiValidationError);
    await expect(upsertLabelingPiSection(ORG, { sectionNo: '1', label: 'x', negotiation: { round: 'r' } })).rejects.toBeInstanceOf(LabelingPiValidationError);
    expect(await listLabelingPiSections(ORG)).toEqual([]);
  });

  it('is strictly tenant-scoped and soft-delete aware', async () => {
    await upsertLabelingPiSection(ORG, { sectionNo: '1', label: 'Mine' });
    await upsertLabelingPiSection(OTHER, { sectionNo: '1', label: 'Theirs' });

    expect((await listLabelingPiSections(ORG)).map((r) => r.label)).toEqual(['Mine']);
    expect(await getLabelingPiSection(OTHER, '1')).toMatchObject({ label: 'Theirs' });

    expect(await deleteLabelingPiSection(ORG, '1')).toBe(true);
    expect(await listLabelingPiSections(ORG)).toEqual([]);   // soft-deleted excluded
    expect(await getLabelingPiSection(ORG, '1')).toBeNull();
    // A fresh record after soft-delete creates a new live row (partial unique index).
    const fresh = await upsertLabelingPiSection(ORG, { sectionNo: '1', label: 'Mine again' });
    expect(fresh.label).toBe('Mine again');
  });
});
