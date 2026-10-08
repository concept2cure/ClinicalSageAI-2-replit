/**
 * QMS change control — END-TO-END against in-process PGlite (real Postgres, WASM).
 *
 * The mocked route tests prove the HTTP contract; this proves the SQL is valid
 * Postgres and the behaviour is correct against a real engine:
 *   - the migration DDL (qms_change_controls + qms_change_links) applies;
 *   - the GA demo seed (scripts/seed/ga-demo.d/123-qms-quality.mjs) runs and
 *     produces service-readable rows;
 *   - the service reads (list / summary / links) return what the surface renders;
 *   - the controlled lifecycle advances with the right stamps, and both guards
 *     (illegal transition, segregation of duties) fire against real SQL.
 *
 * No Neon/docker — PGlite is in-process.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

// A pg-compatible adapter: PGlite returns { rows, affectedRows }; the service
// (and the seed) expect { rows, rowCount }.
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (sql: string, params?: unknown[]) => pool.query(sql, params) } }));

import * as svc from '../changeControl.service';

/** The GA demo seed is untyped ESM JS with no .d.ts. Import it through a
 *  string-typed specifier so tsc treats it as a runtime dynamic import rather
 *  than statically resolving it — a string-literal import (static OR dynamic)
 *  trips TS7016 under noImplicitAny. Typed at the call site; runtime unchanged.
 *  (Same `await import(var)` idiom already used across the security contract tests.) */
type SeedFn = (client: unknown, ctx: unknown) => Promise<void>;
const SEED_QMS_QUALITY_PATH: string = '../../../../scripts/seed/ga-demo.d/123-qms-quality.mjs';
async function loadSeedQuality(): Promise<SeedFn> {
  const mod = (await import(SEED_QMS_QUALITY_PATH)) as { default: SeedFn };
  return mod.default;
}

// Minimal faithful DDL (mirrors the real migrations; FK-free like the store).
const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE users (id serial PRIMARY KEY, email text);
CREATE TABLE organization_users (organization_id int, user_id int, role text);

CREATE TABLE qms_documents (
  id serial PRIMARY KEY, organization_id int NOT NULL, doc_number text NOT NULL, title text NOT NULL,
  doc_type text NOT NULL, category text, version text NOT NULL DEFAULT '1.0', status text NOT NULL DEFAULT 'draft',
  effective_date date, next_review_date date, author_id int, approver_id int, approved_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE qms_training_records (
  id serial PRIMARY KEY, organization_id int NOT NULL, user_id int NOT NULL, document_id int NOT NULL,
  document_version text NOT NULL, acknowledged_at timestamptz NOT NULL DEFAULT now(),
  acknowledgment_method text, expires_at timestamptz
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
  relationship text NOT NULL DEFAULT 'references', note text, created_by int,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

const ORG = 1;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
  // A fake org + admin + two members (a distinct reviewer for segregation of duties).
  await pglite.exec(`
    INSERT INTO organizations (id, name) VALUES (1, 'Concept2Cure');
    INSERT INTO users (id, email) VALUES (10, 'admin@c2c.test'), (11, 'reviewer@c2c.test'), (12, 'member@c2c.test');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES (1,10,'admin'), (1,11,'member'), (1,12,'member');
  `);
  // Run the GA demo seed against the same engine.
  const seedQuality = await loadSeedQuality();
  await seedQuality(pool, { org: { id: ORG }, admin: { id: 10 } });
});
afterAll(async () => {
  await pglite.close();
});

