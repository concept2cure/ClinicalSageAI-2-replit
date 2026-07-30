/**
 * assembleOrgPdevDocs — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: a protocol created in the REAL normalized store
 * (protocol_documents + every protocol_* child) is assembled into the full PdevDoc
 * the v2 surface renders — risks with ordinal likelihood/impact, budget per-subject
 * math, nested amendment changes, deviation CAPA, SoA cells, computed completeness —
 * with no blob, no fallback, and strict org scoping.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { assembleOrgPdevDocs } from '../pdev-view-assembler';

const ORG = 7;
const OTHER = 9;

// Minimal DDL — only the columns the assembler reads (mirrors the migrations/protocol_* set).
const DDL = `
CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int, protocol_kind text, protocol_number text, title text, design_type text, phase text, version text, status text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE protocol_sections (id serial PRIMARY KEY, organization_id int, protocol_document_id int, section_key text, title text, content text, required boolean, status text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_objectives (id serial PRIMARY KEY, organization_id int, protocol_document_id int, objective_type text, objective text, endpoint text, timepoint text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_eligibility_criteria (id serial PRIMARY KEY, organization_id int, protocol_document_id int, kind text, criterion text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_schedule_visits (id serial PRIMARY KEY, organization_id int, protocol_document_id int, visit_name text, timepoint text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_risks (id serial PRIMARY KEY, organization_id int, protocol_document_id int, category text, description text, likelihood text, impact text, mitigation text, residual_likelihood text, residual_impact text, status text, deleted_at timestamptz);
CREATE TABLE protocol_milestones (id serial PRIMARY KEY, organization_id int, protocol_document_id int, name text, milestone_type text, target_date date, actual_date date, deleted_at timestamptz);
CREATE TABLE protocol_amendments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, amendment_number text, title text, affects_consent boolean, submitted_date date, decided_date date, deleted_at timestamptz);
CREATE TABLE protocol_amendment_changes (id serial PRIMARY KEY, amendment_id int, section_ref text, change_description text, previous_text text, proposed_text text);
CREATE TABLE protocol_deviations (id serial PRIMARY KEY, organization_id int, protocol_document_id int, deviation_number text, description text, is_reportable boolean, deleted_at timestamptz);
CREATE TABLE protocol_capa_actions (id serial PRIMARY KEY, deviation_id int, action text, status text);
CREATE TABLE protocol_budget_items (id serial PRIMARY KEY, organization_id int, protocol_document_id int, category text, description text, unit_cost numeric, quantity_per_subject numeric, deleted_at timestamptz);
CREATE TABLE protocol_budget_params (id serial PRIMARY KEY, organization_id int, protocol_document_id int, target_enrollment int, sponsor_payment_per_subject numeric, indirect_rate_pct numeric);
CREATE TABLE protocol_review_assignments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, reviewer_name text, role text, status text, deleted_at timestamptz);
CREATE TABLE protocol_review_comments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, section_ref text, comment text, resolved boolean, deleted_at timestamptz);
CREATE TABLE protocol_soa_assessments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, name text, category text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_soa_cells (id serial PRIMARY KEY, organization_id int, protocol_document_id int, assessment_id int, visit_id int, required boolean);
`;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(
    `DELETE FROM protocol_documents; DELETE FROM protocol_sections; DELETE FROM protocol_objectives;
     DELETE FROM protocol_eligibility_criteria; DELETE FROM protocol_schedule_visits; DELETE FROM protocol_risks;
     DELETE FROM protocol_milestones; DELETE FROM protocol_amendments; DELETE FROM protocol_amendment_changes;
     DELETE FROM protocol_deviations; DELETE FROM protocol_capa_actions; DELETE FROM protocol_budget_items;
     DELETE FROM protocol_budget_params; DELETE FROM protocol_review_assignments; DELETE FROM protocol_review_comments;
     DELETE FROM protocol_soa_assessments; DELETE FROM protocol_soa_cells;`,
  );
});

async function seedFullProtocol(org: number): Promise<number> {
  const d = await pglite.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, protocol_number, title, version, status)
     VALUES ($1,'clinical','NSCLC-301','A Phase 3 NSCLC Study','0.3','in_development') RETURNING id`,
    [org],
  );
  const id = (d.rows[0] as { id: number }).id;
  await pglite.query(`INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, required, status, order_index) VALUES ($1,$2,'synopsis','Synopsis','Body',true,'complete',0),($1,$2,'stats','Statistics',null,true,'not_started',8)`, [org, id]);
  await pglite.query(`INSERT INTO protocol_objectives (organization_id, protocol_document_id, objective_type, objective, endpoint, order_index) VALUES ($1,$2,'primary','Demonstrate OS','Overall survival',0)`, [org, id]);
  await pglite.query(`INSERT INTO protocol_eligibility_criteria (organization_id, protocol_document_id, kind, criterion, order_index) VALUES ($1,$2,'inclusion','Adults',0),($1,$2,'exclusion','Prior IO',0)`, [org, id]);
  await pglite.query(`INSERT INTO protocol_schedule_visits (organization_id, protocol_document_id, visit_name, timepoint, order_index) VALUES ($1,$2,'Screening','Day -28',0)`, [org, id]);
  await pglite.query(`INSERT INTO protocol_risks (organization_id, protocol_document_id, category, description, likelihood, impact, mitigation, residual_likelihood, residual_impact, status) VALUES ($1,$2,'regulatory','Endpoint may be questioned','likely','major','Pre-submission meeting','possible','moderate','mitigating')`, [org, id]);
  await pglite.query(`INSERT INTO protocol_milestones (organization_id, protocol_document_id, name, milestone_type, target_date) VALUES ($1,$2,'FPI','enrollment','2020-01-01')`, [org, id]);
  const a = await pglite.query(`INSERT INTO protocol_amendments (organization_id, protocol_document_id, amendment_number, title, affects_consent, submitted_date) VALUES ($1,$2,'A1','Widen eligibility',true,'2026-06-01') RETURNING id`, [org, id]);
  await pglite.query(`INSERT INTO protocol_amendment_changes (amendment_id, section_ref, change_description, previous_text, proposed_text) VALUES ($1,'5.1','loosen age','18-65','18+')`, [(a.rows[0] as { id: number }).id]);
  const dev = await pglite.query(`INSERT INTO protocol_deviations (organization_id, protocol_document_id, deviation_number, description, is_reportable) VALUES ($1,$2,'D1','Missed visit',true) RETURNING id`, [org, id]);
  await pglite.query(`INSERT INTO protocol_capa_actions (deviation_id, action, status) VALUES ($1,'Retrain site','open')`, [(dev.rows[0] as { id: number }).id]);
  await pglite.query(`INSERT INTO protocol_budget_items (organization_id, protocol_document_id, category, description, unit_cost, quantity_per_subject) VALUES ($1,$2,'labs','Central lab',500,3)`, [org, id]);
  await pglite.query(`INSERT INTO protocol_budget_params (organization_id, protocol_document_id, target_enrollment, sponsor_payment_per_subject, indirect_rate_pct) VALUES ($1,$2,420,15000,28)`, [org, id]);
  const asm = await pglite.query(`INSERT INTO protocol_soa_assessments (organization_id, protocol_document_id, name, category, order_index) VALUES ($1,$2,'ECG','safety',0) RETURNING id`, [org, id]);
  await pglite.query(`INSERT INTO protocol_soa_cells (organization_id, protocol_document_id, assessment_id, visit_id, required) VALUES ($1,$2,$3,1,true)`, [org, id, (asm.rows[0] as { id: number }).id]);
  await pglite.query(`INSERT INTO protocol_review_assignments (organization_id, protocol_document_id, reviewer_name, role, status) VALUES ($1,$2,'Dr Reviewer','biostatistician','in_progress')`, [org, id]);
  await pglite.query(`INSERT INTO protocol_review_comments (organization_id, protocol_document_id, section_ref, comment, resolved) VALUES ($1,$2,'9','Clarify the SAP',false)`, [org, id]);
  return id;
}

describe('assembleOrgPdevDocs', () => {
  it('maps a full real protocol into the PdevDoc contract', async () => {
    const id = await seedFullProtocol(ORG);
    const docs = await assembleOrgPdevDocs(ORG);
    expect(docs).toHaveLength(1);
    const doc = docs[0] as any;

    expect(doc.id).toBe(String(id));
    expect(doc.title).toBe('A Phase 3 NSCLC Study');
    expect(doc.shortTitle).toBe('NSCLC-301');
    expect(doc.objectives[0].endpoint).toBe('Overall survival');
    expect(doc.eligibility.inclusion).toHaveLength(1);
    expect(doc.eligibility.exclusion).toHaveLength(1);
    expect(doc.soa.visits[0].label).toBe('Screening');
    expect(doc.soa.assessments[0].label).toBe('ECG');
    expect(Object.keys(doc.soa.cells)).toHaveLength(1);              // one required cell

    // Risk: text enums map to the 1-5 ordinals the surface multiplies.
    expect(doc.risks[0]).toMatchObject({ hazard: 'Endpoint may be questioned', l: 4, i: 4, rl: 3, ri: 3, status: 'mitigating' });

    // Budget: per-subject = unit_cost × quantity; params carried through.
    expect(doc.budget.items[0].perSubject).toBe(1500);
    expect(doc.budget.params).toMatchObject({ enrollment: 420, sponsorPerSubject: 15000, faRate: 28 });

    // Amendment with a nested change; deviation with CAPA.
    expect(doc.amendments[0]).toMatchObject({ num: 'A1', reconsent: true, status: 'submitted' });
    expect(doc.amendments[0].changes[0]).toMatchObject({ sec: '5.1', from: '18-65', to: '18+' });
    expect(doc.deviations[0].capa[0]).toMatchObject({ action: 'Retrain site', status: 'open' });

    expect(doc.reviews[0].reviewer).toBe('Dr Reviewer');
    expect(doc.milestones[0].urgency).toBe('overdue');              // target in the past, no actual date

    // Completeness: one required section is not_started → a critical finding, <100%.
    expect(doc.completeness).toBe(50);
    expect(doc.completenessFindings.some((f: any) => f.sev === 'critical')).toBe(true);
  });

  it('returns [] for an org with no protocols, and never crosses tenants', async () => {
    await seedFullProtocol(ORG);
    expect(await assembleOrgPdevDocs(OTHER)).toEqual([]);           // strict org scope
  });

  it('excludes soft-deleted protocols', async () => {
    const id = await seedFullProtocol(ORG);
    await pglite.query(`UPDATE protocol_documents SET deleted_at = now() WHERE id = $1`, [id]);
    expect(await assembleOrgPdevDocs(ORG)).toEqual([]);
  });
});
