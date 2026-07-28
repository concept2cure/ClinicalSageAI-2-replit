/**
 * Security contract: the Schedule of Events ON CONFLICT arbiter must name the
 * tenant column.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * project_schedule_of_events was UNIQUE on (project_id) alone
 * (db/migrations/20260617_project_schedule_of_events.sql:48). Uniqueness is what
 * ON CONFLICT resolves against, so an org-blind key decides WHOSE ROW an upsert
 * lands on. generateProjectSchedule (server/services/projects/schedule-of-events/
 * service.ts) upserted with `ON CONFLICT (project_id) DO UPDATE SET ...`, and
 * POST /projects/:id/schedule-of-events/generate never checked that :id belonged
 * to the caller's organization — it called resolveProjectType(), which returned
 * null for a project in another org, and then carried on with `projectType: null`.
 *
 * The DO UPDATE SET list does not include organization_id, so the overwritten row
 * KEEPS the victim's tenant id: invisible to the attacker, still counted as the
 * victim's record. The write replaces project_type, regulatory_framework, goals,
 * baseline_date, target_date and both summary narratives, bumps `version`, and
 * sets `last_reviewed_by_ana_at = now()` — so the clobbered schedule reads as
 * freshly reviewed. A blind write, no data returned: an integrity event on the
 * artifact a program manages its regulatory milestones from.
 *
 * ── Why these tests execute SQL ───────────────────────────────────────────────
 * A source grep cannot tell you which row an upsert lands on. That is decided by
 * the index, at runtime, in the database. So these tests build the real tables,
 * apply the REAL migration file, and run the REAL upsert statement shape. The
 * org-blind case is reproduced FIRST, against the old index, so the fix is known
 * to close a real mechanism rather than a theorised one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(
  REPO_ROOT,
  'db/migrations/20260728_schedule_of_events_org_scoped_uniqueness.sql'
);

/** Minimal shape of the two tables, matching the columns the handler writes. */
const BASE_SCHEMA = `
  CREATE TABLE projects (
    id              integer PRIMARY KEY,
    organization_id integer NOT NULL,
    type            text,
    metadata        json
  );
  CREATE TABLE project_schedule_of_events (
    id                       serial PRIMARY KEY,
    organization_id          integer NOT NULL,
    project_id               integer NOT NULL REFERENCES projects(id),
    status                   text    NOT NULL DEFAULT 'active',
    project_type             text,
    regulatory_framework     text,
    goals                    json,
    basis_summary            text,
    ana_summary              text,
    confidence               text DEFAULT 'moderate',
    version                  integer NOT NULL DEFAULT 1,
    baseline_date            timestamp,
    target_date              timestamp,
    generated_by_ana         boolean NOT NULL DEFAULT true,
    last_reviewed_by_ana_at  timestamp,
    created_at               timestamp NOT NULL DEFAULT now(),
    updated_at               timestamp NOT NULL DEFAULT now()
  );
`;

/** The org-blind uniqueness as the 20260617 migration left it. */
const OLD_INDEX = `
  CREATE UNIQUE INDEX unique_project_schedule
    ON project_schedule_of_events (project_id);
`;

/** generateProjectSchedule's upsert, verbatim in shape. */
const UPSERT = (arbiter: string) => `
  INSERT INTO project_schedule_of_events
    (organization_id, project_id, status, project_type, regulatory_framework, goals,
     basis_summary, ana_summary, confidence, version, baseline_date, target_date,
     generated_by_ana, last_reviewed_by_ana_at, updated_at)
  VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, now(), now())
  ON CONFLICT ${arbiter} DO UPDATE SET
     status = 'active',
     project_type = EXCLUDED.project_type,
     regulatory_framework = EXCLUDED.regulatory_framework,
     goals = EXCLUDED.goals,
     basis_summary = EXCLUDED.basis_summary,
     ana_summary = EXCLUDED.ana_summary,
     confidence = EXCLUDED.confidence,
     version = project_schedule_of_events.version + 1,
     baseline_date = EXCLUDED.baseline_date,
     target_date = EXCLUDED.target_date,
     generated_by_ana = EXCLUDED.generated_by_ana,
     last_reviewed_by_ana_at = now(),
     updated_at = now()
  RETURNING id, version`;

const VICTIM_ORG = 7;
const ATTACKER_ORG = 42;
const PROJECT = 15;

let pg: PGlite;
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(BASE_SCHEMA);
  // Project 15 belongs to the victim's organization.
  await pg.query(`INSERT INTO projects (id, organization_id, type) VALUES ($1, $2, 'IND')`, [
    PROJECT,
    VICTIM_ORG,
  ]);
});
afterEach(async () => {
  await pg?.close();
});

/** The victim's real, reviewed schedule. */
const seedVictim = async () => {
  await pg.query(
    `INSERT INTO project_schedule_of_events
       (organization_id, project_id, project_type, regulatory_framework, goals,
        basis_summary, ana_summary, confidence, baseline_date, target_date)
     VALUES ($1, $2, 'IND', 'FDA', '[{"title":"First patient dosed"}]',
             'Based on the IND pathway with a Q4 filing target.',
             'On track; CMC stability is the critical path.',
             'high', '2026-01-15', '2026-12-01')`,
    [VICTIM_ORG, PROJECT]
  );
};

/** What org 42 sends when it regenerates a project it does not own. */
const attackerArgs = [
  ATTACKER_ORG,
  PROJECT,
  '510K',
  'FDA-CDRH',
  JSON.stringify([{ title: 'Attacker goal' }]),
  'Regenerated with no goals supplied.',
  'Regenerated with no goals supplied.',
  'moderate',
  '2027-06-01',
  '2028-06-01',
  false,
];

