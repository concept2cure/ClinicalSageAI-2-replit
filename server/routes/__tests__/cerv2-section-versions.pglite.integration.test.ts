/**
 * `cerv2_section_versions` has ONE writer — the three route paths included.
 *
 * WHAT WAS WRONG (ledger L39). Four things wrote that history table: the
 * shared writer in services/cerv2/section-version.ts, which AnA's
 * write_kit_section tool goes through, and three inline INSERTs in
 * routes/cerv2-sections.ts — section create, section PATCH, and
 * accept-ana-draft. None of the three was unsafe on its own; all three were
 * untested, which is why they were still there. Four writers of one table is
 * four answers to "was this change recorded, and with what", and the drift
 * had already started: the create path hardcoded `version_number: 1` instead
 * of deriving it, and none of the three recorded `completion_percentage`.
 *
 * WHAT IS LOCKED HERE. Every one of those three paths now goes through
 * `recordCerv2SectionVersion`, and these tests run them end to end against a
 * real (in-process PGlite) Postgres with the real table shapes, because the
 * claims worth making are about rows that actually landed:
 *
 *   • each path writes exactly one version row, in the canonical shape;
 *   • version numbers APPEND across paths rather than restarting — a create
 *     followed by an edit followed by a draft-accept is 1, 2, 3;
 *   • the row holds the state BEFORE the change, which is the part that makes
 *     it history rather than a copy of the current content;
 *   • the field values are recorded in the dedicated `field_data` column AND
 *     in previous_values / new_values, so neither the point-in-time snapshot
 *     nor the diff is lost;
 *   • content and history commit together: if the version write fails, the
 *     content write is rolled back rather than left unversioned;
 *   • and the route file contains no INSERT into the table at all, so a fourth
 *     writer cannot reappear quietly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// ── Mocks ────────────────────────────────────────────────────────────────────
// `db` is hoisted so the router module and this file share one instance.
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

// The identity the router sees. authMiddleware itself is not under test here —
// what is under test is which actor columns reach the version row.
const actor = vi.hoisted(() => ({
  userId: 501 as number | null,
  email: 'reviewer@sponsor.test' as string | null,
  name: 'Dana Reviewer' as string | null,
  organizationId: 77,
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => {
    req.userId = actor.userId;
    req.userEmail = actor.email;
    req.user = { id: actor.userId, name: actor.name, organizationId: actor.organizationId };
    req.tenantContext = { organizationId: actor.organizationId, userId: actor.userId };
    next();
  },
}));

// The audit_logs reflection and the c2c mutation ledger are separate concerns
// with their own tests; they must not need a database here.
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));
vi.mock('../c2c/actions.js', () => ({
  writeMutation: vi.fn(async () => undefined),
}));

import sectionsRouter from '../cerv2-sections';

// ── Real table shapes (shared/schema.ts) ─────────────────────────────────────
const DDL = `
CREATE TABLE cerv2_510k_sections (
  id                    SERIAL PRIMARY KEY,
  organization_id       INTEGER NOT NULL,
  document_id           INTEGER,
  section_number        TEXT NOT NULL,
  section_title         TEXT NOT NULL,
  section_key           TEXT NOT NULL,
  category              TEXT NOT NULL,
  parent_section_id     INTEGER,
  level                 INTEGER DEFAULT 1,
  display_order         INTEGER NOT NULL,
  is_required           BOOLEAN DEFAULT false,
  icon                  TEXT,
  fields                JSON,
  content               TEXT,
  status                TEXT DEFAULT 'todo',
  completion_percentage INTEGER DEFAULT 0,
  compliance_notes      TEXT,
  regulatory_references TEXT[],
  sources               JSON,
  assigned_to           INTEGER,
  reviewer              INTEGER,
  due_date              DATE,
  last_edited_by        INTEGER,
  validation_errors     JSON,
  validation_status     TEXT DEFAULT 'pending',
  draft_source          TEXT,
  drafted_at            TIMESTAMP,
  drafted_summary       TEXT,
  accepted_at           TIMESTAMP,
  accepted_by           INTEGER,
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE cerv2_section_versions (
  id                    SERIAL PRIMARY KEY,
  section_id            INTEGER NOT NULL REFERENCES cerv2_510k_sections(id) ON DELETE CASCADE,
  organization_id       INTEGER NOT NULL,
  version_number        INTEGER NOT NULL,
  version_label         TEXT,
  change_type           TEXT NOT NULL,
  change_summary        TEXT,
  content               TEXT,
  field_data            JSON,
  status                TEXT,
  completion_percentage INTEGER,
  fields_changed        TEXT[],
  previous_values       JSON,
  new_values            JSON,
  changed_by            INTEGER,
  changed_by_name       TEXT,
  changed_by_email      TEXT,
  changed_at            TIMESTAMP NOT NULL DEFAULT now(),
  ip_address            TEXT,
  user_agent            TEXT,
  comment               TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP DEFAULT now()
);
`;

const ORG = 77;
const UA = 'vitest-agent/1.0';

interface VersionRow {
  section_id: number;
  organization_id: number;
  version_number: number;
  change_type: string;
  change_summary: string | null;
  content: string | null;
  field_data: unknown;
  status: string | null;
  completion_percentage: number | null;
  fields_changed: string[] | null;
  previous_values: any;
  new_values: any;
  changed_by: number | null;
  changed_by_email: string | null;
  changed_by_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

let pg: PGlite;
let app: express.Express;

const api = () => ({
  post: (url: string) => request(app).post(url).set('User-Agent', UA),
  patch: (url: string) => request(app).patch(url).set('User-Agent', UA),
});

async function versionsFor(sectionId: number): Promise<VersionRow[]> {
  const res = await pg.query<VersionRow>(
    `SELECT * FROM cerv2_section_versions WHERE section_id = $1 ORDER BY version_number ASC`,
    [sectionId],
  );
  return res.rows;
}

/** Create a section through the route under test; returns its id. */
async function createSection(overrides: Record<string, unknown> = {}): Promise<number> {
  const res = await api()
    .post('/api/cerv2/sections')
    .send({
      section_number: '5.0',
      section_title: 'Substantial Equivalence Discussion',
      section_key: 'substantial-equivalence',
      category: 'Device',
      content: 'ORIGINAL body text',
      status: 'drafting',
      field_data: { predicate_k: 'K123456' },
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.section.id;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  holder.db = drizzle(pg);

  app = express();
  app.use(express.json());
  app.set('trust proxy', true);
  app.use('/api/cerv2/sections', sectionsRouter);
}, 90_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec('DELETE FROM cerv2_section_versions; DELETE FROM cerv2_510k_sections;');
  actor.userId = 501;
  actor.email = 'reviewer@sponsor.test';
  actor.name = 'Dana Reviewer';
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST / — section create', () => {
  it('writes exactly one version row, in the canonical shape', async () => {
    const sectionId = await createSection();
    const rows = await versionsFor(sectionId);

    expect(rows).toHaveLength(1);
    const v = rows[0];
    expect(v.version_number).toBe(1);
    expect(v.organization_id).toBe(ORG);
    expect(v.change_type).toBe('created');
    expect(v.change_summary).toBe('Section created');
    expect(v.content).toBe('ORIGINAL body text');
    expect(v.status).toBe('drafting');
    expect(v.fields_changed).toEqual(['section_number', 'section_title', 'section_key']);
    // A created section has no prior state, and the row says so explicitly
    // rather than leaving previous_values null.
    expect(v.previous_values).toEqual({});
    expect(v.new_values.section_title).toBe('Substantial Equivalence Discussion');
  });

  it('records the actor and request metadata the audit trail is read for', async () => {
    const sectionId = await createSection();
    const [v] = await versionsFor(sectionId);
    expect(v.changed_by).toBe(501);
    expect(v.changed_by_email).toBe('reviewer@sponsor.test');
    expect(v.changed_by_name).toBe('Dana Reviewer');
    expect(v.user_agent).toBe(UA);
    expect(v.ip_address).toBeTruthy();
  });

  it('records completion_percentage, which the inline insert never did', async () => {
    const sectionId = await createSection();
    const [v] = await versionsFor(sectionId);
    expect(v.completion_percentage).toBe(0);
  });

  it('keeps the submitted field values in the dedicated column and in the diff', async () => {
    const sectionId = await createSection({ field_data: { predicate_k: 'K999111' } });
    const [v] = await versionsFor(sectionId);
    // The dedicated column is the point-in-time snapshot a reviewer reads
    // without reconstructing anything. Consolidating onto the shared writer
    // must not have quietly stopped filling it.
    expect(v.field_data).toEqual({ predicate_k: 'K999111' });
    expect(v.new_values.field_data).toEqual({ predicate_k: 'K999111' });
  });

  it('leaves field_data NULL when no field values were submitted', async () => {
    const sectionId = await createSection({ field_data: undefined });
    const [v] = await versionsFor(sectionId);
    // Honest empty state: nothing was supplied, so the column says nothing was
    // supplied rather than claiming an empty set of fields was recorded.
    expect(v.field_data).toBeNull();
  });
});

