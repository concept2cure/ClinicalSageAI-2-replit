import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), summary: vi.fn(), workflow: vi.fn(), recurring: vi.fn(), patterns: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: h.summary }));
vi.mock('../workflow-orchestration.js', () => ({ buildWorkflowContext: h.workflow }));
vi.mock('../../intelligence/signal-capture.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../intelligence/signal-capture.js')>(),
  getRecurringPatterns: h.recurring,
  querySignals: () => [],
}));
vi.mock('../../intelligence/pattern-registry.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../intelligence/pattern-registry.js')>(),
  patternRegistry: { getPatterns: h.patterns },
}));
vi.mock('../../intelligence/readiness-scoring-engine.js', () => ({
  computeReadinessScore: async () => ({ overallScore: 50, gaps: [], dimensions: {}, predictions: null }),
}));

import { enrichContextForChat } from '../context-enrichment';

const NATURAL = 'Review the deficiency letter and reviewer question';
const INPUT = { message: NATURAL, projectId: 42, project: { status: 'linked', id: 42 } as const, organizationId: 7, submissionType: 'IND' };
const PROFILE = {
  regulatoryStrategy: 'Reconcile source evidence', riskFactors: [], openQuestions: [], keyDecisions: [],
  learnedInsights: [], documentStats: { totalIngested: 2 }, memoryEntryCount: 3,
};
const RECURRING = [{ patternId: 'stability-evidence-gap', occurrences: 3 }];
const PATTERNS = [{ id: 'stability-evidence-gap', severity: 'high', name: 'Stability evidence gap', agency: 'FDA', remediation: 'Reconcile shelf-life evidence.' }];
const MEMORY = { rows: [{ title: 'Stability response history', content: 'Earlier reviewer request remains open.', confidence_score: 0.91, category: 'deficiency_pattern' }] };
const PRECEDENT = { rows: [{ title: 'Precedent comparator', content: 'Agency requested longer stability follow-up.', confidence: 0.75, category: 'precedent_analysis' }] };
const deficiencyReads = () => h.query.mock.calls.filter(([, args]) => (args as unknown[]).includes('rim_pattern_registry'));

