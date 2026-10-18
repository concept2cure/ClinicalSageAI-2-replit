/**
 * AnA's user context reports the role, expertise and communication preference
 * that are recorded, and says "not recorded" for the ones that are not.
 *
 * What the code used to do (until 2026-10-15): both user-context loaders read
 * the role as `COALESCE(ou.role, 'member')`, so a user with no membership row
 * in the organization was described to AnA as one of its members; and
 * lumen-context-builder's loader, called without an organization, joined every
 * membership the user has and reported whichever came first (an admin role in
 * another organization). user-intelligence filled an unrecorded expertise
 * level with 'intermediate' and an unrecorded communication style with
 * 'professional', and the prompt then told AnA the user "understand[s]
 * regulatory basics" on the strength of nothing. Nothing gates access on
 * these values; they are what AnA is told about the person.
 *
 * Real tables (drizzle definitions; the two work tables from their migration),
 * on PGlite.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  activityFeed,
  concept2cureConversations,
  concept2cureMessages,
  moduleSubscriptions,
  organizationUsers,
  organizations,
  projects,
  users,
} from '../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any }));
vi.mock('../../db.js', () => ({
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
}));
// The base prompt is ~45 KB and the budget would drop every section under test.
vi.mock('../lumen-context/base-system-prompt.js', () => ({ BASE_SYSTEM_PROMPT: '# BASE' }));
vi.mock('../client-intelligence-memory.js', () => ({
  buildClientIntelligenceContext: async () => null,
  buildProjectIntelligenceContext: async () => null,
}));
vi.mock('../account-canon.js', () => ({
  resolveAccountContext: async () => ({ canonItems: [], terms: [], bundles: [] }),
  formatResolvedContextForPrompt: () => '',
}));
vi.mock('../ana-context-router', () => ({ buildMergedContext: async () => ({ contextBlock: '' }) }));

import { loadUserIntelligence } from '../user-intelligence';
import { buildContextAwarePrompt } from '../lumen-context-builder.js';

const ALPHA = 1;
const BETA = 2;
/** An admin of Beta, with no membership row in Alpha and no recorded preferences. */
const PRIYA = 11;
/** A viewer of Alpha who recorded her preferences. */
const DANA = 33;

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const exec = (sql: string, params: unknown[] = []) => holder.pg.query(sql, params);

beforeAll(async () => {
  holder.pg = new PGlite();
  for (const t of [organizations, users, organizationUsers, projects, moduleSubscriptions, activityFeed,
    concept2cureConversations, concept2cureMessages]) {
    await holder.pg.exec(ddlOf(t as PgTable));
  }
  const migration = readFileSync(
    path.resolve(__dirname, '../../../db/migrations/20260220_user_intelligence_platform.sql'), 'utf8');
  for (const table of ['user_work_sessions', 'user_work_queue']) {
    const ddl = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    if (!ddl) throw new Error(`the CREATE TABLE for ${table} is not in its migration`);
    await holder.pg.exec(ddl[0]);
  }
  await exec(`INSERT INTO organizations (id, name, slug, industry_mode) VALUES
    ($1, 'Alpha Bio', 'alpha', 'biotech'), ($2, 'Beta Pharma', 'beta', 'pharma')`, [ALPHA, BETA]);
  await exec(
    `INSERT INTO users (id, email, name, password_hash, preferences) VALUES
       ($1, 'priya@example.test', 'Priya Raman', 'x', '{}'::jsonb),
       ($2, 'dana@alpha.test', 'Dana Ortiz', 'x',
        '{"expertise_level": "expert", "communication_style": "concise"}'::jsonb)`,
    [PRIYA, DANA]);
  await exec(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $3, 'admin'), ($2, $4, 'viewer')`,
    [BETA, ALPHA, PRIYA, DANA]);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

describe('user intelligence — identity', () => {
  it('a user with no membership row and no recorded preferences has none reported', async () => {
    const { identity } = (await loadUserIntelligence({ userId: PRIYA, organizationId: ALPHA }))!;
    expect(identity.role, 'a user with no membership in the organization was reported as a member').toBeNull();
    expect(identity.expertiseLevel, 'an unrecorded expertise level read as intermediate').toBeNull();
    expect(identity.communicationStyle, 'an unrecorded communication style read as professional').toBeNull();
  }, 60_000);

  it('reports what is recorded', async () => {
    const { identity } = (await loadUserIntelligence({ userId: DANA, organizationId: ALPHA }))!;
    expect(identity).toMatchObject({ role: 'viewer', expertiseLevel: 'expert', communicationStyle: 'concise' });
  }, 60_000);
});

describe("AnA's prompt", () => {
  it('says "not recorded" for an unrecorded role, expertise and preference, and assumes no expertise', async () => {
    const { systemPrompt, context } = await buildContextAwarePrompt({ organizationId: ALPHA, userId: PRIYA });

    expect(context.userRole, 'the user-context loader reported a non-member as a member').toBeNull();
    expect(systemPrompt).toContain('- **Role**: not recorded');
    expect(systemPrompt).toContain('- **Expertise Level**: not recorded');
    expect(systemPrompt).toContain('- **Communication Preference**: not recorded');
    expect(systemPrompt).not.toContain('They understand regulatory basics');
    expect(systemPrompt).not.toMatch(/\*\*Role\*\*: member/);
  }, 60_000);

  it('prints a recorded role, expertise and preference, and adapts to them', async () => {
    const { systemPrompt, context } = await buildContextAwarePrompt({ organizationId: ALPHA, userId: DANA });

    expect(context.userRole).toBe('viewer');
    expect(systemPrompt).toContain('- **Role**: viewer');
    expect(systemPrompt).toContain('- **Expertise Level**: expert');
    expect(systemPrompt).toContain('- **Communication Preference**: concise');
    expect(systemPrompt).toContain('Skip basic explanations');
    expect(systemPrompt).toContain('Keep responses focused and brief.');
  }, 60_000);

  it("without an organization, reports no role rather than one from another organization's membership", async () => {
    const { systemPrompt, context } = await buildContextAwarePrompt({ userId: PRIYA });

    expect(context.userRole, "Priya's Beta admin role was reported for a context with no organization").toBeNull();
    expect(systemPrompt).toContain('- **User**: Priya Raman (role not recorded)');
    expect(systemPrompt).not.toContain('(admin)');
  }, 60_000);
});
