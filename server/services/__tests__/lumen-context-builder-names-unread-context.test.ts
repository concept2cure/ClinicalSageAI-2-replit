/**
 * A context read that fails is named to AnA, never passed off as an absent source.
 *
 * What the code used to do (until 2026-10-15): every read in
 * lumen-context-builder caught its own error and returned null (project record,
 * documents, conversation, user, organization name, client and project
 * intelligence, the AnA intelligence layers, account canon), and the readiness
 * block swallowed its failure into a log line. A failed read was therefore
 * indistinguishable from "nothing recorded": the block vanished and AnA
 * answered as though no project, canon or locked terminology existed. On
 * /api/cortex/chat a failed project read also left orchestrate() with no
 * project at all.
 *
 * The real BASE_SYSTEM_PROMPT is used on purpose: it is ~56 KB, so the
 * 12,000-char budget in assembleSystemPrompt drops every middle section, and
 * the notice has to survive that trim to reach the model.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => {
  const failing = new Set<string>();
  /** Resolves `value`, or rejects when the test has marked `source` as failing. */
  const read = <T>(source: string, value: T): Promise<T> =>
    failing.has(source) ? Promise.reject(new Error(`${source} unavailable`)) : Promise.resolve(value);
  return { failing, read, query: vi.fn(), userIntelligence: vi.fn() };
});

vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../user-intelligence.js', () => ({
  loadUserIntelligence: H.userIntelligence,
  touchWorkSession: async () => undefined,
}));
vi.mock('../client-intelligence-memory.js', () => ({
  buildClientIntelligenceContext: () => H.read('client', null),
  buildProjectIntelligenceContext: () => H.read('projectIntel', null),
}));
vi.mock('../account-canon.js', () => ({
  resolveAccountContext: () => H.read('canon', { canonItems: [], terms: [], bundles: [] }),
  formatResolvedContextForPrompt: () => '',
}));
vi.mock('../ana-context-router', () => ({
  buildMergedContext: () => H.read('layers', { contextBlock: '' }),
}));
vi.mock('../orchestration/cross-object-resolver', () => ({
  assembleCrossObjectPayload: () => Promise.reject(new Error('readiness unavailable')),
}));

import { buildContextAwarePrompt } from '../lumen-context-builder.js';

const PROJECT = {
  id: 7,
  name: 'Program X',
  description: null,
  status: 'active',
  type: 'regulatory',
  progress: 10,
  priority: 'high',
  risk_level: 'low',
  tags: [],
  depth: 1,
  parent_project_id: null,
  metadata: { submissionType: 'IND' },
};

// Which pool query each source is, keyed the way H.failing names it.
const SOURCES: Array<[string, (sql: string) => boolean, () => unknown[]]> = [
  ['project', sql => sql.includes('risk_level'), () => [PROJECT]],
  ['documents', sql => sql.includes('concept2cure_artifacts') && !sql.includes('concept2cure_conversations'), () => [{ total: '0', completed: '0', in_progress: '0' }]],
  ['documents', sql => sql.includes('SELECT settings FROM projects'), () => [{ settings: null }]],
  ['conversation', sql => sql.includes('concept2cure_conversations'), () => [{ message_count: '0', artifact_count: '0' }]],
  ['user', sql => sql.includes('FROM users u'), () => [{ name: 'Priya', role: 'admin' }]],
  ['organization', sql => sql.includes('FROM organizations'), () => [{ name: 'Example Bio' }]],
];

beforeEach(() => {
  H.failing.clear();
  H.userIntelligence.mockReset().mockResolvedValue(null);
  H.query.mockReset().mockImplementation(async (sql: string) => {
    const hit = SOURCES.find(([, matches]) => matches(sql));
    if (!hit) return { rows: [] };
    if (H.failing.has(hit[0])) throw new Error(`${hit[0]} query failed`);
    return { rows: hit[2]() };
  });
});

const NOTICE = /## Context Not Read\nThese could not be read for this turn: ([^\n]*)\n/;

function unreadNamed(systemPrompt: string): string[] {
  const match = NOTICE.exec(systemPrompt);
  return match ? match[1].replace(/\.$/, '').split('; ') : [];
}

describe('lumen-context-builder — a failed read is named, not omitted', () => {
  it('names a project record that could not be read, and the notice survives the prompt budget', async () => {
    H.failing.add('project');
    const { systemPrompt, context } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3 });

    expect(unreadNamed(systemPrompt)).toEqual(['project record']);
    expect(systemPrompt).toContain('Do not infer that they are empty or do not exist');
    expect(context.project).toBeNull();
    expect(context.unreadContext).toEqual(['project record']);
  });

  it('tells a project that was not found apart from one that could not be read', async () => {
    H.query.mockImplementation(async () => ({ rows: [] }));
    const { systemPrompt, context } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3 });

    expect(context.project).toBeNull();
    expect(context.unreadContext).toEqual([]);
    expect(systemPrompt).not.toMatch(NOTICE);
  });

  it('names every source whose read failed', async () => {
    for (const s of ['project', 'documents', 'conversation', 'user', 'organization', 'client', 'projectIntel', 'layers', 'canon']) {
      H.failing.add(s);
    }
    const { systemPrompt, context } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3, userId: 11 });

    const expected = [
      'AnA intelligence layers (personal instructions, capabilities, wisdom, scoped rules)',
      'account canon (governed decisions and locked terminology)',
      'client intelligence',
      'organization name',
      'project conversation history',
      'project documents',
      'project intelligence',
      'project record',
      'user name and role',
    ];
    expect(unreadNamed(systemPrompt)).toEqual(expected);
    expect(context.unreadContext).toEqual(expected);
  });

  it('names a readiness assessment that could not be computed', async () => {
    H.userIntelligence.mockResolvedValue({
      identity: {
        greetingName: 'Priya',
        name: 'Priya Raman',
        email: 'priya@example.test',
        role: 'ra_lead',
        expertiseLevel: 'expert',
        communicationStyle: 'concise',
        focusAreas: [],
      },
      organization: { id: 3, name: 'Example Bio', industryMode: 'biotech', tier: 'standard', enabledModules: [] },
      projects: [],
      activeProject: null,
      currentSession: null,
      recentSessions: [],
      workQueue: [],
      recentActivity: [],
      conversationMemory: { totalConversations: 0, totalMessages: 0, lastTopics: [], frequentTopics: [] },
      timestamp: '2026-10-15T00:00:00.000Z',
    });
    const { systemPrompt } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3, userId: 11 });

    expect(unreadNamed(systemPrompt)).toEqual(['submission readiness assessment']);
  });
});
