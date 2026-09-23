/**
 * Protocol document ⇄ study design — the link, and the design gates on the
 * protocol. END-TO-END against in-process PGlite.
 *
 * docs/design/PROTOCOL_DESIGN_CONVERGENCE.md order of work, step 1: the design
 * object is the spine and the protocol document is its projection. This proves
 * the two halves of that step that live below the route:
 *
 *   • bindStudyDesignTx / unbindStudyDesignTx are tenant-scoped — another
 *     org's protocol is NOT_FOUND, and a design belonging to another tenant
 *     cannot be bound;
 *   • assembleOrgPdevDocs returns, for a BOUND protocol, the design's identity
 *     and the DESIGN GATES' findings — produced by validateDesign() over the
 *     stored design object, never recomputed here — and `null` for an unbound
 *     one, so the surface can say so honestly.
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
import { bindStudyDesignTx, unbindStudyDesignTx, ProtocolDevError } from '../protocol-development-service';
import { STUDY_DESIGN_META_KIND } from '../../study-design/study-design-repository';
import type { StudyDesign } from '../../study-design/study-design-types';

const ORG = 7;
const OTHER = 9;

/* Only the columns the assembler and the link writer read. */
const DDL = `
CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int, protocol_kind text, protocol_number text, title text, design_type text, phase text, version text, status text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz, sponsor text, principal_investigator text, study_design_id text, study_design_linked_at timestamptz, study_design_linked_by int);
CREATE TABLE protocol_sections (id serial PRIMARY KEY, organization_id int, protocol_document_id int, section_key text, title text, content text, required boolean, status text, order_index int, deleted_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE protocol_objectives (id serial PRIMARY KEY, organization_id int, protocol_document_id int, objective_type text, objective text, endpoint text, timepoint text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_eligibility_criteria (id serial PRIMARY KEY, organization_id int, protocol_document_id int, kind text, criterion text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_schedule_visits (id serial PRIMARY KEY, organization_id int, protocol_document_id int, visit_name text, timepoint text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_risks (id serial PRIMARY KEY, organization_id int, protocol_document_id int, category text, description text, likelihood text, impact text, mitigation text, residual_likelihood text, residual_impact text, status text, deleted_at timestamptz, owner text);
CREATE TABLE protocol_milestones (id serial PRIMARY KEY, organization_id int, protocol_document_id int, name text, milestone_type text, target_date date, actual_date date, deleted_at timestamptz);
CREATE TABLE protocol_amendments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, amendment_number text, title text, affects_consent boolean, submitted_date date, decided_date date, deleted_at timestamptz);
CREATE TABLE protocol_amendment_changes (id serial PRIMARY KEY, amendment_id int, section_ref text, change_description text, previous_text text, proposed_text text);
CREATE TABLE protocol_deviations (id serial PRIMARY KEY, organization_id int, protocol_document_id int, deviation_number text, description text, category text, severity text, is_reportable boolean, affects_safety boolean, status text, deleted_at timestamptz);
CREATE TABLE protocol_capa_actions (id serial PRIMARY KEY, deviation_id int, action text, status text);
CREATE TABLE protocol_budget_items (id serial PRIMARY KEY, organization_id int, protocol_document_id int, category text, description text, unit_cost numeric, quantity_per_subject numeric, deleted_at timestamptz);
CREATE TABLE protocol_budget_params (id serial PRIMARY KEY, organization_id int, protocol_document_id int, target_enrollment int, sponsor_payment_per_subject numeric, indirect_rate_pct numeric);
CREATE TABLE protocol_review_assignments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, reviewer_name text, reviewer_user_id int, role text, status text, deleted_at timestamptz, disposition text, due_date date);
CREATE TABLE protocol_review_comments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, section_ref text, comment text, severity text, resolved boolean, deleted_at timestamptz);
CREATE TABLE protocol_soa_assessments (id serial PRIMARY KEY, organization_id int, protocol_document_id int, name text, category text, order_index int, deleted_at timestamptz);
CREATE TABLE protocol_soa_cells (id serial PRIMARY KEY, organization_id int, protocol_document_id int, assessment_id int, visit_id int, required boolean);
CREATE TABLE protocol_team_members (id serial PRIMARY KEY, organization_id int, protocol_document_id int, member_name text, role text, responsibilities text, deleted_at timestamptz);
CREATE TABLE consent_forms (id serial PRIMARY KEY, organization_id int, protocol_document_id int, title text, version text, status text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE consent_form_elements (id serial PRIMARY KEY, organization_id int, consent_form_id int, element_key text, title text, required boolean, present boolean, order_index int);
CREATE TABLE cdisc_prm_studies (id serial PRIMARY KEY, tenant_id int, study_id varchar(100) UNIQUE, protocol_title text, study_phase varchar(20), indication text, protocol_status varchar(50), metadata json, updated_at timestamptz DEFAULT now());
`;

/**
 * A design with a deliberate, well-known defect: the primary endpoint has no
 * estimand, which design-gates.ts reports as EST-001 / critical under
 * ICH E9(R1). The point of the test is that the PROTOCOL shows the gate's
 * verdict, so the design must actually have one.
 */
const DESIGN: StudyDesign = {
  id: 'sd_link_test',
  title: 'A Phase 3 Study of BX-204 in Type 2 Diabetes',
  phase: '3',
  indication: 'type 2 diabetes',
  objectives: [{ level: 'primary', order: 1, text: 'Demonstrate HbA1c reduction', endpointName: 'HbA1c change' }],
  estimands: [],
  endpoints: [
    { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'Change from baseline in HbA1c at week 24', timepoint: 'week 24' },
  ],
  framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
  population: { targetDescription: 'Adults with T2D', analysisPopulations: [], eligibility: [] },
  arms: [{ name: 'BX-204', interventions: [{ name: 'BX-204', role: 'investigational' }] }],
  statisticalPlan: { plannedAnalyses: [] },
};

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); });