beforeEach(() => {
  vi.useFakeTimers();
  h.summary.mockReset().mockResolvedValue(PROFILE);
  h.workflow.mockReset().mockResolvedValue('Workflow context');
  h.recurring.mockReset().mockReturnValue(RECURRING);
  h.patterns.mockReset().mockReturnValue(PATTERNS);
  h.query.mockReset().mockImplementation(async (_sql: string, args: unknown[] = []) => {
    if (args.includes('rim_pattern_registry')) return MEMORY;
    if (args.includes('precedent_analysis')) return PRECEDENT;
    return { rows: [] };
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const liveBlock = '\n\n## ACTIVE REGULATORY PATTERNS\n- **[HIGH]** Stability evidence gap (FDA) — 3 hits | Fix: Reconcile shelf-life evidence.';
const historicalBlock = '\n\n## HISTORICAL DEFICIENCY PATTERNS\nPersisted deficiency and rejection patterns for trend context.\n- **Stability response history** [91% confidence]: Earlier reviewer request remains open.';
const legacySources = ['project-profile', 'workflow', 'deficiency', 'simulation', 'haq', 'agency-tactics'];
const deferredMemory = () => {
  let resolve!: (value: typeof MEMORY) => void;
  const promise = new Promise<typeof MEMORY>(r => { resolve = r; });
  return { promise, resolve };
};
const count = (block: string, text: string) => block.split(text).length - 1;
const observe = () => {
  const settled = vi.fn();
  return { settled, pending: enrichContextForChat(INPUT).then(settled) };
};

describe('one lazy deficiency snapshot preserves its existing consumers', () => {
  it('shares one deficiency read across three natural triggers and preserves repeated prompt contributions', async () => {
    const result = await enrichContextForChat(INPUT);
    expect(deficiencyReads()).toHaveLength(1);
    expect(h.recurring.mock.calls).toEqual([[7, 42]]);
    expect(h.patterns).toHaveBeenCalledTimes(1);
    expect(deficiencyReads()[0][1]).toEqual([42, 7, 'rim_pattern_registry', 'deficiency_pattern', 'reviewer_trigger', 5]);
    expect(String(deficiencyReads()[0][0])).toContain('WHERE project_id = $1 AND organization_id = $2');
    expect(result.sources).toEqual(legacySources);
    expect(result.block).toContain([liveBlock + historicalBlock, liveBlock + historicalBlock, liveBlock + historicalBlock].join('\n'));
    expect(count(result.block, '## ACTIVE REGULATORY PATTERNS')).toBe(3);
    expect(count(result.block, '## HISTORICAL DEFICIENCY PATTERNS')).toBe(3);
    expect(count(result.block, '## PROJECT PRECEDENT INTELLIGENCE')).toBe(1);
    expect(result.block.indexOf('## Project Intelligence Profile')).toBeLessThan(result.block.indexOf('Workflow context'));
    expect(result.block.indexOf('Workflow context')).toBeLessThan(result.block.indexOf('## ACTIVE REGULATORY PATTERNS'));
    expect(result.rewrittenMessage).toBeUndefined();
    expect(result.enrichmentMeta).toEqual({
      sourcesAttempted: 4, sourcesSucceeded: legacySources, sourcesFailed: [], unavailableSources: [], unavailableReasons: {},
      triggerType: 'natural_language', detectedCommand: undefined, detectedAppMention: undefined, hasProjectContext: true,
      composeTrace: undefined, composeTokensUsed: undefined,
    });
  });

  it('starts one shared raw read while all three consumers remain pending', async () => {
    const memory = deferredMemory();
    h.query.mockImplementation((_sql: string, args: unknown[]) => args.includes('rim_pattern_registry') ? memory.promise : Promise.resolve(PRECEDENT));
    const { settled, pending } = observe();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(deficiencyReads()).toHaveLength(1);
      expect(h.recurring).toHaveBeenCalledTimes(1);
      expect(settled).not.toHaveBeenCalled();
      memory.resolve(MEMORY);
      await pending;
      expect(settled.mock.calls[0][0].sources).toEqual(legacySources);
      expect(count(settled.mock.calls[0][0].block, '## HISTORICAL DEFICIENCY PATTERNS')).toBe(3);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      memory.resolve(MEMORY);
      await pending;
    }
  });

  it.each(['simulate', 'review', 'haq', 'preflight'])('keeps the /%s path and its existing source label', async command => {
    const result = await enrichContextForChat({ ...INPUT, message: `/${command}` });
    expect(deficiencyReads()).toHaveLength(1);
    expect(h.recurring).toHaveBeenCalledTimes(1);
    expect(count(result.block, '## HISTORICAL DEFICIENCY PATTERNS')).toBe(1);
    expect(result.sources.slice(0, 3)).toEqual(['project-profile', 'workflow', command]);
    expect(result.enrichmentMeta?.detectedCommand).toBe(command);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    expect(result.rewrittenMessage).not.toContain(`/${command}`);
  });

  it('keeps simulation-only enrichment under its own source label', async () => {
    const result = await enrichContextForChat({ ...INPUT, message: 'Anticipate the question' });
    expect(deficiencyReads()).toHaveLength(1);
    expect(result.sources).toEqual(['project-profile', 'workflow', 'simulation']);
    expect(count(result.block, '## HISTORICAL DEFICIENCY PATTERNS')).toBe(1);
  });

  it('does not eagerly read deficiency context for an unrelated turn', async () => {
    await enrichContextForChat({ ...INPUT, message: 'Show my current project context' });
    expect(h.recurring).not.toHaveBeenCalled();
    expect(h.patterns).not.toHaveBeenCalled();
    expect(deficiencyReads()).toHaveLength(0);
  });
});

describe('shared deficiency work retains each consumer deadline', () => {
  it('reports original per-source timeouts, preserves precedent, and ignores late completion', async () => {
    const memory = deferredMemory();
    h.query.mockImplementation((_sql: string, args: unknown[]) => args.includes('rim_pattern_registry') ? memory.promise : Promise.resolve(PRECEDENT));
    const { settled, pending } = observe();
    try {
      await vi.advanceTimersByTimeAsync(2999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(deficiencyReads()).toHaveLength(1);
      const result = settled.mock.calls[0][0];
      expect(result.enrichmentMeta.unavailableSources).toEqual(['deficiency', 'simulation']);
      expect(result.enrichmentMeta.unavailableReasons).toEqual({ deficiency: 'timeout', simulation: 'timeout' });
      expect(result.enrichmentMeta.sourcesFailed).toEqual(['deficiency', 'simulation']);
      expect(result.sources).toEqual(['project-profile', 'workflow', 'haq', 'agency-tactics']);
      expect(result.block).toContain('Precedent comparator');
      expect(result.block).toContain('Reconcile source evidence');
      expect(result.block).toContain('Do not infer that missing context or unresolved findings do not exist');
      expect(result.block).not.toContain('## ACTIVE REGULATORY PATTERNS');
      const snapshot = JSON.stringify(result);
      memory.resolve(MEMORY);
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.stringify(result)).toBe(snapshot);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      memory.resolve(MEMORY);
      await pending;
    }
  });
});

describe('sharing preserves empty and swallowed-error contracts', () => {
  it('keeps healthy empty results separate from unavailable context', async () => {
    h.recurring.mockReturnValue([]);
    h.query.mockResolvedValue({ rows: [] });
    const result = await enrichContextForChat(INPUT);
    expect(deficiencyReads()).toHaveLength(1);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    expect(result.enrichmentMeta?.sourcesFailed).toEqual(['deficiency', 'simulation', 'haq']);
    expect(result.block).not.toContain('Enrichment context unavailable');
    expect(result.block).not.toMatch(/No .* data found for this project yet/);
  });

  it.each(['throw', 'reject'])('preserves the existing memory-error omission when the query %s', async failure => {
    h.recurring.mockReturnValue([]);
    h.query.mockImplementation((_sql: string, args: unknown[]) => {
      if (!args.includes('rim_pattern_registry')) return Promise.resolve(PRECEDENT);
      if (failure === 'throw') throw new Error('memory failed synchronously');
      return Promise.reject(new Error('memory failed asynchronously'));
    });
    const result = await enrichContextForChat(INPUT);
    expect(deficiencyReads()).toHaveLength(1);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    expect(result.enrichmentMeta?.sourcesFailed).toEqual(['deficiency', 'simulation']);
    expect(result.sources).toEqual(['project-profile', 'workflow', 'haq', 'agency-tactics']);
    expect(result.block).not.toContain('## Deficiency & Rejection Intelligence');
    expect(result.block).not.toMatch(/No .* data found for this project yet/);
  });

  it('retains memory fallback when live patterns throw', async () => {
    h.recurring.mockImplementation(() => { throw new Error('live pattern registry unavailable'); });
    const result = await enrichContextForChat(INPUT);
    expect(h.recurring).toHaveBeenCalledTimes(1);
    expect(deficiencyReads()).toHaveLength(1);
    expect(count(result.block, '## Deficiency & Rejection Intelligence')).toBe(3);
    expect(result.block).not.toContain('## ACTIVE REGULATORY PATTERNS');
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
  });

  it('retains unknown recurring-pattern IDs and occurrence counts', async () => {
    h.recurring.mockReturnValue([{ patternId: 'unknown-pattern', occurrences: 4 }]);
    const result = await enrichContextForChat(INPUT);
    expect(count(result.block, '- **unknown-pattern** — 4 occurrences')).toBe(3);
    expect(deficiencyReads()).toHaveLength(1);
  });
});

describe('deficiency sharing stays fresh and tenant/project scoped', () => {
  it('separates concurrent invocations and reads the same scope again on a later turn', async () => {
    let revision = 'first';
    h.recurring.mockImplementation((org: number, project: number) => [{ patternId: `scope-${org}-${project}-${revision}`, occurrences: 2 }]);
    h.query.mockImplementation(async (_sql: string, args: unknown[]) => ({ rows: args.includes('rim_pattern_registry')
      ? [{ title: `Memory ${args[1]}/${args[0]}/${revision}`, content: 'Scoped reviewer record', confidence_score: 0.9 }]
      : [] }));
    const inputs = [INPUT, { ...INPUT, organizationId: 8 }, { ...INPUT, projectId: 43, project: { status: 'linked', id: 43 } as const }];
    const results = await Promise.all(inputs.map(input => enrichContextForChat(input)));
    for (const [index, input] of inputs.entries()) {
      expect(count(results[index].block, `Memory ${input.organizationId}/${input.projectId}/first`)).toBe(3);
      expect(count(results[index].block, `scope-${input.organizationId}-${input.projectId}-first`)).toBe(3);
      expect(deficiencyReads().filter(([, args]) => args[0] === input.projectId && args[1] === input.organizationId)).toHaveLength(1);
      for (const other of inputs.filter(candidate => candidate !== input)) {
        expect(results[index].block).not.toContain(`Memory ${other.organizationId}/${other.projectId}/first`);
      }
    }
    revision = 'next';
    const fresh = await enrichContextForChat(INPUT);
    expect(deficiencyReads()).toHaveLength(4);
    expect(h.recurring).toHaveBeenCalledTimes(4);
    expect(count(fresh.block, 'Memory 7/42/next')).toBe(3);
    expect(fresh.block).not.toContain('Memory 7/42/first');
    expect(results[0].block).toContain('Memory 7/42/first');
  });
});

describe('deficiency sharing preserves existing organization/project guards', () => {
  it.each([undefined, 0])('starts no deficiency reads without organization %s', async organizationId => {
    await enrichContextForChat({ ...INPUT, organizationId });
    expect(h.recurring).not.toHaveBeenCalled();
    expect(h.patterns).not.toHaveBeenCalled();
    expect(deficiencyReads()).toHaveLength(0);
  });

  it('starts no scoped reads on a projectless turn', async () => {
    await enrichContextForChat({ message: NATURAL, organizationId: 7, submissionType: 'IND' });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.recurring).not.toHaveBeenCalled();
  });

  it.each(['none', 'unresolved'] as const)('starts no deficiency read for a %s project resolution', async status => {
    const project = status === 'none' ? { status } : { status, reason: 'error' as const };
    const result = await enrichContextForChat({ ...INPUT, project });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.recurring).not.toHaveBeenCalled();
    expect(result.block).not.toMatch(/No .* data found for this project yet/);
    if (status === 'none') expect(result.block).toContain('Do not state or imply that this project has, or lacks, any recorded data');
    else expect(result.enrichmentMeta?.unavailableSources).toEqual(['project-record']);
  });
});
