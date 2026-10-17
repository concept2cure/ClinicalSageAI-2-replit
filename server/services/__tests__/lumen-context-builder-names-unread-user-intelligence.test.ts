/**
 * AnA's context names the user-intelligence facts it could not read, and
 * handles an organization profile that is absent rather than inventing one.
 *
 * What the code used to do (until 2026-10-15): user-intelligence replaced a
 * failed organization read with an invented 'Unknown Organization' (industry
 * 'biotech', tier 'standard') and every other failed facet with [] or null, so
 * this builder could read `intel.organization.enabledModules` unguarded and
 * never had a failed facet to name. Now the organization is null when it could
 * not be read and the failed facets are listed on the intelligence — and the
 * builder must neither crash on the null nor drop the names, nor print a NULL
 * industry or tier as "null".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn(), userIntelligence: vi.fn() }));

vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../lumen-context/base-system-prompt.js', () => ({ BASE_SYSTEM_PROMPT: '# BASE' }));
vi.mock('../user-intelligence.js', () => ({
  loadUserIntelligence: H.userIntelligence,
  touchWorkSession: async () => undefined,
}));
vi.mock('../client-intelligence-memory.js', () => ({
  buildClientIntelligenceContext: async () => null,
  buildProjectIntelligenceContext: async () => null,
}));
vi.mock('../account-canon.js', () => ({
  resolveAccountContext: async () => ({ canonItems: [], terms: [], bundles: [] }),
  formatResolvedContextForPrompt: () => '',
}));
vi.mock('../ana-context-router', () => ({ buildMergedContext: async () => ({ contextBlock: '' }) }));
vi.mock('../orchestration/cross-object-resolver', () => ({
  assembleCrossObjectPayload: () => Promise.reject(new Error('readiness unavailable')),
}));

import { buildContextAwarePrompt } from '../lumen-context-builder.js';

const PROJECT_ROW = {
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

const ORGANIZATION = {
  id: 3,
  name: 'Example Bio',
  slug: 'example-bio',
  industryMode: 'biotech' as string | null,
  tier: 'standard' as string | null,
  maxUsers: 25,
  maxProjects: 40,
  enabledModules: [] as string[],
  settings: {},
};

const intelligence = (over: Record<string, unknown> = {}) => ({
  identity: {
    greetingName: 'Priya',
    name: 'Priya Raman',
    email: 'priya@example.test',
    role: 'ra_lead',
    expertiseLevel: 'expert',
    communicationStyle: 'concise',
    focusAreas: [],
  },
  organizationId: 3,
  organization: ORGANIZATION,
  projects: [],
  activeProject: null,
  currentSession: null,
  recentSessions: [],
  workQueue: [],
  recentActivity: [],
  conversationMemory: { totalConversations: 0, totalMessages: 0, lastTopics: [], frequentTopics: [] },
  unread: [],
  timestamp: '2026-10-15T00:00:00.000Z',
  ...over,
});

function answer(sql: string) {
  if (sql.includes('risk_level')) return { rows: [PROJECT_ROW] };
  if (sql.includes('SELECT settings FROM projects')) return { rows: [{ settings: null }] };
  if (sql.includes('COUNT(*) as total')) return { rows: [{ total: '0', completed: '0', in_progress: '0' }] };
  if (sql.includes('message_count')) return { rows: [{ message_count: '0', artifact_count: '0' }] };
  return { rows: [] };
}

beforeEach(() => {
  H.query.mockReset().mockImplementation(async (sql: string) => answer(sql));
  H.userIntelligence.mockReset();
});

describe('lumen-context-builder — user intelligence that could not be read', () => {
  it('names each user-intelligence facet whose read failed', async () => {
    H.userIntelligence.mockResolvedValue(intelligence({ workQueue: null, unread: ['work queue'] }));
    const { systemPrompt, context } = await buildContextAwarePrompt({ organizationId: 3, userId: 11 });

    expect(context.unreadContext).toEqual(['work queue']);
    expect(systemPrompt).toContain('These could not be read for this turn: work queue.');
  });

  it('an organization profile that could not be read is named, not crashed on, and not described', async () => {
    H.userIntelligence.mockResolvedValue(
      intelligence({ organization: null, unread: ['organization profile'] }),
    );
    const { systemPrompt, context } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3, userId: 11 });

    expect(systemPrompt).not.toContain('## Organization Profile');
    expect(systemPrompt).not.toContain('Unknown Organization');
    expect(context.unreadContext).toEqual(['organization profile']);
    // The readiness block still runs for the request's organization: its own
    // failure is named in the prompt beside the unread profile.
    expect(systemPrompt).toContain(
      'These could not be read for this turn: organization profile; submission readiness assessment.',
    );
  });

  it('a user intelligence that could not be loaded at all is named, and the turn still has a prompt', async () => {
    H.userIntelligence.mockRejectedValue(new Error('identity query failed'));
    const { systemPrompt, context } = await buildContextAwarePrompt({ organizationId: 3, userId: 11 });

    expect(context.userIntelligence).toBeNull();
    expect(context.unreadContext).toEqual(['user intelligence']);
    expect(systemPrompt).toContain('These could not be read for this turn: user intelligence.');
  });

  it('prints an industry and tier the organization does not record as not recorded', async () => {
    H.userIntelligence.mockResolvedValue(
      intelligence({ organization: { ...ORGANIZATION, industryMode: null, tier: null } }),
    );
    const { systemPrompt } = await buildContextAwarePrompt({ organizationId: 3, userId: 11 });

    expect(systemPrompt).toContain('- **Industry**: not recorded');
    expect(systemPrompt).toContain('- **Tier**: not recorded');
    expect(systemPrompt).not.toMatch(/\*\*(Industry|Tier)\*\*: null/);
  });
});