describe('GA demo seed → service reads (real Postgres)', () => {
  it('seeds the controlled-document register and change-control log', async () => {
    const docs = await pglite.query(`SELECT count(*)::int AS n FROM qms_documents WHERE organization_id = $1`, [ORG]);
    expect((docs.rows[0] as { n: number }).n).toBe(9);
    const changes = await svc.listChanges(ORG);
    expect(changes).toHaveLength(6);
    // Newest-first ordering, and the seeded numbers are present.
    expect(changes.map((c) => c.change_number)).toContain('CC-2026-014');
  });

  it('summary reflects the seeded lifecycle spread', async () => {
    const s = await svc.changeControlSummary(ORG);
    expect(s.total).toBe(6);
    expect(s.closed).toBe(1);                 // CC-2026-002
    expect(s.awaitingApproval).toBe(1);       // under_assessment: CC-2026-014
    expect(s.inImplementation).toBe(1);       // CC-2026-012
    expect(s.awaitingVerification).toBe(1);   // verification: CC-2026-009
    expect(s.open).toBe(5);                   // all but the closed one
  });

  /* QA walk 2026-10-08 (J8): the "Overdue · Past target date" tile said 2
     while five unclosed changes were past target, because it counted only
     approved and in-implementation rows; and the row flags compared against a
     hard-coded '2026-07-24' in the browser. Overdue now means: past its target
     implementation date and implementation not finished (proposed, under
     assessment, approved or in implementation), judged against the database's
     CURRENT_DATE, one predicate for the tile and the rows. Every seeded target
     is before 2026-10-02, so from that day on the answer is fixed: CC-2026-014
     (under assessment), -012 (in implementation), -006 (approved) and -001
     (proposed); not -009 (verification: implemented) nor -002 (closed). */
  it('counts every change past its target whose implementation is unfinished, whatever its stage', async () => {
    const s = await svc.changeControlSummary(ORG);
    expect(s.overdueImplementation).toBe(4);
  });

  it('flags each such change on the register from the server’s date, with the same predicate', async () => {
    const changes = await svc.listChanges(ORG);
    const flagged = changes.filter((c) => c.implementation_overdue === true).map((c) => c.change_number).sort();
    expect(flagged).toEqual(['CC-2026-001', 'CC-2026-006', 'CC-2026-012', 'CC-2026-014']);
    expect(changes.find((c) => c.change_number === 'CC-2026-009')!.implementation_overdue).toBe(false);
    expect(changes.find((c) => c.change_number === 'CC-2026-002')!.implementation_overdue).toBe(false);
  });

  /* QA walk 2026-10-08 (J8): every change showed 0 links and "No linked
     records yet" while qms_change_links held 9 rows — the register read
     returned no links. They are read for the whole register in one query. */
  it('reads every change’s linked records for the register in one org-scoped query', async () => {
    const changes = await svc.listChanges(ORG);
    const byChange = await svc.listLinksForChanges(ORG, changes.map((c) => c.id));
    const total = [...byChange.values()].reduce((n, l) => n + l.length, 0);
    expect(total).toBe(9);
    const cc014 = changes.find((c) => c.change_number === 'CC-2026-014')!;
    expect(byChange.get(cc014.id)!.map((l) => l.linked_ref).sort()).toEqual(['DEV-2026-041', 'SUP-118', 'VP-7']);
    // Another organisation's ids return nothing.
    expect((await svc.listLinksForChanges(ORG + 1, changes.map((c) => c.id))).size).toBe(0);
    expect((await svc.listLinksForChanges(ORG, [])).size).toBe(0);
  });

  it('links a change to its deviation and validation records', async () => {
    const changes = await svc.listChanges(ORG, { status: 'under_assessment' });
    const cc014 = changes.find((c) => c.change_number === 'CC-2026-014')!;
    const links = await svc.listLinks(ORG, cc014.id);
    const refs = links.map((l) => l.linked_ref);
    expect(refs).toContain('DEV-2026-041'); // deviation
    expect(refs).toContain('VP-7');         // validation protocol
    expect(links.find((l) => l.linked_ref === 'DEV-2026-041')!.relationship).toBe('triggered_by');
  });

  it('seeds no effective document and no training against one: approval is a signature the seed cannot give', async () => {
    // P0-18 (2026-10-01): a document becomes effective only with a signed
    // approval in the same transaction. The seed has no signer, so every
    // document is in review and nothing is acknowledged as read yet.
    const effective = await pglite.query(`SELECT count(*)::int AS n FROM qms_documents WHERE status = 'effective'`);
    expect((effective.rows[0] as { n: number }).n).toBe(0);
    const trained = await pglite.query(`SELECT count(*)::int AS n FROM qms_training_records`);
    expect((trained.rows[0] as { n: number }).n).toBe(0);
  });
});

