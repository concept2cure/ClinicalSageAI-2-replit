/**
 * AnA's wisdom engine stores no confidence nobody measured, and chooses what it
 * shows by what it recorded.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * captureProjectLesson stamped each lesson's confidence_score from its outcome
 * (0.9 success, 0.7 partial, 0.5 failure); promoteToClientWisdom stamped
 * min(0.95, 0.6 + 0.05·projects) on each client pattern, on insert and when it
 * refreshed one; detectProjectRisks reported an unscored lesson at 0.5. Those
 * rows are client/project memory, so the figures reached AnA's memory ranking
 * and the memory surface as "NN% confidence". buildWisdomContext ordered
 * lessons and patterns by that stamped figure, so once it is gone it must order
 * by what the figure stood for: the recorded outcome, the number of projects.
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
  promoteToClientWisdom,
} from '../ana-wisdom-engine';

const ORG = 7;
const PROJECTS = [101, 102, 103, 104, 105, 106];

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
  for (const projectId of PROJECTS) {
    await holder.pg.query(
      'INSERT INTO project_intelligence_profiles (project_id, organization_id) VALUES ($1, $2)', [projectId, ORG]);
  }
});

const lesson = (projectId: number, outcome: 'success' | 'partial' | 'failure', capabilityKey = 'draft_m27') =>
  captureProjectLesson({ projectId, organizationId: ORG, capabilityKey, outcome });

describe('the wisdom engine stores no invented confidence', () => {
  it('captures a lesson with no confidence, whatever its outcome', async () => {
    await lesson(101, 'success');
    await lesson(101, 'partial');
    await lesson(101, 'failure');
    const rows = await all(`SELECT title, confidence_score FROM project_memory_entries WHERE category = 'ana_lesson' ORDER BY id`);
    expect(rows.map(r => r.title)).toEqual([
      'Lesson: draft_m27 — success', 'Lesson: draft_m27 — partial', 'Lesson: draft_m27 — failure']);
    expect(rows.map(r => r.confidence_score), 'a confidence was stamped from the outcome').toEqual([null, null, null]);
  });

  it('promotes a client pattern with no confidence, and names the projects it rests on', async () => {
    for (const projectId of PROJECTS.slice(0, 3)) await lesson(projectId, 'success');
    expect(await promoteToClientWisdom(ORG)).toBe(1);
    const [row] = await all(`SELECT title, confidence_score FROM client_memory_entries WHERE category = 'ana_wisdom'`);
    expect(row.title).toBe('Client wisdom: draft_m27 — success (3 projects)');
    expect(row.confidence_score, '0.6 + 0.05·projects was stored as a confidence').toBeNull();
  });

  it('refreshing a pattern whose evidence doubled stamps no confidence on it', async () => {
    await holder.pg.query(
      `INSERT INTO client_memory_entries (profile_id, organization_id, category, subcategory, title, content, confidence_score, status)
       VALUES (1, $1, 'ana_wisdom', 'draft_m27::success', 'Client wisdom: draft_m27 — success (3 projects)',
               'Pattern observed across 3 projects (outcome: success). x', 0.75, 'active')`, [ORG]);
    for (const projectId of PROJECTS) await lesson(projectId, 'success');
    await promoteToClientWisdom(ORG);
    const [row] = await all(`SELECT title, confidence_score FROM client_memory_entries WHERE category = 'ana_wisdom'`);
    expect(row.title).toBe('Client wisdom: draft_m27 — success (6 projects)');
    expect(row.confidence_score, 'the refresh stamped 0.6 + 0.05·projects').toBeNull();
  });

  it('reports an unscored lesson as a risk with no confidence, not 0.5', async () => {
    await holder.pg.query(
      `INSERT INTO project_memory_entries (project_profile_id, project_id, organization_id, category, subcategory, title, content, importance_level, status)
       VALUES (1, 101, $1, 'ana_lesson', 'draft_m27', 'Lesson: draft_m27 — failure', 'when doing draft_m27, did not work.', 'high', 'active')`, [ORG]);
    const risks = await detectProjectRisks(101);
    expect(risks).toHaveLength(1);
    expect(risks[0].confidenceScore, 'a confidence was filled in for an unscored lesson').toBeNull();
  });
});

describe('the wisdom context chooses by what was recorded, not by a stamped figure', () => {
  it('shows the most recent successful lesson, not a newer failure, when no lesson is scored', async () => {
    await holder.pg.query(
      `INSERT INTO project_memory_entries (project_profile_id, project_id, organization_id, category, subcategory, title, content, importance_level, status, created_at)
       VALUES (1, 101, $1, 'ana_lesson', 'draft_m27', 'Lesson: draft_m27 — success', 'when doing draft_m27, worked well.', 'medium', 'active', '2026-10-01'),
              (1, 101, $1, 'ana_lesson', 'draft_m27', 'Lesson: draft_m27 — failure', 'when doing draft_m27, did not work.', 'high', 'active', '2026-10-05')`, [ORG]);
    const block = await buildWisdomContext(101, ORG);
    expect(block.projectLesson, 'the unscored lessons were ordered by recency alone').toBe('when doing draft_m27, worked well.');
  });

  it('shows the client pattern seen in the most projects, not the newest, when no pattern is scored', async () => {
    await holder.pg.query(
      `INSERT INTO client_memory_entries (profile_id, organization_id, category, subcategory, title, content, status, created_at)
       VALUES (1, $1, 'ana_wisdom', 'a::success', 'Client wisdom: a — success (5 projects)', 'Pattern observed across 5 projects (outcome: success). A', 'active', '2026-10-01'),
              (1, $1, 'ana_wisdom', 'b::success', 'Client wisdom: b — success (3 projects)', 'Pattern observed across 3 projects (outcome: success). B', 'active', '2026-10-05')`, [ORG]);
    const block = await buildWisdomContext(101, ORG);
    expect(block.clientPattern, 'the unscored patterns were ordered by recency alone')
      .toBe('Pattern observed across 5 projects (outcome: success). A');
  });
});

describe('project-only wisdom recall', () => {
  it('reads only the selected project lessons, without client or platform risk/deficiency queries', async () => {
    await holder.pg.query(`INSERT INTO project_memory_entries
      (project_profile_id,project_id,organization_id,category,title,content,importance_level,status)
      VALUES(1,101,$1,'ana_lesson','Selected project failure','PROJECT_A_LESSON','high','active'),
        (2,102,$1,'ana_lesson','Other project failure','PROJECT_B_PRIVATE_LESSON','high','active')`, [ORG]);
    await holder.pg.query(`INSERT INTO ana_platform_wisdom(category,pattern_description,recommendation,evidence_count,confidence_score,is_active)
      VALUES('risk_reduction','GLOBAL_RISK','GLOBAL_ACTION',20,0.9,true),
        ('deficiency_prevention','GLOBAL_DEFICIENCY','GLOBAL_ACTION',20,0.9,true)`);
    await holder.pg.query(`INSERT INTO client_memory_entries(profile_id,organization_id,category,title,content,status)
      VALUES(1,$1,'ana_wisdom','Portfolio pattern','CLIENT_PORTFOLIO_PATTERN','active')`, [ORG]);
    const observer=vi.spyOn(holder.pg,'query');
    try {
      const block=await buildWisdomContext(101,ORG,undefined,undefined,{projectOnly:true});
      expect(block.projectLesson).toBe('PROJECT_A_LESSON');
      expect(block.projectRisks).toEqual([{description:'PROJECT_A_LESSON',severity:'high'}]);
      expect(block.clientPattern).toBeNull();expect(block.platformInsight).toBeNull();
      const queries=observer.mock.calls.map(call=>String(call[0])).join('\n');
      expect(queries).toContain('project_memory_entries');
      expect(queries).not.toMatch(/client_memory_entries|ana_platform_wisdom/);
      expect(JSON.stringify(block)).not.toMatch(/PROJECT_B_PRIVATE|GLOBAL_|CLIENT_PORTFOLIO/);
    } finally {observer.mockRestore();}
  });
});
