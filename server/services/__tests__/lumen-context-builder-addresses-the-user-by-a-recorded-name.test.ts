/**
 * AnA's prompt names the user by their recorded name, says how they go by a
 * recorded preferred name, and says plainly when no name is recorded.
 *
 * What the code used to do (until 2026-10-15): it printed
 * `**Name**: ${greetingName} (${name})` and `They go by "${greetingName}"`, with
 * greetingName built from the first word of the job title ("Senior Raman").
 * greetingName is now the recorded preferred name, else the full recorded name,
 * else null — and a null must not reach the prompt as "null".
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

const intelligence = (identity: Record<string, unknown>) => ({
  identity: {
    name: 'Priya Raman',
    email: 'priya@example.test',
    title: 'Senior Regulatory Affairs Manager',
    role: 'ra_lead',
    expertiseLevel: null,
    communicationStyle: null,
    focusAreas: [],
    ...identity,
  },
  organizationId: 3,
  organization: null,
  projects: [],
  activeProject: null,
  currentSession: null,
  recentSessions: [],
  workQueue: [],
  recentActivity: [],
  conversationMemory: { totalConversations: 0, totalMessages: 0, lastTopics: [], frequentTopics: [] },
  unread: [],
  timestamp: '2026-10-15T00:00:00.000Z',
});

beforeEach(() => {
  H.query.mockReset().mockResolvedValue({ rows: [] });
  H.userIntelligence.mockReset();
});

const prompt = async () => (await buildContextAwarePrompt({ organizationId: 3, userId: 11 })).systemPrompt;

describe('how the prompt names the user', () => {
  it('prints the full recorded name once when that is how they go by', async () => {
    H.userIntelligence.mockResolvedValue(intelligence({ greetingName: 'Priya Raman' }));
    const p = await prompt();
    expect(p).toContain('- **Name**: Priya Raman\n');
    expect(p).toContain('They go by "Priya Raman"');
    expect(p).not.toContain('Senior Raman');
  });

  it('names a recorded preferred name as the name they go by', async () => {
    H.userIntelligence.mockResolvedValue(intelligence({ greetingName: 'Dr. Raman' }));
    expect(await prompt()).toContain('- **Name**: Priya Raman (goes by "Dr. Raman")');
  });

  it('says no name is recorded, and never prints "null", when none is', async () => {
    H.userIntelligence.mockResolvedValue(intelligence({ name: '', greetingName: null }));
    const p = await prompt();
    expect(p).not.toMatch(/null/);
    expect(p).toContain('No name is recorded for them; do not invent one or address them by their title');
  });
});