describe('PATCH /:sectionId — section edit', () => {
  it('appends version 2 rather than restarting, and preserves the text it replaced', async () => {
    const sectionId = await createSection();

    const res = await api()
      .patch(`/api/cerv2/sections/${sectionId}`)
      .send({ content: 'REVISED body text', status: 'ready_for_review', completion_percentage: 60 });
    expect(res.status).toBe(200);

    const rows = await versionsFor(sectionId);
    expect(rows.map(r => r.version_number)).toEqual([1, 2]);

    const v = rows[1];
    expect(v.change_type).toBe('edited');
    expect(v.change_summary).toBe('Section updated');
    expect(v.content).toBe('REVISED body text');
    expect(v.status).toBe('ready_for_review');
    expect(v.completion_percentage).toBe(60);
    // The part that makes the row history rather than a duplicate of the row
    // it describes.
    expect(v.previous_values.content).toBe('ORIGINAL body text');
    expect(v.previous_values.status).toBe('drafting');
    expect(v.previous_values.field_data).toEqual({ predicate_k: 'K123456' });
    expect(v.new_values.content).toBe('REVISED body text');
    expect(v.fields_changed).toEqual(
      expect.arrayContaining(['content', 'status', 'completion_percentage']),
    );
  });

  it('writes one row per edit — three edits leave versions 1..4', async () => {
    const sectionId = await createSection();
    for (const body of ['edit one', 'edit two', 'edit three']) {
      const res = await api().patch(`/api/cerv2/sections/${sectionId}`).send({ content: body });
      expect(res.status).toBe(200);
    }
    const rows = await versionsFor(sectionId);
    expect(rows.map(r => r.version_number)).toEqual([1, 2, 3, 4]);
    expect(rows[3].content).toBe('edit three');
    expect(rows[3].previous_values.content).toBe('edit two');
  });

  it('FAIL-CLOSED: a failed version write rolls the content write back', async () => {
    // The whole point of running the writer on the caller's transaction. Break
    // the history table for one request and the section must be unchanged —
    // an edit that cannot be recorded must not happen.
    const sectionId = await createSection();
    await pg.exec('ALTER TABLE cerv2_section_versions RENAME COLUMN change_summary TO summary_x');
    try {
      const res = await api()
        .patch(`/api/cerv2/sections/${sectionId}`)
        .send({ content: 'UNRECORDABLE body text' });
      expect(res.status).toBe(500);
    } finally {
      await pg.exec('ALTER TABLE cerv2_section_versions RENAME COLUMN summary_x TO change_summary');
    }

    const section = await pg.query<{ content: string }>(
      `SELECT content FROM cerv2_510k_sections WHERE id = $1`,
      [sectionId],
    );
    expect(section.rows[0].content).toBe('ORIGINAL body text');
  });
});