describe('controlled lifecycle against real SQL', () => {
  it('advances proposed → assessed → approved (by a different user) → implemented → verified → closed', async () => {
    const created = await svc.createChange(ORG, {
      changeNumber: 'CC-TEST-100', title: 'Lifecycle proof', changeType: 'process',
      classification: 'major', proposedBy: 10,
    });
    expect(created.status).toBe('proposed');

    let row = await svc.transitionChange(ORG, created.id, 'under_assessment', { userId: 11 });
    expect(row!.status).toBe('under_assessment');

    // Approval is an electronic signature (DP-31 / P1-28): transitionChange
    // refuses it, and the signed route (change-approval-signature.ts) is the one
    // writer. This lifecycle proof stands in for that route with the stamp it writes.
    await expect(svc.transitionChange(ORG, created.id, 'approved', { userId: 11 }))
      .rejects.toMatchObject({ name: 'ChangeApprovalRequiresSignatureError' });
    await pglite.query(
      `UPDATE qms_change_controls SET status = 'approved', approved_by = 11, approved_at = now() WHERE id = $1`,
      [created.id],
    );

    row = await svc.transitionChange(ORG, created.id, 'in_implementation', { userId: 11 });
    expect(row!.status).toBe('in_implementation');

    row = await svc.transitionChange(ORG, created.id, 'verification', { userId: 11 });
    expect(row!.status).toBe('verification');
    expect(row!.implemented_at).toBeTruthy();

    row = await svc.transitionChange(ORG, created.id, 'closed', { userId: 11, effectivenessReview: 'Effective.' });
    expect(row!.status).toBe('closed');
    expect(row!.verified_by).toBe(11);
    expect(row!.closed_at).toBeTruthy();
    expect(row!.effectiveness_review).toBe('Effective.');
  });

  it('rejects an illegal transition (closed is terminal)', async () => {
    const c = await svc.createChange(ORG, { changeNumber: 'CC-TEST-101', title: 'x', proposedBy: 10 });
    await svc.transitionChange(ORG, c.id, 'cancelled', { userId: 10 });
    await expect(svc.transitionChange(ORG, c.id, 'approved', { userId: 11 }))
      .rejects.toBeInstanceOf(svc.InvalidChangeTransitionError);
  });

  it('refuses approval without a signature, for the proposer and anyone else, and changes nothing', async () => {
    const c = await svc.createChange(ORG, { changeNumber: 'CC-TEST-102', title: 'y', proposedBy: 10 });
    await svc.transitionChange(ORG, c.id, 'under_assessment', { userId: 10 });
    for (const userId of [10, 11]) {
      await expect(svc.transitionChange(ORG, c.id, 'approved', { userId }))
        .rejects.toMatchObject({ name: 'ChangeApprovalRequiresSignatureError' });
    }
    const r = await pglite.query(`SELECT status, approved_by FROM qms_change_controls WHERE id = $1`, [c.id]);
    expect(r.rows[0]).toMatchObject({ status: 'under_assessment', approved_by: null });
  });

  it('adds and removes a cross-reference link', async () => {
    const c = await svc.createChange(ORG, { changeNumber: 'CC-TEST-103', title: 'z', proposedBy: 10 });
    const link = await svc.addLink(ORG, c.id, { linkType: 'capa', linkedRef: 'CAPA-999', relationship: 'addresses', createdBy: 10 });
    expect((await svc.listLinks(ORG, c.id))).toHaveLength(1);
    expect(await svc.removeLink(ORG, c.id, link.id)).toBe(true);
    expect((await svc.listLinks(ORG, c.id))).toHaveLength(0);
  });
});