let docId = 0;

beforeEach(async () => {
  await pglite.exec(`DELETE FROM protocol_documents; DELETE FROM protocol_sections; DELETE FROM cdisc_prm_studies;`);
  const d = await pglite.query<{ id: number }>(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, protocol_number, title, version, status)
     VALUES ($1,'clinical','BX-204-301','A Phase 3 Study of BX-204','0.3','in_development') RETURNING id`,
    [ORG],
  );
  docId = d.rows[0].id;
  await pglite.query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, protocol_title, study_phase, indication, protocol_status, metadata)
     VALUES ($1,$2,$3,'3','type 2 diabetes','draft',$4)`,
    [ORG, DESIGN.id, DESIGN.title, JSON.stringify({ kind: STUDY_DESIGN_META_KIND, design: DESIGN })],
  );
});

const client = { query: (sql: string, params?: unknown[]) => pool.query(sql, params) };

describe('protocol document ⇄ study design link', () => {
  it('binds a design and records who linked it and when', async () => {
    await bindStudyDesignTx(client, ORG, docId, DESIGN.id!, 1);
    const r = await pglite.query<{ study_design_id: string; study_design_linked_by: number; study_design_linked_at: unknown }>(
      `SELECT study_design_id, study_design_linked_by, study_design_linked_at FROM protocol_documents WHERE id = $1`,
      [docId],
    );
    expect(r.rows[0].study_design_id).toBe(DESIGN.id);
    expect(r.rows[0].study_design_linked_by).toBe(1);
    expect(r.rows[0].study_design_linked_at).toBeTruthy();
  });

  it('refuses another organization\'s protocol document (NOT_FOUND, nothing written)', async () => {
    await expect(bindStudyDesignTx(client, OTHER, docId, DESIGN.id!, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const r = await pglite.query<{ study_design_id: string | null }>(`SELECT study_design_id FROM protocol_documents WHERE id = $1`, [docId]);
    expect(r.rows[0].study_design_id).toBeNull();
  });

  it('refuses a design that does not exist for this tenant', async () => {
    await expect(bindStudyDesignTx(client, ORG, docId, 'sd_not_mine', 1)).rejects.toBeInstanceOf(ProtocolDevError);
    const r = await pglite.query<{ study_design_id: string | null }>(`SELECT study_design_id FROM protocol_documents WHERE id = $1`, [docId]);
    expect(r.rows[0].study_design_id).toBeNull();
  });

  it('unbinds, and refuses to unbind another organization\'s protocol', async () => {
    await bindStudyDesignTx(client, ORG, docId, DESIGN.id!, 1);
    await expect(unbindStudyDesignTx(client, OTHER, docId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await unbindStudyDesignTx(client, ORG, docId);
    const r = await pglite.query<{ study_design_id: string | null; study_design_linked_at: unknown }>(
      `SELECT study_design_id, study_design_linked_at FROM protocol_documents WHERE id = $1`, [docId],
    );
    expect(r.rows[0].study_design_id).toBeNull();
    expect(r.rows[0].study_design_linked_at).toBeNull();
  });
});

describe('assembleOrgPdevDocs — the design gates on the protocol', () => {
  it('returns null for an unbound protocol — nothing is implied to have passed', async () => {
    const [doc] = await assembleOrgPdevDocs(ORG);
    expect(doc.studyDesign).toBeNull();
  });

  it('returns the design identity and the DESIGN GATES\' findings for a bound protocol', async () => {
    await bindStudyDesignTx(client, ORG, docId, DESIGN.id!, 1);
    const [doc] = await assembleOrgPdevDocs(ORG);
    const sd = doc.studyDesign as Record<string, unknown>;
    expect(sd).toBeTruthy();
    expect(sd.studyId).toBe('sd_link_test');
    expect(sd.resolved).toBe(true);
    expect(sd.title).toBe(DESIGN.title);
    expect(sd.phase).toBe('3');
    expect(sd.indication).toBe('type 2 diabetes');

    // The verdict is the gate engine's, not the assembler's.
    const findings = sd.findings as Array<Record<string, unknown>>;
    expect(Array.isArray(findings)).toBe(true);
    const est = findings.find((f) => f.code === 'EST-001');
    expect(est).toBeTruthy();
    expect(est!.sev).toBe('critical');
    expect(est!.standard).toBe('ICH E9(R1)');
    expect(sd.riskLevel).toBe('critical');
    expect(sd.blocksApproval).toBe(true);
    expect((sd.counts as Record<string, number>).critical).toBeGreaterThan(0);
    expect(sd.summary).toContain('blocked');
  });

  it('does not read another tenant\'s design through the link', async () => {
    await bindStudyDesignTx(client, ORG, docId, DESIGN.id!, 1);
    // The design row moves to another tenant; the link must stop resolving.
    await pglite.query(`UPDATE cdisc_prm_studies SET tenant_id = $1 WHERE study_id = $2`, [OTHER, DESIGN.id]);
    const [doc] = await assembleOrgPdevDocs(ORG);
    const sd = doc.studyDesign as Record<string, unknown>;
    expect(sd.resolved).toBe(false);
    expect(sd.studyId).toBe('sd_link_test');
    expect(sd.findings).toEqual([]);
  });
});
