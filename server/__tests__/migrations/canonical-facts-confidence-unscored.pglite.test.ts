/**
 * canonical_facts.confidence is NULL ("unscored") unless a score was stated.
 *
 * migrations/20260603_living_record_spine.sql declared the column
 * `numeric(5,4) NOT NULL DEFAULT 0.5000`, so every governed fact nobody scored
 * was stored at 0.5 — and with the store now writing NULL for an unstated score,
 * that NOT NULL would refuse the insert instead. The file is amended in place
 * (2026-10-15): the CREATE declares the column nullable with no default, and a
 * conditional block relaxes a table the original created. This runs the file,
 * twice, against PGlite — fresh, and over the original shape.
 *
 * The file is applied by install-fresh only (it is not in C2C_MIGRATION_FILES),
 * so databases provisioned before the amendment need the deploy-set companion
 * the coordinator lands with this change.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'migrations/20260603_living_record_spine.sql';
const SPINE = fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const UNSCORED = { is_nullable: 'YES', column_default: null };
const T = 120_000;

/** What the file references and does not create. */
const PREREQS = `
  CREATE TABLE regulatory_programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE evidence_claims (id serial PRIMARY KEY, program_id integer);
  INSERT INTO regulatory_programs (id) VALUES ('11111111-1111-1111-1111-111111111111');`;

/** canonical_facts as this file created it before 2026-10-15. */
const ORIGINAL_CANONICAL_FACTS = `
  CREATE TABLE canonical_facts (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          integer NOT NULL,
    program_id               uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
    entity                   text NOT NULL,
    field                    text NOT NULL,
    value_num                numeric,
    value_text               text,
    unit                     varchar(40),
    comparator               varchar(8) NOT NULL DEFAULT '=',
    value_type               varchar(20) NOT NULL DEFAULT 'text',
    established_by_claim_id  integer,
    established_by_source_id integer,
    confidence               numeric(5,4) NOT NULL DEFAULT 0.5000,
    status                   varchar(20) NOT NULL DEFAULT 'active',
    version                  integer NOT NULL DEFAULT 1,
    supersedes_id            uuid,
    content_hash             varchar(64),
    metadata                 jsonb DEFAULT '{}'::jsonb,
    created_by               integer,
    created_at               timestamp with time zone NOT NULL DEFAULT now(),
    updated_at               timestamp with time zone NOT NULL DEFAULT now()
  );`;

const insertFact = (field: string, confidence?: string) =>
  confidence === undefined
    ? `INSERT INTO canonical_facts (organization_id, program_id, entity, field, value_num)
       VALUES (1, '11111111-1111-1111-1111-111111111111', 'study', '${field}', 186)`
    : `INSERT INTO canonical_facts (organization_id, program_id, entity, field, value_num, confidence)
       VALUES (1, '11111111-1111-1111-1111-111111111111', 'study', '${field}', 186, ${confidence})`;

async function confidenceColumn(pg: PGlite) {
  const r = await pg.query<{ is_nullable: string; column_default: string | null }>(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'canonical_facts' AND column_name = 'confidence'`,
  );
  return r.rows[0];
}

async function scores(pg: PGlite) {
  const r = await pg.query<{ field: string; confidence: string | null }>(
    `SELECT field, confidence::text AS confidence FROM canonical_facts ORDER BY field`,
  );
  return r.rows;
}

describe(FILE, () => {
  it('creates confidence nullable with no default, and a re-run changes nothing', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQS);
      for (let run = 0; run < 2; run++) {
        await pg.exec(SPINE);
        expect(await confidenceColumn(pg)).toEqual(UNSCORED);
      }
      await pg.exec(insertFact('enrollment'));
      await pg.exec(insertFact('noael', '0.8'));
      expect(await scores(pg)).toEqual([
        { field: 'enrollment', confidence: null },
        { field: 'noael', confidence: '0.8000' },
      ]);
    } finally {
      await pg.close();
    }
  }, T);

  it('relaxes a table the original created, keeps the scores already stored, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQS);
      await pg.exec(ORIGINAL_CANONICAL_FACTS);
      await pg.exec(insertFact('enrollment'));
      await pg.exec(insertFact('noael', '0.9'));
      // Before: an unscored fact is stored at 0.5000.
      expect(await confidenceColumn(pg)).toEqual({ is_nullable: 'NO', column_default: '0.5000' });

      for (let run = 0; run < 2; run++) {
        await pg.exec(SPINE);
        expect(await confidenceColumn(pg)).toEqual(UNSCORED);
      }

      await pg.exec(insertFact('shelf_life'));
      // A stored 0.5000 cannot be told from a score someone gave, so it is kept.
      expect(await scores(pg)).toEqual([
        { field: 'enrollment', confidence: '0.5000' },
        { field: 'noael', confidence: '0.9000' },
        { field: 'shelf_life', confidence: null },
      ]);
    } finally {
      await pg.close();
    }
  }, T);
});
