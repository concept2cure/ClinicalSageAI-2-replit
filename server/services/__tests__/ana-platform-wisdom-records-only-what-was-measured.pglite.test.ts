/** Legacy active wisdom cannot be promoted, refreshed or consumed without
 * reviewed de-identification and exact-artifact QMS approval. Tenant-local
 * lessons and client patterns keep their measured-only provenance. Uses real
 * PGlite rows, including poisonous legacy text, with SQL observation. */
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

const HOLD = 'deidentification_and_human_promotion_required';
async function withoutSharedQuery<T>(run: () => Promise<T>, noQueries = false): Promise<T> {
  const observer = vi.spyOn(holder.pg, 'query');
  try {
    const result = await run();
    const queries = observer.mock.calls.map(call => String(call[0])).join('\n');
    expect(queries).not.toMatch(/ana_platform_wisdom/);
    if (noQueries) expect(observer).not.toHaveBeenCalled();
    return result;
  } finally { observer.mockRestore(); }
}

describe('unreviewed platform wisdom is held before database access', () => {
  it.each(['success', 'partial', 'failure'])('a %s cohort cannot publish free-text tenant dimensions', async outcome => {
    await outcomes(12, 'PRIVATE_CLIENT_DIMENSION_CANARY', outcome);
    expect(await withoutSharedQuery(promoteToPlatformWisdom, true)).toEqual({ promoted: 0, holdReason: HOLD });
    expect(await all('SELECT id FROM ana_platform_wisdom')).toEqual([]);
  });

  it('does not refresh or reactivate an existing active legacy row', async () => {
    await wisdom('PRIVATE_LEGACY_CANARY:FDA:IND:success', 'success_pattern', 0.65, 100);
    await outcomes(12, 'PRIVATE_LEGACY_CANARY', 'success');
    const before = await all('SELECT * FROM ana_platform_wisdom');
    await withoutSharedQuery(promoteToPlatformWisdom, true);
    expect(await all('SELECT * FROM ana_platform_wisdom')).toEqual(before);
  });
});

describe('feedback stays inside tenant learning', () => {
  it.each(['accepted', 'rejected'] as const)('%s feedback does not query or mutate legacy global wisdom', async feedback => {
    await wisdom('draft_m27:FDA:IND:success', 'success_pattern', null, 12, null);
    await outcomes(1, 'draft_m27', 'success');
    const before = await all('SELECT * FROM ana_platform_wisdom');
    await withoutSharedQuery(() => processUserFeedback(1, feedback));
    expect(await all('SELECT * FROM ana_platform_wisdom')).toEqual(before);
    expect((await all('SELECT user_feedback FROM ana_outcome_log'))[0].user_feedback).toBe(feedback);
  });

  it('retains an edited outcome as one project-local lesson without any shared lookup', async () => {
    await holder.pg.query(`INSERT INTO ana_outcome_log(organization_id,project_id,capability_key,action_type,outcome)
      VALUES($1,101,'draft_m27','draft_m27','partial')`, [ORG]);
    await withoutSharedQuery(() => processUserFeedback(1, 'edited', 'TENANT_LOCAL_EDIT_CANARY'));
    const local = await all('SELECT organization_id,project_id,content FROM project_memory_entries');
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({ organization_id: ORG, project_id: 101 });
    expect(local[0].content).toContain('TENANT_LOCAL_EDIT_CANARY');
  });
});

describe('generation contexts reject active legacy global advice', () => {
  it('does not read risk or deficiency canaries even with large active evidence counts', async () => {
    await wisdom('PRIVATE_RISK_CANARY', 'risk_reduction', 0.95, 1000);
    await wisdom('PRIVATE_DEFICIENCY_CANARY', 'deficiency_prevention', 0.95, 1000);
    expect(await withoutSharedQuery(() => detectProjectRisks(101))).toEqual([]);
  });

  it('still reports an actual project-local failure at its recorded importance', async () => {
    await captureProjectLesson({ projectId: 101, organizationId: ORG, capabilityKey: 'draft_m27', outcome: 'failure' });
    const risks = await withoutSharedQuery(() => detectProjectRisks(101));
    expect(risks.map(r => [r.category, r.severity])).toEqual([['learned_failure', 'high']]);
  });

  it.each([undefined, { projectOnly: false }, { projectOnly: true }])('never reads legacy platform insight for recall options %j', async options => {
    await wisdom('PRIVATE_INSIGHT_CANARY', 'success_pattern', 0.99, 1000);
    const block = await withoutSharedQuery(() => buildWisdomContext(101, ORG, 'FDA', 'IND', options));
    expect(block).toMatchObject({ platformInsight: null, recommendedNextAction: null, projectRisks: [], sharedLearningHold: HOLD });
    expect(JSON.stringify(block)).not.toContain('PRIVATE_');
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
