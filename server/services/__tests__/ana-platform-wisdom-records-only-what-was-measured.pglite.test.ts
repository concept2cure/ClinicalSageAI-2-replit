/**
 * AnA's platform wisdom records only what was measured, rates no risk from a
 * figure nobody measured, and says who (or what) wrote its memory.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * promoteToPlatformWisdom stamped every pattern's confidence_score with
 * min(0.95, 0.5 + 0.05·organizations) (the column was NOT NULL DEFAULT 0.5),
 * and scored effectiveness as if an unrated success had been rated 70, a
 * partial outcome at 0.5 and a failure at 10/(n+10). processUserFeedback
 * turned an unmeasured effectiveness into 0.525 on the first acceptance.
 * detectProjectRisks turned the stamped confidence into the risk's severity
 * ('critical' / 'high' / 'medium' / 'low'), and it and buildWisdomContext ranked
 * platform wisdom by it. Lessons and client patterns, built by string
 * templates and counting, were labelled extracted_by 'ai'.
 *
 * Tables from their drizzle definitions (with their literal column defaults),
 * on PGlite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  clientIntelligenceProfiles,
  clientMemoryEntries,
  projectIntelligenceProfiles,
  projectMemoryEntries,
} from '../../../shared/schema';
import { anaOutcomeLog, anaPlatformWisdom } from '../../../shared/schema/ana-intelligence';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({
  get db() { return holder.db; },
  getDb: () => holder.db,
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);

import {
  buildWisdomContext,
  captureProjectLesson,
  detectProjectRisks,
  processUserFeedback,
  promoteToClientWisdom,
  promoteToPlatformWisdom,
} from '../ana-wisdom-engine';

const ORG = 7;

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const type = col.getSQLType().startsWith('vector') ? 'text' : col.getSQLType();
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'`
        : col.hasDefault && type.startsWith('timestamp') ? ' DEFAULT now()' : '';
    return `"${col.name}" ${type}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const all = async (sql: string, params: unknown[] = []) => (await holder.pg.query(sql, params)).rows as any[];

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  for (const t of [clientIntelligenceProfiles, clientMemoryEntries, projectIntelligenceProfiles,
    projectMemoryEntries, anaOutcomeLog, anaPlatformWisdom]) {
    await holder.pg.exec(ddlOf(t as PgTable));
  }
}, 60_000);

afterAll(async () => { await holder.pg?.close(); });

beforeEach(async () => {
  await holder.pg.exec(`TRUNCATE client_intelligence_profiles, client_memory_entries, project_intelligence_profiles,
    project_memory_entries, ana_outcome_log, ana_platform_wisdom RESTART IDENTITY`);
  await holder.pg.query(
    `INSERT INTO client_intelligence_profiles (organization_id, company_name) VALUES ($1, 'Acme Bio')`, [ORG]);
  for (const projectId of [101, 102, 103]) {
    await holder.pg.query(
      `INSERT INTO project_intelligence_profiles (project_id, organization_id, project_type, target_regulatory_bodies)
       VALUES ($1, $2, 'IND', '["FDA"]')`, [projectId, ORG]);
  }
});

/** n outcome rows for one pattern, spread over three organizations. */
async function outcomes(n: number, capabilityKey: string, outcome: string, quality: (i: number) => number | null = () => null) {
  for (let i = 0; i < n; i++) {
    await holder.pg.query(
      `INSERT INTO ana_outcome_log (organization_id, capability_key, action_type, outcome, quality_score, regulatory_body, project_type)
       VALUES ($1, $2, $2, $3, $4, 'FDA', 'IND')`, [1 + (i % 3), capabilityKey, outcome, quality(i)]);
  }
}

async function wisdom(key: string, category: string, confidence: number | null, evidence: number, effectiveness: number | null = null) {
  await holder.pg.query(
    `INSERT INTO ana_platform_wisdom (wisdom_key, category, regulatory_body, project_type, pattern_description,
       recommendation, confidence_score, evidence_count, min_evidence_threshold, effectiveness_score, is_active)
     VALUES ($1, $2, 'FDA', 'IND', $3, $4, $5, $6, 10, $7, true)`,
    [key, category, `pattern ${key}`, `recommendation ${key}`, confidence, evidence, effectiveness]);
}

const platformRow = async (key: string) =>
  (await all('SELECT confidence_score, effectiveness_score FROM ana_platform_wisdom WHERE wisdom_key = $1', [key]))[0];