describe('POST /:sectionId/accept-ana-draft', () => {
  async function seedAnaDraft(): Promise<number> {
    const sectionId = await createSection();
    await pg.query(
      `UPDATE cerv2_510k_sections SET draft_source = 'ana', content = 'AI DRAFTED body' WHERE id = $1`,
      [sectionId],
    );
    return sectionId;
  }

  it('records the acceptance as the next version, with the pre-acceptance state', async () => {
    const sectionId = await seedAnaDraft();

    const res = await api()
      .post(`/api/cerv2/sections/${sectionId}/accept-ana-draft`)
      .send({ status: 'in_review' });
    expect(res.status).toBe(200);

    const rows = await versionsFor(sectionId);
    expect(rows.map(r => r.version_number)).toEqual([1, 2]);

    const v = rows[1];
    expect(v.change_type).toBe('edited');
    expect(v.change_summary).toBe('Accepted AnA draft');
    expect(v.status).toBe('in_review');
    expect(v.content).toBe('AI DRAFTED body');
    expect(v.fields_changed).toEqual(['status', 'accepted_at', 'accepted_by']);
    // Who accepted an AI draft, and what it looked like when they did — and the
    // origin stays stated afterwards; acceptance is a fact added, not one erased.
    expect(v.previous_values.draft_source).toBe('ana');
    expect(v.previous_values.content).toBe('AI DRAFTED body');
    expect(v.new_values.draft_source).toBe('ana');
    expect(typeof v.new_values.accepted_at).toBe('string');
    expect(v.new_values.accepted_by).toBe(501);
    expect(v.changed_by).toBe(501);
  });

  it('keeps the machine origin on the live row and refuses a second acceptance', async () => {
    const sectionId = await seedAnaDraft();
    expect((await api().post(`/api/cerv2/sections/${sectionId}/accept-ana-draft`).send({})).status).toBe(200);
    const { rows } = await pg.query<{
      draft_source: string | null;
      accepted_at: string | null;
      accepted_by: number | null;
    }>(
      `SELECT draft_source, accepted_at, accepted_by FROM cerv2_510k_sections WHERE id = $1`,
      [sectionId],
    );
    // Before L155 this read draft_source = NULL: a section with no stated
    // origin that a person accepted, indistinguishable from human-authored.
    expect(rows[0].draft_source).toBe('ana');
    expect(rows[0].accepted_at).not.toBeNull();
    expect(rows[0].accepted_by).toBe(501);
    const again = await api().post(`/api/cerv2/sections/${sectionId}/accept-ana-draft`).send({});
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already been accepted/);
  });

  it('records the field values both as the state now and as the state before', async () => {
    const sectionId = await seedAnaDraft();
    const res = await api().post(`/api/cerv2/sections/${sectionId}/accept-ana-draft`).send({});
    expect(res.status).toBe(200);
    const rows = await versionsFor(sectionId);
    // The inline insert wrote field_data only — the AFTER state — so the values
    // as they stood before an acceptance were not recoverable. Both now are.
    expect(rows[1].field_data).toEqual({ predicate_k: 'K123456' });
    expect(rows[1].previous_values.field_data).toEqual({ predicate_k: 'K123456' });
  });

  it('records refined content as a content change', async () => {
    const sectionId = await seedAnaDraft();
    const res = await api()
      .post(`/api/cerv2/sections/${sectionId}/accept-ana-draft`)
      .send({ refined_content: 'HUMAN REWRITTEN body' });
    expect(res.status).toBe(200);
    const rows = await versionsFor(sectionId);
    expect(rows[1].fields_changed).toEqual(['content', 'status', 'accepted_at', 'accepted_by']);
    expect(rows[1].content).toBe('HUMAN REWRITTEN body');
    expect(rows[1].previous_values.content).toBe('AI DRAFTED body');
  });
});

