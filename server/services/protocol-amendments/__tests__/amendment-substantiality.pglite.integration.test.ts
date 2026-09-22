/**
 * Amendment substantiality, END-TO-END against in-process PGlite.
 *
 * The pure engine is covered by `substantiality.test.ts`. What this proves is
 * the part that can silently go wrong in the database:
 *
 *   • the "before" design is captured when the amendment is OPENED, and does
 *     not move when the live design is later edited — without that, the
 *     comparison has nothing to compare and the whole Article 16 assessment is
 *     theatre;
 *   • an amendment opened before this column existed, or against a protocol
 *     with no design bound, reports not-assessed rather than a clean bill;
 *   • tenant scope on both the amendment and the design.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { createAmendmentTx, getAmendmentSubstantiality } from '../protocol-amendments-service';
import { STUDY_DESIGN_META_KIND } from '../../study-design/study-design-repository';
import type { StudyDesign } from '../../study-design/study-design-types';

const ORG = 7;
const OTHER = 9;
const SD = 'sd_amendment';

const DDL = `
CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_kind text, title text, status text DEFAULT 'draft', created_by int, deleted_at timestamptz, study_design_id text);
CREATE TABLE protocol_amendments (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_document_id int NOT NULL, amendment_number text, title text NOT NULL, rationale text, amendment_type text, affects_consent boolean, affects_risk boolean, status text NOT NULL DEFAULT 'draft', submitted_date date, decided_date date, created_by int NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz, study_design_snapshot jsonb, study_design_snapshot_id text, study_design_snapshot_at timestamptz);
CREATE TABLE cdisc_prm_studies (id serial PRIMARY KEY, tenant_id int, study_id varchar(100) UNIQUE, protocol_title text, metadata json);
`;

function design(over: Partial<StudyDesign> = {}): StudyDesign {
  return {
    id: SD,
    title: 'BX-204 pivotal',
    phase: '3',
    indication: 'Type 2 diabetes',
    targetRegions: ['US', 'EU'],
    objectives: [],
    estimands: [],
    endpoints: [{ name: 'HbA1c change at week 24', role: 'primary', type: 'continuous', definition: 'Change from baseline' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'Adults', analysisPopulations: [], eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0-10.5%' }] },
    arms: [{ name: 'BX-204', interventions: [{ name: 'BX-204', role: 'investigational', dose: '10 mg' }] }],
    randomization: { ratio: [1, 1], allocationMethod: 'block', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 600, plannedAnalyses: [] },
    safety: { stoppingRules: 'Stop on confirmed DKA.' },
    ...over,
  };
}

async function writeDesign(d: StudyDesign, tenant = ORG): Promise<void> {
  await pool.query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, protocol_title, metadata) VALUES ($1,$2,$3,$4)
     ON CONFLICT (study_id) DO UPDATE SET metadata = EXCLUDED.metadata`,
    [tenant, SD, d.title, JSON.stringify({ kind: STUDY_DESIGN_META_KIND, design: d })],
  );
}

async function seedProtocol(opts: { org?: number; bound?: boolean } = {}): Promise<number> {
  const org = opts.org ?? ORG;
  const r = await pool.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, created_by, study_design_id)
     VALUES ($1,'clinical','P',5,$2) RETURNING id`,
    [org, opts.bound === false ? null : SD],
  );
  return Number(r.rows[0].id);
}

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); });
beforeEach(async () => {
  await pglite.exec('TRUNCATE protocol_documents, protocol_amendments, cdisc_prm_studies RESTART IDENTITY;');
});

describe('the before-design is captured at open and does not move', () => {
  it('snapshots the bound design when the amendment is created', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();

    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1', amendmentType: 'major' });

    const r = await pool.query(`SELECT study_design_snapshot, study_design_snapshot_id, study_design_snapshot_at FROM protocol_amendments WHERE id = $1`, [id]);
    expect(r.rows[0].study_design_snapshot_id).toBe(SD);
    expect(r.rows[0].study_design_snapshot_at).not.toBeNull();
    expect((r.rows[0].study_design_snapshot as StudyDesign).endpoints[0].name).toBe('HbA1c change at week 24');
  });

  it('detects a change made to the live design AFTER the amendment was opened', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();
    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1', amendmentType: 'major', affectsConsent: true, affectsRisk: true });

    // The author now edits the live design — which is exactly what an
    // amendment IS, and what nothing in this platform could previously see.
    await writeDesign(design({ endpoints: [{ name: 'Fasting plasma glucose at week 24', role: 'primary', type: 'continuous', definition: 'Change from baseline' }] }));

    const out = await getAmendmentSubstantiality(ORG, id);

    expect(out.assessment.verdict).toBe('substantial');
    expect(out.assessment.changed).toContain('primary endpoint');
    expect(out.assessment.indicators.find((i) => i.id === 'eu-ctr-primary-endpoint')?.status).toBe('indicated');
    expect(out.snapshotAt).toBeTruthy();
  });

  it('contradicts a sponsor who opened the same change as administrative', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();
    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1', amendmentType: 'administrative' });
    await writeDesign(design({ population: { targetDescription: 'Adults', analysisPopulations: [], eligibility: [{ type: 'inclusion', text: 'HbA1c 6.0-13.0%' }] } }));

    const out = await getAmendmentSubstantiality(ORG, id);

    expect(out.assessment.declarationConflict).toMatch(/declared administrative/);
    expect(out.assessment.declarationConflict).toMatch(/eligibility criteria/);
  });

  /* The declaration check needs a DECLARATION. The form that creates
     amendments never asked about consent or risk, the writer stored `?? false`,
     and the column defaulted to false. So every product-created amendment read
     as "declared to affect neither", and this branch accused its sponsor of
     contradicting an answer they were never asked for (migrations/20260922e). */
  it('does not accuse a sponsor who declared nothing about consent or risk', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();
    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1', amendmentType: 'major' });
    await writeDesign(design({ population: { targetDescription: 'Adults', analysisPopulations: [], eligibility: [{ type: 'inclusion', text: 'HbA1c 6.0-13.0%' }] } }));

    const stored = await pool.query(`SELECT affects_consent, affects_risk FROM protocol_amendments WHERE id = $1`, [id]);
    expect(stored.rows[0]).toEqual({ affects_consent: null, affects_risk: null });

    const out = await getAmendmentSubstantiality(ORG, id);
    expect(out.assessment.indicators.find((i) => i.id === 'eu-ctr-eligibility')?.status).toBe('indicated');
    expect(out.assessment.declarationConflict).toBeNull();
  });

  it('still contradicts a sponsor who DID declare "affects neither"', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();
    const { id } = await createAmendmentTx(pool, ORG, 5, {
      protocolDocumentId: docId, title: 'A1', amendmentType: 'major', affectsConsent: false, affectsRisk: false,
    });
    await writeDesign(design({ population: { targetDescription: 'Adults', analysisPopulations: [], eligibility: [{ type: 'inclusion', text: 'HbA1c 6.0-13.0%' }] } }));

    const out = await getAmendmentSubstantiality(ORG, id);
    expect(out.assessment.declarationConflict).toMatch(/declared to affect neither consent nor risk/);
  });

  /* An untouched design fires NOTHING. This test first failed for a real
     reason: the snapshot round-trips through jsonb, which does not preserve
     key order, so a plain JSON.stringify comparison reported every field as
     changed and called an amendment where nothing happened "substantial". An
     engine that calls every amendment substantial is as useless as one that
     calls none of them substantial, and more alarming. The comparison is
     canonical now. */
  it('fires no indicator when the design has not moved since the amendment opened', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();
    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1', amendmentType: 'minor' });

    const out = await getAmendmentSubstantiality(ORG, id);

    expect(out.assessment.counts.indicated).toBe(0);
    expect(out.assessment.changed).toEqual([]);
    // Still refuses to call that non-substantial, and says why it stopped
    // short: this design carries no Schedule of Activities, so participant
    // burden could not be compared. Unassessed is not clean.
    expect(out.assessment.verdict).toBe('undetermined');
    expect(out.assessment.verdictReason).toMatch(/NOT a determination of non-substantiality/i);
    expect(out.assessment.indicators.find((i) => i.id === 'eu-ctr-participant-burden')?.status).toBe('not_assessed');
  });

  it('reaches a fully-compared clean result when the design carries a schedule too', async () => {
    const soa = {
      id: 'soa1',
      epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment' as const, order: 1 }],
      visits: [{ id: 'v1', name: 'Day 1', epochId: 'e1', studyDay: 1, order: 1 }],
      activities: [{ id: 'a1', name: 'ECG', category: 'safety' as const, order: 1 }],
      cells: [{ visitId: 'v1', activityId: 'a1', state: 'performed' as const }],
    };
    await writeDesign(design({ scheduleOfActivities: soa as never }));
    const docId = await seedProtocol();
    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1', amendmentType: 'minor' });

    const out = await getAmendmentSubstantiality(ORG, id);

    expect(out.assessment.counts.indicated).toBe(0);
    expect(out.assessment.counts.notAssessed).toBe(0);
    expect(out.assessment.verdict).toBe('no_indicator_found');
    expect(out.assessment.verdictReason).toMatch(/NOT a determination of non-substantiality/i);
  });
});