describe('promoteToPlatformWisdom states only what was measured', () => {
  it('stores no confidence for a pattern, however many organizations it spans', async () => {
    await outcomes(12, 'draft_m27', 'success');
    expect(await promoteToPlatformWisdom()).toBe(1);
    const row = await platformRow('draft_m27:FDA:IND:success');
    expect(row.confidence_score, '0.5 + 0.05·organizations was stored as a confidence').toBeNull();
  });

  it('stores no effectiveness for a success nobody rated, and the recorded mean quality for one rated', async () => {
    await outcomes(12, 'draft_m27', 'success');
    await outcomes(12, 'scan_m3', 'success', (i) => (i % 2 === 0 ? 80 : 90));
    await promoteToPlatformWisdom();
    expect((await platformRow('draft_m27:FDA:IND:success')).effectiveness_score,
      'an unrated success was scored as if rated 70').toBeNull();
    expect((await platformRow('scan_m3:FDA:IND:success')).effectiveness_score).toBeCloseTo(0.85, 5);
  });

  it('stores no effectiveness for a failure or a partial outcome, which nothing measured', async () => {
    await outcomes(12, 'draft_m27', 'failure');
    await outcomes(12, 'scan_m3', 'partial');
    await promoteToPlatformWisdom();
    expect((await platformRow('draft_m27:FDA:IND:failure')).effectiveness_score, '10/(n+10) was stored').toBeNull();
    expect((await platformRow('scan_m3:FDA:IND:partial')).effectiveness_score, '0.5 was stored').toBeNull();
  });

  it('a refreshed pattern carries no stamped confidence', async () => {
    await wisdom('draft_m27:FDA:IND:success', 'success_pattern', 0.65, 10);
    await outcomes(12, 'draft_m27', 'success');
    await promoteToPlatformWisdom();
    expect((await platformRow('draft_m27:FDA:IND:success')).confidence_score,
      'the refresh stamped 0.5 + 0.05·organizations').toBeNull();
  });
});

describe('processUserFeedback', () => {
  it('an acceptance adjusts no effectiveness that was never measured', async () => {
    await wisdom('draft_m27:FDA:IND:success', 'success_pattern', null, 12, null);
    await outcomes(1, 'draft_m27', 'success');
    await processUserFeedback(1, 'accepted');
    const [row] = await all(`SELECT effectiveness_score, evidence_count FROM ana_platform_wisdom`);
    expect(row.effectiveness_score, 'an unmeasured effectiveness became 0.525').toBeNull();
    expect(row.evidence_count).toBe(13);
  });
});

describe('detectProjectRisks rates no risk from a confidence figure', () => {
  it('a platform risk pattern and a deficiency pattern are unrated', async () => {
    await wisdom('k1', 'risk_reduction', 0.85, 12);
    await wisdom('k2', 'deficiency_prevention', 0.85, 12);
    const risks = await detectProjectRisks(101);
    expect(risks.map(r => [r.riskId, r.severity]), 'the stored confidence was turned into high / critical').toEqual([
      ['platform-1', 'unrated'],
      ['deficiency-2', 'unrated'],
    ]);
  });

  it('a recorded failure lesson stays high: its recorded importance', async () => {
    await captureProjectLesson({ projectId: 101, organizationId: ORG, capabilityKey: 'draft_m27', outcome: 'failure' });
    const risks = await detectProjectRisks(101);
    expect(risks.map(r => [r.category, r.severity])).toEqual([['learned_failure', 'high']]);
  });

  it('orders platform risks by the evidence recorded, not by a stored confidence', async () => {
    await wisdom('weak-but-confident', 'risk_reduction', 0.9, 10);
    await wisdom('well-evidenced', 'risk_reduction', 0.55, 40);
    const risks = await detectProjectRisks(101);
    expect(risks.map(r => r.description), 'ranked by the stamped confidence').toEqual([
      'pattern well-evidenced', 'pattern weak-but-confident']);
  });
});

describe('buildWisdomContext', () => {
  it('shows the platform insight with the most evidence, not the highest stored confidence', async () => {
    await wisdom('weak-but-confident', 'success_pattern', 0.9, 10);
    await wisdom('well-evidenced', 'success_pattern', 0.55, 40);
    const block = await buildWisdomContext(101, ORG);
    expect(block.platformInsight, 'chosen by the stamped confidence').toBe('pattern well-evidenced');
  });

  it('says a platform risk is unrated', async () => {
    await wisdom('k1', 'risk_reduction', 0.85, 12);
    const block = await buildWisdomContext(101, ORG);
    expect(block.projectRisks).toEqual([{ description: 'pattern k1', severity: 'unrated' }]);
  });
});

describe('memory the wisdom engine writes names its extractor', () => {
  it('a lesson is written by the heuristic, not a model', async () => {
    await captureProjectLesson({ projectId: 101, organizationId: ORG, capabilityKey: 'draft_m27', outcome: 'success' });
    const rows = await all(`SELECT extracted_by FROM project_memory_entries WHERE category = 'ana_lesson'`);
    expect(rows.map(r => r.extracted_by), 'a string template was labelled a model extraction').toEqual(['heuristic']);
  });

  it('a client pattern is written by the heuristic, not a model', async () => {
    for (const projectId of [101, 102, 103]) {
      await captureProjectLesson({ projectId, organizationId: ORG, capabilityKey: 'draft_m27', outcome: 'success' });
    }
    expect(await promoteToClientWisdom(ORG)).toBe(1);
    const rows = await all(`SELECT extracted_by FROM client_memory_entries WHERE category = 'ana_wisdom'`);
    expect(rows.map(r => r.extracted_by), 'a project count was labelled a model extraction').toEqual(['heuristic']);
  });
});
