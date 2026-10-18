/**
 * User intelligence reports what the records say, and names what it could not read.
 *
 * What the code used to do (until 2026-10-15): loadUserProjects gave a project
 * with no recorded submission type the type 'IND' and NULL progress 0
 * (`|| 'IND'`, `|| 0`). Those fed AnA's "All User Projects" list and
 * detectActiveModule, which then chose the IND module ('ind-filing') for a
 * project nobody had typed. A failed organization read was replaced by an
 * invented one ('Unknown Organization', industry 'biotech', tier 'standard',
 * 5 users, 10 projects), an organization row with no industry or limits got
 * the same defaults, and every loader caught its error to null or [] — so a
 * failed read of projects, the work queue, sessions, activity or conversation
 * memory read as "none". A failed identity read became null, which GET
 * /user-intelligence answers as 404 "User not found".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  failing: new Set<string>(),
  identity: [] as unknown[],
  organization: [] as unknown[],
  projects: [] as unknown[],
  query: vi.fn(),
}));

vi.mock('../../db.js', () => ({ pool: { query: H.query } }));

import { loadUserIntelligence } from '../user-intelligence';
import { detectActiveModule, getModuleIntelligence } from '../module-intelligence';

const USER = 11;
const ORG = 3;

/** Which facet a query reads, and the rows it answers with. */
function route(sql: string): [string, () => unknown[]] {
  if (sql.includes('FROM users u')) return ['identity', () => H.identity];
  if (sql.includes('FROM organizations')) return ['organization', () => H.organization];
  if (sql.includes('FROM module_subscriptions')) return ['organization', () => [{ module_id: 'ectd-coauthor' }]];
  if (sql.includes('p.progress, p.metadata')) return ['projects', () => H.projects];
  if (sql.includes("session_type = 'active'")) return ['currentSession', () => []];
  if (sql.includes("session_type = 'completed'")) return ['recentSessions', () => []];
  if (sql.includes('FROM user_work_queue')) return ['workQueue', () => []];
  if (sql.includes('FROM activity_feed')) return ['activity', () => []];
  if (sql.includes('COUNT(DISTINCT cc.id)')) return ['conversation', () => [{ total_conversations: '0', total_messages: '0' }]];
  if (sql.includes('concept2cure_messages')) return ['conversation', () => []];
  throw new Error(`unexpected query in test: ${sql}`);
}

const IDENTITY = {
  id: USER,
  name: 'Priya Raman',
  email: 'priya@example.test',
  title: null,
  department: null,
  bio: null,
  avatar: null,
  last_login: null,
  preferences: {},
  org_role: 'admin',
};

const ORG_ROW = {
  id: ORG,
  name: 'Example Bio',
  slug: 'example-bio',
  industry_mode: 'biotech',
  tier: 'standard',
  max_users: 25,
  max_projects: 40,
  settings: {},
};

const project = (over: Record<string, unknown>) => ({
  id: 1,
  name: 'Program',
  status: 'active',
  progress: null,
  metadata: {},
  user_role: 'owner',
  last_accessed_at: null,
  ...over,
});

beforeEach(() => {
  H.failing.clear();
  H.identity = [IDENTITY];
  H.organization = [ORG_ROW];
  H.projects = [];
  H.query.mockReset().mockImplementation(async (sql: string) => {
    const [facet, rows] = route(sql);
    if (H.failing.has(facet)) throw new Error(`${facet} query failed`);
    return { rows: rows() };
  });
});

const load = (activeProjectId?: number) =>
  loadUserIntelligence({ userId: USER, organizationId: ORG, activeProjectId });

describe('projects — an unrecorded fact stays unrecorded', () => {
  it('a project with no recorded submission type or progress reads null, not IND and 0', async () => {
    H.projects = [
      project({ id: 1, name: 'Unrecorded', metadata: {}, progress: null }),
      project({ id: 2, name: 'Recorded', metadata: { submissionType: 'NDA' }, progress: 0 }),
    ];
    const intel = (await load())!;
    const [unrecorded, recorded] = intel.projects!;
    expect(unrecorded.submissionType).toBeNull();
    expect(unrecorded.progress).toBeNull();
    // A recorded 0% is a fact, and stays one.
    expect(recorded.submissionType).toBe('NDA');
    expect(recorded.progress).toBe(0);
  });

  it('does not route a project whose type is unrecorded to the IND module, or describe it as an IND', async () => {
    H.projects = [project({ id: 1, name: 'Unrecorded', metadata: {} })];
    const intel = (await load(1))!;
    const moduleId = detectActiveModule(intel);
    expect(moduleId).not.toBe('ind-filing');
    const addon = getModuleIntelligence(moduleId!, intel.activeProject)!.systemPromptAddon;
    expect(addon).not.toContain('Investigational New Drug');
    expect(addon).not.toContain('Phase 1');
  });
});

describe('organization — read, or named as unread; never invented', () => {
  it('a failed organization read is null and named, not "Unknown Organization"', async () => {
    H.failing.add('organization');
    const intel = (await load())!;
    expect(intel.organization).toBeNull();
    expect(intel.organizationId).toBe(ORG);
    expect(intel.unread).toContain('organization profile');
  });

  it('an organization row that records no industry or limits is not given defaults', async () => {
    H.organization = [{ ...ORG_ROW, industry_mode: null, max_users: null, max_projects: null }];
    const intel = (await load())!;
    expect(intel.organization!.industryMode).toBeNull();
    expect(intel.organization!.maxUsers).toBeNull();
    expect(intel.organization!.maxProjects).toBeNull();
    expect(intel.organization!.name).toBe('Example Bio');
    expect(intel.unread).toEqual([]);
  });
});

describe('a failed read is named, never an empty list', () => {
  it('names each facet whose read failed and leaves it null', async () => {
    for (const f of ['projects', 'currentSession', 'recentSessions', 'workQueue', 'activity', 'conversation']) {
      H.failing.add(f);
    }
    const intel = (await load())!;
    expect(intel.projects).toBeNull();
    expect(intel.recentSessions).toBeNull();
    expect(intel.workQueue).toBeNull();
    expect(intel.recentActivity).toBeNull();
    expect(intel.conversationMemory).toBeNull();
    expect(intel.unread).toEqual([
      'conversation memory',
      'current work session',
      'recent activity',
      'recent work sessions',
      'user projects',
      'work queue',
    ]);
  });

  it('a failed identity read makes the whole context unavailable, not "user not found"', async () => {
    H.failing.add('identity');
    await expect(load()).rejects.toThrow(/identity query failed/);
  });

  it('a user who is not found is still null', async () => {
    H.identity = [];
    await expect(load()).resolves.toBeNull();
  });
});
