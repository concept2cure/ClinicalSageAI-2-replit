/**
 * An evidence chain's coverage heuristic and its relevance basis are stored,
 * labelled as what they are.
 *
 * Until 2026-10-15 persistEvidenceChain wrote confidence_score — NULL unless a
 * confidence was measured — and dropped chain.evidenceCoverage (the heuristic
 * the chain strength was graded from) and the primary source's relevanceBasis
 * ('fixed_weight': a hand-set weight, not a measurement), because the table had
 * no column for either. migrations/20260327_data_lineage_tracking.sql (deploy
 * set) is amended in place to add them; this applies it twice, on a database
 * installed before the amendment, and persists a chain through the service.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../db', () => ({ get db() { return holder.db; } }));

import { persistEvidenceChain } from '../../services/data-lineage-service';
import type { EvidenceChain } from '../../services/intelligence/evidence-confidence-model';

const FILE = 'migrations/20260327_data_lineage_tracking.sql';
const ROOT = process.cwd();
const AMENDED = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const BEFORE = execSync(`git show HEAD:${FILE}`, { cwd: ROOT, encoding: 'utf8' });
const T = 120_000;
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE projects (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    INSERT INTO organizations DEFAULT VALUES;`);
  await pg.exec(BEFORE); // an install made before the amendment
  for (let deploy = 0; deploy < 2; deploy++) await pg.exec(AMENDED);
  holder.db = drizzle(pg);
}, T);
afterAll(async () => { await pg?.close(); });

describe(FILE, () => {
  it('is on the deploy path', () => {
    expect((C2C_MIGRATION_FILES as readonly unknown[]).includes(FILE)).toBe(true);
  });

  it('adds the two columns, described as a heuristic and a basis', async () => {
    const r = await pg.query<{ column_name: string; d: string | null }>(
      `SELECT column_name, col_description('evidence_chain_records'::regclass, ordinal_position) AS d
         FROM information_schema.columns WHERE table_name = 'evidence_chain_records'
          AND column_name IN ('evidence_coverage_heuristic', 'primary_relevance_basis') ORDER BY column_name`);
    expect(r.rows.map(x => x.column_name)).toEqual(['evidence_coverage_heuristic', 'primary_relevance_basis']);
    expect(r.rows[0].d).toMatch(/heuristic, not a confidence/);
  });

  it('persists the coverage heuristic and the relevance basis; confidence stays unmeasured', async () => {
    const chain: EvidenceChain = {
      primarySource: { sourceType: 'regulatory_reference', sourceId: 'r1', sourceTitle: 'Rule', relevance: 0.8, relevanceBasis: 'fixed_weight' },
      supportingSources: [],
      confidenceBasis: 'ai_inferred',
      confidenceScore: null,
      evidenceCoverage: 62,
      chainStrength: 'moderate',
    };
    const rec = await persistEvidenceChain(1, undefined, 'artifact', 'a1', chain);
    expect(rec, 'the chain was not persisted').not.toBeNull();
    const row = (await pg.query<Record<string, unknown>>(
      'SELECT confidence_score, evidence_coverage_heuristic, primary_relevance_basis FROM evidence_chain_records')).rows[0];
    expect(row).toEqual({ confidence_score: null, evidence_coverage_heuristic: 62, primary_relevance_basis: 'fixed_weight' });
  });
});