describe('no baseline is ever invented', () => {
  it('reports not-assessed for an amendment opened against a protocol with no design bound', async () => {
    const docId = await seedProtocol({ bound: false });
    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1', amendmentType: 'minor' });

    const out = await getAmendmentSubstantiality(ORG, id);

    expect(out.snapshotAt).toBeNull();
    expect(out.assessment.verdict).toBe('undetermined');
    expect(out.assessment.indicators.every((i) => i.status === 'not_assessed')).toBe(true);
  });

  it('reports not-assessed for an amendment that predates the snapshot column', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();
    // A row as it would exist from before the migration: no snapshot.
    const r = await pool.query(
      `INSERT INTO protocol_amendments (organization_id, protocol_document_id, title, amendment_type, status, created_by)
       VALUES ($1,$2,'legacy','minor','draft',5) RETURNING id`,
      [ORG, docId],
    );

    const out = await getAmendmentSubstantiality(ORG, Number(r.rows[0].id));

    expect(out.assessment.verdict).toBe('undetermined');
    expect(out.assessment.indicators.every((i) => i.status === 'not_assessed')).toBe(true);
    expect(out.assessment.verdictReason).toMatch(/NOT a determination of non-substantiality/i);
  });

  it('does not snapshot a design belonging to another tenant', async () => {
    await writeDesign(design(), OTHER);
    const docId = await seedProtocol();

    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1' });

    const r = await pool.query(`SELECT study_design_snapshot_id FROM protocol_amendments WHERE id = $1`, [id]);
    expect(r.rows[0].study_design_snapshot_id).toBeNull();
  });

  it('does not read another organization’s amendment', async () => {
    await writeDesign(design());
    const docId = await seedProtocol();
    const { id } = await createAmendmentTx(pool, ORG, 5, { protocolDocumentId: docId, title: 'A1' });

    await expect(getAmendmentSubstantiality(OTHER, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
