/**
 * AnA's context builder describes a project only by what its record says.
 *
 * What the code used to do (until 2026-10-15): loadProjectContext() read
 * `metadata.submissionType || metadata.submission_type || 'IND'`, so a project
 * with no recorded submission type was handed on as an "Investigational New
 * Drug Application". On POST /api/cortex/chat that string reaches the model
 * through orchestrate()'s "## CURRENT PROJECT CONTEXT" overlay
 * (cortex-unified.ts passes context.project.submissionType), and
 * assembleSystemPrompt() added the IND-specific guidance block for it. NULL
 * progress, NULL risk level and an empty priority were printed as 0%, 'medium'
 * and 'medium'. None of those was recorded. The module-intelligence effort
 * figures were interpolated unchecked, so a null estimate would print "nullh".
 *
 * BASE_SYSTEM_PROMPT is replaced with a short stand-in: the real one is ~56 KB
 * and assembleSystemPrompt's 12,000-char budget then drops every middle
 * section, this block included (see ana-ri/__tests__/response-register.test.ts),
 * so the block could not otherwise be observed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  project: {} as Record<string, unknown>,
  query: vi.fn(),
  userIntelligence: vi.fn(),
  moduleIntelligence: vi.fn(),
}));

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
vi.mock('../module-intelligence.js', () => ({
  detectActiveModule: () => 'ectd-coauthor',
  getModuleIntelligence: H.moduleIntelligence,
  getCrossCuttingIntelligence: () => '',
}));

import { buildContextAwarePrompt, buildSectionSpecificPrompt } from '../lumen-context-builder.js';

const RECORDED = {
  id: 7,
  name: 'Program X',
  description: null,
  status: 'active',
  type: 'regulatory',
  progress: 0,
  priority: 'high',
  risk_level: 'low',
  tags: [],
  depth: 1,
  parent_project_id: null,
  metadata: { submissionType: 'IND' },
};

function answer(sql: string) {
  if (sql.includes('risk_level')) return { rows: [H.project] };
  if (sql.includes('SELECT settings FROM projects')) return { rows: [{ settings: null }] };
  if (sql.includes('COUNT(*) as total')) return { rows: [{ total: '0', completed: '0', in_progress: '0' }] };
  if (sql.includes('message_count')) return { rows: [{ message_count: '0', artifact_count: '0' }] };
  return { rows: [] };
}

beforeEach(() => {
  H.project = { ...RECORDED };
  H.query.mockReset().mockImplementation(async (sql: string) => answer(sql));
  H.userIntelligence.mockReset().mockResolvedValue(null);
  H.moduleIntelligence.mockReset().mockReturnValue(null);
});

describe('lumen-context-builder — a project fact nobody recorded is not assumed', () => {
  it('does not use a declared US_IND project to reinterpret local heading 3 as CMC without an open-document read', async () => {
    const { systemPrompt } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3,
      submissionType: 'US_IND', sectionCode: '3' });
    const guide = buildSectionSpecificPrompt as (code: string, registryId: string) => string | null;
    expect(systemPrompt).not.toContain(guide('3', 'US_IND')!.split('\n')[0]);
  });

  it('leaves an unrecorded submission type unset instead of assuming an IND', async () => {
    H.project = { ...RECORDED, metadata: {} };
    const { systemPrompt, context } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3 });

    // What cortex-unified hands to orchestrate() as the project's submission type.
    expect(context.project?.submissionType).toBeUndefined();
    expect(context.project?.submissionTypeContext).toBeNull();
    expect(systemPrompt).toContain('**Submission Type**: not recorded');
    expect(systemPrompt).not.toContain('Investigational New Drug');
    expect(systemPrompt).not.toContain('## IND-Specific Guidance');
  });

  it('prints NULL progress, NULL risk level and an empty priority as not recorded', async () => {
    // projects.priority is NOT NULL, so only an empty value can be unrecorded.
    H.project = { ...RECORDED, progress: null, priority: '', risk_level: null };
    const { systemPrompt, context } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3 });

    expect(context.project?.progress).toBeNull();
    expect(context.project?.priority).toBeNull();
    expect(context.project?.riskLevel).toBeNull();
    expect(systemPrompt).toContain('**Progress**: not recorded');
    expect(systemPrompt).toContain('**Priority**: not recorded | **Risk Level**: not recorded');
    expect(systemPrompt).not.toContain('**Progress**: 0%');
    expect(systemPrompt).not.toContain('medium');
  });

  it('still prints what is recorded, a recorded 0% included', async () => {
    const { systemPrompt, context } = await buildContextAwarePrompt({ projectId: 7, organizationId: 3 });

    expect(context.project?.submissionType).toBe('Investigational New Drug Application');
    expect(context.project?.submissionTypeContext?.registryId).toBe('US_IND');
    expect(systemPrompt).toContain('**Progress**: 0%');
    expect(systemPrompt).toContain('**Priority**: high | **Risk Level**: low');
    expect(systemPrompt).toContain('## IND-Specific Guidance');
  });
});

describe('lumen-context-builder — figures printed from other modules', () => {
  const identity = {
    greetingName: 'Priya',
    name: 'Priya Raman',
    email: 'priya@example.test',
    role: 'ra_lead',
    expertiseLevel: 'expert',
    communicationStyle: 'concise',
    focusAreas: [],
  };
  const intelligence = (projects: unknown[] = []) => ({
    identity,
    organization: { id: 3, name: 'Example Bio', industryMode: 'biotech', tier: 'standard', enabledModules: [] },
    projects,
    activeProject: null,
    currentSession: null,
    recentSessions: [],
    workQueue: [],
    recentActivity: [],
    conversationMemory: { totalConversations: 0, totalMessages: 0, lastTopics: [], frequentTopics: [] },
    timestamp: '2026-10-15T00:00:00.000Z',
  });

  it('prints a module-intelligence estimate as that module returns it, and a null one as not estimated', async () => {
    H.userIntelligence.mockResolvedValue(intelligence());
    const docType = { description: 'Drafted from the record', aiDraftable: true };
    H.moduleIntelligence.mockReturnValue({
      systemPromptAddon: '## Module Addon',
      documentTypes: [
        { ...docType, name: 'Cover Letter', estimatedHours: 8 },
        { ...docType, name: 'Clinical Overview', estimatedHours: null },
      ],
      workflowStages: [
        { name: 'Draft', description: 'First draft', estimatedDays: 5 },
        { name: 'Review', description: 'QC review', estimatedDays: null },
      ],
    });
    const { systemPrompt } = await buildContextAwarePrompt({ organizationId: 3, userId: 11 });

    expect(systemPrompt).toContain('- **Cover Letter**: Drafted from the record (8h est.)');
    expect(systemPrompt).toContain('- **Clinical Overview**: Drafted from the record (not estimated)');
    expect(systemPrompt).toContain('1. **Draft** (5d) — First draft');
    expect(systemPrompt).toContain('2. **Review** (not estimated) — QC review');
    expect(systemPrompt).not.toMatch(/null[hd]/);
  });

  it('prints a user-intelligence project with no recorded submission type or progress as not recorded', async () => {
    H.userIntelligence.mockResolvedValue(
      intelligence([
        { id: 1, name: 'Recorded', submissionType: 'IND', status: 'active', progress: 40, phase: null, therapeuticArea: null },
        { id: 2, name: 'Unrecorded', submissionType: null, status: 'planning', progress: null, phase: null, therapeuticArea: null },
      ])
    );
    const { systemPrompt } = await buildContextAwarePrompt({ organizationId: 3, userId: 11 });

    expect(systemPrompt).toContain('**Recorded** (Investigational New Drug Application, active, 40% complete)');
    expect(systemPrompt).toContain('**Unrecorded** (submission type not recorded, planning, progress not recorded)');
    expect(systemPrompt).not.toContain('null% complete');
  });
});