const victimRow = async () => {
  const r = await pg.query<any>(
    `SELECT organization_id, project_type, regulatory_framework, basis_summary, version, target_date
       FROM project_schedule_of_events WHERE project_id = $1 AND organization_id = $2`,
    [PROJECT, VICTIM_ORG]
  );
  return r.rows[0];
};

const applyMigration = async () => {
  await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
};

describe('the org-blind arbiter really was a cross-tenant write (mechanism proof)', () => {
  // Asserts the DEFECT, against the OLD index, so the fix below is known to
  // close a real mechanism. If Postgres ever stopped behaving this way, this
  // test would say so.
  it("lands org 42's regeneration on org 7's row, keeping org 7's tenant id", async () => {
    await pg.exec(OLD_INDEX);
    await seedVictim();

    await pg.query(UPSERT('(project_id)'), attackerArgs);

    const row = await victimRow();
    // The row is still tagged as the victim's — the attack is invisible to them.
    expect(row.organization_id).toBe(VICTIM_ORG);
    // ...but every field of their schedule is now the attacker's.
    expect(row.project_type).toBe('510K');
    expect(row.regulatory_framework).toBe('FDA-CDRH');
    expect(row.basis_summary).toContain('no goals supplied');
    // Version incremented and last_reviewed_by_ana_at refreshed, so the
    // clobbered schedule reads as freshly reviewed rather than tampered with.
    expect(row.version).toBe(2);

    // And there is exactly ONE row: the attacker's insert did not create its
    // own, it consumed the victim's.
    const all = await pg.query<any>(`SELECT count(*)::int AS n FROM project_schedule_of_events`);
    expect(all.rows[0].n).toBe(1);
  });
});

describe('after the migration, the arbiter is tenant-scoped', () => {
  beforeEach(async () => {
    await pg.exec(OLD_INDEX);
    await applyMigration();
  });

  it('drops the org-blind unique index, so ON CONFLICT (project_id) is no longer expressible', async () => {
    await seedVictim();
    // Postgres requires a matching unique index for an ON CONFLICT target. With
    // the narrow index gone, the old statement cannot even be planned — the
    // vulnerable form is now unwritable rather than merely unwritten.
    await expect(pg.query(UPSERT('(project_id)'), attackerArgs)).rejects.toThrow(
      /no unique or exclusion constraint matching the ON CONFLICT/i
    );
  });

  it("org 42 cannot overwrite org 7's schedule", async () => {
    await seedVictim();

    // The composite FK refuses the row outright: project 15 belongs to org 7,
    // so a schedule row claiming org 42 cannot reference it.
    await expect(
      pg.query(UPSERT('(organization_id, project_id)'), attackerArgs)
    ).rejects.toThrow(/fk_schedule_project_same_org|foreign key/i);

    const row = await victimRow();
    expect(row.project_type).toBe('IND');
    expect(row.regulatory_framework).toBe('FDA');
    expect(row.version).toBe(1);
    expect(row.basis_summary).toContain('Q4 filing target');
  });

  it('the owning org can still regenerate its own schedule (upsert still upserts)', async () => {
    await seedVictim();

    await pg.query(UPSERT('(organization_id, project_id)'), [
      VICTIM_ORG,
      PROJECT,
      'NDA',
      'FDA',
      JSON.stringify([{ title: 'Updated goal' }]),
      'Re-baselined for an NDA pathway.',
      'Re-baselined for an NDA pathway.',
      'high',
      '2026-02-01',
      '2027-01-01',
      true,
    ]);

    const row = await victimRow();
    expect(row.project_type).toBe('NDA');
    expect(row.version).toBe(2);

    const all = await pg.query<any>(`SELECT count(*)::int AS n FROM project_schedule_of_events`);
    expect(all.rows[0].n).toBe(1);
  });

  it('still permits only one schedule per project per org', async () => {
    await seedVictim();
    await expect(
      pg.query(
        `INSERT INTO project_schedule_of_events (organization_id, project_id) VALUES ($1, $2)`,
        [VICTIM_ORG, PROJECT]
      )
    ).rejects.toThrow(/unique_project_schedule_org|duplicate key/i);
  });

  it('refuses a schedule row attached to another org\'s project, however it is written', async () => {
    // Not via the upsert — a direct INSERT, standing in for any future code
    // path that bypasses the service layer entirely.
    await expect(
      pg.query(
        `INSERT INTO project_schedule_of_events (organization_id, project_id) VALUES ($1, $2)`,
        [ATTACKER_ORG, PROJECT]
      )
    ).rejects.toThrow(/fk_schedule_project_same_org|foreign key/i);
  });
});

describe('the migration refuses to run over existing cross-tenant rows', () => {
  it('fails loudly and names the offending rows rather than silently failing the FK', async () => {
    await pg.exec(OLD_INDEX);
    // A schedule row whose organization_id disagrees with its project's owner.
    // Only ONE row for this project, so the old unique(project_id) index is
    // satisfied — which is the point: the pre-migration schema had nothing that
    // could detect this state, so a database can already be in it.
    await pg.query(
      `INSERT INTO project_schedule_of_events (organization_id, project_id) VALUES ($1, $2)`,
      [ATTACKER_ORG, PROJECT]
    );

    await expect(applyMigration()).rejects.toThrow(/cross-tenant rows and must be resolved by hand/i);
  });
});