describe('all three paths share one numbering sequence', () => {
  it('create → edit → accept-draft yields versions 1, 2, 3', async () => {
    const sectionId = await createSection();
    await api().patch(`/api/cerv2/sections/${sectionId}`).send({ content: 'edited by hand' });
    await pg.query(`UPDATE cerv2_510k_sections SET draft_source = 'ana' WHERE id = $1`, [sectionId]);
    await api().post(`/api/cerv2/sections/${sectionId}/accept-ana-draft`).send({});

    const rows = await versionsFor(sectionId);
    expect(rows.map(r => r.version_number)).toEqual([1, 2, 3]);
    expect(rows.map(r => r.change_summary)).toEqual([
      'Section created',
      'Section updated',
      'Accepted AnA draft',
    ]);
  });
});

describe('SOURCE: one writer per table', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'cerv2-sections.ts'), 'utf8');

  it('the route file writes cerv2_section_versions nowhere itself', () => {
    // A fourth writer is exactly what L39 exists to stop coming back. Both
    // shapes it could take: the Drizzle insert the three handlers used, and
    // raw SQL.
    expect(source).not.toMatch(/\.insert\(\s*cerv2SectionVersions\s*\)/);
    expect(source).not.toMatch(/INSERT\s+INTO\s+cerv2_section_versions/i);
  });

  it('every version row it does write goes through the shared writer, on a transaction', () => {
    const calls = source.match(/recordCerv2SectionVersion\(/g) ?? [];
    // Three handlers: create, PATCH, accept-ana-draft.
    expect(calls).toHaveLength(3);
    expect(source).toContain('sectionVersionExec(tx)');
    expect(source.match(/db\.transaction\(/g) ?? []).toHaveLength(3);
  });
});
