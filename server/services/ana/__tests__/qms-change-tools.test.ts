/**
 * AnA change-control tools — END-TO-END through the registered handlers against
 * in-process PGlite (real Postgres, WASM).
 *
 * Proves the AnA-first path a human tester triggers ("Raise change request",
 * "Advance", "Link a record") actually EXECUTES: tool input → registered
 * handler → changeControl.service → real SQL, with the lifecycle guards intact.
 * The registry-consistency test proves the tools are wired; this proves they work.
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
// The service + the executor both read `pool` from server/db (../../../db from here).
vi.mock('../../../db', () => ({
  pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) },
  getPool: () => ({
    query: (s: string, p?: unknown[]) => pool.query(s, p),
    // C2C-AUDIT-001: the controlled-document handlers now run their mutation
    // and their Part 11 audit row in ONE transaction on a pooled client.
    // PGlite is a single connection, so BEGIN/COMMIT/ROLLBACK here are real.
    connect: async () => ({
      query: (s: string, p?: unknown[]) => pool.query(s, p),
      release: () => undefined,
    }),
  }),
}));
// Keep the Part 11 audit write out of the DB in this focused test
// (server/services/auditService = ../../auditService from here). Still used by
// the qms_change_* handlers.
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) } }));
// revise/retire_qms_document now write their audit via recordGovernedAction on
// the mutation's own client instead of a fire-and-forget auditService call.
// Atomicity is proved end-to-end against real audit DDL in
// qms-vault-audit-atomicity.contract.test.ts; stubbing it here keeps this
// suite focused on the change-control lifecycle without audit_logs DDL.
vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async () => ({ actionId: 'act_test', auditId: 'aud_test', sha256Chain: '' })),
}));

import { getToolHandler } from '../AnaToolExecutor';

const DDL = `
CREATE TABLE qms_documents (
  id serial PRIMARY KEY, organization_id int NOT NULL, doc_number text NOT NULL, title text NOT NULL,
  doc_type text NOT NULL, category text, version text NOT NULL DEFAULT '1.0', status text NOT NULL DEFAULT 'draft',
  effective_date date, next_review_date date, author_id int, approver_id int, approved_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE qms_change_controls (
  id serial PRIMARY KEY, organization_id int NOT NULL, change_number text NOT NULL, title text NOT NULL,
  description text, change_type text NOT NULL DEFAULT 'other', classification text NOT NULL DEFAULT 'minor',
  risk_level text, status text NOT NULL DEFAULT 'proposed', reason text, impact_assessment text,
  implementation_plan text, proposed_by int, assessed_by int, approved_by int, approved_at timestamptz,
  target_implementation_date date, implemented_at timestamptz, verified_by int, verified_at timestamptz,
  effectiveness_review text, closed_at timestamptz, qms_document_id int, metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE UNIQUE INDEX qms_change_org_number_uniq ON qms_change_controls (organization_id, change_number) WHERE deleted_at IS NULL;
CREATE TABLE qms_change_links (
  id serial PRIMARY KEY, organization_id int NOT NULL,
  change_id int NOT NULL REFERENCES qms_change_controls(id) ON DELETE CASCADE,
  link_type text NOT NULL, linked_ref text NOT NULL, linked_label text, linked_id int,
  relationship text NOT NULL DEFAULT 'references', note text, created_by int, created_at timestamptz NOT NULL DEFAULT now()
);
`;

const CTX = { organizationId: 1, userId: 10 };

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
});
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec('DELETE FROM qms_change_links; DELETE FROM qms_change_controls; DELETE FROM qms_documents;'); });

async function call(name: string, input: Record<string, unknown>, ctx = CTX) {
  const handler = getToolHandler(name);
  expect(handler, `${name} must be registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, ctx as never));
}

describe('qms_change_create', () => {
  it('raises a controlled change and persists it', async () => {
    const res = await call('qms_change_create', {
      change_number: 'CC-2026-050', title: 'Second-source resin', change_type: 'material',
      classification: 'major', reason: 'Supply resilience.',
    });
    expect(res.ok).toBe(true);
    expect(res.change_number).toBe('CC-2026-050');
    expect(res.status).toBe('proposed');
    const db = await pglite.query(`SELECT title, proposed_by FROM qms_change_controls WHERE change_number = 'CC-2026-050'`);
    expect((db.rows[0] as { title: string }).title).toBe('Second-source resin');
    expect((db.rows[0] as { proposed_by: number }).proposed_by).toBe(10);
  });

  it('requires change_number and title', async () => {
    const res = await call('qms_change_create', { title: 'x' });
    expect(res.error).toMatch(/required/i);
  });
});

describe('qms_change_transition', () => {
  it('advances a change through the lifecycle with a reason (Part 11)', async () => {
    const created = await call('qms_change_create', { change_number: 'CC-2026-051', title: 'y', reason: 'r' });
    const res = await call('qms_change_transition', { change_id: created.id, to: 'under_assessment', reason: 'Begin impact assessment.' });
    expect(res.ok).toBe(true);
    expect(res.governed).toBe(true);
    expect(res.status).toBe('under_assessment');
  });

  it('refuses a transition without a reason-for-change', async () => {
    const created = await call('qms_change_create', { change_number: 'CC-2026-052', title: 'y' });
    const res = await call('qms_change_transition', { change_id: created.id, to: 'under_assessment' });
    expect(res.error).toMatch(/reason for change is required/i);
  });

  it('enforces segregation of duties (approver ≠ proposer)', async () => {
    const created = await call('qms_change_create', { change_number: 'CC-2026-053', title: 'y', reason: 'r' }); // proposed_by = 10
    await call('qms_change_transition', { change_id: created.id, to: 'under_assessment', reason: 'assess' });
    const res = await call('qms_change_transition', { change_id: created.id, to: 'approved', reason: 'approve' }, CTX); // same user 10
    expect(res.error).toMatch(/approver must differ/i);
  });

  it('rejects an illegal transition', async () => {
    const created = await call('qms_change_create', { change_number: 'CC-2026-054', title: 'y', reason: 'r' });
    const res = await call('qms_change_transition', { change_id: created.id, to: 'closed', reason: 'skip ahead' });
    expect(res.error).toMatch(/cannot move change/i);
  });
});

describe('qms_change_link', () => {
  it('links a change to a deviation', async () => {
    const created = await call('qms_change_create', { change_number: 'CC-2026-055', title: 'y', reason: 'r' });
    const res = await call('qms_change_link', { change_id: created.id, link_type: 'deviation', linked_ref: 'DEV-2026-099', relationship: 'triggered_by' });
    expect(res.ok).toBe(true);
    const db = await pglite.query(`SELECT link_type, linked_ref FROM qms_change_links WHERE change_id = $1`, [created.id]);
    expect((db.rows[0] as { linked_ref: string }).linked_ref).toBe('DEV-2026-099');
  });
});

describe('revise_qms_document / retire_qms_document (SOP register)', () => {
  async function effectiveDoc(num: string) {
    const r = await pglite.query(
      `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, approver_id)
       VALUES (1, $1, 'Proc', 'sop', '3.1', 'effective', 11) RETURNING id`, [num],
    );
    return (r.rows[0] as { id: number }).id;
  }

  it('opens a controlled revision (bumps version, back to draft, clears approval)', async () => {
    const id = await effectiveDoc('SOP-900');
    const res = await call('revise_qms_document', { document_id: id, reason: 'Add re-qualification cadence.' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('draft');
    expect(res.version).toBe('4.0');
    const db = await pglite.query(`SELECT approver_id FROM qms_documents WHERE id = $1`, [id]);
    expect((db.rows[0] as { approver_id: number | null }).approver_id).toBeNull();
  });

  it('requires a reason to revise', async () => {
    const id = await effectiveDoc('SOP-901');
    const res = await call('revise_qms_document', { document_id: id });
    expect(res.error).toMatch(/reason for change is required/i);
  });

  it('retires a document (terminal)', async () => {
    const id = await effectiveDoc('SOP-902');
    const res = await call('retire_qms_document', { document_id: id, reason: 'Superseded.' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('retired');
    // Retiring an already-retired doc is refused.
    const again = await call('retire_qms_document', { document_id: id });
    expect(again.error).toMatch(/already retired/i);
  });
});
